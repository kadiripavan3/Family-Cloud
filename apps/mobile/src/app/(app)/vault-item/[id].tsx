import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, Clock, EyeOff, Flame, Hourglass, Pencil, Shield, TriangleAlert } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { useGetVaultItem, type VaultItemPersonResponse, type VaultItemResponse } from '@/api/generated/homeport';
import { PersonRow } from '@/features/people/PersonRow';
import { PageProblem } from '@/features/states/PageProblem';
import { type Opened, openItem } from '@/features/vault/actions';
import { VaultScreen } from '@/features/vault/Gate';
import { healthOf } from '@/features/vault/health';
import { passwordOf } from '@/features/vault/inside';
import { ItemFields } from '@/features/vault/ItemFields';
import { ItemTile } from '@/features/vault/ItemTile';
import { ASK_EACH_VISIT } from '@/features/vault/look';
import { problemOf } from '@/features/vault/problems';
import { usedElsewhere } from '@/features/vault/session';
import { ShareSheet } from '@/features/vault/ShareSheet';
import { Toast } from '@/features/vault/Toast';
import { useCopy } from '@/features/vault/useCopy';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { momentOf, plainMomentOf } from '@/features/vault/when';
import { timeAgo } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 9.3 A password, or any other item of the Vault: what is inside, with a way to copy each part without
 * showing it and a one-time code that counts down, who can use it, and the phone's verdict on the password.
 * Opening it asks the API for the scrambled piece and this person's wrapped key, and unscrambles it here;
 * what comes out is held by this screen only, and let go of when it closes or the Vault locks.
 */
export default function VaultItem() {
  return (
    <VaultScreen>
      <Unlocked />
    </VaultScreen>
  );
}

function Unlocked() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetVaultItem(id, { query: ASK_EACH_VISIT });
  const load = loadState(asked);
  const item = asked.data;
  const canEdit = !!item && item.canEdit && !item.sample && item.myState === 'ready';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar trailing={canEdit ? <RoundButton label={words.vault.item.edit} icon={(c) => <Pencil size={18} color={c} />} onPress={() => router.push({ pathname: '/vault/edit/[id]', params: { id } })} /> : undefined} />
      {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !item ? <Loading offline={load.offline} /> : <Item item={item} />}
    </SafeAreaView>
  );
}

