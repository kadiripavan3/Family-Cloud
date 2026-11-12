import { useRouter } from 'expo-router';
import { Eye, KeyRound, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { useGetMe, useGetVault } from '@/api/generated/homeport';
import { setUpNewVault } from '@/features/vault/actions';
import { DeviceLockFields, lockFrom, NOTHING_TYPED } from '@/features/vault/DeviceLockFields';
import { problemOf } from '@/features/vault/problems';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { Working } from '@/features/vault/Working';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Heading, Lead } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { rich } from '@/ui/rich';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * Setting up a Vault, the first time. The key pair and the Vault key are made on this phone; the public key
 * and the wrapped private key go to the API; the Vault key is shown next, once (9.6). Nothing here is drawn
 * in the designs: it is the step before the drawn "Your Vault key".
 */
export default function SetUpVault() {
  const router = useRouter();
  const cache = useCache();
  const account = useGetMe().data?.id;
  const vault = useGetVault().data;
  const [typed, setTyped] = useState(NOTHING_TYPED);
  const making = useSecretAction();
  const says = words.vault.setUp;
  const lock = lockFrom(typed);

  const make = async () => {
    if (!account || !lock) return;
    const made = await making.run(async (progress) => {
      const record = await setUpNewVault(account, lock, progress);
      void cache.vaultRecordChanged(record);
    });
    setTyped(NOTHING_TYPED);
    if (made) router.replace('/vault/key');
  };

  return (
    <Screen
      header={<AppBar leading="close" />}
      footer={
        <>
          {making.busy ? <Working text={words.vault.working.making} progress={making.progress} /> : null}
          {making.error ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
              {problemOf(making.error)}
            </Txt>
          ) : null}
          <Button label={says.button} size="lg" block disabled={!lock || !account || vault?.setUp === true} loading={making.busy} onPress={() => void make()} />
        </>
      }>
      <Heading>{says.title}</Heading>
      <Lead>
        {rich(says.lead, {
          bold: (text) => (
            <Txt variant="lead" weight={700}>
              {text}
            </Txt>
          ),
        })}
      </Lead>
      <View style={{ gap: 8, marginTop: 18 }}>
        <NoteBox icon={(c) => <Lock size={20} color={c} />} title={says.points.scrambled.title}>
          {says.points.scrambled.body}
        </NoteBox>
        <NoteBox icon={(c) => <KeyRound size={20} color={c} />} title={says.points.noReset.title}>
          {says.points.noReset.body}
        </NoteBox>
        <NoteBox icon={(c) => <Eye size={20} color={c} />} title={says.points.clear.title}>
          {says.points.clear.body}
        </NoteBox>
      </View>
      <View style={{ marginTop: 18 }}>
        <DeviceLockFields value={typed} onChange={setTyped} disabled={making.busy} />
      </View>
    </Screen>
  );
}
