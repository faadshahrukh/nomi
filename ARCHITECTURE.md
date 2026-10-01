# Architecture

Status key: **[built]** exists and is tested, **[planned]** decided but not implemented.

## Stack decisions

| Concern | Decision | Why |
|---|---|---|
| Mobile | Expo (React Native) + TypeScript, Expo Router **[planned]** | One codebase for iOS and Android; shares TypeScript domain code with a later web app. |
| Domain logic | `packages/core`, pure TypeScript **[built]** | Testable without a device; reusable by web. |
| On-device store | SQLite via `expo-sqlite` **[built, native only]** | Offline capture; fast lists. Web preview uses an in-memory repository. |
| Backend | Supabase: Postgres + Row Level Security + Auth + Edge Functions **[built as code and tested without live services; not deployed]** | RLS gives the user/tenant boundary at the database. Edge Functions hold the LLM key. |
| LLM | Claude via a server-side Edge Function, structured output **[built, not run live]** | The key never ships in the app; only names and the user's text are sent. |
| Sign-in | Supabase Auth: email + password (verified email, password reset) and Google **[adapter built and tested against a stub; sign-in screens built (onboarding step and Profile); not run against a live backend]** | Decided with the product owner. Both resolve to one user; the same verified email links to one account, not two. |
| Speech to text | Platform speech recognition (expo-speech-recognition) with a typed fallback **[built; verified with a scripted recogniser, not on a device; needs a development build, not Expo Go]** | No raw audio leaves the device or is stored. Supports `bn-BD` and `en`. |

These are recommendations made without a pre-existing codebase. They are cheap to change because the core depends on none of them.

## Layers and dependency direction

```
UI (apps/mobile: screens, components)   shell, design system, states [built]; feature screens [planned]
  ↓ calls
Application services             TransactionService [built]; capture orchestration, sync [planned]
  ↓ uses
Domain (packages/core)           ledger, budgets, recurring, safeToSpend, whatChanged, homeSummary, money, dates [built]
AI contract (packages/core/ai)   schema, resolve, policy [built]
  ↓ via ports
Ports                            LedgerRepository [built: SQL and in-memory implementations]; Interpreter [interface only];
                                 SpeechToText, Notifier, Auth, Integrations [planned]
Adapters                         expo-sqlite [built]; Supabase, Claude, platform STT [planned]
```

Rules: the domain imports nothing from UI, storage, network or the LLM. UI never computes money. Adapters implement ports.

## Mobile app structure (`apps/mobile`) **[built: shell only]**

Expo SDK 57, Expo Router (file-based, `src/app`), TypeScript strict.

```
src/app/_layout.tsx        root: fonts, safe area, theme, network, toasts, error boundary
src/app/(tabs)/            Home, Transactions, Insights, Planning, More  (headless expo-router/ui tabs, custom bar)
src/app/gallery.tsx        dev-only component and state gallery
src/design/                tokens.ts (colour, space, radius, type), theme.tsx (light/dark/system), contrast.ts
src/components/ui/         Text, Money, Surface, Button, IconButton, Chip, Segmented, Badge, ProgressBar, Skeleton,
                           EmptyState, ErrorState, OfflineBanner, Toast, BottomSheet, ListRow, SectionHeader, Screen, AsyncBoundary
src/components/nav/        tab bar
src/features/              feature code: home (capture card + sections), transactions, planning
src/data/                  LedgerProvider (loads the ledger, derives HomeSummary), repositories (SQLite/in-memory, demo/real), clock
src/lib/format.ts          date labels ("Today", "In 3 days · 18 Mar")
src/providers/             NetworkProvider
```

Rules in force: components take values and callbacks and never compute money (the `Money` component only calls `formatMoney` from the core). Every async surface goes through `AsyncBoundary` so loading, empty, error and ready are handled the same way. Tabs stay mounted after first visit. The root layout centres the app in a phone-width column on wide screens.

Wired: storage and derived data. `LedgerProvider` opens the repository for the current data mode, loads the whole ledger, and calls `buildHomeSummary` in the core. Screens receive finished numbers (Money Pulse, Safe to Spend with its breakdown, What Changed, budgets, goals, recurring, recent and full transaction lists, filters) and only format and lay them out. Whole-unit display rounding (`floorToWhole` for "safe" figures, `roundToWhole` for comparisons) is also in the core.

