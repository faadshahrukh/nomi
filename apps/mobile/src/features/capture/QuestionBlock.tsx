import { AddPersonInline } from '@/features/people/AddPersonInline';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { formatMoney, frequentCategories, parseAmountText, type Clarification, type EditableDraft, type Transaction } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Button, Chip, Surface, Text } from '@/components/ui';
import type { EditorContext } from './FieldEditorSheet';

/**
 * One focused question with one-tap answers. Asking is the app's way of not guessing: it appears only when a needed
 * detail is missing, and answering it applies a single field correction.
 */
export function QuestionBlock({ question, ctx, transactions, onAnswer, onMore }: {
  question: Clarification; ctx: EditorContext; transactions: Transaction[]; onAnswer: (patch: Partial<EditableDraft>) => void; onMore: () => void;
}) {
  const { colors } = useTheme();
  const [amountText, setAmountText] = useState('');
  const minor = parseAmountText(amountText, ctx.currency);
  const live = ctx.accounts.filter((a) => !a.archivedAt);
  const top = frequentCategories(transactions, ctx.categories, 'expense', 6).map((id) => ctx.categories.find((c) => c.id === id)!).filter(Boolean);
  const wrap = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm };

  return (
    <Surface variant="accent" padding="lg" style={{ gap: space.md }} accessibilityRole="alert">
      <Text variant="bodyStrong" style={{ color: colors.onAccentSoft }}>{question.question}</Text>

      {question.field === 'amount' ? (
        <View style={{ gap: space.sm }}>
          <TextInput value={amountText} onChangeText={setAmountText} accessibilityLabel="Amount" placeholder="450, 5k or 1.5 lakh" placeholderTextColor={colors.inkMuted} keyboardType="decimal-pad"
            onSubmitEditing={() => minor && onAnswer({ amountMinor: minor })} returnKeyType="done"
            style={{ minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 18 }} />
          <Button label={minor ? `Use ${formatMoney(minor, ctx.currency)}` : 'Use amount'} disabled={!minor} onPress={() => minor && onAnswer({ amountMinor: minor })} />
        </View>
      ) : null}

      {question.field === 'purpose' ? (
        <View style={wrap}>
          {top.map((c) => <Chip key={c.id} label={c.name} onPress={() => onAnswer({ categoryId: c.id })} />)}
          <Chip label="More…" onPress={onMore} />
        </View>
      ) : null}

      {question.field === 'account' || question.field === 'to_account' ? (
        <View style={wrap}>
          {live.map((a) => <Chip key={a.id} label={a.name} onPress={() => onAnswer(question.field === 'account' ? { accountId: a.id } : { toAccountId: a.id })} />)}
        </View>
      ) : null}

      {question.field === 'person' ? (
        <View style={{ gap: space.md }}>
          {ctx.people.length ? <View style={wrap}>{ctx.people.map((p) => <Chip key={p.id} label={p.name} onPress={() => onAnswer({ counterpartyId: p.id })} />)}</View> : null}
          <Text variant="caption" tone="muted">{ctx.people.length ? 'Someone new?' : 'Who is this? Add them once and Nomi remembers.'}</Text>
          <AddPersonInline onAdded={(p) => onAnswer({ counterpartyId: p.id })} />
        </View>
      ) : null}

      {question.field === 'goal' ? <View style={wrap}>{ctx.goals.map((g) => <Chip key={g.id} label={g.name} onPress={() => onAnswer({ goalId: g.id })} />)}</View> : null}

      {question.field === 'date' ? (
        <View style={wrap}>
          <Chip label="Today" onPress={() => onAnswer({ localDate: ctx.today })} />
        </View>
      ) : null}
    </Surface>
  );
}
