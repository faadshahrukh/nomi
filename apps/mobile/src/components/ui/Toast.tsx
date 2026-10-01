import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'neutral' | 'success' | 'error' | 'info';
export interface ToastOptions { message: string; tone?: ToastTone; actionLabel?: string; onAction?: () => void; durationMs?: number }
interface ToastItem extends ToastOptions { id: number }

const Ctx = createContext<{ show: (t: ToastOptions) => void }>({ show: () => undefined });
export const useToast = () => useContext(Ctx);

/** One toast at a time; a new one replaces the current. Announced politely to screen readers. */
export function ToastProvider({ children, bottomOffset = 0 }: { children: ReactNode; bottomOffset?: number }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const show = useCallback((t: ToastOptions) => setItem({ ...t, id: ++seq.current }), []);
  const value = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (!item) return;
    const h = setTimeout(() => setItem((cur) => (cur?.id === item.id ? null : cur)), item.durationMs ?? (item.actionLabel ? 6000 : 3500));
    return () => clearTimeout(h);
  }, [item]);

  const icon: IconName = item?.tone === 'success' ? 'check' : item?.tone === 'error' ? 'alert' : 'bell';
  return (
    <Ctx.Provider value={value}>
      {children}
      {item ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + bottomOffset + space.lg, alignItems: 'center', paddingHorizontal: space.lg }}>
          <View accessibilityRole="alert" aria-live="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg, maxWidth: 480 }}>
            <Icon name={icon} size={18} color={colors.bg} />
            <Text variant="callout" style={{ color: colors.bg, flexShrink: 1 }}>{item.message}</Text>
            {item.actionLabel ? (
              <Pressable accessibilityRole="button" onPress={() => { item.onAction?.(); setItem(null); }} hitSlop={8}>
                <Text variant="callout" weight="bold" style={{ color: colors.accent }}>{item.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
