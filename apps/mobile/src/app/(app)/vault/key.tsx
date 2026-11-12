import { Check, ChevronRight, Copy, Download, Plus } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import {
  askVaultHelper,
  confirmVaultKeySaved,
  removeVaultHelper,
  useGetVault,
  useGetVaultHelpers,
  useGetVaultPeople,
  type VaultHelperResponse,
  type VaultHelpersResponse,
  type VaultRecordResponse,
} from '@/api/generated/homeport';
import { placeHref } from '@/features/home/places';
import { useLeave } from '@/features/navigation/useLeave';
import { makeNewVaultKey, splitForHelpers } from '@/features/vault/actions';
import { grouped } from '@/features/vault/crypto/vaultKey';
import { VaultScreen } from '@/features/vault/Gate';
import { KeyQr } from '@/features/vault/KeyQr';
import { ASK_EACH_VISIT } from '@/features/vault/look';
import { printVaultKey } from '@/features/vault/printKey';
import { problemOf } from '@/features/vault/problems';
import { holdFreshVaultKey, useFreshVaultKey, vaultUsed } from '@/features/vault/session';
import { Toast } from '@/features/vault/Toast';
import { useCopy } from '@/features/vault/useCopy';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { Working } from '@/features/vault/Working';
import { formatDayLong, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { GroupLabel, Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { rich } from '@/ui/rich';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** While a new key is on screen, being on this page counts as using the Vault: writing down 24 characters takes longer than two minutes. */
const STILL_HERE_MS = 20_000;

/**
 * 9.6 Your Vault key. Said plainly, because it matters: there is no "forgot my key" button. The key is shown
 * once, right after it was made, to save or print; this phone doesn't keep it. Under it, the helpers: two
 * people who can together let the person back in, each holding one part of the key.
 */
export default function VaultKey() {
  return (
    <VaultScreen>
      <Unlocked />
    </VaultScreen>
  );
}

function Unlocked() {
  const { colors } = useTheme();
  const vault = useGetVault();
  const helpers = useGetVaultHelpers({ query: ASK_EACH_VISIT });
  const load = loadState(vault, helpers);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar />
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : !vault.data || !helpers.data ? (
        <Loading offline={load.offline} />
      ) : (
        <Key vault={vault.data} helpers={helpers.data} />
      )}
    </SafeAreaView>
  );
}

