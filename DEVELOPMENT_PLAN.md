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
| 5 | Server: Supabase schema + RLS migrations, auth (email + Google), Claude interpreter Edge Function | **Done as code and tests; not deployed.** Needs your Supabase, Google and Anthropic accounts to run live. See supabase/README.md |
| 6 | Onboarding (welcome, about/region, optional email or Google sign-up, goals, first account, confirmation preference, optional budget, first capture), accounts screen, sign-in/out/delete in Profile | **Done**. Verified end to end in a browser build in empty mode. Sign-in screens are untested against a live backend. Only the account is required; the rest can be skipped |
| 7 | Voice capture: permission, listening, finishing, editable transcript, and every failure with a typed way forward | **Done**. Verified in a browser build with a scripted recogniser. Real iOS/Android speech (including Bangla quality) is untested and needs a development build, not Expo Go |
| 8 | Transactions list: search (words and exact amounts), type tabs, period/account/category filters, detail screen, field-level edit, delete with Undo, duplicate warning on edit | **Done**. Verified end to end in a browser build. Core search/edit/restore logic is unit-tested (228 core tests) |
| 9 | Budgets (add, edit, remove per category or overall), Money Pulse and Safe to Spend detail screens with the itemised calculation and an editable safety buffer, What Changed drivers that open the matching transactions | **Done**. Verified end to end in a browser build. Validation and delete are unit-tested (234 core tests) |
| 10 | Recurring bills and income (add, edit, pause/resume, mark paid, overdue), Upcoming links, Financial Radar V1: eight deterministic signal kinds, de-duplicated, capped at 5, 2 on Home, dismissible per month or item | **Done**. Verified end to end in a browser build. Radar and recurring logic are unit-tested (250 core tests) |
| 11 | Offline-first sync (queue, version-checked transactions, merge or ask on conflict, server functions), bill reminders (local, no amounts), privacy and data screen (export JSON/CSV, retention switch, delete device data, delete account) | **Done** except app lock. Sync logic is verified against real Postgres with two simulated phones; the live Supabase, a real phone's notifications and the share sheet are untested |
| 12 (next) | Accessibility and offline/error QA, analytics (no financial content), AI evaluation set | |

## Definition of done per feature

UI, data model, business logic, persistence, loading/error/empty/offline states, validation, accessibility, tests, and documentation updated.

## Milestone 3 notes

- Home shows the spec's order with one change: the slot named Financial Radar shows **What changed** (real, deterministic). Radar signals (milestone 10) now fill that slot on Home, and What changed lives in Insights.
- Budget projection was fixed during this milestone: fixed bills paid early in the month are no longer extrapolated as a daily rate, and unpaid bills due later are added.
- What Changed now waits until day 7 of the month so a few days of spending is not called a trend.
- Known gaps: the Android and iOS builds of the SQLite adapter are untested on a device; web has no durable store; Home refreshes only on load (no foreground refresh yet); there is no way to add data yet, so a real ledger is empty until milestones 4 and 6.

## Milestone 4 notes

- Flow: type or tap an example, then a review card shows what was understood with every field tappable; one focused question appears when something needed is missing; Save is disabled until the core validator passes; saving shows Safe to Spend before and after, with Undo. Several transactions in one sentence become several cards. Failures keep the typed text and offer Try again and Enter details. A duplicate warning appears before saving a likely repeat.
- Auto-save is implemented (single, typed, low-impact, high-confidence expense when the user opted in), always with Undo. The demo profile uses "always confirm", so it is not exercised in the UI yet; it is covered by core tests.
- Known gaps: saved transactions cannot be edited or deleted from the ledger yet (milestone 8; Undo works right after saving); the rule-based interpreter is narrower than a language model; categories cannot be created in the editor; shared-expense splits other than equal cannot be edited by hand yet; capture needs an account, so a brand-new real ledger still needs onboarding (milestone 6).

## Design pass (between milestones 5 and 6)

The product owner's Home design was applied: new palette and tokens, gradient surfaces, category icon tiles, redesigned Home with Money Pulse, Safe to Spend (per-day first), a conditional Nomi Signal, Upcoming and Recent Activity, and the Profile tab. Data it needed was added to the core: `liquidBalanceOn`, the balance change versus a month ago, the signal, and the profile display name (device migration 3 and server migration `20250101000200`). What was deliberately not copied, and why, is listed in `DESIGN_SYSTEM.md`.

## Milestone 5 notes

- Built: the Postgres schema with row-level security and its real-Postgres test suite; the Claude interpreter, its Edge Function and the app's client, with on-device fallback; the sign-in adapter (email + Google), secure session storage and not-configured stand-in; the AI-processing privacy setting end to end (device, server, Settings screen); the "Understood with AI / on this device" label.
- Nothing here has run against a live Supabase, Google or Anthropic account. The most likely first-run surprises are `config.toml` keys the CLI renames, the Google redirect URL setup, and the exact beta parameter for refusal fallbacks (it is retried without it automatically). The checklist in `supabase/README.md` is the way to find them.
- The interpreter model defaults to the current Opus; choosing a cheaper model is the product owner's decision.
- The privacy setting needs a profile row, so on a never-onboarded real ledger it is saved the first time it is changed.
- Still to do for the server: sync between device and server (milestone 11), the sign-in screens (milestone 6), per-user export and delete screens (milestone 11).

## Not implemented yet, so do not assume it works

Deployed backend, live AI, creating goals, app lock.
