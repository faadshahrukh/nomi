import type { SqlDb } from './db';

/**
 * Ordered migrations. The database's `PRAGMA user_version` records how many have run.
 * Never edit a released migration; add a new one. Mirrors DATABASE_SCHEMA.md.
 * Money columns are integer minor units. Dates are `YYYY-MM-DD` local dates.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY, country TEXT NOT NULL, currency TEXT NOT NULL, timezone TEXT NOT NULL, locale TEXT NOT NULL,
    confirmation_pref TEXT NOT NULL, high_impact_minor INTEGER NOT NULL, safety_buffer_minor INTEGER NOT NULL,
    retain_raw_input INTEGER NOT NULL DEFAULT 0, default_account_id TEXT
  );
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, currency TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]', opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    include_in_liquid INTEGER NOT NULL DEFAULT 1, archived_at TEXT
  );
  CREATE INDEX idx_accounts_user ON accounts(user_id);
  CREATE TABLE categories (
    id TEXT PRIMARY KEY, user_id TEXT, parent_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL, archived_at TEXT
  );
  CREATE INDEX idx_categories_user ON categories(user_id);
  CREATE TABLE people (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL);
  CREATE INDEX idx_people_user ON people(user_id);
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0), currency TEXT NOT NULL,
    category_id TEXT, merchant_name TEXT, account_id TEXT, to_account_id TEXT,
    local_date TEXT NOT NULL, local_time TEXT, notes TEXT,
    paid_by TEXT NOT NULL DEFAULT 'me', splits TEXT, counterparty_id TEXT,
    debt_direction TEXT, repayment_direction TEXT, goal_id TEXT,
    recurring_rule_id TEXT, occurrence_date TEXT,
    source TEXT NOT NULL, ai_confidence REAL, raw_input TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_tx_user_date ON transactions(user_id, local_date);
  CREATE INDEX idx_tx_user_category ON transactions(user_id, category_id, local_date);
  CREATE INDEX idx_tx_user_account ON transactions(user_id, account_id);
  CREATE UNIQUE INDEX idx_tx_recurring_occurrence ON transactions(recurring_rule_id, occurrence_date)
    WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL;
  CREATE TABLE budgets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category_id TEXT, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL
  );
  CREATE INDEX idx_budgets_user ON budgets(user_id);
  CREATE TABLE recurring_rules (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL, account_id TEXT NOT NULL, category_id TEXT, frequency TEXT NOT NULL, interval_n INTEGER NOT NULL DEFAULT 1,
    anchor_date TEXT NOT NULL, end_date TEXT, is_bill INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_rules_user ON recurring_rules(user_id);
  CREATE TABLE goals (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, currency TEXT NOT NULL, target_minor INTEGER NOT NULL,
    target_date TEXT, monthly_contribution_minor INTEGER, opening_saved_minor INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_goals_user ON goals(user_id);
  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
    at TEXT NOT NULL, changed_fields TEXT NOT NULL, before_json TEXT, after_json TEXT
  );
  CREATE INDEX idx_audit_entity ON audit_log(user_id, entity_id);
  `,
  // 2: privacy choice for AI processing (default on; the app only ever uses it for signed-in users)
  `ALTER TABLE profiles ADD COLUMN ai_processing INTEGER NOT NULL DEFAULT 1;`,
  // 3: display name for greetings
  `ALTER TABLE profiles ADD COLUMN display_name TEXT;`,
  // 4: onboarding
  `ALTER TABLE profiles ADD COLUMN primary_goals TEXT NOT NULL DEFAULT '[]'; ALTER TABLE profiles ADD COLUMN onboarded_at TEXT;`,
  // 5: Radar signals the user dismissed
  `CREATE TABLE dismissed_signals (user_id TEXT NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (user_id, key));`,
];

/** Brings a database up to the latest schema. Safe to call on every launch. */
export async function migrate(db: SqlDb): Promise<void> {
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
  const current = Number(row?.user_version ?? 0);
  if (current > MIGRATIONS.length) throw new Error('Database is newer than this app. Update the app.');
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async () => {
      await db.exec(MIGRATIONS[v]!);
      await db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
