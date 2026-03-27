"use client";

import React, { useMemo, useRef, useState } from "react";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Clock3,
  Filter,
  Leaf,
  MapPin,
  Minus,
  Plane,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { FlightOffer, PriceTrend, TripIntent } from "@/lib/domain/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  intent: TripIntent;
  flights: FlightOffer[];
  alternatives: TripIntent[];
  trendMetadata: PriceTrend;
}

interface ResultsGridProps {
  data: SearchResult;
  onAlternativeClick: (intent: TripIntent) => void;
}

type SortMode = "recommended" | "price" | "duration" | "departure" | "emissions";
type BrowseMode = "all" | "value" | "comfort" | "eco" | "night";
const AUTH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

// ── Animation variants ────────────────────────────────────────────────────────

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" as const } },
};

const sidebarVariants: Variants = {
  hidden: { opacity: 0, x: 14 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.38, ease: "easeOut" as const, delay: 0.12 },
  },
};

// ── Trend config ──────────────────────────────────────────────────────────────

const TREND_CONFIG = {
  BUY: {
    label: "BUY",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/25",
    Icon: TrendingUp,
  },
  MONITOR: {
    label: "MONITOR",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
    Icon: Minus,
  },
  WAIT: {
    label: "WAIT",
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/25",
    Icon: TrendingDown,
  },
  NEUTRAL: {
    label: "NEUTRAL",
    color: "text-zinc-400",
    bg: "bg-zinc-800",
    border: "border-zinc-700",
    Icon: Minus,
  },
} satisfies Record<
  PriceTrend["recommendation"],
  { label: string; color: string; bg: string; border: string; Icon: React.ElementType }
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateBadge(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatKg(value: number): string {
  return `${Math.round(value)} kg CO2`;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getReturnLegSummary(offer: FlightOffer): {
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
} | null {
  const metadata = asRecord(offer.metadata);
  const returnLeg = asRecord(metadata.return_leg);
  const departureTime = asString(returnLeg.departure_time);
  const arrivalTime = asString(returnLeg.arrival_time);
  const origin = asString(returnLeg.origin);
  const destination = asString(returnLeg.destination);

  if (!departureTime || !arrivalTime || !origin || !destination) {
    return null;
  }

  return {
    origin,
    destination,
    departureTime,
    arrivalTime,
  };
}

function getStopCount(offer: FlightOffer): number {
  return Math.max(0, offer.segments.length - 1);
}

function getValueScore(offer: FlightOffer): number | null {
  const metadata = asRecord(offer.metadata);
  const raw = metadata.valueScore;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw;
}

function getDepartureHour(offer: FlightOffer): number {
  const date = new Date(offer.departureTime);
  return Number.isFinite(date.getTime()) ? date.getHours() : 12;
}

function isRedEye(offer: FlightOffer): boolean {
  const hour = getDepartureHour(offer);
  return hour >= 22 || hour <= 5;
}

function sanitizeNumericInput(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function percentile(sortedValues: number[], pct: number): number {
  if (sortedValues.length === 0) return Number.POSITIVE_INFINITY;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * pct)));
  return sortedValues[index];
}

function getRecommendationReason(trend: PriceTrend): string {
  const delta = trend.changeVsMedianPct;
  if (trend.recommendation === "WAIT") {
    if (delta !== undefined && delta > 0) {
      return `Current fares are ${(delta * 100).toFixed(1)}% above typical historical levels.`;
    }
    return "Current fares are elevated versus the recent market baseline.";
  }

  if (trend.recommendation === "BUY") {
    if (delta !== undefined) {
      return `Current fares are ${(Math.abs(delta) * 100).toFixed(1)}% below historical median.`;
    }
    return "Current fares are below the typical market range.";
  }

  if (trend.recommendation === "MONITOR") {
    if (trend.volatility >= 0.35) {
      return "Prices are volatile right now, so a short wait can reveal better timing.";
    }
    return "Prices are near historical baseline; monitor for dips before booking.";
  }

  return "Not enough data to make a strong recommendation yet.";
}

function getRecommendationAction(trend: PriceTrend): string {
  if (trend.recommendation === "WAIT") {
    return "Set a price target and re-check in 3-7 days.";
  }
  if (trend.recommendation === "BUY") {
    return "Book soon; this is priced better than usual.";
  }
  if (trend.recommendation === "MONITOR") {
    return "Track this route and book when you see a small dip.";
  }
  return "Run another search with flexible dates for better signal.";
}

