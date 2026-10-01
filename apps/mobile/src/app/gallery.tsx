import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { darkColors, lightColors, space, typography, type ColorTokens, type TypeVariant } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useNetworkOverride } from '@/providers/NetworkProvider';
import {
  AsyncBoundary, Badge, BottomSheet, Button, Chip, IconButton, ListRow, Money, ProgressBar, Screen, ScreenTitle,
  SectionHeader, Segmented, Skeleton, SkeletonLines, Surface, Text, useToast, type AsyncStatus,
} from '@/components/ui';

/** Developer-only. Shows every component and every UI state so they can be reviewed in light and dark. */
export default function Gallery() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const toast = useToast();
  const [status, setStatus] = useState<AsyncStatus>('ready');
  const [sheet, setSheet] = useState(false);
  const [chip, setChip] = useState('All');
  const { override, setOverride } = useNetworkOverride();
  const palette = scheme === 'dark' ? darkColors : lightColors;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton icon="chevronLeft" label="Back" variant="tonal" onPress={() => (router.canGoBack() ? router.back() : router.replace('/more'))} />
        <Text variant="overline" tone="muted">Developer</Text>
      </View>
      <ScreenTitle title="Component gallery" subtitle="Switch the theme in More. Colours below follow the active theme." />

      <Block title="Typography">
        {(Object.keys(typography) as TypeVariant[]).map((v) => <Text key={v} variant={v} numberOfLines={1}>{v}  ৳1,20,000 · টাকা</Text>)}
      </Block>

      <Block title="Colour tokens">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(Object.keys(palette) as Array<keyof ColorTokens>).filter((k) => k !== 'scrim').map((k) => (
            <View key={k} style={{ width: 96, gap: space.xs }}>
              <View style={{ height: 40, borderRadius: 10, backgroundColor: colors[k], borderWidth: 1, borderColor: colors.border }} />
              <Text variant="caption" tone="muted" numberOfLines={1}>{k}</Text>
            </View>
          ))}
        </View>
      </Block>

      <Block title="Money">
        <Money minor={12_000_000} currency="BDT" size="hero" />
        <Money minor={-85_000} currency="BDT" size="large" tone="negative" />
        <Money minor={45_000} currency="BDT" size="medium" signed tone="positive" />
        <Money minor={12_345_678} currency="BDT" size="small" locale="bn" />
      </Block>

      <Block title="Buttons">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Button label="Save" onPress={() => toast.show({ message: 'Saved', tone: 'success' })} />
          <Button label="Edit" variant="secondary" />
          <Button label="Skip" variant="ghost" />
          <Button label="Delete" variant="danger" />
          <Button label="Saving" loading />
          <Button label="Disabled" disabled />
        </View>
        <Button label="Add transaction" icon="plus" size="lg" fullWidth />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <IconButton icon="mic" label="Speak" variant="accent" />
          <IconButton icon="search" label="Search" variant="tonal" />
          <IconButton icon="bell" label="Notifications" />
        </View>
      </Block>

      <Block title="Chips, segments and badges">
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {['All', 'Expenses', 'Income'].map((c) => <Chip key={c} label={c} selected={c === chip} onPress={() => setChip(c)} />)}
        </View>
        <Segmented accessibilityLabel="Demo" value={chip === 'All' ? 'a' : 'b'} onChange={() => undefined} options={[{ value: 'a', label: 'Month' }, { value: 'b', label: 'Year' }]} />
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Badge label="Voice" icon="mic" />
          <Badge label="On track" tone="positive" icon="check" />
          <Badge label="Watch" tone="caution" icon="alert" />
          <Badge label="Over budget" tone="negative" icon="alert" />
          <Badge label="Owed to you" tone="accent" />
        </View>
      </Block>

      <Block title="Progress">
        <ProgressBar value={0.35} label="Groceries budget" />
        <ProgressBar value={0.82} tone="caution" label="Dining budget" />
        <ProgressBar value={1} tone="negative" label="Transport budget" />
      </Block>

      <Block title="List row">
        <ListRow icon="wallet" title="City Bank" subtitle="Bank account" trailing={<Money minor={10_000_000} currency="BDT" size="small" />} />
      </Block>

      <Block title="Loading, empty, error">
        <Segmented<AsyncStatus> accessibilityLabel="State" value={status} onChange={setStatus}
          options={[{ value: 'loading', label: 'Loading' }, { value: 'empty', label: 'Empty' }, { value: 'error', label: 'Error' }, { value: 'ready', label: 'Ready' }]} />
        <AsyncBoundary status={status} skeleton={<View style={{ gap: space.md }}><Skeleton height={44} /><SkeletonLines lines={3} /></View>}
          empty={{ title: 'No transactions yet', message: 'Tell Nomi what happened.', actionLabel: 'Add one', onAction: () => setStatus('ready') }}
          error={{ onRetry: () => setStatus('ready') }}>
          <Text>Content is shown when the data is ready.</Text>
        </AsyncBoundary>
      </Block>

      <Block title="Offline">
        <Segmented<'auto' | 'offline'> accessibilityLabel="Network" value={override === false ? 'offline' : 'auto'} onChange={(v) => setOverride(v === 'offline' ? false : null)}
          options={[{ value: 'auto', label: 'Real network' }, { value: 'offline', label: 'Simulate offline' }]} />
      </Block>

      <Block title="Toast and sheet">
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button label="Success toast" variant="secondary" onPress={() => toast.show({ message: 'Saved ৳450 to Dining', tone: 'success', actionLabel: 'Undo' })} />
          <Button label="Error toast" variant="secondary" onPress={() => toast.show({ message: "Couldn't save. Your entry is kept.", tone: 'error' })} />
          <Button label="Bottom sheet" variant="secondary" onPress={() => setSheet(true)} />
        </View>
      </Block>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Edit amount">
        <Text tone="muted">Sheets hold corrections and confirmations.</Text>
        <Button label="Done" fullWidth onPress={() => setSheet(false)} />
      </BottomSheet>
    </Screen>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <SectionHeader title={title} />
      <Surface style={{ gap: space.md }}>{children}</Surface>
    </View>
  );
}
