## TripIntel — Elite Build Plan (Duffel + AviationStack)

### 0. Context & Stack

- **Framework**: Next.js 15 (App Router), TypeScript strict.
- **Backend**: Supabase (PostgreSQL + Auth + RLS), Upstash Redis (via Vercel Queues).
- **Providers (Adapter Pattern)**:
  - `DuffelFlightProvider` — test mode, restricted to `ZZ` (Duffel Airways) for deterministic responses.
  - `AviationStackFlightProvider` — read-only, wrapped in an in-memory/TanStack Query cache layer to protect 100-req/month limit.
- **AI**: LangChain.js + Gemini 1.5 Flash for NLU and guardrails.
- **UI**: Shadcn UI, Tailwind CSS, Framer Motion, dark-mode-first.
- **Monitoring**: Sniper 2.0 built with Vercel Cron + Vercel Queues (Upstash) and an adapter-ready queue abstraction.

---

## 1. Core Foundation & Auth (Phase 1)

### 1.1 Next.js / Tooling

- **T1.1.1** Create Next.js 15 app with:
  - App Router, TypeScript strict, Tailwind, ESLint.
- **T1.1.2** Install core deps:
  - `@supabase/supabase-js`, `@supabase/ssr`
  - `@tanstack/react-query`
  - `langchain`, `@langchain/google-genai`
  - `resend`
  - `@radix-ui/*`, `shadcn/ui`
  - `framer-motion`
- **T1.1.3** Configure Tailwind + Shadcn for dark, minimalist theme (rounded-xl cards).

### 1.2 Supabase Auth & Client Wiring

- **T1.2.1** Configure Supabase env vars in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **T1.2.2** Implement `@supabase/ssr` helpers:
  - `createClient` for server components / route handlers.
  - `createBrowserClient` for client components.
- **T1.2.3** Add auth middleware:
  - Next.js middleware to inject Supabase session into `request` context.
- **T1.2.4** Build minimal auth UI:
  - Login / sign-up pages (email/password is fine).
  - Protect dashboard routes with RLS-friendly checks (use `auth.uid()` in policies).

---

## 2. Domain Layer & Adapters (Phase 2)

### 2.1 Domain Types & Provider Interfaces

- **T2.1.1** Define shared domain types in `src/lib/domain/types.ts`:
  - `TripIntent`, `FlightOffer`, `Itinerary`, `PriceSnapshot`, `RouteKey`, `BuyWaitRecommendation`, `AnomalyInsight`, etc.
- **T2.1.2** Define provider interfaces in `src/lib/providers`:
  - `FlightProvider`:
    - `searchFlights(intent: TripIntent): Promise<FlightOffer[]>`
  - (Hotels can be stubbed / future work.)

### 2.2 Duffel & AviationStack Adapters

- **T2.2.1** Implement `DuffelFlightProvider`:
  - Test-mode client configuration.
  - Query only `ZZ` (Duffel Airways) by default:
    - Build filter logic so origin/destination/dates come from `TripIntent`, but `carrier` is locked to `ZZ`.
  - Normalize Duffel response into `FlightOffer`.
- **T2.2.2** Implement `AviationStackFlightProvider`:
  - Build minimal client for search endpoints relevant to pricing/route data.
  - Implement **aggressive caching**:
    - In-memory cache (per server instance) keyed by `RouteKey + date range + key params`.
    - Optional: integrate with TanStack Query client-side for additional caching.
    - Include TTLs and rate-guard logic to stay under 100 req/month.
- **T2.2.3** Implement a `CompositeFlightProvider`:
  - Wrap Duffel (primary) + AviationStack (secondary) behind `FlightProvider`.
  - Strategy:
    - Always call Duffel first (ZZ-only).
    - When AviationStack is needed (for analytics/graph enrichment), check cache first, then call API if not cached.

---

## 3. TripOrchestrator & NLU (Phase 3)

### 3.1 NLU Parser (LangChain + Gemini)

- **T3.1.1** Define `TripIntent` schema (Zod) including:
  - origin, destination, date(s), budget, vibe, flexibility, passengers, constraints.
- **T3.1.2** Implement `parseNaturalLanguageQuery(query: string): Promise<TripIntent>`:
  - LangChain + Gemini 1.5 Flash, structured JSON output.
  - Zod validation and error handling.
- **T3.1.3** Create `/api/parse-query` route:
  - Input: `{ query }`
  - Output: `{ intent }` or validation error.

### 3.2 TripOrchestrator Core

- **T3.2.1** Implement `TripOrchestrator` service:
  - Inject `FlightProvider`, `GraphOptimizer`, `TrendAnalyzer`, `AnomalyDetector`.
- **T3.2.2** Implement main orchestration method:
  - Accept `TripIntent`.
  - Expand origin/destination via `GraphOptimizer`.
  - Call `FlightProvider.searchFlights` (Duffel/ZZ-first, AviationStack as needed).
  - Pass results to `TrendAnalyzer` + `AnomalyDetector`.
- **T3.2.3** `/api/search` route:
  - Accepts `TripIntent` (direct or via `parse-query`).
  - Returns:
    - `flights`, `graph_routes`, `buy_wait`, `rare_deals`, metadata for UI.

---

## 4. GraphOptimizer & Travel Graph (Phase 4 — Priority)

### 4.1 Travel Graph Schema & Seeding

- **T4.1.1** Create Supabase tables:
  - `travel_graph_nodes` — airports/cities with cluster, region, geo coords.
  - `travel_graph_edges` — edges with weights (price_score, time_score, frequency_score).
- **T4.1.2** Seed `travel_graph_nodes`:
  - Start with a small curated set (e.g., personal core regions/hubs).
