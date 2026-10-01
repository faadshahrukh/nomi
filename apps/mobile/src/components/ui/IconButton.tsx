import { Pressable, type PressableProps } from 'react-native';
import { MIN_TOUCH, radius } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { tap } from '@/design/haptics';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  icon: IconName;
  /** Required: icon-only controls must be named for screen readers. */
  label: string;
  variant?: 'plain' | 'tonal' | 'accent';
  size?: number;
}

export function IconButton({ icon, label, variant = 'plain', size = MIN_TOUCH, onPress, disabled, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  const bg = variant === 'accent' ? colors.accent : variant === 'tonal' ? colors.surfaceSunken : 'transparent';
  const fg = variant === 'accent' ? colors.onAccent : colors.ink;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} aria-disabled={!!disabled} disabled={disabled}
      hitSlop={size < MIN_TOUCH ? (MIN_TOUCH - size) / 2 : 0}
      onPress={(e) => { tap(); onPress?.(e); }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.75 : 1 })}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
    </Pressable>
  );
}
