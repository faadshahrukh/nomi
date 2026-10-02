import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import {
  addDays, formatMoney, isValidLocalDate, parseAmountText, type Account, type Category, type EditableDraft, type Goal, type Person, type TransactionType,
} from '@nomi/core';
import { fontFamily, MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { weekdayDate } from '@/lib/format';
import { AddPersonInline } from '@/features/people/AddPersonInline';
import { BottomSheet, Button, Chip, Icon, Text } from '@/components/ui';

export type EditableField = 'amount' | 'category' | 'merchant' | 'notes' | 'account' | 'toAccount' | 'date' | 'type' | 'person' | 'direction' | 'goal';

export interface EditorContext {
  accounts: Account[]; categories: Category[]; people: Person[]; goals: Goal[]; today: string; currency: string;
}

const TITLES: Record<EditableField, string> = {
  amount: 'Amount', category: 'Category', merchant: 'Merchant', notes: 'Note', account: 'Account', toAccount: 'Move to', date: 'Date',
  type: 'Type', person: 'Person', direction: 'Direction', goal: 'Goal',
};
const TYPES: Array<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }, { value: 'refund', label: 'Refund' },
];

function Option({ label, sub, selected, onPress }: { label: string; sub?: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="radio" aria-checked={selected} accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH + 4, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: selected ? colors.accentSoft : 'transparent', opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" style={selected ? { color: colors.onAccentSoft } : undefined}>{label}</Text>
        {sub ? <Text variant="caption" tone="muted">{sub}</Text> : null}
      </View>
      {selected ? <Icon name="check" size={20} color={colors.onAccentSoft} /> : null}
    </Pressable>
  );
}

function TextField({ value, onChange, label, placeholder, keyboardType, onSubmit }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; keyboardType?: 'default' | 'decimal-pad'; onSubmit?: () => void }) {
  const { colors } = useTheme();
  return (
    <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.inkMuted}
      keyboardType={keyboardType} autoFocus onSubmitEditing={onSubmit} returnKeyType="done"
      style={{ minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 18 }} />
  );
}

