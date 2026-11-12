import { useMutation } from '@tanstack/react-query';
import { ChevronDown, EyeOff, Lock, Users } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type Access, type Audience, type AudiencePerson, type AudienceResponse, saveAudience, useGetAudience } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { formatDayLong, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Emoji } from '@/ui/Emoji';
import { FieldButton } from '@/ui/Field';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { ToggleRow } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { accessOf, changeOf, type Draft, draftOf, needsName, sameDraft } from './audience';

type Props = {
  /** The thing whose audience this is, of any kind. */
  thingId: string;
  visible: boolean;
  onClose: () => void;
};

/**
 * 4.3 Who can see this? The one sheet behind every audience chip, the same for a page, a photo, a bill or a
 * password: three choices in plain words, what each person may do, and hiding it from someone until a day.
 * Only the thing's owner can change any of it; everyone else who sees the thing can look. `AudienceChip`
 * opens it, so a screen rarely needs this by itself.
 */
export function AudienceSheet({ thingId, visible, onClose }: Props) {
  const asked = useGetAudience(thingId, { query: { enabled: visible } });
  const load = loadState(asked);
  const audience = asked.data;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={words.sharing.sheet.title}
      subtitle={audience ? words.sharing.sheet.about(audience.title.trim() || words.things.untitled, kindOf(audience.kind).a, audience.circleName) : undefined}>
      {load.error ? (
        <View style={{ minHeight: 220 }}>
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !audience ? (
        <View style={{ minHeight: 220 }}>
          <Loading offline={load.offline} />
        </View>
      ) : (
        <Choices audience={audience} onClose={onClose} />
      )}
    </Sheet>
  );
}

const LEVELS: readonly Access[] = ['edit', 'view', 'none'];

/** The sheet's inside, once the API has said who sees the thing now. */
function Choices({ audience, onClose }: { audience: AudienceResponse; onClose: () => void }) {
  const cache = useCache();
  const [start] = useState(() => draftOf(audience));
  const [draft, setDraft] = useState(start);
  /** The person whose choices are open under their row. */
  const [opened, setOpened] = useState<string | null>(null);
  const mine = audience.mine;

  const save = useMutation({
    mutationFn: () => saveAudience(audience.thingId, changeOf(draft, audience)),
    onSuccess: (saved) => {
      // Every list that shows the thing is told. They catch up behind the sheet as it closes.
      void cache.audienceChanged(saved);
      onClose();
    },
  });
  const done = () => {
    if (!mine || sameDraft(start, draft, audience)) onClose();
    else save.mutate();
  };

  const choose = (next: Audience) => {
    if (mine) setDraft((old) => ({ ...old, audience: next }));
  };
  const kind = words.kinds[audience.circleKind];
  // Everyone in the circle: its people, and the thing's owner. Pets don't count, and aren't on the list.
  const everyone = audience.people.filter((person) => person.role !== 'guest').length + 1;

  return (
    <View>
      <View accessibilityRole="radiogroup" style={{ gap: 8, marginHorizontal: layout.barGutter }}>
        <Option on={draft.audience === 'me'} locked={!mine} icon={(c) => <Lock size={20} color={c} />} label={words.sharing.sheet.onlyYou.label} note={words.sharing.sheet.onlyYou.note} onPress={() => choose('me')} />
        <Option on={draft.audience === 'some'} locked={!mine} icon={(c) => <Users size={20} color={c} />} label={words.sharing.sheet.some.label} note={words.sharing.sheet.some.note} onPress={() => choose('some')} />
        <Option
          on={draft.audience === 'circle'}
          locked={!mine}
          icon={() => <Emoji char={kind.emoji} size={25} />}
          label={kind.everyone(audience.circleName)}
          note={words.sharing.sheet.everyoneNote(everyone)}
          onPress={() => choose('circle')}
        />
      </View>

      {draft.audience === 'circle' ? (
        <View style={{ marginTop: 4, marginHorizontal: 4 }}>
          <ToggleRow
            first
            label={words.sharing.sheet.everyoneEdits.label}
            note={words.sharing.sheet.everyoneEdits.note}
            value={draft.everyoneEdits}
            locked={!mine}
            onChange={(next) => setDraft((old) => ({ ...old, everyoneEdits: next }))}
          />
        </View>
      ) : null}

      {draft.audience === 'me' ? null : (
        <View style={{ marginTop: 8 }}>
          {audience.people.map((person) => (
            <Person
              key={person.memberId}
              person={person}
              audience={audience}
              draft={draft}
              locked={!mine}
              open={opened === person.memberId}
              onToggle={() => setOpened((old) => (old === person.memberId ? null : (person.memberId ?? null)))}
              onChange={setDraft}
            />
          ))}
        </View>
      )}

      {mine ? null : (
        <NoteBox icon={(c) => <Lock size={20} color={c} />} style={{ marginTop: 10, marginHorizontal: layout.barGutter }}>
          {words.sharing.sheet.notYours}
        </NoteBox>
      )}
      {save.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 10, paddingHorizontal: layout.gutter }}>
          {messageFor(save.error)}
        </Txt>
      ) : null}
      <View style={{ paddingTop: 14, paddingHorizontal: layout.barGutter }}>
        <Button label={words.sharing.sheet.done} size="lg" block loading={save.isPending} onPress={done} />
      </View>
    </View>
  );
}

