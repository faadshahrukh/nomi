import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Category } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { BottomSheet, Badge, Button, Chip, ErrorState, ListRow, Screen, ScreenTitle, Segmented, SkeletonLines, Surface, Text, useToast } from '@/components/ui';

function CategorySheet({ visible, editing, kind, mains, onClose }: { visible: boolean; editing: Category | null; kind: 'expense' | 'income'; mains: Category[]; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { saveCategory, archiveCategory } = useLedger();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setName(editing?.name ?? ''); setParentId(editing?.parentId ?? null); setErrors([]); } }, [visible, editing]);
  const k = editing?.kind ?? kind;
  async function save() {
    setBusy(true); setErrors([]);
    try { const r = await saveCategory({ name, kind: k, parentId }, editing?.id ?? null); if (r.ok) { toast.show({ message: editing ? 'Category updated.' : 'Category added.', tone: 'success' }); onClose(); } else setErrors(r.messages); }
    catch { setErrors(["Couldn't save. Try again."]); } finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true);
    try { const r = await archiveCategory(editing!.id, !editing!.archivedAt); if (r.ok) { toast.show({ message: editing!.archivedAt ? 'Restored.' : 'Archived. Past transactions keep it.', tone: 'neutral' }); onClose(); } else setErrors([r.message]); }
    catch { setErrors(["Couldn't change that. Try again."]); } finally { setBusy(false); }
  }
  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit category' : `Add ${k} category`}>
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="callout" weight="semibold">Name</Text>
          <TextInput accessibilityLabel="Category name" value={name} onChangeText={setName} placeholder="e.g. Pets" placeholderTextColor={colors.inkMuted}
            style={{ minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 17 }} />
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">Inside</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Chip label="Its own (main category)" selected={parentId === null} onPress={() => setParentId(null)} />
            {mains.filter((m) => m.id !== editing?.id).map((m) => <Chip key={m.id} label={m.name} selected={parentId === m.id} onPress={() => setParentId(m.id)} />)}
          </View>
        </View>
        {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
        <Button label={editing ? 'Save changes' : 'Add category'} size="lg" fullWidth loading={busy} onPress={() => void save()} />
        {editing ? <Button label={editing.archivedAt ? 'Restore category' : 'Archive category'} variant="secondary" fullWidth disabled={busy} onPress={() => void archive()} /> : null}
      </View>
    </BottomSheet>
  );
}

/** How spending and income are grouped. The built-in set is fixed; add your own, rename them, or archive ones you no longer use. */
export default function CategoriesScreen() {
  const router = useRouter();
  const { state, retry } = useLedger();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [sheet, setSheet] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;
  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={6} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load categories" onRetry={retry} /></Screen>;
  const all = state.snapshot.categories.filter((c) => c.kind === kind);
  const mains = all.filter((c) => c.parentId === null && !c.archivedAt);
  const row = (c: Category, indent: boolean) => (
    <View key={c.id} style={{ paddingLeft: indent ? space.xl : 0 }}>
      <ListRow title={c.name} subtitle={c.archivedAt ? 'Archived' : undefined}
        trailing={c.userId === null ? <Badge label="Built in" tone="neutral" /> : undefined} showChevron={c.userId !== null}
        onPress={c.userId !== null ? () => setSheet({ open: true, editing: c }) : undefined} />
    </View>
  );
  return (
    <Screen>
      {header}
      <ScreenTitle title="Categories" subtitle="How your spending and income are grouped" />
      <Segmented<'expense' | 'income'> accessibilityLabel="Kind" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} />
      <Surface padding="sm">
        {all.filter((c) => c.parentId === null).map((m) => (
          <View key={m.id}>
            {row(m, false)}
            {all.filter((c) => c.parentId === m.id).map((s) => row(s, true))}
          </View>
        ))}
      </Surface>
      <Button label="Add a category" icon="plus" onPress={() => setSheet({ open: true, editing: null })} />
      <CategorySheet visible={sheet.open} editing={sheet.editing} kind={kind} mains={mains} onClose={() => setSheet({ open: false, editing: null })} />
    </Screen>
  );
}
