# AI specification

Implemented in `packages/core/src/ai`. The model adapter that calls an LLM is **not built yet**; the contract it must satisfy is.

## Principle

The model reads language and returns a structured proposal. Deterministic code parses amounts, resolves dates, looks up ids, validates against the ledger and decides what happens next. The model has no access to balances, tools, or write paths.

## Pipeline

```
input (text, or transcript from on-device speech recognition)
 → Interpreter.interpret()                model call, structured output        [adapter planned]
 → InterpretationSchema.safeParse         anything else → `invalid_output` → manual entry   [built]
 → amount parse + input-presence guard    [built]
 → date reference resolution              [built]
 → name → id matching (accounts incl. aliases, categories, people, goals)   [built]
 → ledger validation (validateTransaction)  [built]
 → confidence + confirmation policy       [built]
 → UI shows "what I understood", field-level edit   [planned]
 → TransactionService.create              same path as manual entry   [built]
 → derived totals, Safe to Spend, insights recompute   [built as pure functions]
```

## What the model returns

```ts
{ status: 'ok' | 'not_a_transaction',
  transactions: Array<{
    type: 'expense'|'income'|'transfer'|'refund'|'debt'|'repayment'|'savings_contribution'|'goal_contribution',
    amountText: string | null,         // as written by the user: "5k", "১২০০", "1,20,000"
    currency: 'BDT'… | null,
    categoryName, merchantName, accountName, toAccountName, counterpartyName, goalName, notes: string | null,
    date: {kind:'today'} | {kind:'yesterday'} | {kind:'days_ago', n} | {kind:'absolute', date} | {kind:'unspecified'},
    paidByName: string | null,         // null = the user
    shares: Array<{personName, amountText|null}> | null,   // "me" is the user; one null amount = remainder
    direction: 'lent'|'borrowed'|'received'|'paid' | null,
    confidence: { type, amount, category, account, date }  // each 0..1
  }> }   // max 10 transactions
```

Absent on purpose: ids, numeric amounts, computed dates, balances, free-text answers.

## Validation and resolution rules

1. Output that fails the schema is discarded. The UI keeps the user's text and offers manual entry.
2. `amountText` must contain exactly one amount. Supported: English and Bangla digits, commas incl. lakh style, `k`, `thousand`, `lakh/lac`, `crore`, `হাজার`, `লাখ`, `কোটি`.
3. **Input-presence guard**: the parsed amount must equal an amount found in the user's own text. If not, the proposal is capped at confidence 0.5 and always needs explicit confirmation. 
4. Dates are resolved against the user's timezone "today". A date the user did not give defaults to today and is labelled `default`. Future dates are rejected. Invalid absolute dates are rejected.
5. Accounts match by name, alias (case-insensitive, Bangla aliases supported) or substring. An unknown named account is a question, never an invention. With no account stated: the only account, else the user's default, else ask. A shared expense paid by someone else needs no account.
6. An unknown category name leaves the transaction uncategorised and lowers certainty. It never maps to a guessed category.
7. Shared expenses: shares must resolve to known people (or "me"); at most one share may omit its amount (computed as the remainder); the final sum is validated to equal the total.
8. Transfers and contributions need both accounts. Debt and repayment need a person and a direction. Goal contributions need a goal.
9. An expense with an amount but no category, merchant or note triggers the `purpose` question ("What was the 5,000 for?").
10. Multiple transactions in one input are proposed and decided individually.

## Voice and spoken amounts (decided)

Every voice capture needs an explicit confirmation tap, every time, regardless of confidence or the user's auto-save preference. Speech recognition can mishear numbers, so the confirmation card shows the transcript beside the parsed amount, and the amount (and every other field) is editable before saving. Typed input follows the normal policy below.

Number words are not parsed. If the transcript contains an amount only as words ("four hundred fifty") and no digits, the app does not guess; it asks "How much was it?" and the user types it. Platform recognisers usually return digits, so this is the uncommon path. Number-word parsing can be added later without changing this rule.

## Confidence and confirmation policy

Per-proposal confidence = min of the model's confidence for type, amount, date, account (when stated) and category (when named). The input-presence guard can lower amount confidence.

| Situation | Decision |
|---|---|
| Missing or invalid critical field, or unresolved reference | `clarify`: ask one question, the most important first (amount, then purpose/account/person…) |
| Amount not found in the user's text | `confirm` |
| Amount ≥ high-impact threshold (default BDT 10,000, user setting) | `confirm`, never auto-saved |
| Confidence < 0.7 | `clarify` |
| 0.7 ≤ confidence < 0.9 | `confirm`: show interpretation, user taps Save |
| Confidence ≥ 0.9 | `one_tap`, or `auto_save` only if the user chose auto-save **and** it is a typed personal expense, a single proposal, with no warnings |
| Any voice capture that would otherwise be `one_tap` or `auto_save` | `confirm` |

Income, transfers, loans, shared expenses and multi-transaction inputs are never auto-saved.

## Clarification questions

Produced by code, not the model, so they cannot invent facts: amount, purpose, account, destination account, person, goal, direction, date, or "What happened with your money?" when nothing usable was understood.

## Prompting and privacy (adapter requirements)

- Run on the server. The app never holds the model key.
- Send only: the user's text, today's date, locale, and *names* of accounts, categories, people and goals. Never balances, totals or transaction history.
- Do not log prompts or outputs with financial content. Do not retain by the provider where a zero-retention option exists.
- Voice: transcribe on device. Raw audio is not uploaded or stored. If recognition fails or permission is denied, the transcript or typed text is preserved and the user can edit and retry.
- Do not claim on-device AI processing; interpretation is server-side.

## Learning from corrections (planned)

When the user changes a category for a merchant, store `(merchant_key → category)` counts and prefer them in future matching before any model suggestion. Corrections update the structured transaction field by field (`TransactionService.update`) and are audited.

## Evaluation (planned)

A labelled set covering: simple and multiple expenses, Bangla, English, mixed Bangla-English, relative dates, merchants, shared expenses, transfers, income, refunds, ambiguous amounts, speech errors and corrections. Metrics: field accuracy, category accuracy, false-assumption rate, clarification rate, save success. Today's tests in `packages/core/test/ai.test.ts` cover the validation and policy half with hand-written model outputs.
