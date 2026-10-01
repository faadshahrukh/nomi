import type { AnalyticsEvent, AnalyticsSink } from '@nomi/core';

/** Posts a batch of clean events (names and allowed words only) to the owner's own endpoint. No identifiers, no headers beyond content type. */
export function createHttpSink(url: string, fetchFn: typeof fetch = fetch): AnalyticsSink {
  return { async send(events: AnalyticsEvent[]) {
    const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) });
    if (!res.ok) throw new Error('analytics');
  } };
}