/** The editor for one field of a draft. Applying calls onApply with just the changed fields; the core keeps the rest coherent. */
export function FieldEditorSheet({ field, draft, ctx, onApply, onClose }: {
  field: EditableField | null; draft: EditableDraft; ctx: EditorContext; onApply: (patch: Partial<EditableDraft>) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (field === 'amount') setText(draft.amountMinor ? String(draft.amountMinor / 100) : '');
    else if (field === 'merchant') setText(draft.merchantName ?? '');
    else if (field === 'notes') setText(draft.notes ?? '');
    else if (field === 'date') setText('');
  }, [field, draft.amountMinor, draft.merchantName, draft.notes]);

  const apply = (patch: Partial<EditableDraft>) => { onApply(patch); onClose(); };
  const parsed = field === 'amount' ? parseAmountText(text, ctx.currency) : null;
  const kind = draft.type === 'income' ? 'income' : 'expense';

  const categoryRows = useMemo(() => {
    const usable = ctx.categories.filter((c) => c.kind === kind && !c.archivedAt);
    const parents = usable.filter((c) => !c.parentId);
    return parents.flatMap((p) => [{ c: p, indent: false }, ...usable.filter((c) => c.parentId === p.id).map((c) => ({ c, indent: true }))]);
  }, [ctx.categories, kind]);

  const dates = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(ctx.today, -i)), [ctx.today]);
  const typedDate = text.trim();
  const typedOk = isValidLocalDate(typedDate) && typedDate <= ctx.today;

  const liveAccounts = ctx.accounts.filter((a) => !a.archivedAt);

  return (
    <BottomSheet visible={field !== null} onClose={onClose} title={field ? TITLES[field] : ''}>
      {field === 'amount' ? (
        <View style={{ gap: space.md }}>
          <TextField value={text} onChange={setText} label="Amount" placeholder="450, 5k or 1.5 lakh" keyboardType="decimal-pad" onSubmit={() => parsed && apply({ amountMinor: parsed })} />
          <Text variant="callout" tone={parsed || !text ? 'muted' : 'caution'} aria-live="polite">
            {parsed ? formatMoney(parsed, ctx.currency) : text ? 'Enter a number such as 450, 5k or 1.5 lakh.' : 'Type the amount.'}
          </Text>
          <Button label="Done" fullWidth disabled={!parsed} onPress={() => parsed && apply({ amountMinor: parsed })} />
        </View>
      ) : null}

      {field === 'category' ? (
        <ScrollView style={{ maxHeight: 420 }} accessibilityRole="radiogroup">
          <Option label="No category" selected={draft.categoryId === null} onPress={() => apply({ categoryId: null })} />
          {categoryRows.map(({ c, indent }) => (
            <View key={c.id} style={{ paddingLeft: indent ? space.xl : 0 }}>
              <Option label={c.name} sub={indent ? undefined : 'Group'} selected={draft.categoryId === c.id} onPress={() => apply({ categoryId: c.id })} />
            </View>
          ))}
        </ScrollView>
      ) : null}

      {field === 'merchant' || field === 'notes' ? (
        <View style={{ gap: space.md }}>
          <TextField value={text} onChange={setText} label={TITLES[field]} placeholder={field === 'merchant' ? 'Where was it?' : 'Add a note'}
            onSubmit={() => apply(field === 'merchant' ? { merchantName: text.trim() || null } : { notes: text.trim() || null })} />
          <Button label="Done" fullWidth onPress={() => apply(field === 'merchant' ? { merchantName: text.trim() || null } : { notes: text.trim() || null })} />
        </View>
      ) : null}

      {field === 'account' || field === 'toAccount' ? (
        <ScrollView style={{ maxHeight: 360 }} accessibilityRole="radiogroup">
          {liveAccounts.filter((a) => field === 'account' || a.id !== draft.accountId).map((a) => (
            <Option key={a.id} label={a.name} sub={a.type.replace('_', ' ')} selected={(field === 'account' ? draft.accountId : draft.toAccountId) === a.id}
              onPress={() => apply(field === 'account' ? { accountId: a.id } : { toAccountId: a.id })} />
          ))}
        </ScrollView>
      ) : null}

      {field === 'date' ? (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {dates.map((d, i) => <Chip key={d} label={i === 0 ? 'Today' : i === 1 ? 'Yesterday' : weekdayDate(d, ctx.today)} selected={draft.localDate === d} onPress={() => apply({ localDate: d })} />)}
          </View>
          <View style={{ gap: space.sm }}>
            <Text variant="callout" tone="muted">Or an earlier date (YYYY-MM-DD)</Text>
            <TextField value={text} onChange={setText} label="Earlier date" placeholder="2025-03-01" onSubmit={() => typedOk && apply({ localDate: typedDate })} />
            <Button label="Use this date" variant="secondary" disabled={!typedOk} onPress={() => apply({ localDate: typedDate })} />
          </View>
        </View>
      ) : null}

      {field === 'type' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {TYPES.map((t) => <Chip key={t.value} label={t.label} selected={draft.type === t.value} onPress={() => apply({ type: t.value })} />)}
        </View>
      ) : null}

      {field === 'person' ? (
        <View style={{ gap: space.md }}>
          {ctx.people.length ? (
            <ScrollView style={{ maxHeight: 240 }} accessibilityRole="radiogroup">
              {ctx.people.map((p) => <Option key={p.id} label={p.name} selected={draft.counterpartyId === p.id} onPress={() => apply({ counterpartyId: p.id })} />)}
            </ScrollView>
          ) : null}
          <Text variant="callout" tone="muted">{ctx.people.length ? 'Someone new?' : 'Add the person once and Nomi remembers them.'}</Text>
          <AddPersonInline onAdded={(p) => apply({ counterpartyId: p.id })} />
        </View>
      ) : null}

      {field === 'direction' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(draft.type === 'debt' ? [['lent', 'I lent it'], ['borrowed', 'I borrowed it']] : [['received', 'They paid me back'], ['paid', 'I paid them back']] as const).map(([v, l]) => (
            <Chip key={v} label={l} selected={(draft.type === 'debt' ? draft.debtDirection : draft.repaymentDirection) === v}
              onPress={() => apply(draft.type === 'debt' ? { debtDirection: v as 'lent' | 'borrowed' } : { repaymentDirection: v as 'received' | 'paid' })} />
          ))}
        </View>
      ) : null}

      {field === 'goal' ? (
        ctx.goals.length ? (
          <ScrollView style={{ maxHeight: 320 }} accessibilityRole="radiogroup">
            {ctx.goals.map((g) => <Option key={g.id} label={g.name} selected={draft.goalId === g.id} onPress={() => apply({ goalId: g.id })} />)}
          </ScrollView>
        ) : <Text tone="muted">You have no goals yet.</Text>
      ) : null}
    </BottomSheet>
  );
}
