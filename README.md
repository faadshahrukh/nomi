# Nomi (working name)

A conversational personal-finance companion for iOS and Android. You tell it what happened with your money, by typing or speaking; it turns that into a structured transaction, updates your financial picture, and explains what changed.

> Core loop: Spend → Tell → Interpret → Confirm → Record → Understand → Act.

Source of truth for product intent: the *Conversational Expense App* build specification (PDF, not stored in this repo).

## Status

| Area | State |
|---|---|
| Deterministic finance core (`packages/core`) | **Built and tested** (64 tests) |
| AI interpretation contract, validation, confirmation policy | **Built and tested** (no model adapter yet) |
| Mobile app shell (`apps/mobile`, Expo) | **Built**: tokens, light/dark, navigation, component library, loading/empty/error/offline states. No data connected yet |
| Backend (Supabase), auth, sync | Not started |
| Voice capture | Not started |
| Financial Radar, Insights, Money Circle UI, Ask Money | Not started |

See `DEVELOPMENT_PLAN.md` for the order of work and `ARCHITECTURE.md` for how the pieces fit.

## Repository layout

```
apps/mobile       Expo (React Native) app for iOS, Android and web preview. UI only; all money logic comes from @nomi/core.
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
```

Node 22+, npm 10+. The Component gallery (More → Developer) is shown in development builds, or when `EXPO_PUBLIC_DEV_TOOLS=1`.

## Principles that shape the code

1. AI interprets language. It never changes money. Every AI result is schema-validated, resolved by deterministic code and saved through the same validated path as manual entry.
2. Balances, totals, budgets, Safe to Spend and What Changed are pure functions over the transaction list. Nothing stores a balance.
3. Transfers, loans, repayments and savings are never "spending".
4. Raw text and transcripts are not stored unless the user opts in. Financial values do not go to logs or analytics.
