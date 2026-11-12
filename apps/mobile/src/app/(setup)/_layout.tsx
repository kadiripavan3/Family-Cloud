import { Stack } from 'expo-router';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

/** 2 Set up a circle: the steps a new person goes through after their profile is made, before Home. */
export default function SetupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
