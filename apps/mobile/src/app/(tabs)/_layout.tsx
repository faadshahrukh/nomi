import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { TABS, TabBarContainer, TabButton } from '@/components/nav/TabBar';

// Tabs must see its TabList and TabTrigger children directly, so they are declared here rather than in a wrapper component.
export default function TabsLayout() {
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <TabBarContainer>
          {TABS.map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
              <TabButton label={t.label} icon={t.icon} />
            </TabTrigger>
          ))}
        </TabBarContainer>
      </TabList>
    </Tabs>
  );
}
