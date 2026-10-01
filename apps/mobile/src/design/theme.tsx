import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { colorsFor, type ColorTokens, type Scheme } from './tokens';

export type SchemePreference = 'system' | 'light' | 'dark';

interface ThemeValue {
  scheme: Scheme;
  colors: ColorTokens;
  preference: SchemePreference;
  setPreference: (p: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Resolves light/dark from the user's preference, falling back to the system setting. Persistence arrives with the settings store. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<SchemePreference>('system');
  const setPreference = useCallback((p: SchemePreference) => setPref(p), []);
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(() => ({ scheme, colors: colorsFor(scheme), preference, setPreference }), [scheme, preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
