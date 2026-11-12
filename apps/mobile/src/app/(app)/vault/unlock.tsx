import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useGetMe, useGetVault } from '@/api/generated/homeport';
import { placeHref } from '@/features/home/places';
import { useLeave } from '@/features/navigation/useLeave';
import { keepUnlockedVault, unlockWithVaultKey } from '@/features/vault/actions';
import { normalizeVaultKey } from '@/features/vault/crypto/vaultKey';
import { DeviceLockFields, lockFrom, NOTHING_TYPED } from '@/features/vault/DeviceLockFields';
import { problemOf } from '@/features/vault/problems';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { Working } from '@/features/vault/Working';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Heading, Lead } from '@/ui/Heading';
import { ToggleRow } from '@/ui/Rows';
import { Screen } from '@/ui/Screen';
import { words } from '@/words';

/**
 * Unlocking with the Vault key: on a new phone, or when Face ID or the passcode won't do. The 24 characters
 * are typed here and nowhere sent: they open the private key out of the person's own record. The phone then
 * keeps the private key (never the Vault key) for next time, unless the person says not on this phone.
 */
export default function UnlockWithVaultKey() {
  const router = useRouter();
  const leave = useLeave(placeHref('vault'));
  const account = useGetMe().data?.id;
  const vault = useGetVault().data;
  const [key, setKey] = useState('');
  const [keep, setKeep] = useState(true);
  const [typed, setTyped] = useState(NOTHING_TYPED);
  const unlocking = useSecretAction();
  const says = words.vault.unlock;
  const vaultKey = normalizeVaultKey(key);
  const lock = keep ? lockFrom(typed) : null;
  const ready = !!vaultKey && !!vault?.setUp && !!account && (!keep || !!lock);

  const unlock = async () => {
    if (!ready || !vault || !account || !vaultKey) return;
    const opened = await unlocking.run(async (progress) => {
      await unlockWithVaultKey(vaultKey, vault, lock ? (done) => progress(done / 2) : progress);
      if (lock) await keepUnlockedVault(account, lock, (done) => progress(0.5 + done / 2));
    });
    if (!opened) return;
    setKey('');
    setTyped(NOTHING_TYPED);
    leave();
  };

  return (
    <Screen
      header={<AppBar leading="close" />}
      footer={
        <>
          {unlocking.busy ? <Working text={words.vault.working.unlocking} progress={unlocking.progress} /> : null}
          <Button label={says.button} size="lg" block disabled={!ready} loading={unlocking.busy} onPress={() => void unlock()} />
          <Button label={says.lost} variant="quiet" block onPress={() => router.replace('/vault/recover')} />
        </>
      }>
      <Heading>{says.title}</Heading>
      <Lead>{says.lead}</Lead>
      <View style={{ gap: 12, marginTop: 18 }}>
        <Field
          label={says.field}
          value={key}
          onChangeText={setKey}
          placeholder={says.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          editable={!unlocking.busy}
          maxLength={60}
          error={unlocking.error ? problemOf(unlocking.error, says.wrong) : null}
          note={vaultKey ? null : says.shape(key.replace(/\s+/g, '').length)}
        />
        <View style={{ marginHorizontal: -16 }}>
          <ToggleRow first label={says.keep} note={says.keepNote} value={keep} onChange={setKeep} />
        </View>
        {keep ? <DeviceLockFields value={typed} onChange={setTyped} disabled={unlocking.busy} /> : null}
      </View>
    </Screen>
  );
}
