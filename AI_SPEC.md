# AI specification

Implemented in `packages/core/src/ai`. The model adapter that calls an LLM is **not built yet**; the contract it must satisfy is.

## Principle

The model reads language and returns a structured proposal. Deterministic code parses amounts, resolves dates, looks up ids, validates against the ledger and decides what happens next. The model has no access to balances, tools, or write paths.

## Status

- **Built:** the schema, deterministic resolution and validation, the confirmation policy, the on-device `RuleBasedInterpreter`, and the app's capture flow. The rule-based interpreter is what runs today, so capture works offline.
- **Not built:** the Claude adapter (milestone 5) and speech recognition (milestone 7). When the adapter exists it implements the same `Interpreter` port; the rule-based interpreter stays as the offline and failure fallback.

## Rule-based interpreter (built)

`packages/core/src/ai/ruleInterpreter.ts`. Deterministic, English plus a modest Bangla and mixed vocabulary. It handles the common phrasings of every spec example: simple and multiple expenses, income, transfers and withdrawals, loans and repayments, refunds, shared expenses ("Rahim paid 1,500, my share was 750", "split dinner 1,200 with Rahim"), relative dates ("yesterday", "3 days ago", "12 March", Bangla "আজ/গতকাল"), accounts by name or alias, merchants (a known list plus capitalised names after "at/from"), and categories from keywords.

It is intentionally conservative: it returns nulls instead of guesses. Examples: several competing numbers with no currency marker leave the amount empty (the app asks); a number followed by "th", a month name, "days ago" or "people" is not treated as an amount; a transfer without a clear source leaves the source empty; chit-chat returns `not_a_transaction`. Phrasings it does not recognise become "I couldn't find a transaction in that" with manual entry, never a wrong save. Commas inside numbers ("10,000") are not clause breaks.

Policy additions made in this milestone:
- Transfers, savings and goal contributions never default the source account, even if the user has a default; the app asks.
- Fields the engine filled in without being told (date, account) are returned as `assumed` and shown with an "Assumed" label until the user sets them.

## Correction, questions and duplicates (built)

All in `packages/core/src/draft.ts`, used by the app's review card.

- `EditableDraft` is a transaction the user is still completing (amount may be missing). `validateDraft` returns every reason it cannot be saved; Save stays disabled until that list is empty.
- `reviseDraft(draft, patch)` applies a field correction and keeps the rest coherent: changing the type clears fields that no longer apply (a transfer has no category, income has no destination account), and changing the amount of a shared expense re-splits equally among the same people so totals still add up.
- `nextQuestion` returns the single most useful missing item, most important first: amount, then (conversational mode only) purpose, account, destination account, person, direction, goal, date. Manual entry does not demand a purpose or category.
- `findPossibleDuplicate` flags a live transaction with the same type, amount, accounts, day and merchant or category (recurring bills excluded). The app warns and offers "Save anyway".
- `frequentCategories` ranks the user's own most-used categories for quick answers, topped up with defaults.

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
