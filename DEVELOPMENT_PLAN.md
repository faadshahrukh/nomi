# Development plan

## Product understanding

A mobile-first finance companion whose defining interaction is telling the app what happened (text or voice). AI interprets; deterministic code validates, records and calculates. MVP per spec: onboarding, Home with capture, text and voice capture, interpretation and confirmation, accounts and categories, transactions with search and filters, income and transfers, budgets, rules-based Safe to Spend, What Changed, basic Radar, recurring expenses, data export. Later: receipt OCR, bank/wallet sync, Money Circle UI, advanced assistant, web app, predictive intelligence, integrations.

One deliberate overlap: Money Circle UI is post-MVP, but the spec's own engine examples ("Rahim paid 1,500, my share was 750") need shared-expense accounting to be right. That accounting is built in the core now; its screens come later.

## Decisions taken (change any of them before they cost money)

1. Expo / React Native / TypeScript, npm workspaces monorepo, shared `packages/core`.
2. Supabase (Postgres + RLS + Auth + Edge Functions) for backend, on-device SQLite for offline.
3. Calendar-month budgets and Safe to Spend period in V1 (no salary-cycle periods).
4. One currency per account; BDT default; no cross-currency transfers in V1.
5. Credit-card balances count in liquid money as stored (negative when owed). Savings, business and custom accounts are excluded by default; each is user-editable.
6. Goals are funded by contributions to a savings account. They are not virtual envelopes inside another account.
7. Platform speech recognition on device for voice; Claude server-side for interpretation.
8. Raw text and transcripts are not retained unless the user opts in.

## Open questions that affect later milestones

- Sign-in method: email, phone OTP (common in Bangladesh), social login, or several.
- Whether subscriptions/paywall (listed under Settings in the spec) are in MVP. Assumed out.
- Safety-buffer default and whether to propose one at onboarding.
- Acceptable Bangla speech-recognition quality on mid-range Android devices; may need a server-side fallback.
- Notification channel and quiet hours for Radar.
- Whether "business" accounts need their own reporting boundary.

## Milestones

| # | Milestone | State |
|---|---|---|
| 0 | Repo, workspaces, documentation | **Done** |
| 1 | Deterministic core: money, dates, ledger, validation, transfers, balances, categories roll-up, shared-expense accounting, budgets, recurring, Safe to Spend, What Changed, AI schema/resolve/policy, in-memory repository, audit, permission boundaries | **Done**, 62 tests |
| 2 | Expo app shell: tokens, light/dark, navigation, reusable components, loading/empty/error/offline states | Next |
| 3 | SQLite repository, seed/demo data (clearly flagged), Home reading real derived data | |
| 4 | Text capture end to end with a stub interpreter, confirmation card, field-level correction | |
| 5 | Server: Supabase schema + RLS migrations, auth, Claude interpreter Edge Function | |
| 6 | Onboarding and first transaction | |
| 7 | Voice capture states and fallback | |
| 8 | Transactions list: search, filters, detail, duplicate detection | |
| 9 | Budgets, Money Pulse, Safe to Spend UI, What Changed UI | |
| 10 | Recurring and Upcoming, Financial Radar V1 (deterministic signals, de-duplicated, capped) | |
| 11 | Offline sync queue and conflict handling, notifications, privacy controls, export and delete | |
| 12 | Accessibility and offline/error QA, analytics (no financial content), AI evaluation set | |

## Definition of done per feature

UI, data model, business logic, persistence, loading/error/empty/offline states, validation, accessibility, tests, and documentation updated.

## Not implemented yet, so do not assume it works

Everything outside `packages/core`: the app, backend, auth, voice, sync, notifications, Radar, Insights, export, deletion, app lock.
