import { Pressable, View } from 'react-native';
import { formatMoney, type RecentItem } from '@nomi/core';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, Money, Text, Tile } from '@/components/ui';
import { glyphFor } from '@/lib/glyphs';
import { recentLabel } from '@/lib/format';

const TYPE_LABEL: Record<string, string> = {
  expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', debt: 'Loan', repayment: 'Repayment',
  savings_contribution: 'Savings', goal_contribution: 'Goal',
};

/** One ledger line: category tile, what and where, and the amount. Income and refunds are plus and green; spending is minus in ink (no red for ordinary spending). */
export function TransactionRow({ item, today, currency, showDay = true, onPress }: { item: RecentItem; today: string; currency: string; showDay?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const t = item.transaction;
  const move = t.type === 'transfer' || t.type === 'savings_contribution' || t.type === 'goal_contribution';
  const where = move ? [item.accountName, item.toAccountName].filter(Boolean).join(' → ') : t.paidBy !== 'me' ? 'Paid by someone else' : item.accountName;
  const subtitle = [item.categoryName ?? TYPE_LABEL[t.type], showDay ? recentLabel(t.localDate, today) : null, where].filter(Boolean).join(' · ');
  const incoming = item.direction === 'in';
  const shared = !!t.splits;
  const mine = shared ? t.splits!.find((s) => s.personId === 'me')?.amountMinor ?? 0 : t.amountMinor;
  const g = glyphFor(t.type, t.categoryId);
  const spoken = `${item.title}, ${TYPE_LABEL[t.type]}${shared ? ', shared' : ''}, ${formatMoney(mine, currency, { symbol: false })} taka, ${subtitle}`;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessible accessibilityLabel={onPress ? `${spoken}. Opens details.` : spoken} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}>
      <Tile icon={g.icon} tone={g.tone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{item.title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text>
      </View>
      {shared ? <Icon name="users" size={16} color={colors.inkMuted} /> : null}
      <Money minor={item.direction === 'out' ? -mine : mine} currency={currency} size="small" signed={incoming} tone={incoming ? 'positive' : item.direction === 'neutral' ? 'muted' : 'ink'} />
    </Pressable>
  );
}
