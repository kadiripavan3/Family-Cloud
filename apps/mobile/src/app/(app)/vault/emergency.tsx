import { Bell, ChevronRight, CircleCheck, Clock, FileText, KeyRound, LockOpen, TriangleAlert, UserRound } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import {
  refuseEmergency,
  switchOffEmergency,
  useGetEmergency,
  useGetMyVaultItemsInfinite,
  useGetVaultPeople,
  type VaultEmergencyResponse,
  type VaultItemRowResponse,
  type VaultPersonResponse,
} from '@/api/generated/homeport';
import { paged, rows, useEveryPage } from '@/api/pages';
import { readOwnNote, saveEmergencyAccess } from '@/features/vault/actions';
import { VaultScreen } from '@/features/vault/Gate';
import { ItemTile } from '@/features/vault/ItemTile';
import { problemOf } from '@/features/vault/problems';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { momentOf } from '@/features/vault/when';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { rich } from '@/ui/rich';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How long the person can give themselves to say no, in hours: one day to a week. */
const WAITS = [24, 48, 72, 120, 168] as const;

/**
 * 9.5 If something happens: the feature people only think about too late. A person you trust can ask for
 * your Vault; you get two days to say no; after that it opens to them, with a note you wrote for the family.
 * What opens is set aside here, on the phone: each chosen item's key wrapped for the trusted person, and the
 * note scrambled for them. The wait itself is the service's to keep.
 */
export default function EmergencyAccess() {
  return (
    <VaultScreen>
      <Unlocked />
    </VaultScreen>
  );
}

function Unlocked() {
  const { colors } = useTheme();
  const asked = useGetEmergency();
  const load = loadState(asked);
  const emergency = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar />
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : !emergency ? (
        <Loading offline={load.offline} />
      ) : (
        // What is typed starts from what is saved, and starts again whenever that changes.
        <Loaded key={[emergency.state, emergency.trusted?.memberId, emergency.waitHours, emergency.items.map((item) => item.id).join(), emergency.noteMine?.length].join(':')} emergency={emergency} />
      )}
    </SafeAreaView>
  );
}

type Draft = { trusted: VaultPersonResponse | null; waitHours: number; itemIds: readonly string[]; note: string };

