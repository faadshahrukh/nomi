import { useRouter } from 'expo-router';
import { Button, Screen, ScreenTitle } from '@/components/ui';
import { AuthPanel } from '@/features/auth/AuthPanel';

export default function AuthScreen() {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  return (
    <Screen>
      <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />
      <ScreenTitle title="Sign in" subtitle="Optional. Signing in lets Nomi understand messages with AI. Your balances and history stay on this device." />
      <AuthPanel initialMode="signIn" onSignedIn={back} />
    </Screen>
  );
}
