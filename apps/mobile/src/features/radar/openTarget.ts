import type { useRouter } from 'expo-router';
import type { RadarTarget } from '@nomi/core';

/** Where a Radar signal leads. The core says what it is about; this decides the screen. */
export function openTarget(router: ReturnType<typeof useRouter>, t: RadarTarget): void {
  switch (t.screen) {
    case 'planning': router.push(`/planning?section=${t.section}`); break;
    case 'safe_to_spend': router.push('/safe-to-spend'); break;
    case 'transaction': router.push(`/transaction/${t.id}`); break;
    case 'transactions': router.push(`/transactions?categoryId=${t.categoryId}&period=this_month`); break;
  }
}
