import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { signInService } from '@/auth/signIn';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { RoundButton } from '@/ui/RoundButton';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** 1.4 Email: asks for one thing, then sends the code. */
export default function Email() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const requestCode = useMutation({ mutationFn: (address: string) => signInService.requestCode(address) });

  const send = () => {
    const address = email.trim();
    requestCode.mutate(address, { onSuccess: () => router.push({ pathname: '/code', params: { email: address } }) });
  };

  return (
    <Screen
      header={
        <View style={{ height: 56, paddingHorizontal: 16, justifyContent: 'center' }}>
          <RoundButton label={words.common.back} onPress={() => router.back()} icon={(c) => <ArrowLeft size={20} color={c} />} />
        </View>
      }
      footer={<Button label={words.signIn.email.send} size="lg" block disabled={!looksLikeEmail(email)} loading={requestCode.isPending} onPress={send} />}>
      <Txt variant="heading" accessibilityRole="header" style={{ marginTop: 6 }}>
        {words.signIn.email.title}
      </Txt>
      <Txt variant="lead" color="muted" style={{ marginTop: 10, marginBottom: 24 }}>
        {words.signIn.email.body}
      </Txt>
      <Field
        label={words.signIn.email.field}
        value={email}
        onChangeText={setEmail}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={() => looksLikeEmail(email) && send()}
        error={requestCode.isError ? messageFor(requestCode.error) : null}
      />
    </Screen>
  );
}
