import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('interpret Edge Function', () => {
  it('bundles: every import resolves (including the explicit .ts paths Deno requires), and nothing needs Node', async () => {
    const entry = new URL('../../../supabase/functions/interpret/index.ts', import.meta.url).pathname;
    const out = await build({
      entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
      external: ['@anthropic-ai/sdk', '@supabase/supabase-js'], // provided by Deno via deno.json in production
    });
    const code = out.outputFiles[0]!.text;
    expect(code).toContain('handleInterpret');
    expect(code).toContain('consume_ai_quota');
    expect(code).not.toMatch(/from ["']node:/);
    expect(code).not.toMatch(/require\(["']fs["']\)/);
  });
  it('never ships a secret or the prompt into the mobile app bundle surface', async () => {
    const idx = (await import('node:fs')).readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const aiIdx = (await import('node:fs')).readFileSync(new URL('../src/ai/index.ts', import.meta.url), 'utf8');
    expect(idx + aiIdx).not.toMatch(/claude\/|claudeInterpreter|SYSTEM_PROMPT/); // server-only modules are not re-exported to the app
  });
});