Not wired yet: live backend and sync, notifications, budgets and goals creation, recurring rules creation, export and delete-my-data screens. Planning and Insights are read-only views; the transactions ledger is editable.

### Data modes

`demo` and `real` use separate database files and user ids (`demo-user`, `local-user`), so example data can never appear in a real ledger. Demo data is generated by `buildDemoData(today)` in the core: deterministic, relative to today so insights always have history, and valid under the same rules as real transactions (tested for any day of the month). The default is `demo` in development and `real` in release builds. A real database starts with the system categories only. Until onboarding exists, a real ledger is empty and Home shows its first-run state.

Storage details: `PRAGMA user_version` migrations (`sql/migrations.ts`), every query scoped by `user_id`, optimistic concurrency by `version`, soft deletes, an append-only audit table, and database-level checks (positive amounts; one transaction per recurring-rule occurrence). The same repository tests run against the in-memory and SQLite implementations. The expo-sqlite adapter itself is thin and has not been run on a device or simulator yet.

## Money and time

- Money is an integer of minor units (BDT poisha). No floats in balances. `formatMoney` renders lakh/crore grouping and Bangla digits.
- A transaction's day is `localDate` (`YYYY-MM-DD`) in the user's timezone, set at creation. Month and period maths use it, never UTC instants, so late-night entries land in the right day. Optional `localTime` is display only.
- One currency per account. Cross-currency transfers are rejected for now.

## Transaction model

Spec fields map as follows: `dateTime` → `localDate` + optional `localTime`; `participants` → `splits`; `merchantId/Name` → `merchantName` (a merchant entity is deferred); everything else keeps its name.

Types: `expense, income, transfer, refund, debt, repayment, savings_contribution, goal_contribution`. The spec's "bill payment", "recurring payment" and "shared expense" are not separate types: a bill is an expense in a Bills category, a recurring payment is an expense linked to a `RecurringRule` occurrence, and a shared expense is an expense with `splits` and `paidBy`.

Effect of each type (implemented in `ledger.ts`):

| Type | Account balance | Counts as spending | Counts as income | People balance |
|---|---|---|---|---|
| expense | −amount on `accountId` (none if someone else paid) | my share (my split, else full) | no | friends owe me their splits, or I owe the payer my split |
| income | +amount | no | yes | – |
| refund | +amount | −amount | no | – |
| transfer / savings / goal contribution | −from, +to | no | no | – |
| debt (lent / borrowed) | −amount / +amount | no | no | ±counterparty |
| repayment (received / paid) | +amount / −amount | no | no | ∓counterparty |

Settling a shared expense is a `repayment`.

## Calculations (all in `packages/core`)

**Balance** = opening balance + Σ effects of non-deleted transactions. Never stored.

**Budgets** (`budgets.ts`): monthly, per top-level or sub-category (subtree included) or overall. `spent` is net spending month-to-date. `projected = spent + everydaySpent / dayOfMonth × daysLeft + unpaidRecurringDueThisMonth`, where `everydaySpent` excludes transactions linked to recurring rules (fixed bills paid early in the month are not extrapolated as a daily habit). States: `over` (spent > budget); `at_risk` (≥90% used, or projected > budget); `watch` (≥75% used, or projected > 90%). Pace-based states need at least 7 elapsed days.

**Recurring** (`recurring.ts`): weekly, monthly, yearly with an interval. Each occurrence is computed from the anchor date, so month-end clamping does not drift (31 Jan → 28 Feb → 31 Mar). An occurrence is paid when a transaction has the same `recurringRuleId` and `occurrenceDate`. Unrecorded past occurrences are ignored because we cannot know if they were paid.

**Safe to Spend** (`safeToSpend.ts`), an estimate and never a guarantee:

```
available = liquid − upcoming − goalReserve − buffer
liquid      = Σ balances of accounts with includeInLiquid (cash, bank, card, wallet by default; savings, business, custom excluded)
upcoming    = unpaid recurring expenses due today … period end (default: end of month)
goalReserve = Σ over goals of max(0, requiredThisMonth − contributedThisMonth)
              requiredThisMonth = fixed monthly contribution, else ceil((target − saved) / monthsToTargetDate), else 0
buffer      = user setting
perDay      = floor(max(0, available) / daysRemaining)   (daysRemaining counts today)
```

