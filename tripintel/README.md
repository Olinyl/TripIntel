# TripIntel

An intelligent flight-search platform powered by AI-driven NLU, multi-provider flight data, graph-optimized routing, and a distributed price-alert sniper.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript strict) |
| Auth & Database | Supabase (Postgres + RLS) |
| AI / NLU | Google Gemini 1.5 Flash via `@google/generative-ai` |
| Flight Providers | Duffel (test mode, ZZ carrier) · AviationStack (cached) |
| Email Notifications | Resend |
| UI | Tailwind CSS v4 · Framer Motion · Lucide React |
| Deployment | Vercel + Vercel Cron |

---

## Architecture Overview

```
User query (natural language)
	│
	▼
AI Parser (Gemini 1.5 Flash)  →  TripIntent
	│
	▼
TripOrchestrator
	├─ CompositeFlightProvider
	│    ├─ DuffelFlightProvider     (primary, ZZ-only test mode)
	│    └─ AviationStackProvider    (fallback, in-memory cached)
	├─ GraphOptimizer                (nearby-airport expansion)
	└─ TrendAnalyzer                 (price history → BUY / WAIT / MONITOR)
			└─ ingestPriceSnapshot     (fire-and-forget → price_history table)

Background (Vercel Cron — every 6 hours)
	GET /api/cron/snipe
	└─ PriceSniper.evaluateAlerts()
		  ├─ Fetch active price_alerts from Supabase
		  ├─ Run TrendAnalyzer per route
		  └─ sendPriceAlertEmail (Resend) + update notified_at
```

---

## Environment Variables

Create a `.env.local` file in the project root with the following keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Google AI (Gemini)
GOOGLE_AI_API_KEY=<gemini-api-key>

# Duffel (flight provider — test mode)
DUFFEL_API_KEY=<duffel-test-key>

# AviationStack (flight provider — free tier)
AVIATIONSTACK_API_KEY=<aviationstack-key>

# Resend (email notifications)
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=TripIntel <alerts@yourdomain.com>

# Cron security
CRON_SECRET=<long-random-secret>

# App URL (used in email templates)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Vercel deployment:** All of the above must be added as Environment Variables in the Vercel project settings. `CRON_SECRET` is automatically injected as the `Authorization: Bearer` header by Vercel Cron when running the `/api/cron/snipe` route.

---

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will land directly on the search dashboard (auth required — sign up at `/signup`).

---

## Database Setup

Apply the SQL migration in your Supabase project (SQL Editor or `supabase db push`):

- Creates `price_history`, `route_stats`, `travel_graph_nodes`, `travel_graph_edges`, `user_profiles`, `price_alerts`
- Configures RLS: authenticated read for analytics/graph tables; owner-only for alerts and profiles

---

## Key Design Decisions

- **Adapter pattern** — `FlightProvider` interface decouples Duffel and AviationStack from the orchestrator. Swapping providers requires zero orchestrator changes.
- **ZZ-only Duffel** — Duffel test mode only returns results for carrier code `ZZ`. The adapter enforces this constraint so test searches always produce data.
- **AviationStack cache** — AviationStack has a 100 req/month free-tier limit. The in-memory TTL cache (`MemoryCache`) ensures each unique route is only fetched once per cache window.
- **Fire-and-forget ingestion** — `ingestPriceSnapshot` is called without `await` after each search. Analytics latency never blocks the user-facing response.
- **Statistically-driven alerts** — The Sniper only triggers on a `BUY` signal (price < mean − 0.5σ) _and_ the user's target threshold, reducing false positives significantly.
