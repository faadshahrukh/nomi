import { View } from 'react-native';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export interface ErrorStateProps {
  title?: string;
  /** Plain-language cause and next step. Never include financial values or raw error text. */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title = 'Something went wrong', message = 'Nothing was lost. Try again in a moment.', onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxxl }}>
      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.negativeSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="alert" size={28} color={colors.negative} />
      </View>
      <View style={{ gap: space.xs, alignItems: 'center' }}>
        <Text variant="heading" align="center">{title}</Text>
        <Text variant="callout" tone="muted" align="center" style={{ maxWidth: 320 }}>{message}</Text>
      </View>
      {onRetry ? <Button label={retryLabel} icon="refresh" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}
