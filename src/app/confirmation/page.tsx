import Link from "next/link";

import { DuffelAssistantLauncher } from "@/components/support/duffel-assistant-launcher";

interface ConfirmationPageProps {
  searchParams: Promise<{
    bookingReference?: string;
    orderId?: string;
    airline?: string;
    returnTo?: string;
    customerUserId?: string;
  }>;
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const params = await searchParams;
  const bookingReference = params.bookingReference ?? "Unavailable";
  const orderId = params.orderId ?? "Unavailable";
  const airline = params.airline ?? "Airline";
  const customerUserId = typeof params.customerUserId === "string" ? params.customerUserId : "";
  const returnTo = typeof params.returnTo === "string" && params.returnTo.startsWith("/")
    ? params.returnTo
    : "/dashboard";

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <h1 className="text-3xl font-bold tracking-tight text-emerald-300">Booking Confirmed</h1>
        <p className="mt-2 text-sm text-zinc-300">Your Duffel order was created successfully.</p>

        <div className="mt-5 space-y-2 rounded-lg border border-zinc-800 bg-black/40 p-4 text-sm">
          <p>
            Airline: <span className="font-semibold text-zinc-100">{airline}</span>
          </p>
          <p>
            Booking reference: <span className="font-semibold text-zinc-100">{bookingReference}</span>
          </p>
          <p>
            Order ID: <span className="font-semibold text-zinc-100">{orderId}</span>
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={returnTo}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-600"
          >
            Back to results
          </Link>
          {orderId !== "Unavailable" && (
            <Link
              href={`/orders/${encodeURIComponent(orderId)}`}
              className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30"
            >
              Manage this booking
            </Link>
          )}
        </div>

        {customerUserId && orderId !== "Unavailable" && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-black/30 p-3">
            <p className="mb-2 text-xs text-zinc-400">Need to change or cancel? Open Duffel Assistant.</p>
            <DuffelAssistantLauncher userId={customerUserId} orderId={orderId} issueType="other" />
          </div>
        )}
      </div>
    </div>
  );
}
