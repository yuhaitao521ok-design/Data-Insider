# Copilot instructions for TideWhale

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

## Internationalization (mandatory for every feature)

Every user-facing string must work in **简体中文 / 繁體中文 / English**. This applies to any new feature, panel, tooltip, toast, empty state or error message.

- Render text through `t()` from `lib/i18n.ts` (`const { t } = useI18n();`). Never hard-code Chinese in JSX text, `aria-label`, `title`, or `placeholder`.
- Add the Chinese source string as a key to **both** dictionaries (`ZH_HANT` and `EN`) inside `lib/i18n.ts` in the same change. Untranslated keys silently fall back to Chinese, which counts as a bug.
- Labels that come from data/config modules (range labels, indicator names, sector/index names, session labels) must be wrapped at render time, e.g. `{t(RANGE_CONFIG[key].label)}`.
- Run `npm run check:i18n` before finishing. It must report `0 missing` and `覆盖率约 100%`; use `npm run check:i18n -- --strict` to fail on gaps (suitable for CI).
- When adding a panel, sanity-check it in all three locales: `zh-Hans`, `zh-Hant` and `en` (the switcher lives in `components/LocaleSwitcher.tsx`).

### 中文说明（同上）

新增任何功能都必须同时提供 **简体 / 繁体 / 英文** 三套文案：界面文案一律走 `t()`，并在 `lib/i18n.ts` 的两本词典里同时补 key；提交前运行 `npm run check:i18n`，要求 0 缺失、覆盖率 100%。



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
- Keep the stock feature behavior aligned with README expectations: Yahoo first, Nasdaq fallback, optional AI insight (Perplexity / DeepSeek / any OpenAI-compatible provider).
- If a new route is added, keep the file under `app/api/` and reuse `jsonError()` / `errorStatus()` from `lib/http.ts` instead of custom ad hoc error responses.
- Stay consistent with the naming and semantics already in `lib/types.ts` for `RangeKey`, `Quote`, `ChartResponse`, and `InsightResponse`.

## Workflow (mandatory)

**Every change must have both an issue and a pull request record.** Never push code without them.

1. Open an issue first (title prefix `bug(...)` / `feat(...)` / `docs(...)`), describing problem and acceptance criteria.
2. Branch from `main` as `cline/<short-description>`.
3. Run the local gates before opening the PR: `npm run typecheck`, `npm test`, `npm run check:i18n`; add `npm run build` (or `npm run build:cf` when touching Cloudflare/OpenNext config) when UI or build output changes.
4. Open a PR whose body lists the change and the verification evidence, and link the issue with `Closes #N`.
5. **Merge it yourself once the PR is up and the local gates pass**: `gh pr merge <n> --merge --delete-branch` (repo uses merge commits). Do not leave a finished task sitting on an open PR.
6. After merge the branch is deleted automatically; Cloudflare / Vercel build and deploy `main`.
7. Finish by `git pull` and confirming `HEAD == origin/main` with a clean worktree.

**Hand the merge back to the human only when:**
- the request or design is ambiguous, or involves a trade-off that needs a decision;
- the change is destructive (dropping/rewriting data, changing public APIs, touching CI/CD secrets);
- the fix needs platform-side action (Cloudflare Dashboard build commands, Vercel settings, DNS, secrets, billing);
- local gates keep failing after a genuine fix attempt.

Everything else: issue → branch → PR with evidence → self-merge.

## Repo-specific notes

- LLM keys are optional. The app must stay fully usable without them; AI features degrade gracefully.
  Providers are configured through `LLM_PROVIDER` / `LLM_MODEL` / `LLM_BASE_URL` (insight) and `QUOTE_LLM_*` (quote fallback),
  with legacy `PERPLEXITY_API_KEY` / `PERPLEXITY_MODEL` still honored (see `lib/llm.ts`).
- `README.md` is the source of truth for the product behavior and environment variable contract.
- Validation signals: `npm test` (unit tests in `tests/`), `npm run typecheck`, `npm run build`, `npm run check:i18n`.
