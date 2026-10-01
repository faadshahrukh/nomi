import { describe, expect, it, vi } from 'vitest';
import { FallbackInterpreter, RuleBasedInterpreter, type InterpretInput } from '@nomi/core';
import { buildInterpreter, type InterpreterChoice } from './buildInterpreter';

const base: InterpreterChoice = { aiProcessing: true, backendConfigured: true, signedIn: true, interpretUrl: 'https://p.supabase.co/functions/v1/interpret', anonKey: 'anon-key', getToken: async () => 'tok' };
const input: InterpretInput = { text: 'Spent 450 on lunch', locale: 'en', today: '2025-03-15', currency: 'BDT', accounts: [{ name: 'Cash', aliases: [] }], categoryNames: ['Dining'], personNames: [], goalNames: [] };

describe('who understands the message', () => {
  it('uses the AI service (with on-device rules behind it) only when allowed, configured and signed in', () => {
    expect(buildInterpreter(base)).toBeInstanceOf(FallbackInterpreter);
  });
  it.each<[string, Partial<InterpreterChoice>]>([
    ['the user turned AI off', { aiProcessing: false }],
    ['no backend is configured', { backendConfigured: false }],
    ['the user is signed out', { signedIn: false }],
  ])('keeps the text on the device when %s', (_why, over) => {
    expect(buildInterpreter({ ...base, ...over })).toBeInstanceOf(RuleBasedInterpreter);
  });
  it('never contacts the network in on-device mode', async () => {
    const fetchFn = vi.fn();
    await buildInterpreter({ ...base, aiProcessing: false, fetchFn: fetchFn as never }).interpret(input);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('talks to the interpret function with the user token and public key, and falls back on failure', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 502 }));
    const i = buildInterpreter({ ...base, fetchFn: fetchFn as never });
    const out = await i.interpret(input);
    expect(out.status).toBe('ok'); // answered by the on-device rules after the server failed
    expect(i.lastKind).toBe('device');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(base.interpretUrl);
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', apikey: 'anon-key' });
  });
});
