/**
 * The app's "now". Tests and design review can pin it with EXPO_PUBLIC_TODAY_OVERRIDE=YYYY-MM-DD (development only).
 * Production builds ignore the override.
 */
export function appNow(): Date {
  const o = process.env.EXPO_PUBLIC_TODAY_OVERRIDE;
  return __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1' ? (o && /^\d{4}-\d{2}-\d{2}$/.test(o) ? new Date(`${o}T12:00:00Z`) : new Date()) : new Date();
}
