# Architecture

Status key: **[built]** exists and is tested, **[planned]** decided but not implemented.

## Stack decisions

| Concern | Decision | Why |
|---|---|---|
| Mobile | Expo (React Native) + TypeScript, Expo Router **[planned]** | One codebase for iOS and Android; shares TypeScript domain code with a later web app. |
| Domain logic | `packages/core`, pure TypeScript **[built]** | Testable without a device; reusable by web. |
| On-device store | SQLite via `expo-sqlite` **[planned]** | Offline capture; fast lists. |
| Backend | Supabase: Postgres + Row Level Security + Auth + Edge Functions **[planned]** | RLS gives the user/tenant boundary at the database. Edge Functions hold the LLM key. |
| LLM | Claude via a server-side Edge Function, structured output **[planned]** | The key never ships in the app; only names and the user's text are sent. |
| Sign-in | Supabase Auth: email + password (verified email, password reset) and Google **[planned]** | Decided with the product owner. Both resolve to one user; the same verified email links to one account, not two. |
| Speech to text | Platform speech recognition on device first, text fallback **[planned]** | No raw audio leaves the device or is stored. Supports `bn-BD` and `en`. |

These are recommendations made without a pre-existing codebase. They are cheap to change because the core depends on none of them.

## Layers and dependency direction

```
UI (screens, components)         [planned]
  ↓ calls
Application services             TransactionService [built]; capture orchestration, sync [planned]
  ↓ uses
Domain (packages/core)           ledger, budgets, recurring, safeToSpend, whatChanged, money, dates [built]
AI contract (packages/core/ai)   schema, resolve, policy [built]
  ↓ via ports
Ports                            LedgerRepository [built, in-memory impl]; Interpreter [interface only];
                                 SpeechToText, Notifier, Auth, Integrations [planned]
Adapters                         SQLite, Supabase, Claude, platform STT [planned]
```

Rules: the domain imports nothing from UI, storage, network or the LLM. UI never computes money. Adapters implement ports.

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

**Budgets** (`budgets.ts`): monthly, per top-level or sub-category (subtree included) or overall. `spent` is net spending month-to-date. `projected = spent / dayOfMonth × daysInMonth`. States: `over` (spent > budget); `at_risk` (≥90% used, or projected > budget); `watch` (≥75% used, or projected > 90%). Pace-based states need at least 7 elapsed days.

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

**What Changed** (`whatChanged.ts`): month-to-date net spending vs the average of up to 3 previous months over the *same elapsed days* (pace-matched). Only months fully inside the user's tracking history count; otherwise it returns `insufficient_data`. Drivers are top-level categories whose change has the same sign as the total, is at least BDT 500, ranked by size, each with the supporting transaction ids and the largest transaction. It reports numbers and evidence. It does not infer motives. "Similar" means within ±5%.

## Persistence and security

- `LedgerRepository` takes the acting `userId` on every call and scopes to it **[built, in-memory]**. Production enforcement is Postgres RLS (`user_id = auth.uid()`) **[planned]**. Tests cover cross-user read, update, delete and insert.
- Updates use optimistic concurrency (`version`). Deletes are soft. Every create/update/delete appends an audit entry with changed fields **[built]**.
- Raw input is dropped before save unless `retainRawInput` is on **[built]**.
- Offline: client-generated ids, `version`, soft deletes and `updatedAt` are in place for sync **[built]**; the sync queue and conflict UI are **[planned]**. An unsent capture is kept in a local queue and never discarded **[planned]**.
- Logging rule: never log amounts, merchants, notes, transcripts or names. Analytics events carry counts and timings only.

## Authentication **[planned]**

- Methods in MVP: email + password with email verification and password reset, and Google. No phone OTP, Apple or other providers yet.
- Google on mobile uses the native Google sign-in flow and exchanges the Google ID token with Supabase (`signInWithIdToken`). This needs OAuth client IDs for iOS, Android and web from a Google Cloud project, supplied by the product owner.
- The mobile app holds only the Supabase anon key plus the user's session. The session is stored in the device keychain/keystore (`expo-secure-store`), not AsyncStorage. Tokens refresh automatically; on expiry the app keeps unsent captures in the local queue and prompts for sign-in without discarding them.
- Optional app lock (biometric/PIN) is a separate local gate and does not replace the session.
- To verify before App Store submission: Apple's rules for apps that offer a third-party sign-in such as Google (guideline 4.8) may require an additional privacy-preserving option such as Sign in with Apple.

## Extension points

Receipt OCR, bank/wallet sync, Money Circle UI, Ask Money, predictive finance and the web app each plug in behind a port or consume `packages/core` unchanged. None is an MVP dependency.
