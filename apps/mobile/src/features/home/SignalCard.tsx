import { View } from 'react-native';
import { formatMoney, roundToWhole, type Category, type HomeSummary } from '@nomi/core';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, Surface, Text } from '@/components/ui';
import { Pressable } from 'react-native';

/**
 * One calm observation, shown only when a category is clearly above its usual pace. States the numbers; never guesses a cause
 * and never scolds. Absent entirely when there is nothing worth saying.
 */
export function SignalCard({ summary, categories, onDetails }: { summary: HomeSummary; categories: Category[]; onDetails: () => void }) {
  const { colors } = useTheme();
  const sig = summary.signal;
  if (!sig) return null;
  const c = summary.currency;
  const name = categories.find((x) => x.id === sig.categoryId)?.name ?? 'Uncategorised spending';
  const pct = Math.round(sig.ratio * 100);
  const money = (n: number) => formatMoney(roundToWhole(n, c), c);
  return (
    <Surface variant="peach" padding="lg" rounded="xl" style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="insights" size={20} color={colors.onTilePeach} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          <Text variant="overline" weight="bold" style={{ color: colors.caution }}>NOMI SIGNAL · TODAY</Text>
          <Text variant="bodyStrong" accessibilityRole="header">{name} is {pct}% higher than your usual pace.</Text>
          <Text variant="callout" tone="muted">You've spent {money(sig.currentMinor)} on {name.toLowerCase()} so far this month, against {money(sig.baselineMinor)} by this point in a usual month.</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`See details about ${name}`} onPress={onDetails}
        style={({ pressed }) => ({ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: MIN_TOUCH - 4, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: colors.tilePeach, opacity: pressed ? 0.8 : 1 })}>
        <Text variant="callout" weight="semibold" style={{ color: colors.onTilePeach }}>See details</Text>
        <Icon name="chevronRight" size={16} color={colors.onTilePeach} />
      </Pressable>
    </Surface>
  );
}
