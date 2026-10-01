import { View, type ViewProps } from 'react-native';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';

export interface SurfaceProps extends ViewProps {
  /** raised: card on the background. sunken: quiet well. accent: tinted. */
  variant?: 'raised' | 'sunken' | 'accent' | 'outlined';
  padding?: keyof typeof space | 0;
  rounded?: keyof typeof radius;
}

export function Surface({ variant = 'raised', padding = 'lg', rounded = 'md', style, ...rest }: SurfaceProps) {
  const { colors, scheme } = useTheme();
  const bg = variant === 'sunken' ? colors.surfaceSunken : variant === 'accent' ? colors.accentSoft : colors.surface;
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: bg, borderRadius: radius[rounded], padding: padding === 0 ? 0 : space[padding] },
        variant === 'outlined' && { borderWidth: 1, borderColor: colors.border },
        variant === 'raised' && scheme === 'light' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    />
  );
}
