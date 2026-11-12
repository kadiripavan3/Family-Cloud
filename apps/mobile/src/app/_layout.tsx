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
import { useGetCircles, useGetMe } from '@/api/generated/homeport';
import { useOnline, watchConnection, watchFocus } from '@/api/online';
import { OnboardingProvider, useOnboarding } from '@/auth/onboarding';
import { SessionProvider, useSession } from '@/auth/session';
import { useChosenCircleKnown } from '@/features/circles/current';
import { startCrashReports } from '@/features/crashes/crashes';
import { AskAboutNotifications } from '@/features/notifications/AskAboutNotifications';
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

/**
 * Decides which part of the app a person sees: sign-in, the sign-up steps (their profile, then a circle), or
 * the app itself. Someone with a profile and no circle is sent on to set one up by the app's own layout.
 */
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

  // The app opens as soon as it knows who this is and which circles they are in: from the API, or from what
  // the phone kept of the last run (then without waiting for anyone). Only while an answer is on its way
  // does the splash screen stay. A new person's circles are asked for behind the sign-up steps, which stay.
  const hasProfile = !!me.data?.profile;
  const circles = useGetCircles({ query: { enabled: signedIn && hasProfile } });
  const needsCircles = hasProfile && !onboarding.active;
  const known = me.data !== undefined && (!needsCircles || circles.data !== undefined);
  const asking = signedIn && ((me.isPending && me.fetchStatus === 'fetching') || (needsCircles && circles.isPending && circles.fetchStatus === 'fetching'));
  // Which circle they were in last is remembered on the phone, for each account.
  const circleKnown = useChosenCircleKnown(signedIn ? (me.data?.id ?? null) : null);
  const ready = fontsLoaded && session.status !== 'loading' && !asking && (circleKnown || !signedIn || me.data === undefined);
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
        <Button
          label={words.common.tryAgain}
          block
          loading={me.isRefetching || circles.isRefetching}
          onPress={() => {
            if (me.data === undefined) void me.refetch();
            else void circles.refetch();
          }}
          style={{ marginTop: 12 }}
        />
        <Button label={words.common.signOut} variant="quiet" block onPress={() => void session.signOut()} />
      </View>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {/* The order matters: when the screen someone is on closes to them (they signed in, or out), they land on the first group that is open. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* A new person's profile. It stays underneath until the last sign-up step is done, so Back from setting up a circle has somewhere to go. */}
        <Stack.Protected guard={signedIn && (!hasProfile || onboarding.active)}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        {/* The app itself, and making or joining a circle, need someone to do it for: they open once the profile is made. */}
        <Stack.Protected guard={signedIn && hasProfile}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="(setup)" />
        </Stack.Protected>
      </Stack>
      {/* The question about notifications, asked once, at a moment when there is something to hear about. */}
      {signedIn && hasProfile ? <AskAboutNotifications /> : null}
    </ThemeProvider>
  );
}