The UI must show these components next to the number. `available` can be negative; `perDay` cannot.

**What Changed** (`whatChanged.ts`): month-to-date net spending vs the average of up to 3 previous months over the *same elapsed days* (pace-matched). It returns `insufficient_data` before day 7 of the month (`early_in_month`), with no spending (`no_transactions`), or without a fully tracked earlier month (`no_complete_baseline_month`). Drivers are top-level categories whose change has the same sign as the total, is at least BDT 500, ranked by size, each with the supporting transaction ids and the largest transaction. It reports numbers and evidence. It does not infer motives. "Similar" means within ±5%.

## Persistence and security

- `LedgerRepository` takes the acting `userId` on every call and scopes to it **[built, in-memory]**. Production enforcement is Postgres RLS (`user_id = auth.uid()`) **[planned]**. Tests cover cross-user read, update, delete and insert.
- Updates use optimistic concurrency (`version`). Deletes are soft. Every create/update/delete appends an audit entry with changed fields **[built]**.
- Raw input is dropped before save unless `retainRawInput` is on **[built]**.
- Offline: client-generated ids, `version`, soft deletes and `updatedAt` are in place for sync **[built]**; the sync queue and conflict UI are **[planned]**. An unsent capture is kept in a local queue and never discarded **[planned]**.
- Logging rule: never log amounts, merchants, notes, transcripts or names. Analytics events carry counts and timings only.

## Server (`supabase/`) **[built, not deployed]**

- **Schema** (`migrations/`): mirrors the on-device schema, owned by `auth.users` with cascade, composite `(user_id, id)` keys so a row can never reference another user's row, database-level checks for money, transfers, loans, repayments and splits (same meaning as `validateTransaction`), a version-bump rule against lost updates, soft deletes, an append-only audit log.
- **Row-level security** on every public table (a test fails if any table lacks it). Anonymous callers have no privileges. System categories are readable by all and writable by none.
- **Functions:** `consume_ai_quota` (server only), `export_my_data` (the caller's data as JSON), `delete_my_account` (cascades to everything the user owns).
- **Edge Function `interpret`**: see AI_SPEC.md. Logic in `packages/core` (testable without Deno), thin wiring in `supabase/functions/interpret/index.ts`. The server code is not exported to the app bundle (a test checks).
- **Tested** against real PostgreSQL via PGlite: `packages/core/test/db.rls.test.ts`. Not yet deployed or run with the Supabase CLI.
- Setup, secrets and the first-deploy checklist: `supabase/README.md`.

## Authentication **[adapter built; screens in milestone 6]**

- Implemented in `apps/mobile/src/auth`: `AuthService` port, a Supabase adapter (email + password with confirmation and reset, Google through Supabase's hosted OAuth flow with PKCE, sign-out, account deletion), safe error codes (no provider message ever reaches the screen), a session store that splits the session across secure-store entries, and a not-configured stand-in so the app still runs locally. Sign-up never reveals whether an address already exists.
- Methods in MVP: email + password with email verification and password reset, and Google. No phone OTP, Apple or other providers yet.
- Google uses Supabase's hosted OAuth flow in the system browser (needs only a Google *web* client configured in the Supabase dashboard; works in Expo Go; no Google SDK in the app). A native Google sign-in with `signInWithIdToken` can replace it later for a smoother experience.
- The mobile app holds only the Supabase anon key plus the user's session. The session is stored in the device keychain/keystore (`expo-secure-store`), not AsyncStorage. Tokens refresh automatically; on expiry the app keeps unsent captures in the local queue and prompts for sign-in without discarding them.
- Optional app lock (biometric/PIN) is a separate local gate and does not replace the session.
- To verify before App Store submission: Apple's rules for apps that offer a third-party sign-in such as Google (guideline 4.8) may require an additional privacy-preserving option such as Sign in with Apple.

## Extension points

Receipt OCR, bank/wallet sync, Money Circle UI, Ask Money, predictive finance and the web app each plug in behind a port or consume `packages/core` unchanged. None is an MVP dependency.
