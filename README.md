# Nomi (working name)

A conversational personal-finance companion for iOS and Android. You tell it what happened with your money, by typing or speaking; it turns that into a structured transaction, updates your financial picture, and explains what changed.

> Core loop: Spend → Tell → Interpret → Confirm → Record → Understand → Act.

Source of truth for product intent: the *Conversational Expense App* build specification (PDF, not stored in this repo).

## Status

The MVP in the spec is built as code, with automated tests and browser checks. What has **not** happened yet: a deployed backend, a run on a real phone, and a live AI call. Those need your accounts and a phone; see "Next steps" below.

| Area | State |
|---|---|
| Money logic (`packages/core`): money, ledger, budgets, Safe to Spend, What Changed, recurring, Radar, export, sync engine, AI contract | **Built and tested** (350 tests, including real SQL on SQLite and the server schema and sync functions on real Postgres) |
| App (`apps/mobile`): onboarding, Home, text and voice capture with review and correction, transactions (search, filters, edit, delete with undo), budgets, goals, recurring bills, accounts, categories, people, Money Pulse, Safe to Spend, Insights, Radar, privacy and data, bill reminders, app lock | **Built**; checked in a browser build (axe-core clean, 44 px targets, offline and keyboard use). Voice, reminders and app lock need a development build, not Expo Go |
| On-device storage and demo data | **Built** (SQLite on phones; the web preview keeps data in memory) |
| Understanding messages | On-device rules are the default (63 of 71 on the evaluation set, no safety violations). The Claude interpreter, prompt and Edge Function are built and tested against stubs; **never run against the live model** |
| Server (Supabase): schema, row-level security, sign-in (email and Google), AI function, sync | **Built and tested without live services**; not deployed |
| Offline-first sync with conflict handling | **Built**, verified with two simulated phones against real Postgres; not run live |
| Money Circle screens, Ask Money, receipt OCR, bank/wallet sync | Not started (post-MVP by the spec) |

## Next steps (need you)

1. Build the app on a phone: `apps/mobile/EAS.md`.
2. Deploy the backend: the first-deploy checklist in `supabase/README.md` (Supabase project, Google sign-in, Anthropic key).
3. Run the evaluation set against the real model: `npm run eval -w @nomi/core`.
4. Try it with a screen reader (VoiceOver, TalkBack) and with real Bangla speech.

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


## Running on a phone

Voice and bill reminders need a development build, not Expo Go: see `apps/mobile/EAS.md`.
