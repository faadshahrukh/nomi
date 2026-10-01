import { useState } from 'react';
import { ScrollView } from 'react-native';
import { space } from '@/design/tokens';
import { Chip, EmptyState, Screen, ScreenTitle, type EmptyStateProps } from '@/components/ui';

/** Shared layout for tab screens whose data arrives in later milestones: title, section chips, honest empty state. */
export function TabPlaceholder({ title, subtitle, sections, empty }: { title: string; subtitle: string; sections: string[]; empty: EmptyStateProps }) {
  const [active, setActive] = useState(sections[0] ?? '');
  return (
    <Screen>
      <ScreenTitle title={title} subtitle={subtitle} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel={`${title} sections`}>
        {sections.map((s) => <Chip key={s} label={s} selected={s === active} onPress={() => setActive(s)} />)}
      </ScrollView>
      <EmptyState {...empty} />
    </Screen>
  );
}
