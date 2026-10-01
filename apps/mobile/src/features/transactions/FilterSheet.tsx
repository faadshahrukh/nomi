import { View } from 'react-native';
import type { Account, Category, TransactionPeriod, TransactionQuery } from '@nomi/core';
import { space } from '@/design/tokens';
import { BottomSheet, Button, Chip, Text } from '@/components/ui';

const PERIODS: Array<{ value: TransactionPeriod; label: string }> = [
  { value: 'all', label: 'All time' }, { value: 'this_month', label: 'This month' }, { value: 'last_30_days', label: 'Last 30 days' },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: space.sm }}><Text variant="callout" weight="semibold">{title}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View></View>;
}

/** Period, account and category. Type and search live on the screen itself because they are used most. */
export function FilterSheet({ visible, query, accounts, categories, onChange, onClose }: {
  visible: boolean; query: TransactionQuery; accounts: Account[]; categories: Category[];
  onChange: (patch: Partial<TransactionQuery>) => void; onClose: () => void;
}) {
  // Top-level categories keep the sheet short; a parent's sub-categories are matched by the exact category id only.
  const tops = categories.filter((c) => !c.archivedAt && c.parentId === null && c.kind === 'expense');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters">
      <View style={{ gap: space.lg }}>
        <Group title="When">{PERIODS.map((p) => <Chip key={p.value} label={p.label} selected={(query.period ?? 'all') === p.value} onPress={() => onChange({ period: p.value })} />)}</Group>
        <Group title="Account">
          <Chip label="Any" selected={!query.accountId} onPress={() => onChange({ accountId: null })} />
          {accounts.filter((a) => !a.archivedAt).map((a) => <Chip key={a.id} label={a.name} selected={query.accountId === a.id} onPress={() => onChange({ accountId: a.id })} />)}
        </Group>
        <Group title="Category">
          <Chip label="Any" selected={!query.categoryId} onPress={() => onChange({ categoryId: null })} />
          {tops.map((c) => <Chip key={c.id} label={c.name} selected={query.categoryId === c.id} onPress={() => onChange({ categoryId: c.id })} />)}
        </Group>
        <Button label="Show results" size="lg" fullWidth onPress={onClose} />
        <Button label="Clear filters" variant="ghost" fullWidth onPress={() => onChange({ period: 'all', accountId: null, categoryId: null })} />
      </View>
    </BottomSheet>
  );
}