function computeDisplayedTrend(flights: FlightOffer[], fallback: PriceTrend): PriceTrend {
  if (fallback.sampleSize > 0) {
    return fallback;
  }

  const prices = flights
    .map((flight) => flight.price)
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return fallback;
  }

  const meanPrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const sorted = [...prices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianPrice =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    ...fallback,
    sampleSize: prices.length,
    meanPrice,
    medianPrice,
    latestPrice: prices[0],
    currency: flights[0]?.currency ?? fallback.currency,
  };
}

function buildQueryFromIntent(intent: TripIntent): string {
  const cabinPart = intent.cabin ? `, ${intent.cabin.replace("_", " ")}` : "";
  const budgetPart = intent.maxBudget ? ` under ${intent.currency ?? "USD"} ${intent.maxBudget}` : "";
  return `Flights from ${intent.origin} to ${intent.destination} on ${intent.departureDate}${cabinPart}${budgetPart}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FlightCard({ offer, checkoutHref }: { offer: FlightOffer; checkoutHref: string }) {
  const stopCount = offer.segments.length - 1;
  const returnLeg = getReturnLegSummary(offer);
  const isRoundTrip = Boolean(returnLeg);
  const valueScore = getValueScore(offer);
  const technicalStops = offer.segments.flatMap((segment) =>
    (segment.stops ?? []).map((stop) => ({
      flightNumber: segment.flightNumber,
      airportCode: stop.airportCode,
      durationMinutes: stop.durationMinutes,
    })),
  );

  return (
    <motion.article
      variants={cardVariants}
      className="group rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-800/70"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Route */}
        <div className="flex flex-1 items-center gap-3">
          <div className="min-w-[3rem] text-center">
            <p className="text-base font-semibold leading-none tracking-tight">
              {offer.origin}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatTime(offer.departureTime)}
            </p>
          </div>

          <div className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex w-full items-center gap-1 text-zinc-700">
              <div className="h-px flex-1 bg-zinc-700" />
              <Plane className="h-3 w-3 shrink-0" />
              <div className="h-px flex-1 bg-zinc-700" />
            </div>
            <p className="text-[10px] text-zinc-600">
              {formatDuration(offer.durationMinutes)}
            </p>
          </div>

          <div className="min-w-[3rem] text-center">
            <p className="text-base font-semibold leading-none tracking-tight">
              {offer.destination}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatTime(offer.arrivalTime)}
            </p>
          </div>
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold tracking-tight">
            {offer.currency}&nbsp;{offer.price.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] capitalize text-zinc-500">
            {offer.cabin.replace("_", " ")}
          </p>
          {offer.isEstimated && (
            <p className="mt-0.5 text-[10px] text-amber-400/80">Est. Price</p>
          )}
        </div>
      </div>

      {/* Footer badges */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
          {formatDateBadge(offer.departureTime)}
        </span>
        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          {offer.carrierCode}&nbsp;{offer.flightNumber}
        </span>
        {stopCount > 0 && (
          <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            {stopCount}&nbsp;stop{stopCount > 1 ? "s" : ""}
          </span>
        )}
        {offer.isEstimated && (
          <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400/80">
            Estimated Price
          </span>
        )}
        {isRoundTrip && (
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Round Trip
          </span>
        )}
        {offer.isMock && (
          <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
            Mock Data
          </span>
        )}
        {offer.totalEmissionsKg !== undefined && (
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            {formatKg(offer.totalEmissionsKg)}
          </span>
        )}
        {valueScore !== null && (
          <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
            Value {valueScore.toFixed(2)}
          </span>
        )}
        <Link
          href={checkoutHref}
          className="ml-auto rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Book Flight
        </Link>
      </div>

      {returnLeg && (
        <div className="mt-2 rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-1.5">
          <p className="text-[10px] text-zinc-400">
            Return: {returnLeg.origin} {formatTime(returnLeg.departureTime)} to {returnLeg.destination} {formatTime(returnLeg.arrivalTime)}
            {" "}
            ({formatDateBadge(returnLeg.departureTime)})
          </p>
        </div>
      )}

      {technicalStops.length > 0 && (
        <div className="mt-2 space-y-1 rounded-md border border-zinc-800/80 bg-zinc-950/50 p-2">
          {technicalStops.map((stop, index) => (
            <p key={`${stop.flightNumber}-${stop.airportCode}-${index}`} className="text-[10px] text-zinc-400">
              Touchdown {stop.airportCode} on {stop.flightNumber}
              {stop.durationMinutes > 0 ? ` · ${formatDuration(stop.durationMinutes)}` : ""}
            </p>
          ))}
        </div>
      )}
    </motion.article>
  );
}

function TrendCard({ trend, cheapestPrice }: { trend: PriceTrend; cheapestPrice?: number }) {
  const { label, color, bg, border, Icon } = TREND_CONFIG[trend.recommendation];
  const reason = getRecommendationReason(trend);
  const action = getRecommendationAction(trend);

  return (
    /* glassmorphism card */
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Price Analysis
      </p>

      {/* Recommendation badge */}
      <div
        className={`mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${color} ${bg} ${border}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>

      <p className="mb-3 text-xs text-zinc-300">{reason}</p>
      <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
        {action}
      </p>

      <div className="space-y-2.5">
        {cheapestPrice !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Cheapest shown</span>
            <span className="text-xs font-semibold text-emerald-300">
              {trend.currency ?? "USD"}&nbsp;
              {cheapestPrice.toLocaleString()}
            </span>
          </div>
        )}

        {trend.meanPrice !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Historical average</span>
            <span className="text-xs font-medium text-zinc-200">
              {trend.currency ?? "USD"}&nbsp;
              {trend.meanPrice.toLocaleString()}
            </span>
          </div>
        )}

        {trend.medianPrice !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Historical median</span>
            <span className="text-xs font-medium text-zinc-200">
              {trend.currency ?? "USD"}&nbsp;
              {trend.medianPrice.toLocaleString()}
            </span>
          </div>
        )}

        {trend.latestPrice !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Latest observed</span>
            <span className="text-xs font-medium text-zinc-200">
              {trend.currency ?? "USD"}&nbsp;
              {trend.latestPrice.toLocaleString()}
            </span>
          </div>
        )}

        {trend.changeVsMedianPct !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Vs historical median</span>
            <span
              className={`text-xs font-semibold ${
                trend.changeVsMedianPct <= 0 ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {trend.changeVsMedianPct <= 0 ? "" : "+"}
              {(trend.changeVsMedianPct * 100).toFixed(1)}%
            </span>
          </div>
        )}

        {/* Volatility bar */}
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-xs text-zinc-500">Volatility</span>
          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                style={{ width: `${Math.round(trend.volatility * 100)}%` }}
              />
            </div>
            <span className="w-7 text-right text-xs text-zinc-400">
              {Math.round(trend.volatility * 100)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">Data points</span>
          <span className="text-xs text-zinc-400">{trend.sampleSize}</span>
        </div>
      </div>
    </div>
  );
}

function SmartFilters({
  priceCap,
  setPriceCap,
  directOnly,
  onToggleDirectOnly,
  maxStops,
  setMaxStops,
  maxDurationHours,
  setMaxDurationHours,
  hideRedEye,
  setHideRedEye,
  hideEstimated,
  setHideEstimated,
  sortBy,
  setSortBy,
  browseMode,
  setBrowseMode,
  onReset,
}: {
  priceCap: string;
  setPriceCap: (value: string) => void;
  directOnly: boolean;
  onToggleDirectOnly: () => void;
  maxStops: number;
  setMaxStops: (value: number) => void;
  maxDurationHours: number;
  setMaxDurationHours: (value: number) => void;
  hideRedEye: boolean;
  setHideRedEye: (value: boolean) => void;
  hideEstimated: boolean;
  setHideEstimated: (value: boolean) => void;
  sortBy: SortMode;
  setSortBy: (value: SortMode) => void;
  browseMode: BrowseMode;
  setBrowseMode: (value: BrowseMode) => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          <Filter className="h-3.5 w-3.5" />
          Smart Filters
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-[11px] text-zinc-400">
          Max budget
          <input
            value={priceCap}
            onChange={(event) => setPriceCap(sanitizeNumericInput(event.target.value))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 700"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-400">
            Max stops
            <select
              value={maxStops}
              onChange={(event) => setMaxStops(Number(event.target.value))}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
            >
              <option value={0}>Direct only</option>
              <option value={1}>Up to 1 stop</option>
              <option value={2}>Up to 2 stops</option>
            </select>
          </label>

          <label className="text-[11px] text-zinc-400">
            Max duration
            <select
              value={maxDurationHours}
              onChange={(event) => setMaxDurationHours(Number(event.target.value))}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
            >
              <option value={8}>8h</option>
              <option value={12}>12h</option>
              <option value={16}>16h</option>
              <option value={24}>24h</option>
              <option value={36}>36h</option>
            </select>
          </label>
        </div>

        <label className="text-[11px] text-zinc-400">
          Sort by
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortMode)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          >
            <option value="recommended">Recommended</option>
            <option value="price">Cheapest first</option>
            <option value="duration">Fastest first</option>
            <option value="departure">Earliest departure</option>
            <option value="emissions">Lowest emissions</option>
          </select>
        </label>

        <label className="text-[11px] text-zinc-400">
          Browse mode
          <select
            value={browseMode}
            onChange={(event) => setBrowseMode(event.target.value as BrowseMode)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          >
            <option value="all">All flights</option>
            <option value="value">Value hunts</option>
            <option value="comfort">Comfort picks</option>
            <option value="eco">Eco picks</option>
            <option value="night">Night owl deals</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onToggleDirectOnly}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              directOnly ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300" : "border-zinc-700 text-zinc-400"
            }`}
          >
            Direct only
          </button>
          <button
            type="button"
            onClick={() => setHideRedEye(!hideRedEye)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              hideRedEye ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300" : "border-zinc-700 text-zinc-400"
            }`}
          >
            Hide red-eye
          </button>
          <button
            type="button"
            onClick={() => setHideEstimated(!hideEstimated)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              hideEstimated ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300" : "border-zinc-700 text-zinc-400"
            }`}
          >
            Hide estimated
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceWatchPanel({
  intent,
  currency,
  suggestedTarget,
}: {
  intent: TripIntent;
  currency: string;
  suggestedTarget?: number;
}) {
  const [targetPrice, setTargetPrice] = useState(
    suggestedTarget && Number.isFinite(suggestedTarget) ? Math.round(suggestedTarget).toString() : "",
  );
  const [thresholdPct, setThresholdPct] = useState("3");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

  async function createWatch() {
    const numericTarget = Number(targetPrice);
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setStatus({ type: "error", message: "Enter a valid numeric target price." });
      return;
    }

    setIsSaving(true);
    setStatus({ type: "idle" });
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: intent.origin,
          destination: intent.destination,
          departureDate: intent.departureDate,
          returnDate: intent.returnDate,
          tripType: intent.tripType,
          currency,
          targetPrice: numericTarget,
          thresholdPct: Number(thresholdPct) || 0,
        }),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus({ type: "error", message: json.error ?? "Could not create a watch." });
        return;
      }
      setStatus({ type: "success", message: "Price watch armed. We will email you when sniper conditions are met." });
    } catch {
      setStatus({ type: "error", message: "Failed to save watch. Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <Bell className="h-3.5 w-3.5" />
        Route Watch
      </div>
      <p className="mb-3 text-xs text-zinc-400">
        Turn this search into a passive tracker. We will monitor this route and notify you by email when your target window is hit.
      </p>
      <p className="mb-3 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-zinc-400">
        Watching {intent.tripType === "round_trip" ? "round trip" : "one way"}: {intent.origin} to {intent.destination} on {intent.departureDate}
        {intent.returnDate ? `, returning ${intent.returnDate}` : ""}
      </p>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-[11px] text-zinc-400">
          Target price ({currency})
          <input
            value={targetPrice}
            onChange={(event) => setTargetPrice(sanitizeNumericInput(event.target.value))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 620"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </label>

        <label className="text-[11px] text-zinc-400">
          Leniency window
          <select
            value={thresholdPct}
            onChange={(event) => setThresholdPct(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          >
            <option value="0">Strict (0%)</option>
            <option value="3">Balanced (3%)</option>
            <option value="5">Flexible (5%)</option>
            <option value="8">Wide net (8%)</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            void createWatch();
          }}
          disabled={isSaving}
          className="mt-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
        >
          {isSaving ? "Arming sniper..." : "Set price watch"}
        </button>

        {status.message && (
          <p className={`text-xs ${status.type === "error" ? "text-red-300" : "text-emerald-300"}`}>
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

function QuickInsights({ flights }: { flights: FlightOffer[] }) {
  const cheapest = useMemo(
    () => flights.reduce<FlightOffer | null>((best, flight) => (best === null || flight.price < best.price ? flight : best), null),
    [flights],
  );
  const fastest = useMemo(
    () => flights.reduce<FlightOffer | null>((best, flight) => (best === null || flight.durationMinutes < best.durationMinutes ? flight : best), null),
    [flights],
  );
  const greenest = useMemo(
    () => flights
      .filter((flight) => flight.totalEmissionsKg !== undefined)
      .reduce<FlightOffer | null>((best, flight) => {
        if (best === null) return flight;
        return (flight.totalEmissionsKg ?? Number.POSITIVE_INFINITY) < (best.totalEmissionsKg ?? Number.POSITIVE_INFINITY)
          ? flight
          : best;
      }, null),
    [flights],
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Quick Picks
      </div>
      <div className="space-y-2 text-xs text-zinc-300">
        {cheapest && (
          <p className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5">
            <span>Best price</span>
            <span className="font-medium text-emerald-300">{cheapest.currency} {cheapest.price.toLocaleString()}</span>
          </p>
        )}
        {fastest && (
          <p className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Fastest</span>
            <span className="font-medium">{formatDuration(fastest.durationMinutes)}</span>
          </p>
        )}
        {greenest && (
          <p className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1"><Leaf className="h-3 w-3" /> Lowest CO2</span>
            <span className="font-medium text-emerald-300">{formatKg(greenest.totalEmissionsKg ?? 0)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function AlternativesPanel({
  alternatives,
  onSelect,
}: {
  alternatives: TripIntent[];
  onSelect: (intent: TripIntent) => void;
}) {
  if (alternatives.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <MapPin className="h-3 w-3" />
        Nearby Airports
      </div>
      <div className="flex flex-wrap gap-2">
        {alternatives.map((alt) => (
          <button
            key={alt.origin}
            onClick={() => onSelect(alt)}
            className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300"
          >
            {alt.origin}
            <ArrowRight className="h-2.5 w-2.5 opacity-50" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Exported skeleton ─────────────────────────────────────────────────────────

export function ResultsGridSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-3">
      <div className="space-y-3 md:col-span-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] rounded-xl bg-zinc-800/60" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-44 rounded-xl bg-zinc-800/60" />
        <div className="h-28 rounded-xl bg-zinc-800/60" />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ResultsGrid({ data, onAlternativeClick }: ResultsGridProps) {
  const { flights, alternatives, trendMetadata } = data;
  const [priceCap, setPriceCap] = useState("");
  const [directOnly, setDirectOnly] = useState(false);
  const [maxStops, setMaxStops] = useState(2);
  const previousMaxStopsRef = useRef(2);
  const [maxDurationHours, setMaxDurationHours] = useState(24);
  const [hideRedEye, setHideRedEye] = useState(false);
  const [hideEstimated, setHideEstimated] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("recommended");
  const [browseMode, setBrowseMode] = useState<BrowseMode>("all");

  const numericPriceCap = Number(priceCap);

  const filteredFlights = useMemo(() => {
    const constrainedMaxStops = directOnly ? 0 : maxStops;
    let next = flights.filter((flight) => {
      if (!Number.isFinite(flight.price) || flight.price <= 0) return false;
      if (Number.isFinite(numericPriceCap) && numericPriceCap > 0 && flight.price > numericPriceCap) return false;
      if (getStopCount(flight) > constrainedMaxStops) return false;
      if (flight.durationMinutes > maxDurationHours * 60) return false;
      if (hideRedEye && isRedEye(flight)) return false;
      if (hideEstimated && flight.isEstimated) return false;
      return true;
    });

    if (browseMode !== "all") {
      const sortedPrices = next.map((flight) => flight.price).sort((a, b) => a - b);
      const valueCap = percentile(sortedPrices, 0.35);
      const ecoEmissions = next
        .map((flight) => flight.totalEmissionsKg)
        .filter((value): value is number => value !== undefined && Number.isFinite(value))
        .sort((a, b) => a - b);
      const ecoCap = percentile(ecoEmissions, 0.4);

      next = next.filter((flight) => {
        if (browseMode === "value") {
          return flight.price <= valueCap && getStopCount(flight) <= 1;
        }
        if (browseMode === "comfort") {
          return getStopCount(flight) <= 1 && !isRedEye(flight) && flight.durationMinutes <= 10 * 60;
        }
        if (browseMode === "eco") {
          return (flight.totalEmissionsKg ?? Number.POSITIVE_INFINITY) <= ecoCap;
        }
        if (browseMode === "night") {
          return isRedEye(flight) && flight.price <= percentile(sortedPrices, 0.5);
        }
        return true;
      });
    }

    next = [...next].sort((left, right) => {
      if (sortBy === "price") return left.price - right.price;
      if (sortBy === "duration") return left.durationMinutes - right.durationMinutes;
      if (sortBy === "departure") return Date.parse(left.departureTime) - Date.parse(right.departureTime);
      if (sortBy === "emissions") {
        const leftEmissions = left.totalEmissionsKg ?? Number.POSITIVE_INFINITY;
        const rightEmissions = right.totalEmissionsKg ?? Number.POSITIVE_INFINITY;
        return leftEmissions - rightEmissions;
      }

      const leftStops = getStopCount(left);
      const rightStops = getStopCount(right);
      if (leftStops !== rightStops) return leftStops - rightStops;

      const leftComposite = left.price * 0.6 + left.durationMinutes * 0.4;
      const rightComposite = right.price * 0.6 + right.durationMinutes * 0.4;
      return leftComposite - rightComposite;
    });

    return next;
  }, [browseMode, directOnly, flights, hideEstimated, hideRedEye, maxDurationHours, maxStops, numericPriceCap, sortBy]);

  const displayedTrend = computeDisplayedTrend(filteredFlights, trendMetadata);
  const cheapestPrice = filteredFlights
    .map((flight) => flight.price)
    .filter((price) => Number.isFinite(price) && price > 0)
    .reduce<number | undefined>((min, value) => (min === undefined || value < min ? value : min), undefined);

  const resetFilters = () => {
    setPriceCap("");
    setDirectOnly(false);
    setMaxStops(2);
    previousMaxStopsRef.current = 2;
    setMaxDurationHours(24);
    setHideRedEye(false);
    setHideEstimated(false);
    setSortBy("recommended");
    setBrowseMode("all");
  };

  const toggleDirectOnly = () => {
    if (!directOnly) {
      previousMaxStopsRef.current = maxStops;
      setDirectOnly(true);
      setMaxStops(0);
      return;
    }

    setDirectOnly(false);
    setMaxStops(Math.max(1, previousMaxStopsRef.current));
  };

  const returnTo = `/dashboard?q=${encodeURIComponent(buildQueryFromIntent(data.intent))}`;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Flight list — staggered */}
      <motion.div
        className="space-y-3 md:col-span-2"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        {filteredFlights.length === 0 ? (
          <motion.div
            variants={cardVariants}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center"
          >
            <Plane className="mx-auto mb-3 h-7 w-7 text-zinc-700" />
            <p className="text-sm text-zinc-500">
              No flights match your filters. Try loosening stops, budget, or duration.
            </p>
          </motion.div>
        ) : (
          filteredFlights.map((offer) => (
            <FlightCard
              key={offer.id}
              offer={offer}
              checkoutHref={`/checkout/${encodeURIComponent(offer.id)}?returnTo=${encodeURIComponent(returnTo)}`}
            />
          ))
        )}
      </motion.div>

      {/* Sidebar — slides in */}
      <motion.div
        className="space-y-3"
        variants={sidebarVariants}
        initial="hidden"
        animate="show"
      >
        <SmartFilters
          priceCap={priceCap}
          setPriceCap={setPriceCap}
          directOnly={directOnly}
          onToggleDirectOnly={toggleDirectOnly}
          maxStops={maxStops}
          setMaxStops={setMaxStops}
          maxDurationHours={maxDurationHours}
          setMaxDurationHours={setMaxDurationHours}
          hideRedEye={hideRedEye}
          setHideRedEye={setHideRedEye}
          hideEstimated={hideEstimated}
          setHideEstimated={setHideEstimated}
          sortBy={sortBy}
          setSortBy={setSortBy}
          browseMode={browseMode}
          setBrowseMode={setBrowseMode}
          onReset={resetFilters}
        />
        {!AUTH_DISABLED && (
          <PriceWatchPanel
            intent={data.intent}
            currency={trendMetadata.currency ?? flights[0]?.currency ?? "USD"}
            suggestedTarget={cheapestPrice}
          />
        )}
        <QuickInsights flights={filteredFlights} />
        <TrendCard trend={displayedTrend} cheapestPrice={cheapestPrice} />
        <AlternativesPanel alternatives={alternatives} onSelect={onAlternativeClick} />
      </motion.div>
    </div>
  );
}
