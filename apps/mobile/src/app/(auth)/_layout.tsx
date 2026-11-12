import { Stack } from 'expo-router';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
