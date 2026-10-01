# Nomi (working name)

A conversational personal-finance companion for iOS and Android. You tell it what happened with your money, by typing or speaking; it turns that into a structured transaction, updates your financial picture, and explains what changed.

> Core loop: Spend → Tell → Interpret → Confirm → Record → Understand → Act.

Source of truth for product intent: the *Conversational Expense App* build specification (PDF, not stored in this repo).

## Status

| Area | State |
|---|---|
| Deterministic finance core (`packages/core`) | **Built and tested** (192 tests, including the real SQL run against SQLite and the server schema run on real Postgres) |
| On-device storage (SQLite), demo data, Home summary | **Built**. Native only; web preview uses an in-memory store |
| AI interpretation contract, validation, confirmation policy | **Built and tested**. An on-device rule-based interpreter is the live interpreter; the Claude adapter is not built |
| Text capture end to end (type, review, correct, save, undo) | **Built** in the app |
| Server: Postgres schema with row-level security, Claude interpreter Edge Function, sign-in adapter (email + Google), AI privacy setting | **Built and tested without live services**. Needs your Supabase, Google and Anthropic accounts to connect (see `supabase/README.md`). No sign-in screens yet (milestone 6) |
| Mobile app (`apps/mobile`, Expo) | **Built**: design system and states, plus Home, Transactions (search, filters, detail, edit, delete), budgets, Money Pulse and Safe to Spend details, Planning (read-only) and Insights (What changed) reading real stored data. Text capture, first-run onboarding, accounts and sign-in screens work. Voice capture is built (needs a development build on a phone). Transactions can be searched, filtered, edited and deleted (with Undo) |
| Backend (Supabase), auth, sync | **Built as code and tested** against real Postgres; not deployed (needs your Supabase project) |
| Voice capture | Not started |
| Financial Radar V1 (Home and `/radar`), Insights (What changed) | **Built**, rule-based, no AI |
| Money Circle UI, Ask Money | Not started |

See `DEVELOPMENT_PLAN.md` for the order of work and `ARCHITECTURE.md` for how the pieces fit.

## Repository layout

```
apps/mobile       Expo (React Native) app for iOS, Android and web preview. UI only; all money logic comes from @nomi/core.
supabase/         Server as code: migrations, Edge Function, config. See supabase/README.md.
packages/core     Pure TypeScript domain logic. No UI, network, storage or LLM calls. Shared by mobile and the future web app.
ARCHITECTURE.md  DATABASE_SCHEMA.md  AI_SPEC.md  DESIGN_SYSTEM.md  DEVELOPMENT_PLAN.md
```

## Commands

```bash
npm install
npm test            # all workspaces (core logic + design-token contrast)
npm run typecheck
```

Run the app (from `apps/mobile`):

```bash
npx expo start          # then press i / a, or scan the QR code in Expo Go
npx expo start --web    # browser preview
EXPO_PUBLIC_DEV_TOOLS=1 npx expo export -p web   # static web build including the component gallery
EXPO_PUBLIC_DATA_MODE=demo|real                   # which data to open (default: demo in development, real in release)
EXPO_PUBLIC_TODAY_OVERRIDE=2025-03-15             # development only: pin "today" for reproducible screenshots
```

Demo data lives in its own database file (`nomi-demo.db`) under its own user id and is labelled "Demo data" on Home. Real data uses `nomi.db`. They never mix. In development, More → Developer switches between them.

Node 22+, npm 10+. The Component gallery (More → Developer) is shown in development builds, or when `EXPO_PUBLIC_DEV_TOOLS=1`.

## Principles that shape the code

1. AI interprets language. It never changes money. Every AI result is schema-validated, resolved by deterministic code and saved through the same validated path as manual entry.
2. Balances, totals, budgets, Safe to Spend and What Changed are pure functions over the transaction list. Nothing stores a balance.
3. Transfers, loans, repayments and savings are never "spending".
4. Raw text and transcripts are not stored unless the user opts in. Financial values do not go to logs or analytics.
