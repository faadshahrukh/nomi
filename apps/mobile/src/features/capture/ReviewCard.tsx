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
import { DraftFields } from './DraftFields';
import type { EditableField, EditorContext } from './FieldEditorSheet';
import { QuestionBlock } from './QuestionBlock';


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
  const d = item.draft;
  const [request, setRequest] = useState<EditableField | null>(null);
  const catName = ctx.categories.find((c) => c.id === d.categoryId)?.name ?? null;
  const sharedMine = d.splits?.find((s) => s.personId === 'me')?.amountMinor;
  const cur = ctx.currency;
  const issues = validateDraft(d, userId, data);
  const blocked = issues.length > 0;
  const conversational = item.decision !== 'manual';
  const question = conversational ? nextQuestion(d, userId, data, { askPurpose: true, amountLabel: d.amountMinor ? formatMoney(d.amountMinor, cur, { symbol: false }) : undefined }) : null;
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
      {question ? <QuestionBlock question={question} ctx={ctx} transactions={data.transactions} onAnswer={(patch) => onEdit(item, patch)} onMore={() => setRequest('category')} /> : null}

      <DraftFields draft={d} ctx={ctx} issues={issues} assumed={item.assumed} request={request} onRequestHandled={() => setRequest(null)} onEdit={(patch) => onEdit(item, patch)} />

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

    </Surface>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
