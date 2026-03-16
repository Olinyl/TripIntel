"use client";

import React from "react";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Minus,
  Plane,
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
        <Link
          href={checkoutHref}
          className="ml-auto rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Book Flight
        </Link>
      </div>

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
  const displayedTrend = computeDisplayedTrend(flights, trendMetadata);
  const cheapestPrice = flights
    .map((flight) => flight.price)
    .filter((price) => Number.isFinite(price) && price > 0)
    .reduce<number | undefined>((min, value) => (min === undefined || value < min ? value : min), undefined);
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
        {flights.length === 0 ? (
          <motion.div
            variants={cardVariants}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center"
          >
            <Plane className="mx-auto mb-3 h-7 w-7 text-zinc-700" />
            <p className="text-sm text-zinc-500">
              No flights found for this route.
            </p>
          </motion.div>
        ) : (
          flights.map((offer) => (
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
        <TrendCard trend={displayedTrend} cheapestPrice={cheapestPrice} />
        <AlternativesPanel alternatives={alternatives} onSelect={onAlternativeClick} />
      </motion.div>
    </div>
  );
}
