import { Platform } from 'react-native';
import type { LockCapability } from '@nomi/core';

export type AuthResult = 'success' | 'failed' | 'cancelled' | 'unavailable';

/** Port for the phone's own unlock (fingerprint, face, or PIN/pattern). Nomi never sees or stores anything biometric. */
export interface Authenticator {
  supported(): boolean;
  capability(): Promise<LockCapability>;
  authenticate(reason: string): Promise<AuthResult>;
}

export const noAuthenticator: Authenticator = { supported: () => false, capability: async () => ({ hardware: false, enrolled: false }), authenticate: async () => 'unavailable' };

/** expo-local-authentication, loaded lazily and guarded. Unavailable on web. */
export function createAuthenticator(): Authenticator {
  if (Platform.OS === 'web') return noAuthenticator;
  let LA: typeof import('expo-local-authentication');
  try { LA = require('expo-local-authentication'); } catch { return noAuthenticator; }
  return {
    supported: () => true,
    async capability() {
      try { return { hardware: await LA.hasHardwareAsync() || (await LA.getEnrolledLevelAsync()) !== LA.SecurityLevel.NONE, enrolled: (await LA.getEnrolledLevelAsync()) !== LA.SecurityLevel.NONE }; }
      catch { return { hardware: false, enrolled: false }; }
    },
    async authenticate(reason) {
      try {
        const r = await LA.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel', disableDeviceFallback: false });
        if (r.success) return 'success';
        return r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel' ? 'cancelled' : r.error === 'not_available' || r.error === 'not_enrolled' ? 'unavailable' : 'failed';
      } catch { return 'unavailable'; }
    },
  };
}