function Loaded({ emergency }: { emergency: VaultEmergencyResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const on = emergency.state !== 'off';
  const [draft, setDraft] = useState<Draft>(() => {
    let note = '';
    try {
      note = readOwnNote(emergency);
    } catch {
      // A note that doesn't open with this key is left empty: saving writes a new one.
    }
    return { trusted: emergency.trusted, waitHours: emergency.waitHours || 48, itemIds: emergency.items.map((item) => item.id), note };
  });
  const [changed, setChanged] = useState(false);
  const [sheet, setSheet] = useState<'person' | 'wait' | 'items' | 'note' | 'off' | null>(null);
  const saving = useSecretAction();
  const answering = useSecretAction();
  const says = words.vault.emergency;

  // Everything that is this person's own, in every circle: only their own items can be set aside.
  const mine = useGetMyVaultItemsInfinite(undefined, { query: paged });
  useEveryPage(mine);
  const items = (rows(mine.data) ?? []).filter((item) => !item.sample);
  const titles = new Map([...emergency.items.map((item) => [item.id, item.title] as const), ...items.map((item) => [item.id, item.title] as const)]);
  const chosen = draft.itemIds.filter((id) => titles.has(id));

  const change = (next: Partial<Draft>) => {
    setDraft((old) => ({ ...old, ...next }));
    setChanged(true);
  };
  const save = () =>
    void saving.run(async () => {
      const trusted = draft.trusted;
      if (!trusted?.memberId || !trusted.publicKey) return;
      await cache.vaultEmergencyChanged(await saveEmergencyAccess({ trustedMemberId: trusted.memberId, trustedPublicKey: trusted.publicKey, waitHours: draft.waitHours, itemIds: chosen, note: draft.note }));
    });
  const sayNo = () => void answering.run(async () => void (await cache.vaultEmergencyChanged(await refuseEmergency())));
  const switchOff = async () => {
    const done = await answering.run(async () => {
      await switchOffEmergency();
      await cache.vaultEmergencyChanged();
    });
    if (done) setSheet(null);
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
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

        {emergency.state === 'asked' ? (
          <NoteBox
            tone="warn"
            icon={(c) => <TriangleAlert size={20} color={c} />}
            title={says.asked.title(firstName(emergency.trusted?.name))}
            trailing={<Button label={says.asked.no} size="sm" variant="ink" inline loading={answering.busy} onPress={sayNo} />}
            style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
            {says.asked.body(emergency.opensAt ? momentOf(emergency.opensAt) : '')}
          </NoteBox>
        ) : emergency.state === 'open' ? (
          <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={says.open.title(firstName(emergency.trusted?.name))} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
            {says.open.body}
          </NoteBox>
        ) : null}

        <Steps trusted={draft.trusted} hours={draft.waitHours} />

        <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          <Line
            first
            leading={draft.trusted ? <Avatar uri={draft.trusted.avatarUrl} name={draft.trusted.name} size={34} /> : <Tile icon={(c) => <UserRound size={18} color={c} />} />}
            label={draft.trusted?.name ?? says.person.none}
            note={says.person.label}
            onPress={() => setSheet('person')}
          />
          <Line leading={<Tile icon={(c) => <Clock size={18} color={c} />} />} label={says.wait.label} value={says.wait.value(draft.waitHours)} onPress={() => setSheet('wait')} />
          <Line
            leading={<Tile icon={(c) => <KeyRound size={18} color={c} />} />}
            label={says.opens.label}
            note={chosen.length === 0 ? says.opens.none : says.opens.summary(chosen.map((id) => titles.get(id) ?? ''), chosen.length)}
            onPress={() => setSheet('items')}
          />
          <Line leading={<Tile icon={(c) => <FileText size={18} color={c} />} />} label={says.note.label} note={draft.note.trim() ? says.note.written : says.note.hint} onPress={() => setSheet('note')} />
        </Card>
        <Txt variant="footnote" color="muted" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {says.honest}
        </Txt>
      </ScrollView>

      <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
        {saving.error || answering.error ? (
          <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
            {problemOf(saving.error ?? answering.error)}
          </Txt>
        ) : null}
        {on && !changed ? (
          <Txt variant="caption" color="muted" center accessibilityLiveRegion="polite">
            {says.on(firstName(emergency.trusted?.name))}
          </Txt>
        ) : null}
        {on && !changed ? null : <Button label={on ? says.save : says.turnOn} size="lg" block disabled={!draft.trusted?.publicKey} loading={saving.busy} onPress={save} />}
        {on ? (
          <Button label={says.switchOff} variant="quiet" block onPress={() => setSheet('off')} />
        ) : (
          <Txt variant="small" weight={500} color="muted" center>
            {draft.trusted ? says.fine : says.needPerson}
          </Txt>
        )}
      </View>

      <ChoosePerson visible={sheet === 'person'} onClose={() => setSheet(null)} chosen={draft.trusted} onChoose={(trusted) => change({ trusted })} />
      <Sheet visible={sheet === 'wait'} onClose={() => setSheet(null)} title={says.wait.title}>
        {WAITS.map((hours, index) => (
          <SheetRow
            key={hours}
            first={index === 0}
            label={says.wait.choice(hours)}
            trailing={hours === draft.waitHours ? <CircleCheck size={22} color={colors.ok} /> : undefined}
            onPress={() => {
              change({ waitHours: hours });
              setSheet(null);
            }}
          />
        ))}
      </Sheet>
      <ChooseItems visible={sheet === 'items'} onClose={() => setSheet(null)} items={items} loading={mine.isPending} chosen={draft.itemIds} onChange={(itemIds) => change({ itemIds })} />
      <Sheet visible={sheet === 'note'} onClose={() => setSheet(null)} title={says.note.title} subtitle={says.note.sealed}>
        <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
          <Field label={says.note.label} value={draft.note} onChangeText={(note) => change({ note })} multiline maxLength={8000} placeholder={says.note.placeholder} />
          <Button label={words.common.done} size="lg" block onPress={() => setSheet(null)} />
        </View>
      </Sheet>
      <ConfirmSheet
        visible={sheet === 'off'}
        onClose={() => setSheet(null)}
        title={says.switchOffAsk.title}
        body={says.switchOffAsk.body(firstName(emergency.trusted?.name))}
        confirm={says.switchOffAsk.confirm}
        busy={answering.busy}
        problem={answering.error ? messageFor(answering.error) : null}
        onConfirm={() => void switchOff()}
      />
    </>
  );
}

/** The three steps, side by side: they ask, you have time to say no, it opens to them. */
function Steps({ trusted, hours }: { trusted: VaultPersonResponse | null; hours: number }) {
  const { colors } = useTheme();
  const says = words.vault.emergency.steps;
  const name = trusted ? firstName(trusted.name) : null;
  const box = { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.photo } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 18, marginBottom: 16, marginHorizontal: layout.barGutter }}>
      <View style={[box, { backgroundColor: colors.fill }]}>
        {trusted ? <Avatar uri={trusted.avatarUrl} name={trusted.name} size={28} /> : <UserRound size={28} color={colors.text} />}
        <Txt variant="small" weight={700} center>
          {says.asks(name)}
        </Txt>
      </View>
      <ChevronRight size={14} color={colors.muted} />
      <View style={[box, { backgroundColor: colors.accentSoft }]}>
        <Bell size={28} color={colors.text} />
        <Txt variant="small" weight={700} center>
          {says.wait(hours)}
        </Txt>
      </View>
      <ChevronRight size={14} color={colors.muted} />
      <View style={[box, { backgroundColor: colors.fill }]}>
        <LockOpen size={28} color={colors.text} />
        <Txt variant="small" weight={700} center>
          {says.opens(name)}
        </Txt>
      </View>
    </View>
  );
}

