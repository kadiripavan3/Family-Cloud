import { useRouter } from 'expo-router';
import { Check, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { answerHelperAsk, type EntrustedVaultResponse, useGetEntrusted, useGetHelping, useGetShareToPassOn, type VaultHelpingResponse } from '@/api/generated/homeport';
import { PersonRow } from '@/features/people/PersonRow';
import { passMyShareOn } from '@/features/vault/actions';
import { CheckWords } from '@/features/vault/CheckWords';
import { VaultScreen } from '@/features/vault/Gate';
import { ASK_EACH_VISIT } from '@/features/vault/look';
import { problemOf } from '@/features/vault/problems';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { GroupLabel, Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * What this person does for other people's Vaults: the people they are a helper for (9.6, from the other
 * side: saying yes or no, and passing their part of the key on when someone is getting back in), and the
 * people who named them as the one who can ask if something happens (9.5).
 */
export default function Helping() {
  return (
    <VaultScreen>
      <Unlocked />
    </VaultScreen>
  );
}

function Unlocked() {
  const { colors } = useTheme();
  const router = useRouter();
  const helping = useGetHelping({ query: ASK_EACH_VISIT });
  const entrusted = useGetEntrusted({ query: ASK_EACH_VISIT });
  const load = loadState(helping, entrusted);
  const says = words.vault.helping;
  const nothing = helping.data?.length === 0 && entrusted.data?.length === 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar />
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : !helping.data || !entrusted.data ? (
        <Loading offline={load.offline} />
      ) : nothing ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
          <EmptyState emoji="🤝" title={says.empty.title} body={says.empty.body} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>
            <Heading>{says.title}</Heading>
            <Lead>{says.lead}</Lead>
          </View>
          {helping.data.length > 0 ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.label}</GroupLabel> : null}
          {helping.data.map((one) => (
            <Helped key={one.id} helping={one} />
          ))}
          {entrusted.data.length > 0 ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.vault.entrusted.list.label}</GroupLabel> : null}
          {entrusted.data.map((one: EntrustedVaultResponse) => (
            <PersonRow
              key={one.id}
              name={one.owner.name}
              avatarUrl={one.owner.avatarUrl}
              line={words.vault.entrusted.list.line[one.state]}
              onPress={() => router.push({ pathname: '/vault/entrusted/[id]', params: { id: one.id } })}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** One person who asked this one to be a helper: the answer, stepping down, and passing the part on while they are getting back in. */
function Helped({ helping }: { helping: VaultHelpingResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const [steppingDown, setSteppingDown] = useState(false);
  const answering = useSecretAction();
  const says = words.vault.helping;
  const name = firstName(helping.person.name);
  const needed = helping.state === 'accepted' && helping.recovery && !helping.recovery.given;

  const answer = async (accept: boolean) => {
    const done = await answering.run(async () => {
      await answerHelperAsk(helping.id, { accept });
      await cache.vaultHelpGiven();
    });
    if (done) setSteppingDown(false);
  };

  return (
    <View>
      <PersonRow
        name={helping.person.name}
        avatarUrl={helping.person.avatarUrl}
        line={helping.state === 'asked' ? says.ask.line : helping.state === 'declined' ? says.declined.line : needed ? says.needed.line : helping.recovery?.given ? says.needed.given : says.accepted.line}
        spoken={helping.state === 'accepted' ? says.accepted.stepDown(name) : undefined}
        onPress={helping.state === 'accepted' ? () => setSteppingDown(true) : undefined}
        trailing={
          helping.state === 'asked' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={says.ask.no} spoken={says.ask.noSpoken(name)} size="sm" variant="soft" inline disabled={answering.busy} onPress={() => void answer(false)} />
              <Button label={says.ask.yes} spoken={says.ask.yesSpoken(name)} size="sm" inline loading={answering.busy} onPress={() => void answer(true)} />
            </View>
          ) : helping.state === 'accepted' && !needed ? (
            <Check size={20} color={colors.ok} strokeWidth={2.6} />
          ) : (
            <View />
          )
        }
      />
      {needed ? <PassOn helping={helping} /> : null}
      {answering.error && !steppingDown ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.gutter }}>
          {messageFor(answering.error)}
        </Txt>
      ) : null}
      <ConfirmSheet
        visible={steppingDown}
        onClose={() => setSteppingDown(false)}
        title={says.accepted.stepDownAsk.title(name)}
        body={says.accepted.stepDownAsk.body}
        confirm={says.accepted.stepDownAsk.confirm}
        busy={answering.busy}
        problem={answering.error ? messageFor(answering.error) : null}
        onConfirm={() => void answer(false)}
      />
    </View>
  );
}

/**
 * Someone this person helps is getting back in. Before the part is passed on, both read the same check words
 * to each other: they come from the new phone's temporary key, so a recovery started by someone else shows
 * other words. Passing on opens the part with this person's key and seals it again for that temporary key.
 */
function PassOn({ helping }: { helping: VaultHelpingResponse }) {
  const cache = useCache();
  const asked = useGetShareToPassOn(helping.id);
  const passing = useSecretAction();
  const says = words.vault.helping.needed;
  const name = firstName(helping.person.name);
  const pass = () =>
    void passing.run(async () => {
      await passMyShareOn(helping.id);
      await cache.vaultHelpGiven();
    });
  return (
    <View style={{ gap: 10, marginTop: 4, marginBottom: 14, marginHorizontal: layout.barGutter }}>
      <NoteBox tone="warn" icon={(c) => <ShieldCheck size={20} color={c} />} title={says.title(name)}>
        {says.body(name)}
      </NoteBox>
      {asked.data ? <CheckWords tempPublicKey={asked.data.tempPublicKey} label={says.words} /> : asked.isError ? null : <Loading />}
      {asked.isError || passing.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {asked.isError ? messageFor(asked.error) : problemOf(passing.error)}
        </Txt>
      ) : null}
      <Button label={says.pass} block disabled={!asked.data} loading={passing.busy} onPress={pass} />
    </View>
  );
}
