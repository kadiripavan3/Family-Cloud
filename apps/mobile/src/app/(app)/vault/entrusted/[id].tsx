import { useLocalSearchParams } from 'expo-router';
import { ChevronRight, Clock, FileText, Hourglass, LockOpen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { askForVault, type EntrustedItemResponse, type EntrustedVaultResponse, useGetEntrustedVault } from '@/api/generated/homeport';
import { PageProblem } from '@/features/states/PageProblem';
import { openEntrusted, readEntrustedNote } from '@/features/vault/actions';
import { VaultScreen } from '@/features/vault/Gate';
import type { Inside } from '@/features/vault/inside';
import { ItemFields } from '@/features/vault/ItemFields';
import { ItemTile } from '@/features/vault/ItemTile';
import { ASK_EACH_VISIT } from '@/features/vault/look';
import { problemOf } from '@/features/vault/problems';
import { Toast } from '@/features/vault/Toast';
import { useCopy } from '@/features/vault/useCopy';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { momentOf } from '@/features/vault/when';
import { timeAgo } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel, Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** While a request runs, the page asks again this often: the service opens it when the time is up, whoever is looking. */
const ASK_AGAIN_MS = 15_000;

/**
 * 9.5 If something happens, from the other side: the person someone trusted. They can ask; the owner is told
 * and has their time to say no; after the wait what was chosen opens here, with the note. Until then this
 * page shows none of it, not even what would open: the service doesn't hand it out.
 */
export default function EntrustedVault() {
  return (
    <VaultScreen>
      <Unlocked />
    </VaultScreen>
  );
}

function Unlocked() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetEntrustedVault(id, { query: { ...ASK_EACH_VISIT, refetchInterval: (query) => (query.state.data?.state === 'asked' ? ASK_AGAIN_MS : false) } });
  const load = loadState(asked);
  const entrusted = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar />
      {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !entrusted ? <Loading offline={load.offline} /> : <Loaded entrusted={entrusted} />}
    </SafeAreaView>
  );
}

function Loaded({ entrusted }: { entrusted: EntrustedVaultResponse }) {
  const cache = useCache();
  const [asking, setAsking] = useState(false);
  const ask = useSecretAction();
  const says = words.vault.entrusted;
  const name = firstName(entrusted.owner.name);

  const send = async () => {
    const done = await ask.run(async () => {
      await cache.vaultAskedFor(await askForVault(entrusted.id));
    });
    if (done) setAsking(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, marginHorizontal: layout.rowGutter }}>
          <Avatar uri={entrusted.owner.avatarUrl} name={entrusted.owner.name} size={56} />
          <View style={{ flex: 1 }}>
            <Heading>{says.title(name)}</Heading>
          </View>
        </View>
        <View style={{ marginHorizontal: layout.rowGutter }}>
          <Lead>{says.lead(name)}</Lead>
        </View>

        {entrusted.state === 'off' ? (
          <NoteBox icon={(c) => <Clock size={20} color={c} />} style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
            {says.off(name)}
          </NoteBox>
        ) : entrusted.state === 'ready' ? (
          <View style={{ gap: 12, marginTop: 18, marginHorizontal: layout.barGutter }}>
            {entrusted.refusedAt ? <NoteBox icon={(c) => <Clock size={20} color={c} />}>{says.refused(name, timeAgo(entrusted.refusedAt))}</NoteBox> : null}
            <NoteBox icon={(c) => <Hourglass size={20} color={c} />}>{says.ready.body(name, entrusted.waitHours)}</NoteBox>
            <Button label={says.ready.ask(name)} size="lg" block onPress={() => setAsking(true)} />
          </View>
        ) : entrusted.state === 'asked' ? (
          <Waiting entrusted={entrusted} />
        ) : (
          <Open entrusted={entrusted} />
        )}
      </ScrollView>
      <ConfirmSheet
        visible={asking}
        onClose={() => setAsking(false)}
        title={says.askAsk.title(name)}
        body={says.askAsk.body(name, entrusted.waitHours)}
        confirm={says.askAsk.confirm}
        cancel={says.askAsk.cancel}
        busy={ask.busy}
        problem={ask.error ? messageFor(ask.error) : null}
        onConfirm={() => void send()}
      />
    </>
  );
}

/** Asked, and waiting: when it opens, and how long that still is. */
function Waiting({ entrusted }: { entrusted: EntrustedVaultResponse }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const says = words.vault.entrusted.asked;
  const opensAt = entrusted.opensAt;
  return (
    <NoteBox soft icon={(c) => <Hourglass size={20} color={c} />} title={says.title} style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
      {words.common.spoken([says.body(firstName(entrusted.owner.name), opensAt ? momentOf(opensAt) : '').replace(/\.$/, ''), opensAt ? says.left(new Date(opensAt).getTime() - now) : null])}
    </NoteBox>
  );
}

/** Open: the note that was written for this person, and what was chosen to open, each read with its key from what was set aside. */
function Open({ entrusted }: { entrusted: EntrustedVaultResponse }) {
  const { colors } = useTheme();
  const says = words.vault.entrusted.open;
  const [shown, setShown] = useState<{ item: EntrustedItemResponse; inside: Inside } | null>(null);
  const opening = useSecretAction();
  const { copy, said } = useCopy();
  // Read once, when the page opens: what comes out stays with this page and goes with it.
  const [note] = useState(() => {
    try {
      return { text: readEntrustedNote(entrusted), problem: null };
    } catch (problem) {
      return { text: '', problem: problem as unknown };
    }
  });
  const open = (item: EntrustedItemResponse) =>
    void opening.run(async () => {
      setShown({ item, inside: await openEntrusted(entrusted.id, item.id) });
    });

  return (
    <>
      <NoteBox soft icon={(c) => <LockOpen size={20} color={c} />} title={says.title} style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
        {entrusted.openedAt ? momentOf(entrusted.openedAt) : ''}
      </NoteBox>

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.note}</GroupLabel>
      <Card style={{ flexDirection: 'row', gap: 12, marginHorizontal: layout.barGutter, padding: 16, borderRadius: radius.card }}>
        <FileText size={20} color={colors.text} />
        <Txt variant="body" selectable testID="entrusted-note" style={{ flex: 1 }}>
          {note.problem ? problemOf(note.problem) : note.text || says.noNote}
        </Txt>
      </Card>

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.items}</GroupLabel>
      {entrusted.items.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {says.nothing}
        </Txt>
      ) : (
        entrusted.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={words.vault.entrusted.openItem(item.title)}
            onPress={() => open(item)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter, backgroundColor: pressed ? colors.fill : 'transparent' })}>
            <ItemTile category={item.category} title={item.title} />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="item" numberOfLines={1}>
                {item.title}
              </Txt>
              <Txt variant="footnote" color="muted" numberOfLines={1}>
                {words.common.join([words.vault.drawers[item.category].one, item.site])}
              </Txt>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        ))
      )}
      {opening.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {problemOf(opening.error)}
        </Txt>
      ) : null}

      <Sheet visible={shown !== null} onClose={() => setShown(null)} title={shown?.item.title} subtitle={shown ? words.common.join([words.vault.drawers[shown.item.category].one, shown.item.site]) : undefined}>
        {shown ? <ItemFields inside={shown.inside} access="see" onCopy={(text) => void copy(text)} /> : null}
        {said ? (
          <Txt variant="caption" color="muted" center accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
            {said}
          </Txt>
        ) : null}
      </Sheet>
      {said && !shown ? <Toast text={said} bottom={34} /> : null}
    </>
  );
}
