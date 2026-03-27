import { Resend } from "resend";
import type { SniperTrigger } from "@/lib/services/price-sniper";

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  return new Resend(apiKey);
}

function buildEmailHtml(trigger: SniperTrigger, currency: string): string {
  const savings = trigger.targetPrice - trigger.latestPrice;
  const savingsPct = ((savings / trigger.targetPrice) * 100).toFixed(1);
  const [origin, destination] = trigger.routeKey.split("/");
  const departureDate = trigger.routeKey.split("/")[2] ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TripIntel Price Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fafafa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden;max-width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#71717a;font-weight:600;">
                TripIntel
              </p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#fafafa;letter-spacing:-0.02em;">
                🎯 Price Alert Triggered
              </h1>
            </td>
          </tr>

          <!-- Route card -->
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background-color:#09090b;border:1px solid #27272a;border-radius:12px;padding:20px;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#52525b;">
                      Route
                    </p>
                    <p style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#fafafa;">
                      ${origin ?? ""} &rarr; ${destination ?? ""}
                    </p>
                    ${departureDate ? `<p style="margin:6px 0 0;font-size:13px;color:#71717a;">${departureDate}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Price breakdown -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding-right:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                           style="background-color:#052e16;border:1px solid #166534;border-radius:10px;padding:16px;">
                      <tr><td>
                        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#4ade80;">
                          Current Price
                        </p>
                        <p style="margin:0;font-size:22px;font-weight:800;color:#4ade80;">
                          ${currency} ${trigger.latestPrice.toLocaleString()}
                        </p>
                      </td></tr>
                    </table>
                  </td>
                  <td width="50%" style="padding-left:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                           style="background-color:#18181b;border:1px solid #27272a;border-radius:10px;padding:16px;">
                      <tr><td>
                        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">
                          Your Target
                        </p>
                        <p style="margin:0;font-size:22px;font-weight:800;color:#a1a1aa;">
                          ${currency} ${trigger.targetPrice.toLocaleString()}
                        </p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Savings badge -->
          ${
            savings > 0
              ? `<tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0;display:inline-block;background-color:#14532d;color:#4ade80;border:1px solid #166534;
                         border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;">
                You're saving ${currency} ${savings.toLocaleString()} (${savingsPct}% below target)
              </p>
            </td>
          </tr>`
              : ""
          }

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;">
              <p style="margin:0 0 16px;font-size:13px;color:#71717a;line-height:1.6;">
                Our price engine detected a statistically low price for this route.
                Prices at this level don't last — book now before they rise.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#4f46e5;border-radius:8px;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://tripintel.vercel.app"}/dashboard"
                       style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;letter-spacing:-0.01em;">
                      Search Again on TripIntel &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:11px;color:#52525b;line-height:1.6;">
                You received this alert because you set a price watch for ${origin ?? ""} &rarr; ${destination ?? ""}.
                To manage your alerts, visit your TripIntel dashboard.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface AlertEmailPayload {
  toEmail: string;
  trigger: SniperTrigger;
  currency?: string;
}

export async function sendPriceAlertEmail({
  toEmail,
  trigger,
  currency = "USD",
}: AlertEmailPayload): Promise<void> {
  const resend = getResendClient();
  const [origin, destination] = trigger.routeKey.split("/");
  const subject = `🎯 Price drop: ${origin} → ${destination} is now ${currency} ${trigger.latestPrice.toLocaleString()}`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "TripIntel <alerts@tripintel.app>",
    to: toEmail,
    subject,
    html: buildEmailHtml(trigger, currency),
  });

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`);
  }
}
