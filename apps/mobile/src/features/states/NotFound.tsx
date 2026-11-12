import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '@/auth/session';
import { useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { words } from '@/words';

/**
 * Shown for an address the app has no screen for: a link made for a newer version of Homeport, or one that
 * was typed wrong. It says so in the app's own words and offers the one way on that always works.
 */
export function NotFound() {
  const router = useRouter();
  const { colors } = useTheme();
  const signedIn = useSession().status === 'signedIn';
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48, backgroundColor: colors.bg }}>
      <EmptyState
        emoji="🚪"
        title={words.states.notFound.title}
        body={signedIn ? words.states.notFound.bodySignedIn : words.states.notFound.body}
        action={<Button label={signedIn ? words.common.goHome : words.states.notFound.goToStart} onPress={() => router.replace('/')} />}
      />
    </View>
  );
}
