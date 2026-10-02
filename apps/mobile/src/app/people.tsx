import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { AddPersonInline } from '@/features/people/AddPersonInline';
import { Button, EmptyState, ErrorState, ListRow, Screen, ScreenTitle, SkeletonLines, Surface, Text, useToast } from '@/components/ui';

/** Friends you share costs and loans with. Rename or add; people are never deleted because past entries refer to them. */
export default function PeopleScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { state, retry, savePerson } = useLedger();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;
  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={4} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load people" onRetry={retry} /></Screen>;
  const people = state.snapshot.people;

  async function rename() {
    if (!editing) return;
    const r = await savePerson(editing.name, editing.id).catch(() => ({ ok: false as const, messages: ["Couldn't save. Try again."] }));
    if (r.ok) { setEditing(null); setErrors([]); toast.show({ message: 'Renamed.', tone: 'success' }); } else setErrors(r.messages);
  }
  return (
    <Screen>
      {header}
      <ScreenTitle title="People" subtitle="Friends you split costs with or lend to" />
      {people.length ? (
        <Surface padding="sm">
          {people.map((p) => (
            <View key={p.id}>
              <ListRow icon="users" title={p.name} showChevron onPress={() => { setEditing({ id: p.id, name: p.name }); setErrors([]); }} />
              {editing?.id === p.id ? (
                <View style={{ gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md }}>
                  <TextInput accessibilityLabel="New name" value={editing.name} onChangeText={(t) => setEditing({ id: p.id, name: t })} autoFocus
                    style={{ minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.medium, fontSize: 16 }} />
                  {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button label="Save name" onPress={() => void rename()} />
                    <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </Surface>
      ) : <EmptyState icon="users" title="No people yet" message="Add a friend and you can say things like “Rahim paid 1,500, my share was 750” or “Lent Rahim 1,200”." />}
      <Surface padding="lg" rounded="lg" style={{ gap: space.sm }}>
        <Text variant="bodyStrong">Add someone</Text>
        <AddPersonInline onAdded={() => toast.show({ message: 'Added.', tone: 'success' })} />
      </Surface>
    </Screen>
  );
}