function Key({ vault, helpers }: { vault: VaultRecordResponse; helpers: VaultHelpersResponse }) {
  const cache = useCache();
  const leave = useLeave(placeHref('vault'));
  const fresh = useFreshVaultKey();
  const { copy, said } = useCopy();
  const [pdf, setPdf] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const making = useSecretAction();
  const confirming = useSecretAction();
  const says = words.vault.key;

  useEffect(() => {
    if (!fresh) return;
    const timer = setInterval(vaultUsed, STILL_HERE_MS);
    return () => clearInterval(timer);
  }, [fresh]);

  const makeNew = async () => {
    setAsking(false);
    await making.run(async (progress) => {
      const record = await makeNewVaultKey(progress);
      await Promise.all([cache.vaultRecordChanged(record), cache.vaultHelpersChanged()]);
    });
  };
  const saved = async () => {
    const done = await confirming.run(async () => {
      void cache.vaultRecordChanged(await confirmVaultKeySaved());
    });
    if (!done) return;
    holdFreshVaultKey(null);
    leave();
  };
  const print = async () => {
    if (!fresh) return;
    const how = await printVaultKey({ title: says.print.title, body: says.print.body, made: says.print.made(formatDayLong(today())), key: grouped(fresh) });
    setPdf(how === 'printed' ? null : how === 'blocked' ? says.pdfBlocked : says.pdfOnPhone);
  };

  const groups = fresh ? grouped(fresh).split(' ') : [];
  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>
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
        </View>

        <Card style={{ gap: 12, marginTop: 18, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel }}>
          {fresh ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <KeyQr text={fresh} size={76} />
                {/* Two lines of three groups, each group in its own column: the app has no fixed-width font, and a key is read and typed group by group. */}
                <View accessible accessibilityLabel={grouped(fresh)} testID="vault-key" style={{ flex: 1, gap: 4 }}>
                  {[groups.slice(0, 3), groups.slice(3)].map((line) => (
                    <View key={line.join('')} style={{ flexDirection: 'row' }}>
                      {line.map((group) => (
                        <Txt key={group} variant="headline" weight={500} selectable style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
                          {group}
                        </Txt>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label={says.pdf} variant="soft" icon={(c) => <Download size={16} color={c} />} onPress={() => void print()} style={{ flex: 1, paddingHorizontal: 10 }} />
                <Button label={says.copy} variant="soft" icon={(c) => <Copy size={16} color={c} />} onPress={() => void copy(grouped(fresh))} style={{ flex: 1, paddingHorizontal: 10 }} />
              </View>
              {pdf ? (
                <Txt variant="caption" color="muted" accessibilityLiveRegion="polite">
                  {pdf}
                </Txt>
              ) : null}
            </>
          ) : (
            <>
              <View style={{ gap: 4 }}>
                <Txt variant="headline">{says.shownOnce.title}</Txt>
                <Txt variant="note" color="muted">
                  {says.shownOnce.body}
                </Txt>
              </View>
              {making.busy ? <Working text={words.vault.working.making} progress={making.progress} /> : null}
              <Button label={says.makeNew} variant="soft" block loading={making.busy} onPress={() => setAsking(true)} />
            </>
          )}
          {making.error ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {problemOf(making.error)}
            </Txt>
          ) : null}
        </Card>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.helpers.label}</GroupLabel>
        <Helpers vault={vault} helpers={helpers} fresh={fresh} />
      </ScrollView>

      <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
        {confirming.error ? (
          <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
            {problemOf(confirming.error)}
          </Txt>
        ) : null}
        {fresh ? (
          <Button label={says.saved} size="lg" block loading={confirming.busy} onPress={() => void saved()} />
        ) : vault.keySaved ? (
          <Txt variant="footnote" color="muted" center>
            {says.savedOn}
          </Txt>
        ) : null}
      </View>
      {said ? <Toast text={said} bottom={96} /> : null}
      <ConfirmSheet visible={asking} onClose={() => setAsking(false)} title={says.makeNewAsk.title} body={says.makeNewAsk.body} confirm={says.makeNewAsk.confirm} cancel={says.makeNewAsk.cancel} onConfirm={() => void makeNew()} />
    </>
  );
}

/** The people who can together let this person back in, the way to ask another, and handing each their part of the key. */
function Helpers({ vault, helpers, fresh }: { vault: VaultRecordResponse; helpers: VaultHelpersResponse; fresh: string | null }) {
  const { colors } = useTheme();
  const cache = useCache();
  const [choosing, setChoosing] = useState(false);
  const [removing, setRemoving] = useState<VaultHelperResponse | null>(null);
  const [typed, setTyped] = useState('');
  const change = useSecretAction();
  const splitting = useSecretAction();
  const says = words.vault.key.helpers;
  const list = helpers.helpers;
  const accepted = list.filter((helper) => helper.state === 'accepted');
  const due = accepted.length >= 2 && (helpers.sharesDue || accepted.some((helper) => !helper.hasShare));

  const remove = async () => {
    if (!removing) return;
    const id = removing.id;
    const done = await change.run(async () => {
      await removeVaultHelper(id);
      await cache.vaultHelpersChanged();
    });
    if (done) setRemoving(null);
  };
  const split = async () => {
    const key = fresh ?? typed;
    const done = await splitting.run(async (progress) => {
      await cache.vaultHelpersChanged(await splitForHelpers(key, vault, helpers, progress));
    });
    if (done) setTyped('');
  };

  return (
    <>
      <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
        {list.map((helper, index) => {
          const name = firstName(helper.person.name);
          const yes = helper.state === 'accepted';
          const title = yes ? (accepted[0]?.id === helper.id ? says.can(name) : says.canToo(name)) : helper.state === 'asked' ? says.asked(name) : says.declined(name);
          const note = !yes ? says.state[helper.state === 'asked' ? 'asked' : 'declined'] : !helper.hasShare ? says.state.acceptedNeedsPart : accepted[0]?.id === helper.id ? says.state.accepted : says.anyTwo;
          return (
            <HelperRow key={helper.id} first={index === 0} title={title} note={note} spoken={says.remove(name)} onPress={() => setRemoving(helper)} leading={<Avatar uri={helper.person.avatarUrl} name={helper.person.name} size={34} />}>
              {yes && helper.hasShare ? <Check size={20} color={colors.ok} strokeWidth={2.6} /> : null}
            </HelperRow>
          );
        })}
        {list.length < 5 ? (
          <HelperRow
            first={list.length === 0}
            title={says.add(list.length)}
            note={says.addNote(list.length)}
            onPress={() => setChoosing(true)}
            leading={
              <View style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
                <Plus size={18} color={colors.text} />
              </View>
            }>
            <ChevronRight size={18} color={colors.muted} />
          </HelperRow>
        ) : null}
      </Card>

      {due ? (
        <View style={{ gap: 10, marginTop: 14, marginHorizontal: layout.barGutter }}>
          <NoteBox soft icon={(c) => <Check size={20} color={c} />} title={says.split.title}>
            {says.split.body(accepted.length)}
          </NoteBox>
          {fresh ? null : (
            <Field
              label={says.split.field}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              editable={!splitting.busy}
              note={says.split.fieldNote}
              error={splitting.error ? problemOf(splitting.error, says.split.wrong) : null}
            />
          )}
          {splitting.busy ? <Working text={words.vault.working.unlocking} progress={splitting.progress} /> : null}
          {fresh && splitting.error ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {problemOf(splitting.error, says.split.wrong)}
            </Txt>
          ) : null}
          <Button label={says.split.button(accepted.length)} block disabled={!fresh && !typed.trim()} loading={splitting.busy} onPress={() => void split()} />
        </View>
      ) : accepted.length === 1 ? (
        <Txt variant="footnote" color="muted" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {says.split.needTwo}
        </Txt>
      ) : null}

      <ChooseHelper visible={choosing} onClose={() => setChoosing(false)} helpers={helpers} />
      <ConfirmSheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        title={says.removeAsk.title(firstName(removing?.person.name))}
        body={says.removeAsk.body}
        confirm={says.removeAsk.confirm}
        busy={change.busy}
        problem={change.error ? messageFor(change.error) : null}
        onConfirm={() => void remove()}
      />
    </>
  );
}

/** One row of the helpers' card: a small picture, a line and what it means, and a tick or an arrow at the end. */
function HelperRow({ first, title, note, spoken, onPress, leading, children }: { first: boolean; title: string; note: string; spoken?: string; onPress: () => void; leading: ReactNode; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([title, note, spoken])}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600}>
          {title}
        </Txt>
        <Txt variant="footnote" color="muted">
          {note}
        </Txt>
      </View>
      {children}
    </Pressable>
  );
}