/** The grey square an icon sits on at the start of a row. */
function Tile({ icon }: { icon: (color: string) => ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ width: 34, height: 34, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>{icon(colors.text)}</View>;
}

/** One of the four rows: what it is, what it is set to, and an arrow that opens the choice. */
function Line({ first, leading, label, note, value, onPress }: { first?: boolean; leading: ReactNode; label: string; note?: string; value?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([label, value, note])}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600}>
          {label}
        </Txt>
        {note ? (
          <Txt variant="footnote" color="muted" numberOfLines={2}>
            {note}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt variant="callout" color="muted">
          {value}
        </Txt>
      ) : (
        <ChevronRight size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

/** Who can ask: someone from this person's circles who has a Vault of their own, so things can be sealed for them. */
function ChoosePerson({ visible, onClose, chosen, onChoose }: { visible: boolean; onClose: () => void; chosen: VaultPersonResponse | null; onChoose: (person: VaultPersonResponse) => void }) {
  const { colors } = useTheme();
  const asked = useGetVaultPeople({ query: { enabled: visible } });
  const says = words.vault.emergency;
  const people = asked.data;
  return (
    <Sheet visible={visible} onClose={onClose} title={says.person.title}>
      {!people ? (
        <View style={{ minHeight: 160 }}>
          <Loading />
        </View>
      ) : people.length === 0 || people.every((person) => !person.hasVault) ? (
        <Txt variant="callout" color="muted" style={{ paddingVertical: 12, paddingHorizontal: layout.gutter }}>
          {says.nobody}
        </Txt>
      ) : null}
      {(people ?? []).map((person, index) => (
        <View key={person.memberId ?? person.name} style={{ opacity: person.hasVault ? 1 : 0.5 }} pointerEvents={person.hasVault ? 'auto' : 'none'}>
          <SheetRow
            first={index === 0}
            icon={() => <Avatar uri={person.avatarUrl} name={person.name} size={38} />}
            label={person.name}
            note={person.hasVault ? undefined : says.noVault}
            trailing={chosen?.memberId === person.memberId ? <CircleCheck size={22} color={colors.ok} /> : undefined}
            onPress={() => {
              onChoose(person);
              onClose();
            }}
          />
        </View>
      ))}
    </Sheet>
  );
}

/** What opens: this person's own items, to tick. */
function ChooseItems({ visible, onClose, items, loading, chosen, onChange }: { visible: boolean; onClose: () => void; items: VaultItemRowResponse[]; loading: boolean; chosen: readonly string[]; onChange: (ids: string[]) => void }) {
  const { colors } = useTheme();
  const says = words.vault.emergency.opens;
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id]);
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title} subtitle={says.hint} tall footer={<View style={{ paddingTop: 12, paddingHorizontal: layout.rowGutter }}><Button label={words.common.done} size="lg" block onPress={onClose} /></View>}>
      {loading ? (
        <View style={{ minHeight: 160 }}>
          <Loading />
        </View>
      ) : items.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ paddingVertical: 12, paddingHorizontal: layout.gutter }}>
          {says.empty}
        </Txt>
      ) : (
        items.map((item) => {
          const on = chosen.includes(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityLabel={says.pick(item.title)}
              accessibilityState={{ checked: on }}
              // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
              aria-checked={on}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter, backgroundColor: pressed ? colors.fill : 'transparent' })}>
              <ItemTile category={item.category} title={item.title} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="item" numberOfLines={1}>
                  {item.title}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {item.glance}
                </Txt>
              </View>
              {on ? <CircleCheck size={22} color={colors.ok} strokeWidth={2.4} /> : <View style={{ width: 20, height: 20, margin: 1, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.lineStrong }} />}
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}
