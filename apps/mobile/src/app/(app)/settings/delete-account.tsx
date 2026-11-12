import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { useDeleteAccount } from '@/api/generated/homeport';
import { useSession } from '@/auth/session';
import { useLeave } from '@/features/navigation/useLeave';
import { radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Heading, Lead } from '@/ui/Heading';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** Delete account: clear and final. No maze and no guilt trip. */
export default function DeleteAccount() {
  const leave = useLeave();
  const { colors } = useTheme();
  const session = useSession();
  const queryClient = useQueryClient();
  const remove = useDeleteAccount({
    mutation: {
      onSuccess: async () => {
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
          <Button label={words.settings.deleteAccount.confirm} variant="danger" size="lg" block loading={remove.isPending} onPress={() => remove.mutate()} />
          <Button label={words.settings.deleteAccount.keep} variant="line" size="lg" block onPress={leave} />
        </>
      }>
      <View style={{ width: 72, height: 72, borderRadius: radius.cardLarge, marginTop: 14, marginBottom: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
        <Trash2 size={32} color={colors.danger} />
      </View>
      <Heading>{words.settings.deleteAccount.title}</Heading>
      <Lead>{words.settings.deleteAccount.lead}</Lead>
    </Screen>
  );
}
