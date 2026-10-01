import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  NotoSansBengali_400Regular, NotoSansBengali_500Medium, NotoSansBengali_600SemiBold, NotoSansBengali_700Bold, NotoSansBengali_800ExtraBold,
} from '@expo-google-fonts/noto-sans-bengali';
import { useEffect } from 'react';
import { ThemeProvider, useTheme } from '@/design/theme';
import { MAX_CONTENT_WIDTH } from '@/design/tokens';
import { NetworkProvider } from '@/providers/NetworkProvider';
import { ToastProvider } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TAB_BAR_HEIGHT } from '@/components/nav/TabBar';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Frame() {
  const { colors, scheme } = useTheme();
  return (
    // On wide screens (web, tablets) the app stays a centred phone-width column.
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, backgroundColor: colors.bg }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ErrorBoundary>
          <ToastProvider bottomOffset={TAB_BAR_HEIGHT}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
          </ToastProvider>
        </ErrorBoundary>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    NotoSansBengali_400Regular, NotoSansBengali_500Medium, NotoSansBengali_600SemiBold, NotoSansBengali_700Bold, NotoSansBengali_800ExtraBold,
  });
  const ready = loaded || !!error; // a font failure falls back to the system font rather than blocking the app
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => undefined); }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NetworkProvider>
          <Frame />
        </NetworkProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
