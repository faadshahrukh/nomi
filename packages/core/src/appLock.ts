export const LOCK_GRACE_CHOICES = [0, 30, 60, 300] as const;
export type LockGraceSeconds = (typeof LOCK_GRACE_CHOICES)[number];
export const LOCK_DEFAULT_GRACE: LockGraceSeconds = 30;

export interface AppLockSettings { enabled: boolean; graceSeconds: LockGraceSeconds }

export const parseGrace = (v: string | null): LockGraceSeconds => ((LOCK_GRACE_CHOICES as readonly number[]).includes(Number(v)) && v !== null && v !== '' ? (Number(v) as LockGraceSeconds) : LOCK_DEFAULT_GRACE);

/**
 * Whether the app should ask for the phone's unlock (fingerprint, face or PIN) when it comes back to the front.
 *  - Always on a cold start while the lock is on.
 *  - After being in the background, only once the grace period has passed, so a quick glance at a message does not lock you out.
 * A clock that moved backwards counts as "a long time": the safe answer is to lock.
 */
export function shouldLock(opts: { settings: AppLockSettings; backgroundedAtMs: number | null; nowMs: number }): boolean {
  if (!opts.settings.enabled) return false;
  if (opts.backgroundedAtMs === null) return true; // never seen it go to the background: this is a fresh start
  const away = opts.nowMs - opts.backgroundedAtMs;
  return away < 0 || away >= opts.settings.graceSeconds * 1000;
}

/**
 * What to do when the phone itself has no screen lock set (no fingerprint, face or PIN enrolled). Nomi cannot protect itself then,
 * and locking would trap the owner out for good, so it lets them in and says why.
 */
export type LockCapability = { hardware: boolean; enrolled: boolean };
export const canProtect = (c: LockCapability): boolean => c.hardware && c.enrolled;
