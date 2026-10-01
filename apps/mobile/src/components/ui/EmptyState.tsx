import { View } from 'react-native';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: IconName; title: string; message?: string;
  actionLabel?: string; onAction?: () => void;
  /** compact removes the large icon tile, for use inside cards. */
  compact?: boolean;
}

export function EmptyState({ icon = 'inbox', title, message, actionLabel, onAction, compact }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: compact ? 'flex-start' : 'center', gap: space.md, paddingVertical: compact ? space.xs : space.xxxl }} accessibilityRole="summary">
      {compact ? null : (
        <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={28} color={colors.onAccentSoft} />
        </View>
      )}
      <View style={{ gap: space.xs, alignItems: compact ? 'flex-start' : 'center' }}>
        <Text variant={compact ? 'bodyStrong' : 'heading'} align={compact ? 'left' : 'center'}>{title}</Text>
        {message ? <Text variant="callout" tone="muted" align={compact ? 'left' : 'center'} style={{ maxWidth: 320 }}>{message}</Text> : null}
      </View>
      {actionLabel && onAction ? <View style={{ alignSelf: compact ? 'flex-start' : 'center' }}><Button label={actionLabel} variant={compact ? 'secondary' : 'primary'} onPress={onAction} /></View> : null}
    </View>
  );
}
