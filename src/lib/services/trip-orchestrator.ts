import type { FlightOffer, PriceTrend, TripIntent } from "@/lib/domain/types";
import { CompositeFlightProvider } from "@/lib/providers/composite-flight-provider";
import type { FlightProvider } from "@/lib/providers/flight-provider";
import { GraphOptimizer } from "@/lib/services/graph-optimizer";
import { TrendAnalyzer } from "@/lib/services/trend-analyzer";

// ── Price Estimator ────────────────────────────────────────────────────────────
// AviationStack is a schedule API and returns $0 for all fares. We estimate
// missing prices from duration so longer routes trend higher.
const ESTIMATE_FLOOR = 450;
const ESTIMATE_CEILING = 1200;
const ESTIMATE_BASE = 160;
const ESTIMATE_PER_MINUTE = 1.35;
const ESTIMATE_JITTER = 90;

const PRICE_WEIGHT = 0.55;
const DURATION_WEIGHT = 0.45;
const LAYOVER_QUALITY_BONUS_DIRECT = -0.08;
const LAYOVER_QUALITY_PENALTY_MULTI = 0.14;

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max <= min) return 0;
  return (value - min) / (max - min);
}

function countStops(offer: FlightOffer): number {
  if (offer.segments.length <= 1) return 0;
  return offer.segments.length - 1;
}

function scoreFlight(
  offer: FlightOffer,
  bounds: { minPrice: number; maxPrice: number; minDuration: number; maxDuration: number },
): number {
  const priceScore = normalize(offer.price, bounds.minPrice, bounds.maxPrice);
  const safeDuration = Number.isFinite(offer.durationMinutes) && offer.durationMinutes > 0
    ? offer.durationMinutes
    : bounds.maxDuration;
  const durationScore = normalize(safeDuration, bounds.minDuration, bounds.maxDuration);

  const stops = countStops(offer);
  const stopPenalty = stops === 0 ? LAYOVER_QUALITY_BONUS_DIRECT : stops === 1 ? 0.18 : 0.35 + LAYOVER_QUALITY_PENALTY_MULTI;
  const estimatePenalty = offer.isEstimated ? 0.05 : 0;

  return stopPenalty + estimatePenalty + priceScore * PRICE_WEIGHT + durationScore * DURATION_WEIGHT;
}

function sortByRecommendation(flights: FlightOffer[]): FlightOffer[] {
  if (flights.length <= 1) return flights;

  const prices = flights.map((flight) => flight.price).filter((price) => Number.isFinite(price));
  const durations = flights
    .map((flight) => flight.durationMinutes)
    .filter((duration) => Number.isFinite(duration) && duration > 0);

  const bounds = {
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 1,
    minDuration: durations.length ? Math.min(...durations) : 0,
    maxDuration: durations.length ? Math.max(...durations) : 1,
  };

  return [...flights].sort((left, right) => {
    const scoreDiff = scoreFlight(left, bounds) - scoreFlight(right, bounds);
    if (scoreDiff !== 0) return scoreDiff;

    const stopDiff = countStops(left) - countStops(right);
    if (stopDiff !== 0) return stopDiff;

    const priceDiff = left.price - right.price;
    if (priceDiff !== 0) return priceDiff;

    return left.durationMinutes - right.durationMinutes;
  });
}

function estimatePrice(offer: FlightOffer): FlightOffer {
  if (offer.price > 0) return offer;
  const durationMinutes = Number.isFinite(offer.durationMinutes) && offer.durationMinutes > 0
    ? offer.durationMinutes
    : 180;
  const baseline = ESTIMATE_BASE + durationMinutes * ESTIMATE_PER_MINUTE;
  const jitter = Math.floor(Math.random() * (ESTIMATE_JITTER * 2 + 1)) - ESTIMATE_JITTER;
  const estimated = Math.round(
    Math.min(ESTIMATE_CEILING, Math.max(ESTIMATE_FLOOR, baseline + jitter)),
  );
  return { ...offer, price: estimated, isEstimated: true };
}

export interface TripOrchestratorResult {
  /** Primary flight offers sorted by ascending price. */
  flights: FlightOffer[];
  /** Alternative TripIntents for nearby origin airports, ready for lazy search. */
  alternatives: TripIntent[];
  /** Price-trend analytics for the requested route. */
  trendMetadata: PriceTrend;
}

export class TripOrchestrator {
  private flightProvider: FlightProvider;
  private graphOptimizer: GraphOptimizer;
  private trendAnalyzer: TrendAnalyzer;

  constructor(
    flightProvider: FlightProvider = new CompositeFlightProvider(),
    graphOptimizer: GraphOptimizer = new GraphOptimizer(),
    trendAnalyzer: TrendAnalyzer = new TrendAnalyzer(),
  ) {
    this.flightProvider = flightProvider;
    this.graphOptimizer = graphOptimizer;
    this.trendAnalyzer = trendAnalyzer;
  }

  async search(intent: TripIntent): Promise<TripOrchestratorResult> {
    const routeKey = [
      intent.origin,
      intent.destination,
      intent.departureDate,
      ...(intent.returnDate ? [intent.returnDate] : []),
    ].join("/");

    const [flights, trendMetadata] = await Promise.all([
      this.flightProvider.searchFlights(intent),
      this.trendAnalyzer.analyzePriceTrend(routeKey),
    ]);

    const normalizedFlights = sortByRecommendation(
      flights
      .filter((flight) => Number.isFinite(flight.price) && flight.price >= 0)
      .map(estimatePrice)
      ).map((offer) => {
        const prices = flights.map((flight) => flight.price).filter((price) => Number.isFinite(price));
        const durations = flights
          .map((flight) => flight.durationMinutes)
          .filter((duration) => Number.isFinite(duration) && duration > 0);
        const bounds = {
          minPrice: prices.length ? Math.min(...prices) : 0,
          maxPrice: prices.length ? Math.max(...prices) : 1,
          minDuration: durations.length ? Math.min(...durations) : 0,
          maxDuration: durations.length ? Math.max(...durations) : 1,
        };
        const valueScore = Number(scoreFlight(offer, bounds).toFixed(4));

        return {
          ...offer,
          metadata: {
            ...(offer.metadata ?? {}),
            valueScore,
          },
        };
      });

    // Keep price_history fresh — ingest top-5 results without blocking the response.
    normalizedFlights.slice(0, 5).forEach((offer) => {
      this.trendAnalyzer.ingestPriceSnapshot(offer, intent).catch((err) => {
        console.error("[TripOrchestrator] Price ingestion failed:", err);
      });
    });

    const alternatives = this.graphOptimizer.buildAlternativeIntents(intent);

    return {
      flights: normalizedFlights,
      alternatives,
      trendMetadata,
    };
  }
}

