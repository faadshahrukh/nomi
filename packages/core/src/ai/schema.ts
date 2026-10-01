import { z } from 'zod';

/**
 * The ONLY shape the language model is allowed to return. Note what is absent: the model returns amounts as the
 * text the user wrote ("5k", "১২০০"), dates as references ("yesterday"), and names instead of ids. All parsing,
 * date arithmetic and id lookup happens in deterministic code (see resolve.ts).
 */
const conf = z.number().min(0).max(1);

export const DateRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }),
  z.object({ kind: z.literal('yesterday') }),
  z.object({ kind: z.literal('days_ago'), n: z.number().int().min(1).max(366) }),
  z.object({ kind: z.literal('absolute'), date: z.string().max(10) }),
  z.object({ kind: z.literal('unspecified') }),
]);

export const ProposedTransactionSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer', 'refund', 'debt', 'repayment', 'savings_contribution', 'goal_contribution']),
  amountText: z.string().max(60).nullable(),
  currency: z.string().length(3).nullable(),
  categoryName: z.string().max(60).nullable(),
  merchantName: z.string().max(80).nullable(),
  accountName: z.string().max(60).nullable(),
  toAccountName: z.string().max(60).nullable(),
  date: DateRefSchema,
  notes: z.string().max(200).nullable(),
  /** null = the user paid. */
  paidByName: z.string().max(60).nullable(),
  /** Shared expenses. personName "me" = the user. amountText null on exactly one party means "the remainder". */
  shares: z.array(z.object({ personName: z.string().max(60), amountText: z.string().max(60).nullable() })).max(20).nullable(),
  counterpartyName: z.string().max(60).nullable(),
  direction: z.enum(['lent', 'borrowed', 'received', 'paid']).nullable(),
  goalName: z.string().max(60).nullable(),
  confidence: z.object({ type: conf, amount: conf, category: conf, account: conf, date: conf }),
});

export const InterpretationSchema = z.object({
  status: z.enum(['ok', 'not_a_transaction']),
  transactions: z.array(ProposedTransactionSchema).max(10),
});

export type ProposedTransaction = z.infer<typeof ProposedTransactionSchema>;
export type Interpretation = z.infer<typeof InterpretationSchema>;
