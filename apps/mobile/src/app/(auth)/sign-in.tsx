import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Mail, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openPage } from '@/api/config';
import { ApiError, messageFor } from '@/api/fetcher';
import { authMode } from '@/auth/mode';
import { signInService } from '@/auth/signIn';
import { ContinueAs, type JourneyOffer } from '@/features/journeyLink/ContinueAs';
import { layout, radius, useTheme } from '@/theme';
import { AppleLogo, BrandMark, GoogleLogo } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { RoundButton } from '@/ui/RoundButton';
import { Txt } from '@/ui/Txt';
import { rich } from '@/ui/rich';
import { words } from '@/words';

/** The three buttons are a little lower than a large button elsewhere, so the "Continue as" row fits above them. */
const BUTTON = { minHeight: 50 } as const;

type Props = {
  /**
   * Journey's sign-in, when it was found on this phone: then "Continue as …" is the first choice. Nothing
   * hands one over yet (see `ContinueAs`), so the screen opens with the three ways in.
   */
  journey?: JourneyOffer;
};

/** 1.3 Log in or sign up: one screen for both. Apple first, as the App Store asks when Google is offered. */
export default function SignIn({ journey }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<string | null>(null);

  // Where Apple or Google isn't offered (not connected yet, or not this kind of phone), say so plainly.
  const [busy, setBusy] = useState<string | null>(null);
  const with_ = (which: 'apple' | 'google', start: (() => Promise<void>) | null) => () => {
    if (!start) {
      const name = words.signIn.providers[which];
      setNote(authMode === 'local' ? words.signIn.choose.later(name) : words.signIn.choose.notOnThisPhone(name));
      return;
    }
    setNote(null);
    setBusy(which);
    start()
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.code === 'cancelled')) setNote(messageFor(error));
      })
      .finally(() => setBusy(null));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LightStatusBar />
      <ScrollView bounces={false} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 250 }}>
          <Image source={require('@/assets/photos/dining.jpg')} style={{ flex: 1 }} contentFit="cover" contentPosition={{ top: '70%' }} accessible={false} />
          <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
            <RoundButton label={words.common.close} tone="photo" onPress={() => router.back()} icon={(c) => <X size={20} color={c} />} />
          </View>
        </View>
        <View style={{ flex: 1, marginTop: -30, paddingTop: 50, paddingBottom: insets.bottom + 16, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.bg }}>
          <View style={{ position: 'absolute', top: -32, left: 20, borderRadius: radius.cardLarge, borderWidth: 4, borderColor: colors.bg }}>
            <BrandMark size={64} />
          </View>
          <View style={{ paddingHorizontal: layout.rowGutter, gap: 10 }}>
            <Txt variant="heading" accessibilityRole="header">
              {words.signIn.choose.title}
            </Txt>
            <Txt variant="lead" color="muted">
              {words.signIn.choose.body}
            </Txt>
          </View>
          {journey ? <ContinueAs offer={journey} /> : null}
          <View style={{ paddingHorizontal: layout.rowGutter, gap: 9, marginTop: journey ? 14 : 24 }}>
            <Button label={words.signIn.choose.apple} size="lg" variant="ink" block loading={busy === 'apple'} onPress={with_('apple', signInService.apple)} icon={(c) => <AppleLogo color={c} />} style={BUTTON} />
            <Button label={words.signIn.choose.google} size="lg" variant="line" block loading={busy === 'google'} onPress={with_('google', signInService.google)} icon={() => <GoogleLogo />} style={BUTTON} />
            <Button label={words.signIn.choose.email} size="lg" variant="line" block onPress={() => router.push('/email')} icon={(c) => <Mail size={19} color={c} />} style={BUTTON} />
            {note ? (
              <View accessibilityLiveRegion="polite" style={{ padding: 13, borderRadius: radius.field, backgroundColor: colors.fill }}>
                <Txt variant="caption" weight={600}>
                  {note}
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt variant="small" color="muted" center weight={500} style={{ marginTop: 18, marginHorizontal: 34 }}>
            {rich(words.signIn.choose.agree, {
              terms: (text) => (
                <Txt variant="small" weight={700} accessibilityRole="link" onPress={() => openPage('/terms')} style={{ color: colors.accentText }}>
                  {text}
                </Txt>
              ),
              privacy: (text) => (
                <Txt variant="small" weight={700} accessibilityRole="link" onPress={() => openPage('/privacy')} style={{ color: colors.accentText }}>
                  {text}
                </Txt>
              ),
            })}
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}
