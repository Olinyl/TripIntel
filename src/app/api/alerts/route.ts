import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isAuthDisabled } from "@/lib/auth/mode";
import type { TripType } from "@/lib/domain/types";

interface AlertBody {
  origin?: unknown;
  destination?: unknown;
  departureDate?: unknown;
  returnDate?: unknown;
  tripType?: unknown;
  targetPrice?: unknown;
  currency?: unknown;
  thresholdPct?: unknown;
}

interface SupabaseInsertError {
  message: string;
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isTripType(value: unknown): value is TripType {
  return value === "one_way" || value === "round_trip";
}

function getMissingColumnName(message: string): string | null {
  const match = /Could not find the '([^']+)' column/i.exec(message);
  return match?.[1] ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (isAuthDisabled()) {
      return NextResponse.json(
        { error: "Price watches are unavailable while guest mode is enabled." },
        { status: 403 },
      );
    }

    const supabase = await getServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "You must be signed in to create a price watch." }, { status: 401 });
    }

    const body = (await request.json()) as AlertBody;
    const origin = asString(body.origin).toUpperCase();
    const destination = asString(body.destination).toUpperCase();
    const departureDate = asString(body.departureDate);
    const returnDate = asString(body.returnDate);
    const currency = asString(body.currency).toUpperCase() || "USD";
    const targetPrice = asNumber(body.targetPrice);
    const thresholdPctRaw = asNumber(body.thresholdPct) ?? 0;
    const thresholdPct = Math.max(0, Math.min(20, thresholdPctRaw));
    const tripType: TripType = isTripType(body.tripType)
      ? body.tripType
      : (returnDate ? "round_trip" : "one_way");

    if (!origin || !destination || !departureDate) {
      return NextResponse.json({ error: "origin, destination and departureDate are required." }, { status: 400 });
    }

    if (!targetPrice || targetPrice <= 0) {
      return NextResponse.json({ error: "targetPrice must be a positive number." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const payload: Record<string, unknown> = {
      user_id: session.user.id,
      origin,
      destination,
      departure_date: departureDate,
      return_date: returnDate || null,
      trip_type: tripType,
      one_way: tripType === "one_way",
      target_price: targetPrice,
      baseline_price: targetPrice,
      currency,
      threshold_pct: thresholdPct,
      is_active: true,
    };

    let insertError: SupabaseInsertError | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await admin.from("price_alerts").insert(payload);
      if (!error) {
        insertError = null;
        break;
      }

      insertError = { message: error.message };
      const missingColumn = getMissingColumnName(error.message);
      if (!missingColumn) {
        break;
      }

      // Support environments where older schema names are used.
      if (missingColumn === "threshold_pct") {
        delete payload.threshold_pct;
        payload.threshold_delta_pct = thresholdPct;
        continue;
      }

      if (missingColumn in payload) {
        delete payload[missingColumn];
        continue;
      }

      break;
    }

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create alert.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
