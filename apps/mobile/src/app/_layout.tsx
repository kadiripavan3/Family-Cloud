import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_600SemiBold_Italic,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { makeQueryClient } from '@/api/client';
import { useGetMe } from '@/api/generated/homeport';
import { useOnline, watchConnection, watchFocus } from '@/api/online';
import { OnboardingProvider, useOnboarding } from '@/auth/onboarding';
import { SessionProvider, useSession } from '@/auth/session';
import { startCrashReports } from '@/features/crashes/crashes';
import { linksKnowSession } from '@/lib/links';
import { useTheme } from '@/theme';
import { loadAppearance } from '@/theme/appearance';
import { Button } from '@/ui/Button';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

void SplashScreen.preventAutoHideAsync();
void loadAppearance();
// Before the first request: without a connection, reading waits instead of failing; and what is on screen
// is asked for again when the app comes back from being put away.
watchConnection();
watchFocus();
// Crash reports, in builds that have the key for them. Elsewhere this does nothing.
startCrashReports();

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <OnboardingProvider>
            <App />
          </OnboardingProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Decides which part of the app a person sees: sign-in, the sign-up steps (their profile, then a circle), or the app itself. */
function App() {
  const theme = useTheme();
  const session = useSession();
  const onboarding = useOnboarding();
  const signedIn = session.status === 'signedIn';
  const online = useOnline();
  const me = useGetMe({ query: { enabled: signedIn } });
  // A link is only remembered for later while nobody is signed in; the router opens the others itself.
  useEffect(() => linksKnowSession(signedIn), [signedIn]);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_600SemiBold_Italic,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // The app opens as soon as it knows who this is: from the API, or from what the phone kept of the last run
  // (then without waiting for anyone). Only while the answer is on its way does the splash screen stay.
  const known = me.data !== undefined;
  const asking = signedIn && me.isPending && me.fetchStatus === 'fetching';
  const ready = fontsLoaded && session.status !== 'loading' && !asking;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = { ...base, colors: { ...base.colors, background: theme.colors.bg, card: theme.colors.bg, text: theme.colors.text } };

  // Signed in, but nothing is known about the person and the API can't be asked: the one case with nothing to show.
  if (signedIn && !known) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', gap: 12, padding: 32, backgroundColor: theme.colors.bg }}>
        <Txt variant="title" center accessibilityRole="header">
          {online ? words.states.cantOpen.unreachable.title : words.states.offline.title}
        </Txt>
        <Txt color="muted" center>
          {online ? words.states.cantOpen.unreachable.body : words.states.cantOpen.offline}
        </Txt>
        <Button label={words.common.tryAgain} block loading={me.isRefetching} onPress={() => void me.refetch()} style={{ marginTop: 12 }} />
        <Button label={words.common.signOut} variant="quiet" block onPress={() => void session.signOut()} />
      </View>
    );
  }

  // A new person stays in the sign-up steps until the last one, even though their profile exists after the first.
  const hasProfile = !!me.data?.profile;
  const stage = !signedIn ? 'auth' : !hasProfile || onboarding.active ? 'signUp' : 'app';
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={stage === 'auth'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={stage === 'signUp'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        {/* Setting up a circle needs someone to set it up for: it opens once the profile is made. */}
        <Stack.Protected guard={stage === 'signUp' && hasProfile}>
          <Stack.Screen name="(setup)" />
        </Stack.Protected>
        <Stack.Protected guard={stage === 'app'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