/** One of the three choices: an icon on a tile, a line and what it means, and a radio button. */
function Option({ on, locked, icon, label, note, onPress }: { on: boolean; locked: boolean; icon: (color: string) => ReactNode; label: string; note: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityLabel={words.common.spoken([label, note])}
      accessibilityState={{ checked: on, disabled: locked }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-checked={on}
      disabled={locked}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        // The thicker line of the chosen one takes its half point from the padding, so nothing moves.
        paddingVertical: on ? 11.5 : 12,
        paddingHorizontal: on ? 13.5 : 14,
        borderRadius: radius.card,
        borderWidth: on ? 2 : 1.5,
        borderColor: on ? colors.text : colors.line,
        backgroundColor: colors.bg,
        opacity: locked && !on ? 0.5 : 1,
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

type PersonProps = {
  person: AudiencePerson;
  audience: AudienceResponse;
  draft: Draft;
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (change: (old: Draft) => Draft) => void;
};

/** One person: their picture and first name, and a pill that says what they may do. Pressing it opens their choices underneath. */
function Person({ person, audience, draft, locked, open, onToggle, onChange }: PersonProps) {
  const { colors } = useTheme();
  const [pickingDay, setPickingDay] = useState(false);
  const id = person.memberId ?? '';
  const name = firstName(person.name);
  const isHidden = id in draft.hidden;
  const through = draft.hidden[id] ?? null;
  const access = accessOf(draft, person, audience.place);
  /** Their own level, where they have one. */
  const level: Access = draft.access[id] ?? 'none';
  // Their own level can be chosen where they are named: with some people, or when "everyone" doesn't reach them.
  const hasOwnLevel = draft.audience === 'some' || needsName(person, audience.place);
  const says = isHidden ? (through ? words.sharing.sheet.hiddenUntil(formatDayLong(through)) : words.sharing.sheet.hidden) : words.sharing.sheet.access[access];

  const setAccess = (next: Access) =>
    onChange((old) => {
      const hidden = { ...old.hidden };
      // Someone who can't see it at all has nothing hidden from them.
      if (next === 'none') delete hidden[id];
      return { ...old, access: { ...old.access, [id]: next }, hidden };
    });
  const hide = (day: string | null) =>
    onChange((old) => ({
      ...old,
      // Hidden for a while means they see it afterwards: someone who couldn't see it gets to look.
      access: hasOwnLevel && (old.access[id] ?? 'none') === 'none' ? { ...old.access, [id]: 'view' } : old.access,
      hidden: { ...old.hidden, [id]: day },
    }));
  const show = () =>
    onChange((old) => {
      const hidden = { ...old.hidden };
      delete hidden[id];
      return { ...old, hidden };
    });

  const pill = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 7,
        paddingLeft: 12,
        paddingRight: locked ? 12 : 8,
        borderRadius: radius.pill,
        backgroundColor: isHidden ? colors.accentSoft : colors.fill,
      }}>
      {isHidden ? <EyeOff size={13} color={colors.accentText} /> : null}
      <Txt variant="footnote" weight={700} style={{ color: isHidden ? colors.accentText : access === 'none' ? colors.muted : colors.text }}>
        {says}
      </Txt>
      {locked ? null : <ChevronDown size={14} color={isHidden ? colors.accentText : access === 'none' ? colors.muted : colors.text} />}
    </View>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
        <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={38} />
        <Txt variant="item" numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </Txt>
        {locked ? (
          <View accessible accessibilityLabel={words.sharing.sheet.personQuiet(name, says)}>
            {pill}
          </View>
        ) : (
          <Tap accessibilityRole="button" accessibilityLabel={words.sharing.sheet.person(name, says)} aria-expanded={open} hitSlop={8} onPress={onToggle} scaleTo={0.94}>
            {pill}
          </Tap>
        )}
      </View>

      {open && !locked ? (
        <View style={{ gap: 10, paddingTop: 2, paddingBottom: 10 }}>
          {hasOwnLevel ? (
            <Segmented label={name} options={LEVELS.map((level) => ({ id: level, label: words.sharing.sheet.access[level] }))} value={level} onChange={setAccess} />
          ) : null}
          {isHidden ? (
            <View style={{ gap: 10, paddingHorizontal: layout.barGutter }}>
              <View style={{ flexDirection: 'row' }}>
                <FieldButton label={words.sharing.sheet.until} value={through ? formatDayLong(through) : words.sharing.sheet.noEnd} onPress={() => setPickingDay(true)} />
              </View>
              <Button label={words.sharing.sheet.showAgain(name)} variant="soft" size="sm" onPress={show} />
            </View>
          ) : (
            <View style={{ gap: 6, paddingHorizontal: layout.barGutter }}>
              <Button label={words.sharing.sheet.hide(name)} variant="soft" size="sm" icon={(c) => <EyeOff size={15} color={c} />} onPress={() => hide(null)} />
              <Txt variant="footnote" color="muted" style={{ marginHorizontal: 4 }}>
                {words.sharing.sheet.hideNote(name)}
              </Txt>
            </View>
          )}
          <DayPicker visible={pickingDay} onClose={() => setPickingDay(false)} title={words.sharing.sheet.untilTitle(name)} value={through ?? today()} min={today()} onChange={(day) => hide(day)} />
        </View>
      ) : null}
    </View>
  );
}
