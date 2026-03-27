"use client";

import { useEffect, useState } from "react";

interface FlightStatus {
  segmentKey: string;
  flightIata: string;
  scheduledDeparture?: string;
  estimatedDeparture?: string;
  departureGate?: string;
  departureTerminal?: string;
  delayMinutes?: number;
  status?: string;
}

interface FlightStatusCardsProps {
  orderId: string;
}

function formatTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function normalizeStatus(status?: string): string {
  if (!status) return "unknown";
  return status.replace(/_/g, " ");
}

export function FlightStatusCards({ orderId }: FlightStatusCardsProps) {
  const [statuses, setStatuses] = useState<FlightStatus[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStatuses() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`);
        const payload = (await response.json()) as {
          statuses?: FlightStatus[];
          error?: string;
        };

        if (!response.ok || !Array.isArray(payload.statuses)) {
          if (isMounted) {
            setErrorMessage(payload.error ?? "Unable to load live status right now.");
          }
          return;
        }

        if (isMounted) {
          setStatuses(payload.statuses);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to load live status right now.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStatuses();
    const interval = window.setInterval(() => {
      void loadStatuses();
    }, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [orderId]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Live Flight Status</h2>
        <span className="text-[11px] text-zinc-500">Auto-refresh every 60s</span>
      </div>

      {isLoading && <p className="mt-3 text-xs text-zinc-500">Loading status cards...</p>}

      {errorMessage && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errorMessage}
        </p>
      )}

      {!isLoading && !errorMessage && statuses.length === 0 && (
        <p className="mt-3 text-xs text-zinc-500">No trackable segments found for this order.</p>
      )}

      {statuses.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {statuses.map((status) => (
            <article key={`${status.segmentKey}-${status.flightIata}`} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-zinc-100">{status.flightIata}</p>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] capitalize text-zinc-300">
                  {normalizeStatus(status.status)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                <p>Sched: <span className="text-zinc-200">{formatTime(status.scheduledDeparture)}</span></p>
                <p>Est: <span className="text-zinc-200">{formatTime(status.estimatedDeparture)}</span></p>
                <p>Terminal: <span className="text-zinc-200">{status.departureTerminal ?? "-"}</span></p>
                <p>Gate: <span className="text-zinc-200">{status.departureGate ?? "-"}</span></p>
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">
                Delay: <span className="text-zinc-200">{status.delayMinutes !== undefined ? `${status.delayMinutes} min` : "-"}</span>
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
