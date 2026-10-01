import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, MAX_CONTENT_WIDTH } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }

/** Modal sheet. Tapping the scrim, the close button or the system back gesture dismisses it. */
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.scrim }} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>{title}</Text>
            <IconButton icon="close" label="Close" variant="tonal" size={40} onPress={onClose} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
