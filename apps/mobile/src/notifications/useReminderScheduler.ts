import { useEffect, useMemo } from 'react';
import { planReminders } from '@nomi/core';
import { useLedger } from '@/data/LedgerProvider';
import { appNow } from '@/data/clock';
import { createReminderService, type ReminderService } from './reminderService';

/** Keeps the phone's scheduled reminders in step with the ledger: re-plans whenever bills, payments or the setting change. */
export function useReminderScheduler(injected?: ReminderService) {
  const { state, mode } = useLedger();
  const service = useMemo(() => injected ?? createReminderService(), [injected]);
  useEffect(() => {
    if (state.status !== 'ready' || mode !== 'real' || !service.available()) return; // example data never schedules real reminders
    let alive = true;
    (async () => {
      const permitted = (await service.permission()) === 'granted';
      const items = state.reminders.enabled && permitted ? planReminders(state.snapshot.recurringRules, state.snapshot.transactions, { date: state.summary.today, hour: appNow().getHours(), minute: appNow().getMinutes() }, { hour: state.reminders.hour }) : [];
      if (alive) await service.replaceAll(items);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [state, mode, service]);
}
