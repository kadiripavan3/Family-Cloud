import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '@/api/fetcher';
import { useGetVault } from '@/api/generated/homeport';
import { placeHref } from '@/features/home/places';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Blob } from '@/ui/Blob';
import { Button } from '@/ui/Button';
import { Loading } from '@/ui/Loading';
import { Problem } from '@/ui/Problem';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Locked } from './Locked';
import { useVaultUnlocked, vaultUsed } from './session';

type Props = {
  children: ReactNode;
  /** The bar a locked or loading page keeps, so there is always a way back. The unlocked page draws its own. */
  leading?: 'back' | 'close';
};

/**
 * Around every screen of the Vault that needs the key. While the Vault is locked it draws the locked page in
 * the screen's place (and unlocking brings the screen back, started afresh: nothing an open screen held
 * outlives the lock). While it is unlocked, any touch on the screen counts as using the Vault, so the two
 * minutes start again.
 */
export function VaultScreen({ children, leading = 'back' }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const unlocked = useVaultUnlocked();
  const asked = useGetVault({ query: { enabled: !unlocked } });

  if (unlocked) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.bg }}
        onStartShouldSetResponderCapture={() => {
          vaultUsed();
          return false;
        }}>
        {children}
      </View>
    );
  }
  const load = loadState(asked);
  const vault = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading={leading} />
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : !vault ? (
        <Loading offline={load.offline} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 44, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {vault.setUp ? (
            <Locked vault={vault} title={words.vault.gate.title} body={words.vault.gate.body} />
          ) : (
            <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 34 }}>
              <View style={{ marginBottom: 6 }}>
                <Blob emoji={words.vault.setUp.emoji} />
              </View>
              <Txt variant="titleSmall" accessibilityRole="header" center>
                {words.vault.setUp.start.title}
              </Txt>
              <Txt variant="bodySmall" color="muted" center>
                {words.vault.setUp.start.body}
              </Txt>
              <Button label={words.vault.gate.toVault} size="lg" inline onPress={() => router.navigate(placeHref('vault'))} style={{ marginTop: 10 }} />
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
