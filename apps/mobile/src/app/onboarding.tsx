import { useRouter } from 'expo-router';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';

export default function Onboarding() {
  const router = useRouter();
  return <OnboardingFlow onDone={() => router.replace('/')} />;
}