- **T4.1.3** Seed `travel_graph_edges`:
  - Initial edges using heuristic weights or static CSV, then later refined from real data.

### 4.2 GraphOptimizer Service

- **T4.2.1** Implement `GraphOptimizer.expandOrigin(origin: string): Promise<string[]>`:
  - Read `travel_graph_nodes` and return regional cluster airports.
- **T4.2.2** Implement `GraphOptimizer.findOptimizedRoutes(params)`:
  - Build in-memory graph:
    - Nodes from `travel_graph_nodes`.
    - Edges from `travel_graph_edges` and selected provider-derived routes.
  - Run Dijkstra or A*:
    - Target metric: price, or price-time combination.
- **T4.2.3** Integration with TripOrchestrator:
  - Pre-search:
    - Expand origin/destination using `expandOrigin`.
  - Post-search:
    - Run `findOptimizedRoutes` to compute multi-leg or self-transfer routes.
  - Tag these as `graph_routes` / `hacker_fare_candidates` for UI.

---

## 5. Price Prediction & Anomaly Detection (Phase 5 — Priority)

### 5.1 Supabase Analytics Schemas

- **T5.1.1** Create:
  - `price_history` — raw price snapshots per search.
  - `route_stats` — aggregated medians, means, volatilities.
- **T5.1.2** Implement RLS:
  - Pricing data can be global; use read-only policies for all authenticated users (or keep RLS relaxed but documented).

### 5.2 Data Ingestion

- **T5.2.1** In TripOrchestrator, after each search:
  - Send top-N offers to `TrendAnalyzer.ingestPriceSnapshot`.
- **T5.2.2** `TrendAnalyzer.ingestPriceSnapshot`:
  - Write normalized records to `price_history`.

### 5.3 TrendAnalyzer — Buy/Wait

- **T5.3.1** Implement `getBuyWaitRecommendation(route, dateRange, currentPrice)`:
  - Query `route_stats` and/or recent `price_history`.
  - Compute:
    - Position vs. median, short-term trend, volatility.
  - Output:
    - `action` (`buy | wait`), `confidence`, `reason`.
- **T5.3.2** Integrate into `/api/search` response:
  - Provide per-query recommendation for the best priced itinerary.

### 5.4 AnomalyDetector — Rare Deals

- **T5.4.1** Implement `evaluateDeal(route, dateRange, currentPrice)`:
  - Compare price vs median/percentiles in `route_stats`.
  - Compute rarity score, e.g. percentile or z-score.
- **T5.4.2** Tag offers as rare deals:
  - `isRareDeal`, `rarityScore`, `percentile`.
  - Surface as “Rare Deal” badges in search results.

---

## 6. Sniper 2.0 — Vercel Queues + Upstash (Phase 6 — Priority)

### 6.1 Price Alerts Model & APIs

- **T6.1.1** Supabase table `price_alerts`:
  - user_id, route key, dates, baseline_price, threshold_pct, is_active, last_checked_at, last_price, notified_at.
- **T6.1.2** Alerts API:
  - `/api/alerts`:
    - Create/update/delete alerts for logged-in users.
  - RLS: users only access their own alerts (`auth.uid()` match).

### 6.2 Queue Abstraction

- **T6.2.1** Implement queue interface in `src/lib/infra/queue`:
  - `enqueuePriceAlertCheck(alertId: string)`.
- **T6.2.2** Vercel Queues implementation:
  - Backend powered by Upstash Redis, but abstracted through the queue interface.
  - Compatible with BullMQ patterns (job name, payload, retries).

### 6.3 Cron + Worker Behavior

- **T6.3.1** Vercel Cron job:
  - Hits `/api/cron/price-sniper` once per hour with a shared secret.
- **T6.3.2** `/api/cron/price-sniper` route:
  - Fetch all active `price_alerts`.
  - For each alert:
    - Enqueue a job via queue abstraction.
- **T6.3.3** Queue consumer (Serverless worker endpoint):
  - Vercel “serverless queue consumer” route.
  - For each job:
    - Call `TripOrchestrator` with alert params (reusing cache/GraphOptimizer).
    - Use `TrendAnalyzer` + `AnomalyDetector` to decide if notification threshold is hit.
    - If yes, send email via Resend and update `price_alerts` baseline/last_price.
- **T6.3.4** Adapter-ready design:
  - Document that the same queue interface can be implemented with a long-lived Node worker even though current deployment uses Vercel Queues.

---

## 7. UX Layer: One-Box, Bento, and Signals (Phase 7)

### 7.1 One-Box Search Experience

- **T7.1.1** One search bar component:
  - Calls `/api/parse-query` → `/api/search`.
- **T7.1.2** Display parsed intent chips (origin, dates, budget).

### 7.2 Bento Dashboard

- **T7.2.1** Layout:
  - Cards for:
    - Graph-Optimized Routes.
    - Buy/Wait insights.
    - Rare deals.
- **T7.2.2** Framer Motion:
  - Animate card entrance, hover, and filter changes.

### 7.3 Discovery / Future Work Hooks

- **T7.3.1** Wire placeholders for:
  - “Anywhere Under Budget” map (using Travel Graph + `price_history`).
  - Personalization & guardrails (future phases, already planned in Elite doc).

---

## 8. Docs & Resume Packaging (Phase 8)

- **T8.1.1** Write architecture overview (README section + diagrams).
- **T8.1.2** Document:
  - Adapter pattern for Duffel + AviationStack.
  - Graph search strategy (Dijkstra/A*).
  - Prediction and anomaly detection approach.
  - Sniper 2.0 behavior on Vercel Queues.
- **T8.1.3** Add “Talk Track” examples:
  - How you describe this system in an interview.