import { describe, expect, it } from 'vitest';
import { initialVoice, mapSpeechError, speechLanguage, voiceReducer, type VoiceAction, type VoiceState } from './voiceMachine';

const run = (actions: VoiceAction[], from: VoiceState = initialVoice) => actions.reduce(voiceReducer, from);

describe('voice machine', () => {
  it('goes idle → requesting → listening → finishing → heard', () => {
    const s = run([{ type: 'open' }, { type: 'listening' }, { type: 'partial', text: 'lunch' }, { type: 'stop' }, { type: 'final', text: '  lunch 250 ' }]);
    expect(s).toEqual({ phase: 'heard', transcript: 'lunch 250' });
  });
  it('treats an empty final result as no speech, not a transaction', () => {
    expect(run([{ type: 'open' }, { type: 'listening' }, { type: 'final', text: '  ' }])).toMatchObject({ phase: 'failed', reason: 'no_speech', transcript: '' });
  });
  it('keeps what was heard when an error arrives mid-way', () => {
    const s = run([{ type: 'open' }, { type: 'listening' }, { type: 'partial', text: 'biryani 350 from' }, { type: 'fail', reason: 'network' }]);
    expect(s).toMatchObject({ phase: 'failed', reason: 'network', transcript: 'biryani 350 from' });
  });
  it('lets the user edit a failed or heard transcript', () => {
    const failed = run([{ type: 'open' }, { type: 'fail', reason: 'unavailable', canAskAgain: false }, { type: 'edit', text: 'tea 30' }]);
    expect(failed).toMatchObject({ phase: 'failed', transcript: 'tea 30', canAskAgain: false });
    expect(run([{ type: 'edit', text: 'x' }], { phase: 'heard', transcript: 'a' })).toEqual({ phase: 'heard', transcript: 'x' });
  });
  it('ignores late events once the sheet has moved on', () => {
    expect(run([{ type: 'partial', text: 'late' }, { type: 'final', text: 'late' }, { type: 'stop' }])).toEqual(initialVoice);
    expect(run([{ type: 'final', text: 'late' }], { phase: 'heard', transcript: 'a' })).toEqual({ phase: 'heard', transcript: 'a' });
  });
  it('maps recogniser errors', () => {
    expect(mapSpeechError('not-allowed')).toBe('denied');
    expect(mapSpeechError('no-speech')).toBe('no_speech');
    expect(mapSpeechError('network')).toBe('network');
    expect(mapSpeechError('language-not-supported')).toBe('language');
    expect(mapSpeechError('aborted')).toBeNull();
    expect(mapSpeechError('???')).toBe('unknown');
  });
  it('chooses the listening language', () => {
    expect(speechLanguage('mixed', 'BD')).toBe('bn-BD');
    expect(speechLanguage('en', 'IN')).toBe('en-IN');
    expect(speechLanguage('en', 'EU')).toBe('en-US');
  });
});
