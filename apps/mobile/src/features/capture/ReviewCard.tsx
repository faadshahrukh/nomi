import { useState } from 'react';
import { View } from 'react-native';
import {
  formatMoney, nextQuestion, validateDraft, type EditableDraft, type LedgerData,
} from '@nomi/core';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Badge, Button, Money, Surface, Text } from '@/components/ui';
import { pastDayLabel, shortDate } from '@/lib/format';
import type { ReviewItem } from './captureReducer';
import { FieldEditorSheet, type EditableField, type EditorContext } from './FieldEditorSheet';
import { FieldRow } from './FieldRow';
import { QuestionBlock } from './QuestionBlock';

const TYPE_LABEL: Record<string, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', debt: 'Loan', repayment: 'Repayment', savings_contribution: 'Savings', goal_contribution: 'Goal contribution' };
const isMove = (t: string) => t === 'transfer' || t === 'savings_contribution' || t === 'goal_contribution';

/**
 * "Here is what I understood." Every field is tappable, so a wrong reading is a one-field fix, never a retype.
 * The Save button stays disabled until the core validator is satisfied.
 */
export function ReviewCard({ item, data, userId, ctx, onEdit, onSave, onSaveAnyway, onDiscard, showCount, interpretedBy, heard }: {
  item: ReviewItem; data: LedgerData; userId: string; ctx: EditorContext; showCount?: number; interpretedBy?: 'model' | 'device' | null;
  /** Set when the text came from voice: shown beside the amount so a misheard number is easy to spot. */
  heard?: string | null;
  onEdit: (item: ReviewItem, patch: Partial<EditableDraft>) => void; onSave: (item: ReviewItem) => void; onSaveAnyway: (item: ReviewItem) => void; onDiscard: (item: ReviewItem) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const d = item.draft;
  const cur = ctx.currency;
  const issues = validateDraft(d, userId, data);
  const blocked = issues.length > 0;
  const conversational = item.decision !== 'manual';
  const question = conversational ? nextQuestion(d, userId, data, { askPurpose: true, amountLabel: d.amountMinor ? formatMoney(d.amountMinor, cur, { symbol: false }) : undefined }) : null;
  const name = (list: Array<{ id: string; name: string }>, id: string | null | undefined) => list.find((x) => x.id === id)?.name ?? null;
  const missing = (code: string) => issues.some((i) => i.code === code);
  const catName = name(ctx.categories, d.categoryId);
  const sharedMine = d.splits?.find((s) => s.personId === 'me')?.amountMinor;
  const payer = d.paidBy !== 'me' ? name(ctx.people, d.paidBy) : null;
  const saveLabel = blocked ? 'Save' : `Save ${formatMoney(sharedMine ?? d.amountMinor ?? 0, cur)}${d.type === 'expense' && !catName ? ' without a category' : ''}`;

  return (
    <Surface padding="xl" rounded="lg" style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <Text variant="heading" accessibilityRole="header">{conversational ? "Here's what I understood" : 'New transaction'}</Text>
        {showCount && showCount > 1 ? <Badge label={`${showCount} to review`} tone="neutral" /> : null}
      </View>

      {heard ? (
        <Surface variant="accent" padding="md" style={{ gap: 2 }}>
          <Text variant="caption" weight="bold" style={{ color: colors.onAccentSoft }}>YOU SAID</Text>
          <Text variant="callout" style={{ color: colors.onAccentSoft }}>“{heard}”</Text>
          <Text variant="caption" style={{ color: colors.onAccentSoft }}>Voice can mishear numbers. Check the amount, then confirm.</Text>
        </Surface>
      ) : null}
      {conversational && interpretedBy ? (
        <Text variant="caption" tone="muted">{interpretedBy === 'model' ? 'Understood with AI. Check it before saving.' : 'Understood on this device.'}</Text>
      ) : null}
      {item.unsure && !question ? (
        <Surface variant="accent" padding="md"><Text variant="callout" style={{ color: colors.onAccentSoft }}>I'm not sure I read this right. Please check the details before saving.</Text></Surface>
      ) : null}
      {question ? <QuestionBlock question={question} ctx={ctx} transactions={data.transactions} onAnswer={(patch) => onEdit(item, patch)} onMore={() => setEditing('category')} /> : null}

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
          <><FieldRow label={isMove(d.type) ? 'From' : 'Account'} value={name(ctx.accounts, d.accountId) ?? 'Choose an account'} status={missing('account_required') || missing('account_not_found') ? 'needed' : item.assumed.account && d.accountId ? 'assumed' : undefined} onPress={() => setEditing('account')} /><Divider /></>
        )}
        {isMove(d.type) ? <><FieldRow label="To" value={name(ctx.accounts, d.toAccountId) ?? 'Choose an account'} status={missing('to_account_required') ? 'needed' : undefined} onPress={() => setEditing('toAccount')} /><Divider /></> : null}
        {d.type === 'debt' || d.type === 'repayment' ? <>
          <FieldRow label="Person" value={name(ctx.people, d.counterpartyId) ?? 'Choose a person'} status={missing('counterparty_required') ? 'needed' : undefined} onPress={() => setEditing('person')} /><Divider />
          <FieldRow label="Direction" value={({ lent: 'I lent it', borrowed: 'I borrowed it', received: 'They paid me back', paid: 'I paid them back' } as Record<string, string>)[(d.type === 'debt' ? d.debtDirection : d.repaymentDirection) ?? ''] ?? 'Choose'} status={missing('direction_required') ? 'needed' : undefined} onPress={() => setEditing('direction')} /><Divider />
        </> : null}
        {d.type === 'goal_contribution' ? <><FieldRow label="Goal" value={name(ctx.goals, d.goalId) ?? 'Choose a goal'} status={missing('goal_required') ? 'needed' : undefined} onPress={() => setEditing('goal')} /><Divider /></> : null}
        <FieldRow label="Date" value={`${pastDayLabel(d.localDate, ctx.today)}${d.localDate !== ctx.today && pastDayLabel(d.localDate, ctx.today) !== shortDate(d.localDate, ctx.today) ? ` · ${shortDate(d.localDate, ctx.today)}` : ''}`}
          status={item.assumed.date && d.localDate === ctx.today ? 'assumed' : undefined} onPress={() => setEditing('date')} />
        <Divider />
        <FieldRow label="Note" value={d.notes ?? 'None'} onPress={() => setEditing('notes')} />
      </View>

      {item.duplicate ? (
        <Surface variant="accent" padding="md" style={{ gap: space.sm }} accessibilityRole="alert">
          <Text variant="bodyStrong" style={{ color: colors.onAccentSoft }}>This looks like one you already recorded.</Text>
          <Text variant="callout" style={{ color: colors.onAccentSoft }}>{item.duplicate.merchantName ?? 'Same details'} · {formatMoney(item.duplicate.amountMinor, cur)} · {pastDayLabel(item.duplicate.localDate, ctx.today)}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button label="Save anyway" variant="secondary" onPress={() => onSaveAnyway(item)} />
            <Button label="Cancel" variant="ghost" onPress={() => onDiscard(item)} />
          </View>
        </Surface>
      ) : null}
      {item.error ? <Text variant="callout" tone="negative" accessibilityRole="alert">{item.error}</Text> : null}

      {!item.duplicate ? (
        <View style={{ gap: space.sm }}>
          <Button label={item.saving ? 'Saving' : saveLabel} size="lg" fullWidth loading={item.saving} disabled={blocked} onPress={() => onSave(item)} />
          <Button label="Discard" variant="ghost" fullWidth onPress={() => onDiscard(item)} />
        </View>
      ) : null}

      <FieldEditorSheet field={editing} draft={d} ctx={ctx} onClose={() => setEditing(null)} onApply={(patch) => onEdit(item, patch)} />
    </Surface>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
