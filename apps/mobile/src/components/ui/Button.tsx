import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { tap } from '@/design/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({ label, variant = 'primary', size = 'md', icon, loading, fullWidth, disabled, onPress, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const off = disabled || loading;
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.negativeSoft : variant === 'secondary' ? colors.surfaceSunken : 'transparent';
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.negative : variant === 'ghost' ? colors.accent : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!off}
      aria-busy={!!loading}
      disabled={off}
      onPress={(e) => { tap(); onPress?.(e); }}
      style={({ pressed }) => ({
        minHeight: size === 'lg' ? 56 : MIN_TOUCH, paddingHorizontal: size === 'lg' ? space.xxl : space.lg, borderRadius: radius.pill,
        backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm,
      })}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <View><Text variant="bodyStrong" style={{ color: fg }}>{label}</Text></View>
    </Pressable>
  );
}
