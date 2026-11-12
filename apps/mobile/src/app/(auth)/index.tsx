import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openPage } from '@/api/config';
import { darkTheme, radius, withAlpha } from '@/theme';
import { BrandMark, JourneyMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Frost } from '@/ui/Frost';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Txt } from '@/ui/Txt';
import { rich } from '@/ui/rich';
import { words } from '@/words';

/** 1.1 Welcome: one full-bleed photo and one promise. Always dark, so the photo leads. */
export default function Welcome() {
  const router = useRouter();
  const { colors } = darkTheme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.stage }}>
      <LightStatusBar />
      <Image source={require('@/assets/photos/welcome-home.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      <LinearGradient
        colors={[withAlpha(colors.stage, 0.45), withAlpha(colors.stage, 0), withAlpha(colors.stage, 0), withAlpha(colors.stage, 0.8), withAlpha(colors.stage, 0.95)]}
        locations={[0, 0.2, 0.38, 0.66, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 }}>
          <BrandMark size={36} />
          <Txt variant="titleSmall" color="onPhoto">
            {words.common.appName}
          </Txt>
        </View>
        <View style={{ gap: 12, paddingBottom: 12 }}>
          {/* What matters most to someone who already has the other app: there is nothing new to sign up for. */}
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 6,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: 14,
              borderRadius: radius.cardLarge,
              borderWidth: 1,
              borderColor: colors.photoGlassLine,
              backgroundColor: colors.photoGlass,
              overflow: 'hidden',
            }}>
            <Frost tone="dark" />
            <JourneyMark size={28} />
            <Txt variant="caption" weight={500} color="onPhoto">
              {rich(words.signIn.welcome.oneAccount, {
                bold: (text) => (
                  <Txt variant="caption" weight={800} color="onPhoto">
                    {text}
                  </Txt>
                ),
              })}
            </Txt>
          </View>
          <Txt variant="hero" accessibilityRole="header" color="onPhoto">
            {words.signIn.welcome.title}
          </Txt>
          <Txt variant="bodyLarge" color="onPhoto" style={{ opacity: 0.84, marginBottom: 10 }}>
            {words.signIn.welcome.body}
          </Txt>
          <Button label={words.signIn.welcome.start} size="lg" block onPress={() => router.push('/how-it-works')} />
          <Button label={words.signIn.welcome.haveAccount} size="lg" variant="glass" block onPress={() => router.push('/sign-in')} />
          <Txt variant="tiny" color="onPhoto" center weight={500} style={{ opacity: 0.62, marginTop: 4, marginBottom: 2 }}>
            {rich(words.signIn.welcome.agree, {
              terms: (text) => (
                <Txt variant="tiny" color="onPhoto" weight={700} accessibilityRole="link" onPress={() => openPage('/terms')} style={{ textDecorationLine: 'underline' }}>
                  {text}
                </Txt>
              ),
              privacy: (text) => (
                <Txt variant="tiny" color="onPhoto" weight={700} accessibilityRole="link" onPress={() => openPage('/privacy')} style={{ textDecorationLine: 'underline' }}>
                  {text}
                </Txt>
              ),
            })}
          </Txt>
        </View>
      </SafeAreaView>
    </View>
  );
}
