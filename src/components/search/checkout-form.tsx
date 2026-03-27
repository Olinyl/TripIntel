"use client";

import { useState } from "react";
import { DuffelAncillaries } from "@duffel/components";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FlexConditionsCard } from "@/components/support/flex-conditions-card";

interface CheckoutFormProps {
  offerId: string;
  offer: Record<string, unknown>;
  seatMaps: unknown[];
  userEmail: string;
  isAuthenticated: boolean;
  returnTo: string;
}

interface FormState {
  givenName: string;
  familyName: string;
  bornOn: string;
  gender: "m" | "f";
  title: "mr" | "mrs" | "ms";
  email: string;
  phoneNumber: string;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getOfferPassengerId(offer: Record<string, unknown>): string {
  const passengers = Array.isArray(offer.passengers) ? offer.passengers : [];
  const firstPassenger = passengers[0];
  if (!firstPassenger || typeof firstPassenger !== "object") return "";
  return asString((firstPassenger as Record<string, unknown>).id);
}

function formatIsoDateTime(value: unknown): string {
  const iso = asString(value);
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function createExternalSearchUrl(params: {
  origin: string;
  destination: string;
  departureIso: string;
  returnIso?: string;
}): string {
  const parseDate = (iso: string): string => {
    if (!iso) return "";
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const origin = params.origin.trim().toUpperCase();
  const destination = params.destination.trim().toUpperCase();
  const departureDate = parseDate(params.departureIso);
  const returnDate = parseDate(params.returnIso ?? "");

  const pieces = [
    "Flights",
    origin && destination ? `from ${origin} to ${destination}` : "",
    departureDate ? `on ${departureDate}` : "",
    returnDate ? `returning ${returnDate}` : "",
  ].filter(Boolean);

  return `https://www.google.com/travel/flights?hl=en&q=${encodeURIComponent(pieces.join(" "))}`;
}

interface SelectedService {
  id: string;
  quantity: number;
}

export function CheckoutForm({ offerId, offer, seatMaps, userEmail, isAuthenticated, returnTo }: CheckoutFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const defaultPassengerId = getOfferPassengerId(offer);
  const slices = Array.isArray(offer.slices) ? offer.slices : [];
  const firstSlice = slices[0] && typeof slices[0] === "object"
    ? (slices[0] as Record<string, unknown>)
    : {};
  const origin = asString((firstSlice.origin as Record<string, unknown> | undefined)?.iata_code, "-");
  const destination = asString((firstSlice.destination as Record<string, unknown> | undefined)?.iata_code, "-");

  const [form, setForm] = useState<FormState>({
    givenName: "",
    familyName: "",
    bornOn: "",
    gender: "m",
    title: "mr",
    email: userEmail,
    phoneNumber: "+1",
  });

  const amount = asString(offer.total_amount, "-");
  const currency = asString(offer.total_currency, "USD");
  const firstSegment = Array.isArray(firstSlice.segments) && firstSlice.segments[0]
    ? (firstSlice.segments[0] as Record<string, unknown>)
    : {};
  const secondSlice = slices[1] && typeof slices[1] === "object"
    ? (slices[1] as Record<string, unknown>)
    : {};
  const secondSegment = Array.isArray(secondSlice.segments) && secondSlice.segments[0]
    ? (secondSlice.segments[0] as Record<string, unknown>)
    : {};
  const externalSearchUrl = createExternalSearchUrl({
    origin,
    destination,
    departureIso: asString(firstSegment.departing_at),
    returnIso: asString(secondSegment.departing_at),
  });
  const departureText = formatIsoDateTime(firstSegment.departing_at);
  const ancillariesPassengers = defaultPassengerId
    ? [
        {
          id: defaultPassengerId,
          given_name: form.givenName || "Traveler",
          family_name: form.familyName || "Guest",
          gender: form.gender,
          title: form.title,
          born_on: form.bornOn || "1990-01-01",
          email: form.email || userEmail,
          phone_number: form.phoneNumber || "+10000000000",
        },
      ]
    : [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");

    if (!defaultPassengerId) {
      setErrorMessage("Offer passenger id is missing. Please go back and select another offer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId,
          passengers: [
            {
              id: defaultPassengerId,
              given_name: form.givenName,
              family_name: form.familyName,
              born_on: form.bornOn,
              gender: form.gender,
              title: form.title,
              email: form.email,
              phone_number: form.phoneNumber,
            },
          ],
          services: selectedServices,
        }),
      });

      const json = (await res.json()) as {
        error?: string;
        order?: Record<string, unknown>;
      };

      if (!res.ok || !json.order) {
        setErrorMessage(json.error ?? "Booking failed.");
        return;
      }

      const bookingReference = asString(json.order.booking_reference, "");
      const orderId = asString(json.order.id, "");
      const airline = asString((json.order.owner as Record<string, unknown> | undefined)?.name, "Airline");
      const orderUsers = Array.isArray(json.order.users)
        ? json.order.users.filter((entry): entry is string => typeof entry === "string")
        : [];
      const customerUserId = orderUsers[0] ?? "";

      const params = new URLSearchParams({
        bookingReference,
        orderId,
        airline,
        returnTo,
        ...(customerUserId ? { customerUserId } : {}),
      });
      router.push(`/confirmation?${params.toString()}`);
    } catch {
      setErrorMessage("Unable to create order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Checkout</h1>
          <p className="mt-1 text-sm text-zinc-300">Complete passenger details to create a live Duffel order in test mode.</p>
          <Link
            href={returnTo}
            className="mt-3 inline-block text-xs font-medium text-indigo-300 transition-colors hover:text-indigo-200"
          >
            Back to search results
          </Link>
        </div>

        {!isAuthenticated && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">Before you purchase</h2>
            <p className="mt-1 text-xs text-zinc-400">
              You can sign in now for a smoother post-booking experience, or continue as guest if you prefer.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/login?next=${encodeURIComponent(`/checkout/${offerId}`)}`}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-500"
              >
                Sign in before purchase
              </Link>
              <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                Continue as guest
              </span>
            </div>
          </section>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-200">{origin} to {destination}</p>
          <p className="mt-1 text-xs text-zinc-400">Departure: {departureText}</p>
          <p className="mt-2 text-lg font-semibold text-zinc-50">{currency} {amount}</p>
          <p className="mt-1 text-[11px] text-zinc-500">Offer ID: {offerId}</p>
          <a
            href={externalSearchUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-200 transition-colors hover:border-indigo-500/60 hover:text-indigo-300"
          >
            Open External Booking View
          </a>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={form.givenName}
              onChange={(e) => setForm((prev) => ({ ...prev, givenName: e.target.value }))}
              placeholder="First name"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-indigo-500/60"
            />
            <input
              value={form.familyName}
              onChange={(e) => setForm((prev) => ({ ...prev, familyName: e.target.value }))}
              placeholder="Last name"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-indigo-500/60"
            />
            <input
              value={form.bornOn}
              onChange={(e) => setForm((prev) => ({ ...prev, bornOn: e.target.value }))}
              type="date"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
            />
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              type="email"
              placeholder="Email"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-indigo-500/60"
            />
            <input
              value={form.phoneNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
              placeholder="Phone number"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-indigo-500/60"
            />
            <select
              value={form.gender}
              onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value as "m" | "f" }))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
            >
              <option value="m">Male</option>
              <option value="f">Female</option>
            </select>
            <select
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value as "mr" | "mrs" | "ms" }))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
            >
              <option value="mr">Mr</option>
              <option value="mrs">Mrs</option>
              <option value="ms">Ms</option>
            </select>
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {isSubmitting ? "Creating booking..." : "Confirm Booking"}
          </button>
        </form>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">Optional bags and seats</p>
            <p className="text-xs text-zinc-500">Selected services: {selectedServices.length}</p>
          </div>

          {defaultPassengerId ? (
            <div className="rounded-lg bg-white p-3 text-zinc-900">
              <DuffelAncillaries
                debug
                offer={offer as never}
                seat_maps={seatMaps as never}
                services={["bags", "seats"]}
                passengers={ancillariesPassengers as never}
                onPayloadReady={(payload) => {
                  const payloadRecord = payload as unknown as Record<string, unknown>;
                  const payloadServices = Array.isArray(payloadRecord.services) ? payloadRecord.services : [];
                  const normalized = payloadServices
                    .map((service) => {
                      if (!service || typeof service !== "object") return null;
                      const value = service as Record<string, unknown>;
                      const id = asString(value.id);
                      const quantity = typeof value.quantity === "number" ? value.quantity : 1;
                      if (!id) return null;
                      return { id, quantity };
                    })
                    .filter((service): service is SelectedService => Boolean(service));
                  setSelectedServices(normalized);
                }}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Select a valid offer first to load ancillaries.
            </p>
          )}
        </div>

        <FlexConditionsCard
          title="Offer flexibility conditions"
          source={offer}
        />
      </div>
    </div>
  );
}
