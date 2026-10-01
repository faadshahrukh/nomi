import type { CurrencyCode } from './money';
import type { LocalDate } from './dates';

export type Id = string;

export type AccountType = 'cash' | 'bank' | 'card' | 'mobile_wallet' | 'savings' | 'business' | 'custom';

export interface Account {
  id: Id; userId: Id; name: string; type: AccountType; currency: CurrencyCode;
  /** Names the user may say aloud, e.g. ["bkash", "বিকাশ"]. Matched case-insensitively. */
  aliases: string[];
  openingBalanceMinor: number;
  /** Counted toward Safe to Spend. Defaults by type, user-editable. */
  includeInLiquid: boolean;
  archivedAt: string | null;
}

export const defaultIncludeInLiquid = (t: AccountType): boolean =>
  t === 'cash' || t === 'bank' || t === 'card' || t === 'mobile_wallet';

export interface Category {
  id: Id; userId: Id | null; // null = system default shared by all users
  parentId: Id | null; name: string; kind: 'expense' | 'income'; archivedAt: string | null;
}

export interface Person { id: Id; userId: Id; name: string }

export type TransactionType =
  | 'expense' | 'income' | 'transfer' | 'refund' | 'debt' | 'repayment'
  | 'savings_contribution' | 'goal_contribution';

export type TransactionSource = 'manual' | 'text' | 'voice' | 'receipt' | 'import' | 'sync';

export interface Split { personId: Id | 'me'; amountMinor: number }

export interface Transaction {
  id: Id; userId: Id; type: TransactionType;
  amountMinor: number; currency: CurrencyCode;
  categoryId: Id | null; merchantName: string | null;
  /** Account money leaves/enters. Null only for a shared expense paid by someone else. */
  accountId: Id | null;
  /** Destination for transfer / savings_contribution / goal_contribution. */
  toAccountId: Id | null;
  localDate: LocalDate; localTime: string | null; // authoritative date in the user's timezone
  notes: string | null;
  /** 'me' or a Person id. */
  paidBy: Id | 'me';
  /** Shared expenses: how the total is divided. Null = not shared (my share is the full amount). */
  splits: Split[] | null;
  counterpartyId: Id | null;
  debtDirection: 'lent' | 'borrowed' | null;
  repaymentDirection: 'received' | 'paid' | null;
  goalId: Id | null;
  recurringRuleId: Id | null; occurrenceDate: LocalDate | null;
  source: TransactionSource; aiConfidence: number | null;
  /** Only stored when the user opted in to retaining raw input. */
  rawInput: string | null;
  createdAt: string; updatedAt: string; deletedAt: string | null; version: number;
}

export interface Budget { id: Id; userId: Id; categoryId: Id | null; /* null = overall */ amountMinor: number; currency: CurrencyCode }

export interface RecurringRule {
  id: Id; userId: Id; name: string; type: 'expense' | 'income';
  amountMinor: number; currency: CurrencyCode; accountId: Id; categoryId: Id | null;
  frequency: 'weekly' | 'monthly' | 'yearly'; interval: number;
  anchorDate: LocalDate; endDate: LocalDate | null; isBill: boolean; active: boolean;
}

export interface Goal {
  id: Id; userId: Id; name: string; currency: CurrencyCode; targetMinor: number;
  targetDate: LocalDate | null; monthlyContributionMinor: number | null; openingSavedMinor: number;
}

export interface Profile {
  userId: Id; country: string; currency: CurrencyCode; timezone: string; locale: 'en' | 'bn' | 'mixed';
  confirmationPref: 'always_confirm' | 'auto_save_high_confidence';
  highImpactMinor: number; safetyBufferMinor: number; retainRawInput: boolean; defaultAccountId: Id | null;
  /** The user's privacy choice: may the text of a message be sent to the AI service to be understood? Off means on-device rules only. */
  aiProcessing: boolean;
  /** What the app calls the user in greetings. Collected during onboarding; null until then. */
  displayName: string | null;
}

export interface LedgerData {
  accounts: Account[]; categories: Category[]; people: Person[]; transactions: Transaction[];
}

export interface AuditEntry {
  id: Id; userId: Id; entity: 'transaction'; entityId: Id; action: 'create' | 'update' | 'delete';
  at: string; changedFields: string[]; before: Partial<Transaction> | null; after: Partial<Transaction> | null;
}
