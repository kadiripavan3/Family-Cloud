import { useRouter } from 'expo-router';
import { KeyRound, ScanFace } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useGetMe, type VaultRecordResponse } from '@/api/generated/homeport';
import { layout } from '@/theme';
import { Blob } from '@/ui/Blob';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { unlockWithDevice, unlockWithPasscode } from './actions';
import { useKeptHow } from './kept';
import { problemOf } from './problems';
import { useSecretAction } from './useSecretAction';
import { Working } from './Working';

/**
 * 9.1 The Vault, locked: what stands in the Vault's place, and on any of its screens, while there is no key
 * in memory. Unlocking asks the phone for the key (Face ID), or for the passcode the key is kept behind, or,
 * on a phone that holds no key yet, for the Vault key itself.
 */
export function Locked({ vault, title = words.vault.locked.title, body = words.vault.locked.body }: { vault: VaultRecordResponse; title?: string; body?: string }) {
  const router = useRouter();
  const account = useGetMe().data?.id;
  const how = useKeptHow(account);
  const faceId = useSecretAction();
  const [typing, setTyping] = useState(false);
  const says = words.vault.locked;

  return (
    <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 34 }}>
      <View style={{ marginBottom: 6 }}>
        <Blob emoji={says.emoji} />
      </View>
      <Txt variant="titleSmall" accessibilityRole="header" center>
        {title}
      </Txt>
      <Txt variant="bodySmall" color="muted" center>
        {how === null ? (Platform.OS === 'web' ? says.newBrowser : says.newPhone) : body}
      </Txt>
      {how === undefined ? null : how === 'device' ? (
        <Button
          label={says.faceId}
          size="lg"
          inline
          loading={faceId.busy}
          icon={(c) => <ScanFace size={22} color={c} />}
          onPress={() => void faceId.run(() => unlockWithDevice(account ?? '', vault, says.faceIdPrompt))}
          style={{ marginTop: 10 }}
        />
      ) : how === 'passcode' ? (
        <Button label={says.passcode} size="lg" inline icon={(c) => <KeyRound size={20} color={c} />} onPress={() => setTyping(true)} style={{ marginTop: 10 }} />
      ) : (
        <Button label={says.vaultKey} size="lg" inline icon={(c) => <KeyRound size={20} color={c} />} onPress={() => router.push('/vault/unlock')} style={{ marginTop: 10 }} />
      )}
      {faceId.error ? (
        <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
          {says.faceIdFailed}
        </Txt>
      ) : null}
      {how === undefined ? null : how === null ? (
        <Button label={says.lostKey} variant="quiet" inline onPress={() => router.push('/vault/recover')} />
      ) : (
        <Button label={says.vaultKey} variant="quiet" inline onPress={() => router.push('/vault/unlock')} />
      )}
      <PasscodeSheet visible={typing} onClose={() => setTyping(false)} account={account ?? ''} vault={vault} />
    </View>
  );
}

/** The sheet that asks for the passcode this phone or browser keeps the key behind. */
function PasscodeSheet({ visible, onClose, account, vault }: { visible: boolean; onClose: () => void; account: string; vault: VaultRecordResponse }) {
  const [passcode, setPasscode] = useState('');
  const unlock = useSecretAction();
  const says = words.vault.locked.sheet;
  const submit = async () => {
    if (!passcode || unlock.busy) return;
    const typed = passcode;
    // Unlocking takes this whole view away (the Vault itself is drawn in its place), so nothing follows it here.
    if (!(await unlock.run((progress) => unlockWithPasscode(account, vault, typed, progress)))) setPasscode('');
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Field
          label={says.field}
          value={passcode}
          onChangeText={setPasscode}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          editable={!unlock.busy}
          onSubmitEditing={() => void submit()}
          error={unlock.error ? problemOf(unlock.error, says.wrong) : null}
        />
        {unlock.busy ? <Working text={words.vault.working.unlocking} progress={unlock.progress} /> : null}
        <Button label={says.unlock} size="lg" block disabled={!passcode} loading={unlock.busy} onPress={() => void submit()} />
      </View>
    </Sheet>
  );
}