function Item({ item }: { item: VaultItemResponse }) {
  const cache = useCache();
  const [opened, setOpened] = useState<Opened | null>(null);
  /** The person this screen's share sheet is about: one of the people, everyone (null), or closed (undefined). */
  const [sharing, setSharing] = useState<string | null | undefined>(undefined);
  const opening = useSecretAction();
  const { copy, said } = useCopy();
  const says = words.vault.item;
  const owner = firstName(item.owner.name);
  const openable = !item.sample && item.myState === 'ready';

  // What was opened is this screen's alone: the item's key is overwritten when the screen lets go of it.
  const held = useRef<Opened | null>(null);
  const hold = useCallback((next: Opened | null) => {
    if (held.current && held.current !== next) held.current.itemKey.fill(0);
    held.current = next;
    setOpened(next);
  }, []);
  useEffect(
    () => () => {
      held.current?.itemKey.fill(0);
    },
    [],
  );

  const { run } = opening;
  const open = useCallback(
    () =>
      run(async () => {
        const next = await openItem(item);
        hold(next);
        // A key that was for one look is used up now: the item's own page says so from here on.
        if (next.once) void cache.vaultItemOpened(item);
      }),
    [run, item, hold, cache],
  );
  // It opens by itself, unless opening is the one look: then the person decides when. A new version (someone
  // saved a change, or the item got a new key) is opened afresh.
  const version = useRef<number | null>(null);
  useEffect(() => {
    if (!openable || item.once || version.current === item.version) return;
    version.current = item.version;
    void open();
  }, [openable, item.once, item.version, open]);

  const password = opened ? passwordOf(opened.inside) : null;
  const elsewhere = opened && password ? usedElsewhere(item.id, password) : [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2, marginBottom: 16, marginHorizontal: layout.rowGutter }}>
          <ItemTile category={item.category} title={item.title} size={64} />
          <View style={{ flex: 1 }}>
            <Txt variant="titleLarge" accessibilityRole="header">
              {item.title}
            </Txt>
            <Txt variant="caption" color="muted">
              {item.glance}
            </Txt>
          </View>
        </View>

        {item.sample ? (
          <Note icon={(c) => <Shield size={20} color={c} />} title={says.sample.title}>
            {says.sample.body}
          </Note>
        ) : item.myState === 'waiting' ? (
          <Note icon={(c) => <Hourglass size={20} color={c} />} title={says.waiting.title}>
            {says.waiting.body(owner)}
          </Note>
        ) : item.myState === 'used' && !opened ? (
          <Note icon={(c) => <Flame size={20} color={c} />} title={says.once.used.title}>
            {says.once.used.body(owner)}
          </Note>
        ) : item.myState === 'stopped' ? (
          <Note icon={(c) => <Clock size={20} color={c} />} title={says.stopped.title}>
            {says.stopped.body(owner)}
          </Note>
        ) : opened ? (
          <>
            {opened.labelsChanged ? (
              <Note warn icon={(c) => <TriangleAlert size={20} color={c} />} title={says.labelsChanged.title} below>
                {says.labelsChanged.body(opened.inside.title, opened.inside.site)}
              </Note>
            ) : null}
            <ItemFields inside={opened.inside} access={opened.access} expiresOn={item.expiresOn} onCopy={(text) => void copy(text)} />
            {opened.once ? (
              <Note icon={(c) => <Flame size={20} color={c} />} title={says.once.opened.title} above>
                {says.once.opened.body}
              </Note>
            ) : null}
            {opened.access === 'use' ? (
              <Note icon={(c) => <EyeOff size={20} color={c} />} title={says.useOnly.title} above>
                {says.useOnly.body}
              </Note>
            ) : null}
            {!item.mine && item.stopsAt ? (
              <Txt variant="footnote" color="muted" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
                {says.stopsAt(momentOf(item.stopsAt))}
              </Txt>
            ) : null}
          </>
        ) : item.once && openable ? (
          <Note icon={(c) => <Flame size={20} color={c} />} title={says.once.ready.title} trailing={<Button label={says.once.ready.button} size="sm" variant="ink" inline loading={opening.busy} onPress={() => void open()} />}>
            {says.once.ready.body(owner)}
          </Note>
        ) : opening.error ? null : (
          <View style={{ height: 120 }}>
            <Loading />
          </View>
        )}
        {opening.error ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {problemOf(opening.error)}
          </Txt>
        ) : null}

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.who}</GroupLabel>
        {item.people.map((person) => (
          <Person key={person.memberId} person={person} mine={item.mine} onChange={item.mine && opened && !person.owner ? () => setSharing(person.memberId) : undefined} />
        ))}
        {item.mine && opened ? <PersonRow add name={says.share} line={says.shareNote} onPress={() => setSharing(null)} /> : null}

        {opened && password && opened.access !== 'use' ? (
          <View style={{ marginTop: 8 }}>
            <Verdict stored={item.health} password={password} elsewhere={elsewhere} />
          </View>
        ) : null}
      </ScrollView>
      {said ? <Toast text={said} bottom={34} /> : null}
      {opened ? (
        <ShareSheet
          // Each opening starts from what is so: nothing ticked last time is carried over.
          key={String(sharing)}
          visible={sharing !== undefined}
          onClose={() => setSharing(undefined)}
          item={item}
          opened={opened}
          focus={sharing}
          onSaved={(newKey) => {
            // With a new key, what this screen holds opens nothing any more: it is let go of, and the item
            // is opened afresh as soon as the API has said which version it is at.
            if (newKey) hold(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** One of this page's boxes that say where things stand. */
function Note({ icon, title, children, warn, trailing, above, below }: { icon: (color: string) => ReactNode; title: string; children: string; warn?: boolean; trailing?: ReactNode; above?: boolean; below?: boolean }) {
  return (
    <NoteBox tone={warn ? 'warn' : 'plain'} icon={icon} title={title} trailing={trailing} style={{ marginTop: above ? 12 : 0, marginBottom: below ? 12 : 0, marginHorizontal: layout.barGutter }}>
      {children}
    </NoteBox>
  );
}

/** One person who can use it: who they are, where their key stands, and what they may do. Its owner can change that from here. */
function Person({ person, mine, onChange }: { person: VaultItemPersonResponse; mine: boolean; onChange?: () => void }) {
  const { colors } = useTheme();
  const says = words.vault.item;
  const name = person.you ? says.you : firstName(person.name);
  const access = person.access ?? 'see';
  const lines = person.you ? says.lineYou : says.line;
  const line = person.owner
    ? person.you
      ? says.yours
      : says.owner
    : person.state === 'used'
      ? lines.used
      : person.state === 'stopped'
        ? lines.stopped
        : person.state === 'waiting'
          ? person.missing === 'no_vault'
            ? lines.noVault
            : lines.waiting
          : person.once
            ? lines.once
            : person.stopsAt
              ? lines.until(plainMomentOf(person.stopsAt))
              : person.changedAt
                ? lines.changed(timeAgo(person.changedAt))
                : mine && person.openedAt
                  ? lines.opened(timeAgo(person.openedAt))
                  : lines[access];
  const pill = person.owner ? null : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 7, paddingLeft: 12, paddingRight: onChange ? 8 : 12, borderRadius: radius.pill, backgroundColor: colors.fill }}>
      <Txt variant="footnote" weight={700}>
        {says.access[access]}
      </Txt>
      {onChange ? <ChevronDown size={14} color={colors.text} /> : null}
    </View>
  );
  return (
    <PersonRow
      name={name}
      avatarUrl={person.avatarUrl}
      line={line}
      trailing={
        pill && onChange ? (
          <Tap accessibilityRole="button" accessibilityLabel={says.accessSpoken(name, says.access[access])} hitSlop={8} onPress={onChange} scaleTo={0.94}>
            {pill}
          </Tap>
        ) : (
          (pill ?? undefined)
        )
      }
    />
  );
}

/** The phone's verdict on the password: strong, weak, or the same as in another item. And plainly: nothing checks for leaks. */
function Verdict({ stored, password, elsewhere }: { stored: VaultItemResponse['health']; password: string; elsewhere: string[] }) {
  const says = words.vault.item.health;
  const length = [...password].length;
  // What is judged now wins over what was saved with the item: other items may have been opened since.
  const now = healthOf(password, elsewhere.length > 0);
  const health = stored === 'leaked' ? 'leaked' : now === 'ok' && stored === 'reused' ? 'reused' : now;
  const text = health === 'ok' ? says.ok.body(length) : health === 'weak' ? says.weak.body(length) : health === 'reused' ? says.reused.body(elsewhere) : says.leaked.body;
  return (
    <NoteBox tone={health === 'ok' ? 'plain' : 'warn'} icon={(c) => (health === 'ok' ? <Shield size={20} color={c} /> : <TriangleAlert size={20} color={c} />)} title={says[health].title} style={{ marginHorizontal: layout.barGutter }}>
      {words.common.spoken([text.replace(/\.$/, ''), says.noLeakCheck])}
    </NoteBox>
  );
}
