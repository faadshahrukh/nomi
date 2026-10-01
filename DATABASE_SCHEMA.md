# Database schema

The TypeScript types in `packages/core/src/types.ts` are the authoritative model today. SQL migrations do not exist yet; this document defines what they must implement. All tables carry `user_id` and are protected by RLS (`user_id = auth.uid()`), except system categories (`user_id IS NULL`, readable by everyone, writable by no one).

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `user_id`, `country`, `currency`, `timezone`, `locale`, `confirmation_pref`, `high_impact_minor`, `safety_buffer_minor`, `retain_raw_input` | One row per user. |
| `accounts` | `id`, `name`, `type`, `currency`, `aliases text[]`, `opening_balance_minor`, `include_in_liquid`, `archived_at` | Balance is derived, never stored. |
| `categories` | `id`, `user_id?`, `parent_id`, `name`, `kind`, `archived_at` | Two levels used today; the tree is arbitrary. |
| `people` | `id`, `name` | Money Circle counterparties. |
| `transactions` | see below | Soft delete. |
| `budgets` | `category_id?`, `amount_minor`, `currency` | `NULL` category = overall monthly budget. |
| `recurring_rules` | `name`, `type`, `amount_minor`, `account_id`, `category_id`, `frequency`, `interval`, `anchor_date`, `end_date`, `is_bill`, `active` | |
| `goals` | `name`, `target_minor`, `target_date`, `monthly_contribution_minor`, `opening_saved_minor` | Saved amount = opening + goal contributions. |
| `audit_log` | `entity`, `entity_id`, `action`, `at`, `changed_fields`, `before jsonb`, `after jsonb` | Append-only. |
| `category_corrections` | `merchant_key`, `category_id`, `count`, `last_at` | Learning from user corrections (planned). |
| `insights` | `kind`, `key`, `payload jsonb`, `dismissed_at` | Materialised Radar signals, derived from transactions. |

`transactions` columns: `id uuid (client generated)`, `type`, `amount_minor bigint CHECK > 0`, `currency`, `category_id`, `merchant_name`, `account_id`, `to_account_id`, `local_date date`, `local_time time`, `notes`, `paid_by` (`'me'` or person id), `splits jsonb`, `counterparty_id`, `debt_direction`, `repayment_direction`, `goal_id`, `recurring_rule_id`, `occurrence_date`, `source`, `ai_confidence real`, `raw_input` (null unless opted in), `created_at`, `updated_at`, `deleted_at`, `version int`.

Constraints to add in SQL beyond RLS: foreign keys must reference rows with the same `user_id`; transfer `account_id <> to_account_id`; `sum(splits) = amount_minor`. The application validates the same rules (`validateTransaction`) so offline writes are checked before sync.

Indexes: `(user_id, local_date)`, `(user_id, category_id, local_date)`, `(user_id, account_id)`, unique `(recurring_rule_id, occurrence_date)` where not deleted.

Export and deletion: a user can export all rows as CSV/JSON and delete their account, which cascades to every table above.
