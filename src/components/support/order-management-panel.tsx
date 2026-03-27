"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AITravelAssistantChat } from "@/components/support/ai-travel-assistant-chat";
import { DuffelAssistantLauncher } from "@/components/support/duffel-assistant-launcher";
import { FlexConditionsCard } from "@/components/support/flex-conditions-card";
import { FlightStatusCards } from "@/components/support/flight-status-cards";

type UnknownRecord = Record<string, unknown>;

interface OrderManagementPanelProps {
  orderId: string;
}

interface AvailableService {
  id: string;
  amount: string;
  currency: string;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function OrderManagementPanel({ orderId }: OrderManagementPanelProps) {
  const [order, setOrder] = useState<UnknownRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationQuote, setCancellationQuote] = useState<UnknownRecord | null>(null);
  const [services, setServices] = useState<AvailableService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [isAddingService, setIsAddingService] = useState(false);

  const refreshOrder = useCallback(async () => {
    setErrorMessage("");
    setIsLoading(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      const json = (await res.json()) as { error?: string; order?: UnknownRecord };
      if (!res.ok || !json.order) {
        setErrorMessage(json.error ?? "Unable to load order.");
        return;
      }
      setOrder(json.order);
    } catch {
      setErrorMessage("Unable to load order right now.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  const loadServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/services`);
      const json = (await res.json()) as { error?: string; services?: UnknownRecord[] };
      if (!res.ok || !Array.isArray(json.services)) return;

      const mapped = json.services.map((entry) => {
        const service = asRecord(entry);
        return {
          id: asString(service.id),
          amount: asString(service.total_amount, "0.00"),
          currency: asString(service.total_currency, "USD"),
        } satisfies AvailableService;
      }).filter((service) => service.id);

      setServices(mapped);
      if (mapped[0] && !selectedServiceId) {
        setSelectedServiceId(mapped[0].id);
      }
    } catch {
      // Non-blocking for now.
    }
  }, [orderId, selectedServiceId]);

  useEffect(() => {
    void refreshOrder();
    void loadServices();
  }, [loadServices, refreshOrder]);

  const availableActions = useMemo(() => asStringArray(order?.available_actions), [order]);
  const bookingReference = asString(order?.booking_reference, "Unavailable");
  const totalAmount = asString(order?.total_amount, "-");
  const totalCurrency = asString(order?.total_currency, "USD");
  const owner = asRecord(order?.owner);
  const airlineName = asString(owner.name, "Airline");
  const userIds = asStringArray(order?.users);
  const assistantUserId = userIds[0];
  const orderSummary = [
    `Order ${orderId}`,
    `Airline ${airlineName}`,
    `Booking reference ${bookingReference}`,
    `Total ${totalCurrency} ${totalAmount}`,
  ].join(" | ");

  async function createCancellationQuote() {
    setIsCancelling(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quote" }),
      });
      const json = (await res.json()) as { error?: string; cancellation?: UnknownRecord };
      if (!res.ok || !json.cancellation) {
        setErrorMessage(json.error ?? "Unable to fetch cancellation quote.");
        return;
      }
      setCancellationQuote(json.cancellation);
    } catch {
      setErrorMessage("Unable to fetch cancellation quote.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function confirmCancellation() {
    const cancellationId = asString(cancellationQuote?.id);
    if (!cancellationId) return;

    setIsCancelling(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", cancellationId }),
      });
      const json = (await res.json()) as { error?: string; cancellation?: UnknownRecord };
      if (!res.ok || !json.cancellation) {
        setErrorMessage(json.error ?? "Unable to confirm cancellation.");
        return;
      }
      setCancellationQuote(json.cancellation);
      await refreshOrder();
    } catch {
      setErrorMessage("Unable to confirm cancellation.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function addBagsOrServices() {
    if (!selectedServiceId) {
      setErrorMessage("Select a service first.");
      return;
    }

    setIsAddingService(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: [{ id: selectedServiceId, quantity: Math.max(1, serviceQuantity) }],
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMessage(json.error ?? "Unable to add service.");
        return;
      }
      await refreshOrder();
      await loadServices();
    } catch {
      setErrorMessage("Unable to add service.");
    } finally {
      setIsAddingService(false);
    }
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manage Booking</h1>
            <p className="mt-1 text-sm text-zinc-500">Order {orderId}</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600"
          >
            Back to dashboard
          </Link>
        </div>

        {errorMessage && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          {isLoading ? (
            <p className="text-sm text-zinc-500">Loading order...</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>
                Airline: <span className="font-semibold text-zinc-100">{airlineName}</span>
              </p>
              <p>
                Booking reference: <span className="font-semibold text-zinc-100">{bookingReference}</span>
              </p>
              <p>
                Total: <span className="font-semibold text-zinc-100">{totalCurrency} {totalAmount}</span>
              </p>
              <p className="text-xs text-zinc-500">Available actions: {availableActions.join(", ") || "none"}</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Support Assistant</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Opens Duffel Assistant for cancellation/change support and human handoff when automation is limited.
          </p>
          {assistantUserId ? (
            <div className="mt-3">
              <DuffelAssistantLauncher
                userId={assistantUserId}
                orderId={orderId}
                issueType="other"
                summary={orderSummary}
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-amber-300">
              No Duffel customer user is attached to this order yet, so Assistant cannot be opened for this booking.
            </p>
          )}
        </section>

        <AITravelAssistantChat
          context={{
            issueType: "other",
            summary: orderSummary,
            orderSnapshot: order ?? undefined,
          }}
        />

        <FlightStatusCards orderId={orderId} />

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Cancel Order</h2>
          <p className="mt-1 text-xs text-zinc-500">Step 1 creates a quote. Step 2 confirms it.</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isCancelling || !availableActions.includes("cancel")}
              onClick={() => {
                void createCancellationQuote();
              }}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-600 disabled:opacity-40"
            >
              {isCancelling ? "Working..." : "Create cancellation quote"}
            </button>
            <button
              type="button"
              disabled={isCancelling || !asString(cancellationQuote?.id)}
              onClick={() => {
                void confirmCancellation();
              }}
              className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/30 disabled:opacity-40"
            >
              Confirm cancellation
            </button>
          </div>

          {cancellationQuote && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300">
              <p>Quote ID: {asString(cancellationQuote.id)}</p>
              <p>Refund: {asString(cancellationQuote.refund_currency)} {asString(cancellationQuote.refund_amount, "0.00")}</p>
              <p>Refund to: {asString(cancellationQuote.refund_to, "-")}</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Add Post-Booking Bags/Services</h2>
          <p className="mt-1 text-xs text-zinc-500">Loads available services from Duffel and books selected quantity.</p>

          {services.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500">No available services were returned for this order.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"
              >
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.id} ({service.currency} {service.amount})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={serviceQuantity}
                onChange={(e) => setServiceQuantity(Number(e.target.value || 1))}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"
              />
              <button
                type="button"
                disabled={isAddingService}
                onClick={() => {
                  void addBagsOrServices();
                }}
                className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              >
                {isAddingService ? "Adding..." : "Add service"}
              </button>
            </div>
          )}
        </section>

        {order && (
          <FlexConditionsCard
            title="Order flexibility conditions"
            source={order}
          />
        )}
      </div>
    </div>
  );
}
