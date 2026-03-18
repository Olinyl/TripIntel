"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ResultsGrid,
  ResultsGridSkeleton,
  type SearchResult,
} from "@/components/search/results-grid";
import type { TripIntent } from "@/lib/domain/types";

interface Props {
  userEmail: string;
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: SearchResult };

export function SearchDashboard({ userEmail }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQueryFromUrl = searchParams.get("q")?.trim() ?? "";
  const [query, setQuery] = useState(initialQueryFromUrl);
  const [loyaltyAirlineCode, setLoyaltyAirlineCode] = useState("");
  const [loyaltyAccountNumber, setLoyaltyAccountNumber] = useState("");
  const [useAmeliaTestProfile, setUseAmeliaTestProfile] = useState(false);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasHydratedFromUrlRef = useRef(false);

  const updateUrlWithQuery = useCallback((nextQuery: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    } else {
      params.delete("q");
    }
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [pathname, router, searchParams]);

  const runSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          loyaltyAirlineCode: loyaltyAirlineCode.trim() || undefined,
          loyaltyAccountNumber: loyaltyAccountNumber.trim() || undefined,
          useAmeliaTestProfile,
        }),
      });
      const json = (await res.json()) as SearchResult & { error?: string };

      if (!res.ok) {
        setState({ status: "error", message: json.error ?? "Search failed." });
      } else {
        setState({ status: "success", data: json });
        updateUrlWithQuery(searchQuery);
      }
    } catch {
      setState({
        status: "error",
        message: "Unable to reach the search service. Please try again.",
      });
    }
  }, [loyaltyAccountNumber, loyaltyAirlineCode, updateUrlWithQuery, useAmeliaTestProfile]);

  function handleAlternativeClick(intent: TripIntent) {
    const q = `Flights from ${intent.origin} to ${intent.destination} on ${intent.departureDate}`;
    setQuery(q);
    void runSearch(q);
  }

  const intentChips =
    state.status === "success"
      ? [
          { key: "origin", label: state.data.intent.origin },
          { key: "destination", label: state.data.intent.destination },
          { key: "date", label: state.data.intent.departureDate },
          ...(state.data.intent.returnDate
            ? [{ key: "returnDate", label: state.data.intent.returnDate }]
            : []),
          { key: "pax", label: `${state.data.intent.passengers} pax` },
          { key: "cabin", label: state.data.intent.cabin?.replace("_", " ") ?? "economy" },
          ...(state.data.intent.maxBudget
            ? [{ key: "budget", label: `≤ ${state.data.intent.currency ?? "USD"} ${state.data.intent.maxBudget}` }]
            : []),
        ]
      : [];

  function handleChipClick(chipKey: string) {
    if (state.status !== "success") return;

    const intent = state.data.intent;
    const baseQuery = `Flights from ${intent.origin} to ${intent.destination} on ${intent.departureDate}`;
    setQuery(baseQuery);

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      if (chipKey === "date") {
        searchInputRef.current?.setSelectionRange(baseQuery.length - intent.departureDate.length, baseQuery.length);
      }
    });
  }

  function clearSearchFromTags() {
    setQuery("");
    setState({ status: "idle" });
    updateUrlWithQuery("");
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }

  useEffect(() => {
    if (hasHydratedFromUrlRef.current) return;
    const initialQuery = initialQueryFromUrl;
    if (!initialQuery) {
      hasHydratedFromUrlRef.current = true;
      return;
    }

    hasHydratedFromUrlRef.current = true;
    const timer = window.setTimeout(() => {
      void runSearch(initialQuery);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialQueryFromUrl, runSearch]);

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TripIntel</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as{" "}
            <span className="text-zinc-300">{userEmail}</span>
          </p>
        </div>

        {/* ── Search box ───────────────────────────────────────────────────── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Flights from SFO to LHR next Friday, business class under $2000"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3.5 pl-11 pr-28 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            disabled={state.status === "loading" || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.status === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </form>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            value={loyaltyAirlineCode}
            onChange={(e) => setLoyaltyAirlineCode(e.target.value.toUpperCase())}
            placeholder="Loyalty airline code (e.g. ZZ)"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
          <input
            value={loyaltyAccountNumber}
            onChange={(e) => setLoyaltyAccountNumber(e.target.value)}
            placeholder="Loyalty account number"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => {
              setUseAmeliaTestProfile((prev) => !prev);
              if (!useAmeliaTestProfile) {
                setLoyaltyAirlineCode("ZZ");
                setLoyaltyAccountNumber("1234567890");
              }
            }}
            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
              useAmeliaTestProfile
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {useAmeliaTestProfile ? "Amelia Earhart loyalty: ON" : "Use Amelia Earhart test loyalty"}
          </button>
        </div>

        {/* ── Intent chips ──────────────────────────────────────────────────── */}
        {intentChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {intentChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => handleChipClick(chip.key)}
                className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              onClick={clearSearchFromTags}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-red-500/50 hover:text-red-300"
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {state.status === "error" && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {state.message}
          </p>
        )}

        {/* ── Loading skeleton ──────────────────────────────────────────────── */}
        {state.status === "loading" && <ResultsGridSkeleton />}

        {/* ── Results ───────────────────────────────────────────────────────── */}
        {state.status === "success" && (
          <ResultsGrid
            data={state.data}
            onAlternativeClick={handleAlternativeClick}
          />
        )}
      </div>
    </div>
  );
}
