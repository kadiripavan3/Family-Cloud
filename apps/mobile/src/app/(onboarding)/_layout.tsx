import { Stack } from 'expo-router';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

/** The first thing after signing in for the first time: the person's own profile. */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
