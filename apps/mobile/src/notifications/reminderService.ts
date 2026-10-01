import { Platform } from 'react-native';
import type { PlannedReminder } from '@nomi/core';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

/** Port for local reminders. Everything is scheduled on the device; no push server and no account are involved. */
export interface ReminderService {
  available(): boolean;
  permission(): Promise<ReminderPermission>;
  request(): Promise<ReminderPermission>;
  /** Replaces every scheduled reminder with exactly these. Because ids are stable, running it again never duplicates. */
  replaceAll(items: PlannedReminder[]): Promise<void>;
}

export const noReminders: ReminderService = { available: () => false, permission: async () => 'denied', request: async () => 'denied', replaceAll: async () => undefined };

const CHANNEL = 'bills';

/** expo-notifications, loaded lazily and guarded so a build without it falls back to "not available" rather than crashing. */
export function createReminderService(): ReminderService {
  if (Platform.OS === 'web') return noReminders;
  let N: typeof import('expo-notifications');
  try { N = require('expo-notifications'); } catch { return noReminders; }
  const map = (s: { granted: boolean; canAskAgain: boolean }): ReminderPermission => (s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied');
  return {
    available: () => true,
    permission: async () => { try { return map(await N.getPermissionsAsync()); } catch { return 'denied'; } },
    request: async () => { try { return map(await N.requestPermissionsAsync()); } catch { return 'denied'; } },
    async replaceAll(items) {
      await N.cancelAllScheduledNotificationsAsync();
      if (Platform.OS === 'android') await N.setNotificationChannelAsync(CHANNEL, { name: 'Bill reminders', importance: N.AndroidImportance.DEFAULT });
      for (const r of items) {
        const [y, m, d] = r.date.split('-').map(Number) as [number, number, number];
        await N.scheduleNotificationAsync({
          identifier: r.id, content: { title: r.title, body: r.body, sound: false },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(y, m - 1, d, r.hour, r.minute), channelId: CHANNEL },
        });
      }
    },
  };
}
