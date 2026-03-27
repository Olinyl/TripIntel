import { NextResponse } from "next/server";
import { PriceSniper } from "@/lib/services/price-sniper";

/**
 * GET /api/cron/snipe
 *
 * Entry-point for the price-alert background worker, designed to be called
 * by Vercel Cron (or any HTTP scheduler).  Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` automatically when the route is
 * declared in vercel.json — the same header must be supplied by any manual
 * invocation so that arbitrary callers cannot trigger the sniper.
 */
export async function GET(request: Request): Promise<Response> {
  // ── Security gate ──────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron/Snipe] CRON_SECRET environment variable is not set.");
    return NextResponse.json(
      { error: "Server misconfiguration: CRON_SECRET is not set." },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // ──────────────────────────────────────────────────────────────────────────

  try {
    const sniper = new PriceSniper();
    const result = await sniper.evaluateAlerts();

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Cron/Snipe] Fatal error during alert evaluation:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
