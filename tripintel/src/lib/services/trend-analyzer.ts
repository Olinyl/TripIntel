import { createClient } from "@supabase/supabase-js";
import type { FlightOffer, PriceTrend, TripIntent } from "@/lib/domain/types";

interface PriceRecord {
  price: number;
  currency: string;
}

const NEUTRAL: PriceTrend = {
  recommendation: "NEUTRAL",
  volatility: 0,
  sampleSize: 0,
};

/** Minimum number of data points required to make a recommendation. */
const MIN_SAMPLE_SIZE = 3;

/**
 * Upper bound on how many historical rows to pull per query.
 * Keeps response times predictable while still capturing trends.
 */
const HISTORY_LIMIT = 50;
const HISTORY_WINDOW_DAYS = 45;

interface HistoricalPriceRow {
  price: number;
  currency: string;
  departure_date: string;
  recorded_at: string;
}

function parseRouteKey(routeKey: string): {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
} {
  const [origin = "", destination = "", departureDate = "", returnDate] =
    routeKey.split("/");

  return {
    origin,
    destination,
    departureDate,
    returnDate: returnDate ?? null,
  };
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

function getDateWindow(dateString: string, days: number): { start: string; end: string } | null {
  const parsed = new Date(`${dateString}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;

  const start = new Date(parsed);
  const end = new Date(parsed);
  start.setUTCDate(start.getUTCDate() - days);
  end.setUTCDate(end.getUTCDate() + days);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export class TrendAnalyzer {
  /**
   * Analyses historical prices for a route and returns a `PriceTrend`
   * describing current market conditions.
   *
   * @param routeKey - Serialised route identifier in the form
   *   `ORIGIN/DESTINATION/YYYY-MM-DD` (optionally `/.../RETURN_DATE`).
   */
  async analyzePriceTrend(routeKey: string): Promise<PriceTrend> {
    try {
      const supabase = getSupabaseAdminClient();
      const { origin, destination, departureDate, returnDate } =
        parseRouteKey(routeKey);

      if (!origin || !destination || !departureDate) {
        return NEUTRAL;
      }

      let exactDateQuery = supabase
        .from("price_history")
        .select("price, currency, departure_date, recorded_at")
        .eq("origin", origin)
        .eq("destination", destination)
        .eq("departure_date", departureDate);

      if (returnDate) {
        exactDateQuery = exactDateQuery.eq("return_date", returnDate);
      } else {
        exactDateQuery = exactDateQuery.is("return_date", null);
      }

      const { data: exactData, error: exactError } = await exactDateQuery
        .order("recorded_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (exactError) {
        console.error("[TrendAnalyzer] Failed to query exact-date price_history:", exactError.message);
      }

      let rows = ((exactData ?? []) as HistoricalPriceRow[])
        .filter((row) => Number.isFinite(row.price) && row.price > 0);

      if (rows.length < MIN_SAMPLE_SIZE) {
        const dateWindow = getDateWindow(departureDate, HISTORY_WINDOW_DAYS);
        if (dateWindow) {
          let historicalQuery = supabase
            .from("price_history")
            .select("price, currency, departure_date, recorded_at")
            .eq("origin", origin)
            .eq("destination", destination)
            .gte("departure_date", dateWindow.start)
            .lte("departure_date", dateWindow.end);

          if (returnDate) {
            historicalQuery = historicalQuery.eq("return_date", returnDate);
          } else {
            historicalQuery = historicalQuery.is("return_date", null);
          }

          const { data: historicalData, error: historicalError } = await historicalQuery
            .order("recorded_at", { ascending: false })
            .limit(HISTORY_LIMIT);

          if (historicalError) {
            console.error("[TrendAnalyzer] Failed to query historical window:", historicalError.message);
          } else {
            rows = ((historicalData ?? []) as HistoricalPriceRow[])
              .filter((row) => Number.isFinite(row.price) && row.price > 0);
          }
        }
      }

      if (rows.length < MIN_SAMPLE_SIZE) {
        return NEUTRAL;
      }

      const records = rows as PriceRecord[];
      const prices = records.map((r) => r.price);
      const currency = records[0].currency;

      const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const median = computeMedian(prices);
      const variance =
        prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
      const stddev = Math.sqrt(variance);

      // Coefficient of variation, clamped to [0, 1].
      const volatility = mean > 0 ? Math.min(1, stddev / mean) : 0;

      // Classify the latest (most recent) price relative to broader historical baseline.
      const latestPrice = prices[0];
      const changeVsMedianPct = median > 0 ? (latestPrice - median) / median : 0;

      let recommendation: PriceTrend["recommendation"];
      if (changeVsMedianPct <= -0.08) {
        recommendation = "BUY";
      } else if (changeVsMedianPct >= 0.1) {
        recommendation = "WAIT";
      } else if (volatility > 0.35) {
        recommendation = "MONITOR";
      } else {
        recommendation = "MONITOR";
      }

      const minObservedPrice = Math.min(...prices);
      const maxObservedPrice = Math.max(...prices);

      return {
        recommendation,
        volatility,
        sampleSize: prices.length,
        meanPrice: Math.round(mean * 100) / 100,
        medianPrice: Math.round(median * 100) / 100,
        minObservedPrice,
        maxObservedPrice,
        changeVsMedianPct,
        latestPrice,
        currency,
      };
    } catch {
      // Degrade gracefully — analytics should never break the search path.
      return NEUTRAL;
    }
  }

  /**
   * Persists a single price observation into `price_history`.
   * Intended to be called fire-and-forget from TripOrchestrator.
   */
  async ingestPriceSnapshot(
    offer: FlightOffer,
    intent: TripIntent,
  ): Promise<void> {
    try {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.from("price_history").insert({
        origin: intent.origin,
        destination: intent.destination,
        departure_date: intent.departureDate,
        return_date: intent.returnDate ?? null,
        one_way: intent.tripType === "one_way",
        price: offer.price,
        currency: offer.currency,
        provider: offer.provider,
        cabin: offer.cabin,
        passengers: intent.passengers,
        metadata: {
          offer_id: offer.id,
          carrier_code: offer.carrierCode,
          flight_number: offer.flightNumber,
        },
      });

      if (error) {
        console.error("[TrendAnalyzer] Failed to ingest price snapshot:", error.message);
      }
    } catch {
      // Non-critical path — ingestion failures must never propagate.
      console.error("[TrendAnalyzer] Unexpected ingestion failure.");
    }
  }
}