/** Who to ask: the people of this person's circles who have their own sign-in. Someone without a Vault can't hold a part yet. */
function ChooseHelper({ visible, onClose, helpers }: { visible: boolean; onClose: () => void; helpers: VaultHelpersResponse }) {
  const cache = useCache();
  const asked = useGetVaultPeople({ query: { enabled: visible } });
  const asking = useSecretAction();
  const says = words.vault.key.helpers;
  // Someone who said no can be asked again; someone who was asked or said yes is on the list already.
  const taken = new Set(helpers.helpers.filter((helper) => helper.state !== 'declined').map((helper) => helper.person.memberId));
  const people = (asked.data ?? []).filter((person) => person.memberId && !taken.has(person.memberId));
  const ask = async (memberId: string) => {
    const done = await asking.run(async () => {
      await askVaultHelper({ clientId: newClientId(), memberId });
      await cache.vaultHelpersChanged();
    });
    if (done) onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={says.choose} subtitle={says.chooseNote}>
      {!asked.data ? (
        <View style={{ minHeight: 160 }}>
          <Loading />
        </View>
      ) : people.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ paddingVertical: 12, paddingHorizontal: layout.gutter }}>
          {says.nobody}
        </Txt>
      ) : (
        people.map((person, index) => (
          <View key={person.memberId} style={{ opacity: person.hasVault ? 1 : 0.5 }} pointerEvents={person.hasVault ? 'auto' : 'none'}>
            <SheetRow first={index === 0} icon={() => <Avatar uri={person.avatarUrl} name={person.name} size={38} />} label={person.name} note={person.hasVault ? undefined : says.noVault} onPress={() => void ask(person.memberId ?? '')} />
          </View>
        ))
      )}
      {asking.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 8, paddingHorizontal: layout.gutter }}>
          {messageFor(asking.error)}
        </Txt>
      ) : null}
    </Sheet>
  );
}
