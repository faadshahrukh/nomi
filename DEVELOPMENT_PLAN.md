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
9. Sign-in is email + password and Google, via Supabase Auth. No phone OTP or other providers in MVP. (Confirmed by the product owner.)
10. Voice captures always require a confirmation tap, with the amount editable. Number words are not parsed; the user types the amount if needed. (Confirmed by the product owner.)
11. Subscription and paywall are out of the MVP. (Confirmed by the product owner.) No billing code, plan tiers or entitlement checks until it is scheduled.

## Open questions that affect later milestones

- Google Cloud OAuth client IDs (iOS, Android, web) and a Supabase project, needed at milestone 5.
- Safety-buffer default and whether to propose one at onboarding.
- Acceptable Bangla speech-recognition quality on mid-range Android devices; may need a server-side fallback.
- Notification channel and quiet hours for Radar.
- Whether "business" accounts need their own reporting boundary.

## Milestones

| # | Milestone | State |
|---|---|---|
| 0 | Repo, workspaces, documentation | **Done** |
| 1 | Deterministic core: money, dates, ledger, validation, transfers, balances, categories roll-up, shared-expense accounting, budgets, recurring, Safe to Spend, What Changed, AI schema/resolve/policy, in-memory repository, audit, permission boundaries | **Done**, 62 tests |
| 2 | Expo app shell: tokens, light/dark, navigation, reusable components, loading/empty/error/offline states | **Done**. Verified in a browser build in light and dark; not yet run on a phone or simulator |
| 3 | SQLite repository, seed/demo data (clearly flagged), Home reading real derived data | **Done**. Verified in a browser build with an in-memory store; the SQLite adapter has not run on a device yet. Also made Transactions, Planning and Insights read-only views of the same data so no tab contradicts Home |
| 4 | Text capture end to end with a stub interpreter, confirmation card, field-level correction | **Done**. The "stub" is a real on-device rule-based interpreter (offline capable). Verified in a browser build; not yet on a device |
| 5 (next) | Server: Supabase schema + RLS migrations, auth (email + Google), Claude interpreter Edge Function | |
| 6 | Onboarding (sign-up/sign-in with email or Google) and first transaction | |
| 7 | Voice capture states and fallback | |
| 8 | Transactions list: search, filters, detail, duplicate detection | |
| 9 | Budgets, Money Pulse, Safe to Spend UI, What Changed UI | |
| 10 | Recurring and Upcoming, Financial Radar V1 (deterministic signals, de-duplicated, capped) | |
| 11 | Offline sync queue and conflict handling, notifications, privacy controls, export and delete | |
| 12 | Accessibility and offline/error QA, analytics (no financial content), AI evaluation set | |

## Definition of done per feature

UI, data model, business logic, persistence, loading/error/empty/offline states, validation, accessibility, tests, and documentation updated.

## Milestone 3 notes

- Home shows the spec's order with one change: the slot named Financial Radar shows **What changed** (real, deterministic). Radar signals themselves are milestone 10.
- Budget projection was fixed during this milestone: fixed bills paid early in the month are no longer extrapolated as a daily rate, and unpaid bills due later are added.
- What Changed now waits until day 7 of the month so a few days of spending is not called a trend.
- Known gaps: the Android and iOS builds of the SQLite adapter are untested on a device; web has no durable store; Home refreshes only on load (no foreground refresh yet); there is no way to add data yet, so a real ledger is empty until milestones 4 and 6.

## Milestone 4 notes

- Flow: type or tap an example, then a review card shows what was understood with every field tappable; one focused question appears when something needed is missing; Save is disabled until the core validator passes; saving shows Safe to Spend before and after, with Undo. Several transactions in one sentence become several cards. Failures keep the typed text and offer Try again and Enter details. A duplicate warning appears before saving a likely repeat.
- Auto-save is implemented (single, typed, low-impact, high-confidence expense when the user opted in), always with Undo. The demo profile uses "always confirm", so it is not exercised in the UI yet; it is covered by core tests.
- Voice is still a placeholder: the mic shows "Voice capture isn't built yet".
- Known gaps: saved transactions cannot be edited or deleted from the ledger yet (milestone 8; Undo works right after saving); the rule-based interpreter is narrower than a language model; categories cannot be created in the editor; shared-expense splits other than equal cannot be edited by hand yet; capture needs an account, so a brand-new real ledger still needs onboarding (milestone 6).

## Not implemented yet, so do not assume it works

Backend, auth, the Claude interpreter, voice, sync, notifications, Radar signals, creating accounts, budgets or goals, editing or deleting saved transactions, export, deletion, app lock.
