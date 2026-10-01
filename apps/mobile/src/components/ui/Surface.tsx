import { View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';

export interface SurfaceProps extends ViewProps {
  /**
   * raised: white card. sunken: quiet well. accent: flat mint tint. outlined: border only.
   * mint: soft mint-to-white gradient (capture, Safe to Spend). forest: the dark hero card. peach: the warm Nomi Signal card.
   */
  variant?: 'raised' | 'sunken' | 'accent' | 'outlined' | 'mint' | 'forest' | 'peach';
  padding?: keyof typeof space | 0;
  rounded?: keyof typeof radius;
}

export function Surface({ variant = 'raised', padding = 'lg', rounded = 'md', style, children, ...rest }: SurfaceProps) {
  const { colors, scheme } = useTheme();
  const base = { borderRadius: radius[rounded], padding: padding === 0 ? 0 : space[padding], overflow: 'hidden' as const };
  if (variant === 'mint') {
    return (
      <LinearGradient colors={[colors.accentSoft, colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[base, { borderWidth: 1, borderColor: colors.border }, style]} {...rest}>
        {children}
      </LinearGradient>
    );
  }
  const bg = variant === 'sunken' ? colors.surfaceSunken : variant === 'accent' ? colors.accentSoft : variant === 'forest' ? colors.forest : variant === 'peach' ? colors.cautionSoft : colors.surface;
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: bg, ...base },
        variant === 'outlined' && { borderWidth: 1, borderColor: colors.border },
        (variant === 'raised' || variant === 'peach') && scheme === 'light' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
