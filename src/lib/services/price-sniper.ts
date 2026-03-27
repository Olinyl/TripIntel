import { createClient } from "@supabase/supabase-js";
import type { PriceAlert } from "@/lib/domain/types";
import { TrendAnalyzer } from "@/lib/services/trend-analyzer";
import { sendPriceAlertEmail } from "@/lib/infra/notifications/resend-service";

/** Maximum number of active alerts to process in one evaluation run. */
const BATCH_LIMIT = 100;

export interface SniperTrigger {
  alertId: string;
  routeKey: string;
  latestPrice: number;
  targetPrice: number;
}

export interface SniperResult {
  evaluated: number;
  triggered: number;
  triggers: SniperTrigger[];
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key);
}

export class PriceSniper {
  private trendAnalyzer: TrendAnalyzer;

  constructor(trendAnalyzer: TrendAnalyzer = new TrendAnalyzer()) {
    this.trendAnalyzer = trendAnalyzer;
  }

  /**
   * Fetches all active `price_alerts`, evaluates each against the latest
   * price data, and logs a "Notification Trigger" for any that fire.
   *
   * A trigger fires when:
   *  1. The trend classifier returns "BUY" (current price is below the
   *     historical mean by more than half a standard deviation), AND
   *  2. The latest observed price is at or below the user's `target_price`,
   *     adjusted upward by `threshold_pct` to allow a leniency window.
   */
  async evaluateAlerts(): Promise<SniperResult> {
    const supabase = getSupabaseAdminClient();

    const { data: rows, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("is_active", true)
      .limit(BATCH_LIMIT);

    if (error || !rows) {
      console.error(
        "[PriceSniper] Failed to fetch active alerts:",
        error?.message,
      );
      return { evaluated: 0, triggered: 0, triggers: [] };
    }

    const alerts = rows as PriceAlert[];
    const triggers: SniperTrigger[] = [];

    for (const alert of alerts) {
      const routeKey = [
        alert.origin,
        alert.destination,
        alert.departure_date,
        ...(alert.return_date ? [alert.return_date] : []),
      ].join("/");

      const trend = await this.trendAnalyzer.analyzePriceTrend(routeKey);

      if (trend.latestPrice === undefined) {
        // No price history yet for this route — skip until data is available.
        continue;
      }

      // Allow the user's threshold_pct to act as a leniency window
      // (e.g. threshold_pct=5 fires when price is within 5 % above target).
      const targetPrice = alert.target_price ?? alert.baseline_price;
      const thresholdPct = alert.threshold_pct ?? alert.threshold_delta_pct ?? 0;

      if (targetPrice === undefined) {
        continue;
      }

      const effectiveCeiling =
        targetPrice * (1 + thresholdPct / 100);
      const meetsTarget = trend.latestPrice <= effectiveCeiling;

      if (trend.recommendation === "BUY" && meetsTarget) {
        triggers.push({
          alertId: alert.id,
          routeKey,
          latestPrice: trend.latestPrice,
          targetPrice,
        });

        // Fetch user email from auth.users via Admin API.
        const { data: userData, error: userError } =
          await supabase.auth.admin.getUserById(alert.user_id);

        if (userError) {
          console.error(
            `[PriceSniper] Failed to fetch user ${alert.user_id}:`,
            userError.message,
          );
        }

        const recipientEmail = userData.user?.email;

        if (recipientEmail) {
          try {
            await sendPriceAlertEmail({
              toEmail: recipientEmail,
              trigger: {
                alertId: alert.id,
                routeKey,
                latestPrice: trend.latestPrice,
                targetPrice,
              },
              currency: alert.currency,
            });
          } catch (emailErr) {
            console.error(
              `[PriceSniper] Email delivery failed for alert ${alert.id}:`,
              emailErr instanceof Error ? emailErr.message : emailErr,
            );
          }
        }

        // Update last_price and notified_at regardless of email success.
        await supabase
          .from("price_alerts")
          .update({
            last_price: trend.latestPrice,
            notified_at: new Date().toISOString(),
          })
          .eq("id", alert.id);
      }
    }

    console.log(
      `[PriceSniper] Run complete — evaluated: ${alerts.length}, triggered: ${triggers.length}`,
    );

    return { evaluated: alerts.length, triggered: triggers.length, triggers };
  }
}
