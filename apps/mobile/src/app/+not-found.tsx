import { useRouter } from 'expo-router';
import { Screen, ErrorState } from '@/components/ui';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen showOffline={false}>
      <ErrorState title="That page doesn't exist" message="The link may be out of date." onRetry={() => router.replace('/')} retryLabel="Go to Home" />
    </Screen>
  );
}
