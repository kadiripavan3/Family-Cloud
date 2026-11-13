import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { useDeleteAccount } from '@/api/generated/homeport';
import { useSession } from '@/auth/session';
import { sayFarewell } from '@/features/leaving/farewell';
import { useLeave } from '@/features/navigation/useLeave';
import { radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Heading, Lead } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.settings.deleteAccount;
/** What goes: only this app, or the other one too. */
const CHOICES = ['homeport', 'both'] as const;
type Choice = (typeof CHOICES)[number];

/**
 * Delete account: clear and final. No maze and no guilt trip. The account is shared with Journey, so the
 * page asks which goes: only this app (the sign-in is never touched), or Journey too. What the API says
 * happened is shown on the welcome screen afterwards, since deleting signs the person out.
 */
export default function DeleteAccount() {
  const leave = useLeave();
  const { colors } = useTheme();
  const session = useSession();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Choice>('homeport');
  const remove = useDeleteAccount({
    mutation: {
      onSuccess: async (answer) => {
        sayFarewell(answer.message);
        await session.signOut();
        queryClient.clear();
      },
    },
  });

  return (
    <Screen
      header={<AppBar />}
      footer={
        <>
          {remove.isError ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
              {messageFor(remove.error)}
            </Txt>
          ) : null}
          <Button label={says.confirm} variant="danger" size="lg" block loading={remove.isPending} onPress={() => remove.mutate({ params: { journeyToo: choice === 'both' } })} />
          <Button label={says.keep} variant="line" size="lg" block onPress={leave} />
        </>
      }>
      <View style={{ width: 72, height: 72, borderRadius: radius.cardLarge, marginTop: 14, marginBottom: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
        <Trash2 size={32} color={colors.danger} />
      </View>
      <Heading>{says.title}</Heading>
      <Lead>{says.lead}</Lead>
      <Txt variant="item" style={{ marginTop: 22, marginBottom: 10 }}>
        {says.which}
      </Txt>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        {CHOICES.map((one) => {
          const on = one === choice;
          return (
            <Tap
              key={one}
              accessibilityRole="radio"
              accessibilityLabel={words.common.spoken([says.choices[one].label, says.choices[one].note])}
              accessibilityState={{ checked: on }}
              // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
              aria-checked={on}
              onPress={() => setChoice(one)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                // The thicker line of the chosen one takes its half point from the padding, so nothing moves.
                paddingVertical: on ? 12.5 : 13,
                paddingHorizontal: on ? 15.5 : 16,
                borderRadius: radius.card,
                borderWidth: on ? 2 : 1.5,
                borderColor: on ? colors.text : colors.line,
                backgroundColor: colors.bg,
              }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="item" weight={800}>
                  {says.choices[one].label}
                </Txt>
                <Txt variant="caption" weight={500} color="muted">
                  {says.choices[one].note}
                </Txt>
              </View>
              <View style={{ width: 22, height: 22, borderRadius: radius.pill, borderWidth: on ? 7 : 2, borderColor: on ? colors.text : colors.lineStrong }} />
            </Tap>
          );
        })}
      </View>
    </Screen>
  );
}
