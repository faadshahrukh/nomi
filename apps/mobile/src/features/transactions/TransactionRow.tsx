import { View } from 'react-native';
import { formatMoney, type RecentItem } from '@nomi/core';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Money, Text } from '@/components/ui';
import { pastDayLabel } from '@/lib/format';

const TYPE_LABEL: Record<string, string> = {
  expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', debt: 'Loan', repayment: 'Repayment',
  savings_contribution: 'Savings', goal_contribution: 'Goal',
};

/** One ledger line. Income and refunds get a plus and green; expenses stay neutral (no red for ordinary spending). */
export function TransactionRow({ item, today, currency, showDay = true }: { item: RecentItem; today: string; currency: string; showDay?: boolean }) {
  const { colors } = useTheme();
  const t = item.transaction;
  const where = t.type === 'transfer' || t.type === 'savings_contribution' || t.type === 'goal_contribution'
    ? [item.accountName, item.toAccountName].filter(Boolean).join(' → ')
    : t.paidBy !== 'me' ? 'Paid by someone else' : item.accountName;
  const subtitle = [item.categoryName ?? TYPE_LABEL[t.type], where, showDay ? pastDayLabel(t.localDate, today) : null].filter(Boolean).join(' · ');
  const incoming = item.direction === 'in';
  const shown = t.splits && t.type === 'expense' ? t.splits.find((s) => s.personId === 'me')?.amountMinor ?? 0 : t.amountMinor;
  const spoken = `${item.title}, ${TYPE_LABEL[t.type]}, ${formatMoney(shown, currency, { symbol: false })} taka, ${subtitle}`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.sm }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: incoming ? colors.positiveSoft : colors.surfaceSunken }}>
        <Text variant="bodyStrong" tone={incoming ? 'positive' : 'ink'}>{item.title.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{item.title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text>
      </View>
      <Money minor={shown} currency={currency} size="small" signed={incoming} tone={incoming ? 'positive' : item.direction === 'neutral' ? 'muted' : 'ink'} />
    </View>
  );
}
