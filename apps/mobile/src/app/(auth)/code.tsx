import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { signInService } from '@/auth/signIn';
import { authMode, LOCAL_TEST_CODE } from '@/auth/mode';
import { radius, useTheme } from '@/theme';
import { OtpInput } from '@/ui/OtpInput';
import { RoundButton } from '@/ui/RoundButton';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { rich } from '@/ui/rich';
import { words } from '@/words';

/** 1.5 Email code: six boxes, checked as soon as the last digit is in. */
export default function Code() {
  const router = useRouter();
  const { colors } = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  // A right code signs the person in; the session hears it from the sign-in service and the app moves on.
  const createToken = useMutation({ mutationFn: (typed: string) => signInService.verifyCode(email, typed) });
  const resend = useMutation({ mutationFn: () => signInService.requestCode(email) });

  const check = (typed: string) => createToken.mutate(typed, { onError: () => setCode('') });

  return (
    <Screen
      header={
        <View style={{ height: 56, paddingHorizontal: 16, justifyContent: 'center' }}>
          <RoundButton label={words.common.back} onPress={() => router.back()} icon={(c) => <ArrowLeft size={20} color={c} />} />
        </View>
      }>
      <Txt variant="heading" accessibilityRole="header" style={{ marginTop: 6 }}>
        {words.signIn.code.title}
      </Txt>
      <Txt variant="lead" color="muted" style={{ marginTop: 10, marginBottom: 28 }}>
        {rich(words.signIn.code.sentTo(email), {
          email: (text) => (
            <Txt variant="lead" weight={700}>
              {text}
            </Txt>
          ),
        })}
      </Txt>
      <OtpInput value={code} onChange={setCode} onComplete={check} disabled={createToken.isPending} />
      {createToken.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 12 }}>
          {messageFor(createToken.error)}
        </Txt>
      ) : null}
      <Pressable accessibilityRole="button" disabled={resend.isPending} onPress={() => resend.mutate()} style={{ marginTop: 18, alignSelf: 'flex-start' }} hitSlop={8}>
        <Txt variant="callout" color="accentText" weight={700} accessibilityLiveRegion="polite">
          {resend.isPending ? words.signIn.code.sending : resend.isSuccess ? words.signIn.code.sentAgain : words.signIn.code.sendAgain}
        </Txt>
      </Pressable>
      {resend.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8 }}>
          {messageFor(resend.error)}
        </Txt>
      ) : null}
      {authMode === 'local' ? (
        <View style={{ marginTop: 24, padding: 13, borderRadius: radius.field, backgroundColor: colors.fill }}>
          <Txt variant="caption" weight={600}>
            {words.signIn.code.testMode(LOCAL_TEST_CODE)}
          </Txt>
        </View>
      ) : null}
    </Screen>
  );
}
