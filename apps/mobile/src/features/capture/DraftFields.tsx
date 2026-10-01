import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatMoney, type EditableDraft, type Issue } from '@nomi/core';
import { useTheme } from '@/design/theme';
import { Money } from '@/components/ui';
import { pastDayLabel, shortDate } from '@/lib/format';
import { FieldEditorSheet, type EditableField, type EditorContext } from './FieldEditorSheet';
import { FieldRow } from './FieldRow';

const TYPE_LABEL: Record<string, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', debt: 'Loan', repayment: 'Repayment', savings_contribution: 'Savings', goal_contribution: 'Goal contribution' };
const isMove = (t: string) => t === 'transfer' || t === 'savings_contribution' || t === 'goal_contribution';

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

/**
 * The tappable field list for a draft, shared by the capture review card and the transaction editor so a correction
 * works identically in both. `assumed` marks values the engine filled in without being told.
 */
export function DraftFields({ draft: d, ctx, issues, assumed = { date: false, account: false }, request, onRequestHandled, onEdit }: {
  draft: EditableDraft; ctx: EditorContext; issues: Issue[]; assumed?: { date: boolean; account: boolean }; onEdit: (patch: Partial<EditableDraft>) => void;
  /** Lets a parent open a field's editor (e.g. "More categories" from a question). */
  request?: EditableField | null; onRequestHandled?: () => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState<EditableField | null>(null);
  useEffect(() => { if (request) { setEditing(request); onRequestHandled?.(); } }, [request, onRequestHandled]);
  const cur = ctx.currency;
  const name = (list: Array<{ id: string; name: string }>, id: string | null | undefined) => list.find((x) => x.id === id)?.name ?? null;
  const missing = (code: string) => issues.some((i) => i.code === code);
  const catName = name(ctx.categories, d.categoryId);
  const sharedMine = d.splits?.find((s) => s.personId === 'me')?.amountMinor;
  const payer = d.paidBy !== 'me' ? name(ctx.people, d.paidBy) : null;
  return (
    <>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
        <FieldRow label="Amount" value={d.amountMinor ? formatMoney(d.amountMinor, cur) : 'Add an amount'} status={d.amountMinor ? undefined : 'needed'} onPress={() => setEditing('amount')}
          valueNode={d.amountMinor ? <Money minor={d.amountMinor} currency={cur} size="large" /> : undefined} />
        <Divider />
        <FieldRow label="Type" value={TYPE_LABEL[d.type] ?? d.type} onPress={() => setEditing('type')} />
        <Divider />
        {d.type === 'expense' || d.type === 'refund' || d.type === 'income' ? <>
          <FieldRow label="Category" value={catName ?? 'None'} status={undefined} onPress={() => setEditing('category')} />
          <Divider />
        </> : null}
        {d.type === 'expense' || d.type === 'refund' ? <><FieldRow label="Merchant" value={d.merchantName ?? 'None'} onPress={() => setEditing('merchant')} /><Divider /></> : null}
        {payer ? (
          <><FieldRow label="Paid by" value={`${payer}. Your share ${formatMoney(sharedMine ?? 0, cur)}`} hint="Change the amount to re-split equally." onPress={() => setEditing('amount')} /><Divider /></>
        ) : (
          <><FieldRow label={isMove(d.type) ? 'From' : 'Account'} value={name(ctx.accounts, d.accountId) ?? 'Choose an account'} status={missing('account_required') || missing('account_not_found') ? 'needed' : assumed.account && d.accountId ? 'assumed' : undefined} onPress={() => setEditing('account')} /><Divider /></>
        )}
        {isMove(d.type) ? <><FieldRow label="To" value={name(ctx.accounts, d.toAccountId) ?? 'Choose an account'} status={missing('to_account_required') ? 'needed' : undefined} onPress={() => setEditing('toAccount')} /><Divider /></> : null}
        {d.type === 'debt' || d.type === 'repayment' ? <>
          <FieldRow label="Person" value={name(ctx.people, d.counterpartyId) ?? 'Choose a person'} status={missing('counterparty_required') ? 'needed' : undefined} onPress={() => setEditing('person')} /><Divider />
          <FieldRow label="Direction" value={({ lent: 'I lent it', borrowed: 'I borrowed it', received: 'They paid me back', paid: 'I paid them back' } as Record<string, string>)[(d.type === 'debt' ? d.debtDirection : d.repaymentDirection) ?? ''] ?? 'Choose'} status={missing('direction_required') ? 'needed' : undefined} onPress={() => setEditing('direction')} /><Divider />
        </> : null}
        {d.type === 'goal_contribution' ? <><FieldRow label="Goal" value={name(ctx.goals, d.goalId) ?? 'Choose a goal'} status={missing('goal_required') ? 'needed' : undefined} onPress={() => setEditing('goal')} /><Divider /></> : null}
        <FieldRow label="Date" value={`${pastDayLabel(d.localDate, ctx.today)}${d.localDate !== ctx.today && pastDayLabel(d.localDate, ctx.today) !== shortDate(d.localDate, ctx.today) ? ` · ${shortDate(d.localDate, ctx.today)}` : ''}`}
          status={assumed.date && d.localDate === ctx.today ? 'assumed' : undefined} onPress={() => setEditing('date')} />
        <Divider />
        <FieldRow label="Note" value={d.notes ?? 'None'} onPress={() => setEditing('notes')} />
      </View>
      <FieldEditorSheet field={editing} draft={d} ctx={ctx} onClose={() => setEditing(null)} onApply={onEdit} />
    </>
  );
}
