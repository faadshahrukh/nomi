# Database schema

The TypeScript types in `packages/core/src/types.ts` are the model. **Migration 1 is implemented** for SQLite in `packages/core/src/sql/migrations.ts` and covers `profiles, accounts, categories, people, transactions, budgets, recurring_rules, goals, audit_log` with the indexes below. Column names are snake_case (`interval_n` for a rule's interval). `category_corrections` and `insights` are not created yet. The server database is implemented in `supabase/migrations/` (Postgres with RLS) and tested on real Postgres. It adds `ai_usage`, `ai_processing` and `created_at/updated_at` columns, uses `text` ids (so client-generated ids work) with composite `(user_id, id)` keys, and defines `consume_ai_quota`, `export_my_data` and `delete_my_account`. Sync between the two stores is milestone 11. All tables carry `user_id` and are protected by RLS (`user_id = auth.uid()`), except system categories (`user_id IS NULL`, readable by everyone, writable by no one).

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
| `dismissed_signals` | `user_id`, `key`, `at` | Radar signals the user dismissed. Radar itself is computed on the device from transactions and not stored; keys are scoped to a month or an item. Not yet included in `export_my_data`. |

`transactions` columns: `id uuid (client generated)`, `type`, `amount_minor bigint CHECK > 0`, `currency`, `category_id`, `merchant_name`, `account_id`, `to_account_id`, `local_date date`, `local_time time`, `notes`, `paid_by` (`'me'` or person id), `splits jsonb`, `counterparty_id`, `debt_direction`, `repayment_direction`, `goal_id`, `recurring_rule_id`, `occurrence_date`, `source`, `ai_confidence real`, `raw_input` (null unless opted in), `created_at`, `updated_at`, `deleted_at`, `version int`.

Constraints to add in SQL beyond RLS: foreign keys must reference rows with the same `user_id`; transfer `account_id <> to_account_id`; `sum(splits) = amount_minor`. The application validates the same rules (`validateTransaction`) so offline writes are checked before sync.

Indexes: `(user_id, local_date)`, `(user_id, category_id, local_date)`, `(user_id, account_id)`, unique `(recurring_rule_id, occurrence_date)` where not deleted.

On device the row-level scoping is done by always filtering on `user_id` in the repository; on the server it is enforced by RLS.

Export and deletion: a user can export all rows as CSV/JSON and delete their account, which cascades to every table above.


## Sync additions (migration 20250101000500)

- Every synced table (`profiles`, `accounts`, `people`, `goals`, `recurring_rules`, `budgets`, `transactions`) gains `server_rev bigint`, stamped from `sync_rev_seq` on every insert and update by a trigger. Devices pull "everything after the last stamp I saw" (with a small overlap, since stamps are only approximately in commit order).
- `budgets` gains `deleted_at` so a deletion can reach other devices.
- `sync_push(items jsonb)` applies a batch as the caller (row-level security applies). Per item it answers `ok`, `conflict` (transactions only: the base version no longer matches, with the server's copy) or `rejected` (error class only, never the values). `sync_pull(since, limit)` returns changed rows in pages.
- Device-only SQLite tables: `settings` (reminder choice, sync position), `sync_outbox`, `sync_conflicts`, `dismissed_signals`.
