import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import palette from '../../../tailwind.palette';

// Every screen draws its own web-style header (PageHeader / VioletHeader / custom),
// so the native header is off everywhere.
export default function AppLayout() {
  const { profile } = useAuth();
  const segments = useSegments();

  // Same gate as the web's ProtectedRoute: an incomplete profile goes to onboarding.
  const complete = !!profile?.onboarding_completed || !!profile?.preferred_position;
  const onOnboarding = segments[segments.length - 1] === 'onboarding';
  if (profile && !complete && !onOnboarding) return <Redirect href="/onboarding" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.gray['50'] } }} />;
}
