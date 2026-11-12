import { useRouter } from 'expo-router';
import { Check, Clock, Eye, EyeOff, Flame, Pencil, Plus } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { useGetVaultSharing, type VaultAccess, type VaultItemPersonResponse, type VaultItemResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { addDays, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { DayPicker } from '@/ui/DayPicker';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { Sheet } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { type Opened, removesSomeone, type ShareDraft, shareItem } from './actions';
import { ASK_EACH_VISIT } from './look';
import { problemOf } from './problems';
import { useSecretAction } from './useSecretAction';
import { comingSunday, dayOf, eveningLabel, stopsAtOf } from './when';

type Props = {
  visible: boolean;
  onClose: () => void;
  item: VaultItemResponse;
  /** The item as this phone opened it: its key is what gets wrapped for each person. */
  opened: Pick<Opened, 'inside' | 'itemKey' | 'version'>;
  /** One person the sheet is about, when it was opened from their row. Everyone else keeps what they have. */
  focus?: string | null;
  /** After saving. `newKey` is true when the item got a new key: what the screen holds of it is out of date. */
  onSaved: (newKey: boolean) => void;
};

/** What the sheet's choices are set to. Every one starts from what is so, until the person changes it. */
type Chosen = { ticked: readonly string[]; access: VaultAccess; once: boolean; stopsDay: string | null };

/** True for someone the item is shared with right now: they hold a working key, or wait for one. */
const hasItNow = (person: VaultItemPersonResponse) => person.access !== null && (person.state === 'ready' || person.state === 'waiting');

/**
 * 9.4 Share a secret: who gets it, one of three ways (use without seeing, see, change), gone after one look,
 * or only until an evening. Saving sends the audience and each person's wrapped key in one go; taking it
 * away from someone who has had it gives the item a new key in the same step.
 */
export function ShareSheet({ visible, onClose, item, opened, focus, onSaved }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circle = useCircles().find((one) => one.id === item.circleId);
  const asked = useGetVaultSharing(item.id, { query: { ...ASK_EACH_VISIT, enabled: visible } });
  const load = loadState(asked);
  const sharing = asked.data;
  const [changes, setChanges] = useState<Partial<Chosen>>({});
  const [pickingDay, setPickingDay] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const saving = useSecretAction();
  const says = words.vault.share;
  const kind = circle?.kind ?? 'solo';

  const others = (sharing?.people ?? []).filter((person) => !person.owner && !person.you);
  const shown = focus ? others.filter((person) => person.memberId === focus) : others;
  // The sheet starts from what is so: who has it, and the way the first of them has it.
  const first = shown.find(hasItNow);
  const ticked = changes.ticked ?? shown.filter(hasItNow).map((person) => person.memberId);
  const access = changes.access ?? first?.access ?? 'use';
  const once = changes.once ?? first?.once ?? false;
  const stopsDay = changes.stopsDay !== undefined ? changes.stopsDay : first?.stopsAt ? dayOf(first.stopsAt) : null;
  const change = (next: Partial<Chosen>) => setChanges((old) => ({ ...old, ...next }));

  const draft: ShareDraft = [
    // Opened from one person's row, everyone else keeps exactly what they have.
    ...(focus ? others.filter((person) => person.memberId !== focus && hasItNow(person)).map((person) => ({ memberId: person.memberId, access: person.access ?? 'see', once: person.once, stopsAt: person.stopsAt })) : []),
    ...ticked.map((memberId) => ({ memberId, access, once: access === 'change' ? false : once, stopsAt: stopsDay ? stopsAtOf(stopsDay).toISOString() : null })),
  ];
  const named = new Set(draft.map((person) => person.memberId));
  const newKey = sharing ? removesSomeone(sharing, draft) : false;
  const losing = others.filter((person) => person.access !== null && person.state !== null && person.state !== 'waiting' && !named.has(person.memberId));
  const withoutVault = shown.filter((person) => ticked.includes(person.memberId) && person.missing === 'no_vault');
  const focused = focus ? shown[0] : undefined;

  const toggle = (person: VaultItemPersonResponse) => {
    if (person.missing === 'no_phone') {
      setSaid(says.noPhone(firstName(person.name)));
      return;
    }
    setSaid(null);
    change({ ticked: ticked.includes(person.memberId) ? ticked.filter((one) => one !== person.memberId) : [...ticked, person.memberId] });
  };
  const save = async () => {
    if (!sharing) return;
    const saved = await saving.run(async () => {
      await cache.vaultItemShared(item, await shareItem(item, opened, sharing, draft));
    });
    if (!saved) return;
    onSaved(newKey);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={focused ? says.titleFor(firstName(focused.name), item.title) : says.title(item.title)}
      footer={
        sharing ? (
          <View style={{ gap: 8, paddingTop: 12, paddingHorizontal: layout.barGutter }}>
            {saving.error ? (
              <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
                {problemOf(saving.error)}
              </Txt>
            ) : null}
            <Button label={says.button(ticked.length)} size="lg" block loading={saving.busy} onPress={() => void save()} />
          </View>
        ) : undefined
      }>
      {load.error ? (
        <View style={{ minHeight: 220 }}>
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !sharing ? (
        <View style={{ minHeight: 220 }}>
          <Loading offline={load.offline} />
        </View>
      ) : (
        <View style={{ paddingBottom: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingTop: 10, paddingBottom: 14, paddingHorizontal: layout.rowGutter }}>
            {shown.map((person) => (
              <Face key={person.memberId} person={person} on={ticked.includes(person.memberId)} onPress={() => toggle(person)} />
            ))}
            {focus ? null : (
              <Tap accessibilityRole="button" accessibilityLabel={says.outside.title} onPress={() => setOutside((old) => !old)} style={{ alignItems: 'center', gap: 5 }}>
                <View style={{ width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
                  <Plus size={22} color={colors.text} />
                </View>
                <Txt variant="small" weight={700} color="muted">
                  {says.other}
                </Txt>
              </Tap>
            )}
          </ScrollView>
          {shown.length === 0 ? <Said>{says.nobody}</Said> : null}
          {said ? <Said>{said}</Said> : null}
          {shown
            .filter((person) => (person.state === 'used' || person.state === 'stopped') && !ticked.includes(person.memberId))
            .map((person) => (
              <Said key={person.memberId}>{says.gone(firstName(person.name), person.state === 'used' ? 'used' : 'stopped')}</Said>
            ))}
          {outside ? (
            <NoteBox
              soft
              icon={(c) => <Plus size={20} color={c} />}
              title={says.outside.title}
              style={{ marginBottom: 12, marginHorizontal: layout.barGutter }}
              trailing={
                <Button
                  label={says.outside.button}
                  size="sm"
                  variant="soft"
                  inline
                  onPress={() => {
                    onClose();
                    router.push('/guest-pass/new');
                  }}
                />
              }>
              {says.outside.body}
            </NoteBox>
          ) : null}

          <View accessibilityRole="radiogroup" style={{ gap: 10, marginHorizontal: layout.barGutter }}>
            <Way on={access === 'use'} icon={(c) => <EyeOff size={20} color={c} />} label={says.ways.use.label} note={says.ways.use.note} onPress={() => change({ access: 'use' })} />
            <Way on={access === 'see'} icon={(c) => <Eye size={20} color={c} />} label={says.ways.see.label} note={says.ways.see.note} onPress={() => change({ access: 'see' })} />
            <Way on={access === 'change'} icon={(c) => <Pencil size={20} color={c} />} label={says.ways.change.label} note={says.ways.change.note[kind]} onPress={() => change({ access: 'change' })} />
          </View>
          {access === 'use' ? (
            <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
              {says.useNote}
            </Txt>
          ) : null}

          <Card style={{ marginTop: 10, marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 12, paddingHorizontal: 16, opacity: access === 'change' ? 0.45 : 1 }} pointerEvents={access === 'change' ? 'none' : 'auto'}>
              <Flame size={20} color={colors.text} />
              <Txt variant="item" weight={600} style={{ flex: 1 }}>
                {says.once}
              </Txt>
              <Toggle label={says.once} value={access !== 'change' && once} onChange={(next) => change({ once: next })} />
            </View>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={words.common.fieldChange(says.stops, stopsDay ? eveningLabel(stopsDay) : says.never)}
              onPress={() => setPickingDay(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Clock size={20} color={colors.text} />
              <Txt variant="item" weight={600} style={{ flex: 1 }}>
                {says.stops}
              </Txt>
              <Txt variant="callout" color="muted">
                {stopsDay ? eveningLabel(stopsDay) : says.never}
              </Txt>
            </Tap>
          </Card>
          {stopsDay ? (
            <View style={{ alignItems: 'flex-start', marginTop: 8, marginHorizontal: layout.barGutter }}>
              <Button label={says.stopsClear} variant="soft" size="sm" onPress={() => change({ stopsDay: null })} />
            </View>
          ) : null}

          {withoutVault.length > 0 ? <Said top>{says.noVault(withoutVault.map((person) => firstName(person.name)))}</Said> : null}
          {newKey && losing.length > 0 ? <Said top>{says.removing(losing.map((person) => firstName(person.name)))}</Said> : null}
          <DayPicker
            visible={pickingDay}
            onClose={() => setPickingDay(false)}
            title={says.stopsTitle}
            value={stopsDay ?? comingSunday(today())}
            min={today()}
            max={addDays(today(), 365)}
            onChange={(day) => {
              change({ stopsDay: day });
              setPickingDay(false);
            }}
          />
        </View>
      )}
    </Sheet>
  );
}

/** A sentence of the sheet's own: why someone can't be ticked, what happens to someone who is. */
function Said({ children, top }: { children: ReactNode; top?: boolean }) {
  return (
    <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: top ? 10 : 0, marginBottom: top ? 0 : 10, marginHorizontal: layout.gutter }}>
      {children}
    </Txt>
  );
}

/** One person in the row of pictures: ticked with a ring and a tick when the item is shared with them. */
function Face({ person, on, onPress }: { person: VaultItemPersonResponse; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const name = firstName(person.name);
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={words.vault.share.person(name)}
      accessibilityState={{ checked: on }}
      // Said this way, a browser hears whether they are ticked as well: the web takes no `accessibilityState`.
      aria-checked={on}
      onPress={onPress}
      style={{ alignItems: 'center', gap: 5, opacity: person.missing === 'no_phone' ? 0.5 : 1 }}>
      {/* The ring of the ticked one is drawn around the picture without moving it. */}
      <View style={{ margin: -4.5, padding: 2, borderRadius: radius.pill, borderWidth: 2.5, borderColor: on ? colors.accent : 'transparent' }}>
        <Avatar uri={person.avatarUrl} name={person.name} size={52} />
      </View>
      {on ? (
        <View style={{ position: 'absolute', right: -4, top: 34, width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.accent }}>
          <Check size={11} color={colors.onAccent} strokeWidth={3} />
        </View>
      ) : null}
      <Txt variant="small" weight={700} color={on ? 'text' : 'muted'} numberOfLines={1} style={{ maxWidth: 64 }}>
        {name}
      </Txt>
    </Tap>
  );
}

/** One of the three ways: an icon on a tile, a line and what it means, and a radio button. */
function Way({ on, icon, label, note, onPress }: { on: boolean; icon: (color: string) => ReactNode; label: string; note: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityLabel={words.common.spoken([label, note])}
      accessibilityState={{ checked: on }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-checked={on}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        // The thicker line of the chosen one takes its half point from the padding, so nothing moves.
        paddingVertical: on ? 14.5 : 15,
        paddingHorizontal: on ? 15.5 : 16,
        borderRadius: radius.card,
        borderWidth: on ? 2 : 1.5,
        borderColor: on ? colors.text : colors.line,
        backgroundColor: colors.bg,
      }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>{icon(colors.text)}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="item" weight={800}>
          {label}
        </Txt>
        <Txt variant="caption" weight={500} color="muted">
          {note}
        </Txt>
      </View>
      <View style={{ width: 22, height: 22, marginTop: 2, borderRadius: radius.pill, borderWidth: on ? 7 : 2, borderColor: on ? colors.text : colors.lineStrong }} />
    </Tap>
  );
}
