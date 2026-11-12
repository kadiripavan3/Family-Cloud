import { useRouter } from 'expo-router';
import { Check, Hourglass, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { cancelVaultRecovery, useGetMe, useGetVault, useGetVaultAttention, useGetVaultHelpers, useGetVaultRecovery, type VaultRecoveryResponse } from '@/api/generated/homeport';
import { PersonRow } from '@/features/people/PersonRow';
import { finishRecovery, isMyRecovery, keepUnlockedVault, makeNewVaultKey, startRecovery } from '@/features/vault/actions';
import { CheckWords } from '@/features/vault/CheckWords';
import { DeviceLockFields, lockFrom, NOTHING_TYPED } from '@/features/vault/DeviceLockFields';
import { forgetRecovery } from '@/features/vault/keeper';
import { problemOf } from '@/features/vault/problems';
import { useVaultLock } from '@/features/vault/session';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { Working } from '@/features/vault/Working';
import { formatDayLong, toISODate } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** While a recovery is open, the page asks again this often whether the helpers have helped. */
const ASK_AGAIN_MS = 5000;

/**
 * Getting back in without the Vault key (9.6, the other half): a new phone makes a temporary key pair and
 * starts a recovery; two helpers pass their parts on, sealed for that temporary key; this phone joins them
 * into the Vault key and opens the private key with it. The person is told on every phone they are signed
 * in on, and can cancel a recovery from any of them: this page is that place too.
 *
 * It needs no key to open: it is where someone stands who has none.
 */
export default function Recover() {
  const { colors } = useTheme();
  const lock = useVaultLock();
  const vault = useGetVault();
  const attention = useGetVaultAttention();
  const helpers = useGetVaultHelpers();
  const load = loadState(vault, attention, helpers);
  const recovery = attention.data?.recovery ?? null;
  const says = words.vault.recover;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading="close" />
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : !vault.data || !attention.data || !helpers.data ? (
        <Loading offline={load.offline} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>
            <Heading>{says.title}</Heading>
            <Lead>{says.lead}</Lead>
          </View>
          {recovery ? <Running recovery={recovery} /> : lock.unlocked ? <BackIn /> : <Start canRecover={helpers.data.ready} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Nothing is running: ask the helpers, or say plainly that there is no way back in. */
function Start({ canRecover }: { canRecover: boolean }) {
  const cache = useCache();
  const account = useGetMe().data?.id;
  const starting = useSecretAction();
  const says = words.vault.recover;
  if (!canRecover) {
    return (
      <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={says.noHelpers.title} style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
        {says.noHelpers.body}
      </NoteBox>
    );
  }
  const start = () =>
    void starting.run(async () => {
      if (!account) return;
      await startRecovery(account);
      await cache.vaultRecoveryChanged();
    });
  return (
    <View style={{ gap: 12, marginTop: 18, marginHorizontal: layout.barGutter }}>
      {starting.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {problemOf(starting.error)}
        </Txt>
      ) : null}
      <Button label={says.start} size="lg" block disabled={!account} loading={starting.busy} onPress={start} />
    </View>
  );
}

/** A recovery is open: who has helped, the words to check with them, and opening the Vault once two have. Or, on a phone that didn't start it, the way to cancel it. */
function Running({ recovery: first }: { recovery: VaultRecoveryResponse }) {
  const cache = useCache();
  const account = useGetMe().data?.id;
  const asked = useGetVaultRecovery(first.id, { query: { refetchInterval: ASK_AGAIN_MS } });
  const recovery = asked.data ?? first;
  const [mine, setMine] = useState<boolean | null>(null);
  const [typed, setTyped] = useState(NOTHING_TYPED);
  const [cancelling, setCancelling] = useState(false);
  const opening = useSecretAction();
  const stopping = useSecretAction();
  const says = words.vault.recover;
  const lock = lockFrom(typed);

  useEffect(() => {
    let current = true;
    if (account) void isMyRecovery(account, first).then((answer) => current && setMine(answer));
    return () => {
      current = false;
    };
  }, [account, first]);

  const open = async () => {
    if (!account || !lock) return;
    const done = await opening.run(async (progress) => {
      await finishRecovery(account, recovery, lock.how === 'passcode' ? (part) => progress(part / 2) : progress);
      await keepUnlockedVault(account, lock, (part) => progress(0.5 + part / 2));
    });
    setTyped(NOTHING_TYPED);
    if (done) await cache.vaultRecoveryChanged();
  };
  const cancel = async () => {
    const done = await stopping.run(async () => {
      await cancelVaultRecovery(recovery.id);
      if (account) await forgetRecovery(account);
      await cache.vaultRecoveryChanged();
    });
    if (done) setCancelling(false);
  };

  if (mine === null) return <Loading />;
  return (
    <View style={{ gap: 12, marginTop: 18 }}>
      <View style={{ gap: 12, marginHorizontal: layout.barGutter }}>
        {mine ? (
          <NoteBox soft icon={(c) => <Hourglass size={20} color={c} />} title={recovery.ready ? says.ready.title : says.started.title}>
            {recovery.ready ? says.ready.body : says.started.body(recovery.needed)}
          </NoteBox>
        ) : (
          <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={says.notMine.title}>
            {says.notMine.body}
          </NoteBox>
        )}
        <CheckWords tempPublicKey={recovery.tempPublicKey} label={says.words} />
      </View>
      <View>
        {recovery.helpers.map((helper) => (
          <PersonRow key={helper.person.memberId ?? helper.person.name} name={helper.person.name} avatarUrl={helper.person.avatarUrl} line={helper.given ? says.helper.given : says.helper.waiting} trailing={helper.given ? <GivenTick /> : <View />} />
        ))}
      </View>
      <View style={{ gap: 12, marginHorizontal: layout.barGutter }}>
        <Txt variant="footnote" color="muted">
          {words.common.spoken([says.lapses(formatDayLong(toISODate(new Date(recovery.lapsesAt)))).replace(/\.$/, ''), mine && Platform.OS === 'web' ? says.keepOpen : null])}
        </Txt>
        {mine && recovery.ready ? (
          <>
            <DeviceLockFields value={typed} onChange={setTyped} disabled={opening.busy} />
            {opening.busy ? <Working text={words.vault.working.unlocking} progress={opening.progress} /> : null}
            {opening.error ? (
              <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
                {problemOf(opening.error, says.failed)}
              </Txt>
            ) : null}
            <Button label={says.ready.open} size="lg" block disabled={!lock} loading={opening.busy} onPress={() => void open()} />
          </>
        ) : null}
        <Button label={says.cancel} variant={mine ? 'quiet' : 'ink'} size={mine ? 'md' : 'lg'} block onPress={() => setCancelling(true)} />
      </View>
      <ConfirmSheet
        visible={cancelling}
        onClose={() => setCancelling(false)}
        title={says.cancelAsk.title}
        body={says.cancelAsk.body}
        confirm={says.cancelAsk.confirm}
        cancel={says.cancelAsk.cancel}
        busy={stopping.busy}
        problem={stopping.error ? messageFor(stopping.error) : null}
        onConfirm={() => void cancel()}
      />
    </View>
  );
}

function GivenTick() {
  const { colors } = useTheme();
  return <Check size={20} color={colors.ok} strokeWidth={2.6} />;
}

/** Back in. The Vault key that was just rebuilt came out of two parts other people held: the next step is a new one. */
function BackIn() {
  const router = useRouter();
  const cache = useCache();
  const making = useSecretAction();
  const says = words.vault.recover.after;
  const make = async () => {
    const done = await making.run(async (progress) => {
      const record = await makeNewVaultKey(progress);
      await Promise.all([cache.vaultRecordChanged(record), cache.vaultHelpersChanged()]);
    });
    if (done) router.replace('/vault/key');
  };
  return (
    <View style={{ gap: 12, marginTop: 18, marginHorizontal: layout.barGutter }}>
      <NoteBox soft icon={(c) => <Check size={20} color={c} />} title={says.title}>
        {says.body}
      </NoteBox>
      {making.busy ? <Working text={words.vault.working.making} progress={making.progress} /> : null}
      {making.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {problemOf(making.error)}
        </Txt>
      ) : null}
      <Button label={says.button} size="lg" block loading={making.busy} onPress={() => void make()} />
    </View>
  );
}
