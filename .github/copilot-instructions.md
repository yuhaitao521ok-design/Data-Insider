# Copilot instructions for Data Insider

## Project overview

This repository is a Next.js 15 stock market dashboard for US equities. The app is intentionally simple: it fetches market quotes and charts from upstream providers, normalizes them, and renders a client dashboard without a database or server-side persistence layer.

The important architecture is:

- `app/` contains the Next.js App Router entry points and API routes.
  - `app/page.tsx` is the entry page that renders the dashboard.
  - `app/api/*/route.ts` contains all server endpoints: quotes, chart, search, config, and insight.
- `components/` contains the client-side UI and polling logic.
  - `Dashboard.tsx` owns watchlist state, auto-refresh, chart selection, and the main rendering flow.
  - `PriceChart.tsx`, `Sparkline.tsx`, `SearchBox.tsx`, and `InsightPanel.tsx` are presentational pieces.
- `lib/` contains domain and data-source logic.
  - `lib/market.ts` is the orchestration layer for the actual fallback strategy.
  - `lib/yahoo.ts`, `lib/nasdaq.ts`, and `lib/perplexity.ts` are provider-specific adapters.
  - `lib/cache.ts` implements the in-memory stale-while-revalidate cache.
  - `lib/types.ts` centralizes `RangeKey`, symbol validation, and shared market types.
  - `lib/http.ts` provides common API error handling and request parsing.

The data-source strategy is the main product behavior:

1. Prefer Yahoo Finance for quotes and intraday charts.
2. Fall back to Nasdaq when Yahoo is rate-limited or unavailable.
3. Use Perplexity only as a last-resort quote or insight provider when the API key is configured.
4. Preserve the current provider label in API responses (`X-Data-Source` and `provider` fields) so the UI can accurately show data provenance.

## Build, test, and validation commands

This repo has a minimal script setup; there is no dedicated lint or test runner configured in `package.json` today.

Use these commands:

```bash
npm install
cp .env.example .env.local   # optional: only needed for Perplexity AI insight
npm run dev
```

Production validation:

```bash
npm run build
npm run start
```

Type-checking (the repo's explicit validation script):

```bash
npm run typecheck
```

If you need to validate a focused change without a full suite, prefer `npm run typecheck` plus a targeted app/build check. There are no per-file Jest/Vitest tests or lint commands in this repo at the moment.

## Key conventions

- This project is Next.js App Router + TypeScript; avoid introducing separate server frameworks or ad hoc server code when a route or helper in `app/` or `lib/` already fits.
- Symbol handling is normalized centrally. Do not bypass `normalizeSymbol()` or `isValidSymbol()` when validating user input or watchlist entries.
- Keep API endpoints and shared types aligned with `lib/types.ts`. New ranges must be added to `RANGE_KEYS` and `RANGE_CONFIG`, and UI code should consume those shared values instead of inventing local range definitions.
- Keep the upstream fallback chain consistent: whenever a market provider fails, prefer the existing ordered behavior in `lib/market.ts` rather than adding a parallel source ad hoc.
- This repo uses a process-local in-memory cache (`lib/cache.ts`) for a performance optimization. Changes should preserve stale-while-revalidate semantics rather than replacing the cache behavior with a different mechanism.
- The app intentionally runs without a database and without persistent server state. If work requires persistence, prefer browser/localStorage patterns already used by the dashboard rather than adding a backend datastore.
- Node runtime is required for API handlers; keep `runtime = "nodejs"` and avoid Edge Runtime assumptions unless the repo explicitly changes.
- For chart/quote endpoints, preserve the existing provider metadata (`provider`, `stale`, `cached`, `X-Data-Source`) so the frontend can correctly show freshness and source labels.

## Working rules for this codebase

- Prefer single-file, focused edits in the existing module layout instead of introducing new architectural layers.
- When changing data-source logic, verify both the fallback path and the request error path; this app is sensitive to rate limiting and upstream outages.
- Keep the stock feature behavior aligned with README expectations: Yahoo first, Nasdaq fallback, optional Perplexity AI insight.
- If a new route is added, keep the file under `app/api/` and reuse `jsonError()` / `errorStatus()` from `lib/http.ts` instead of custom ad hoc error responses.
- Stay consistent with the naming and semantics already in `lib/types.ts` for `RangeKey`, `Quote`, `ChartResponse`, and `InsightResponse`.

## Repo-specific notes

- `PERPLEXITY_API_KEY` is optional. The app should remain fully usable without it.
- `README.md` is the source of truth for the product behavior and environment variable contract.
- There are no linting rules or test suites configured in the package manifest as of now, so `npm run typecheck` and a production `npm run build` are the main validation signals.
