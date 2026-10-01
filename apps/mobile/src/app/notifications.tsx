import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { planReminders } from '@nomi/core';
import { space } from '@/design/tokens';
import { appNow } from '@/data/clock';
import { useLedger } from '@/data/LedgerProvider';
import { createReminderService, type ReminderPermission } from '@/notifications/reminderService';
import { monthDay } from '@/lib/format';
import { Button, Chip, ErrorState, Screen, ScreenTitle, Segmented, SkeletonLines, Surface, Text, useToast } from '@/components/ui';

const HOURS = [{ h: 8, label: '8 am' }, { h: 9, label: '9 am' }, { h: 12, label: 'Noon' }, { h: 18, label: '6 pm' }, { h: 20, label: '8 pm' }];

/** Bill reminders: a heads-up the day before and on the day. Local to this phone, no amounts on the lock screen, and the exact list is shown here. */
export default function NotificationsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, mode, retry, setReminders } = useLedger();
  const service = useMemo(() => createReminderService(), []);
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  useEffect(() => { service.permission().then(setPermission).catch(() => undefined); }, [service]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;
  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={5} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load this" onRetry={retry} /></Screen>;

  const { reminders, snapshot, summary } = state;
  const supported = service.available();
  const demo = mode === 'demo';
  const now = appNow();
  const upcoming = planReminders(snapshot.recurringRules, snapshot.transactions, { date: summary.today, hour: now.getHours(), minute: now.getMinutes() }, { hour: reminders.hour });

  async function toggle(on: boolean) {
    if (on) {
      const p = permission === 'granted' ? 'granted' : await service.request();
      setPermission(p);
      if (p !== 'granted') { toast.show({ message: 'Allow notifications for Nomi in your phone settings to get reminders.', tone: 'info' }); return; }
    }
    await setReminders({ ...reminders, enabled: on }).catch(() => toast.show({ message: "Couldn't save that. Try again.", tone: 'error' }));
  }

  return (
    <Screen>
      {header}
      <ScreenTitle title="Notifications" subtitle="Only what is worth your attention" />
      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <Text variant="bodyStrong">Bill reminders</Text>
        <Text variant="callout" tone="muted">A note the day before a bill is due and another on the day, only for bills you have not marked paid. They never include amounts, so nothing private shows on your lock screen.</Text>
        {!supported ? <Text variant="callout" tone="caution" accessibilityRole="alert">{demo ? 'Reminders are off for the example data.' : 'Reminders work on the phone app. This version cannot schedule them.'}</Text> : null}
        {supported && permission === 'denied' ? <Text variant="callout" tone="caution" accessibilityRole="alert">Notifications are blocked for Nomi. Turn them on in your phone settings, then come back.</Text> : null}
        <Segmented<'on' | 'off'> accessibilityLabel="Bill reminders" value={reminders.enabled && permission === 'granted' ? 'on' : 'off'} onChange={(v) => void toggle(v === 'on')}
          options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <Text variant="bodyStrong">Time of day</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {HOURS.map((o) => <Chip key={o.h} label={o.label} selected={reminders.hour === o.h} onPress={() => void setReminders({ ...reminders, hour: o.h })} />)}
        </View>
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.xs }}>
        <Text variant="bodyStrong">What would be sent</Text>
        {upcoming.length === 0 ? <Text variant="callout" tone="muted">Nothing in the next two weeks. Add a recurring bill in Planning and it will show up here.</Text>
          : upcoming.slice(0, 6).map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, minHeight: 32, alignItems: 'center' }} accessible accessibilityLabel={`${r.title}, ${monthDay(r.date)}`}>
              <Text variant="callout" style={{ flex: 1 }}>{r.title}</Text>
              <Text variant="caption" tone="muted">{monthDay(r.date)}</Text>
            </View>))}
      </Surface>
    </Screen>
  );
}
