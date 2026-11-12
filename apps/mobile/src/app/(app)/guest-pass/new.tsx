import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { type ChecklistRow, createGuestPass, type PageRow, type ThingBrief, useGetChecklistsInfinite, useGetPagesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { ThingRow } from '@/features/things/ThingRow';
import { addDays, atTime, formatComingDay, formatTime, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { MoreButton } from '@/ui/MoreButton';
import { RowGroup } from '@/ui/Rows';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How far ahead a pass can start: it runs for a week at most. */
const DAYS_AHEAD = 30;

/** A page or a list of the circle, as the row every list of mixed things draws. */
const asThing = (row: PageRow | ChecklistRow, kind: 'page' | 'checklist'): ThingBrief => ({
  id: row.id,
  circleId: row.circleId,
  kind,
  place: 'notes',
  title: row.title,
  chip: row.chip,
  mine: row.mine,
  glance: 'start' in row ? row.start?.split('\n')[0] : 'left' in row ? words.things.list.left(row.left ?? 0, (row.left ?? 0) + (row.done ?? 0)) : null,
});

/**
 * 4.5 Guest pass, making one. For someone who is not in the circle and shouldn't be: who it is for, from
 * when to when, and which of the circle's pages and lists they may open. Giving it shows the pass itself,
 * with its link and its code.
 */
export default function NewGuestPass() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const says = words.people.pass;
  const [guest, setGuest] = useState('');
  const [day, setDay] = useState(today());
  const [from, setFrom] = useState(() => formatTime(new Date()));
  const [until, setUntil] = useState(() => words.dates.time(23, 30));
  const [pickingDay, setPickingDay] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const clientId = useRef(newClientId());

  const pages = useGetPagesInfinite(circle.id, undefined, { query: paged });
  const lists = useGetChecklistsInfinite(circle.id, undefined, { query: paged });
  const things = [...(rows(pages.data) ?? []).map((row) => asThing(row, 'page')), ...(rows(lists.data) ?? []).map((row) => asThing(row, 'checklist'))];

  const starts = atTime(day, from);
  // Until a time that is earlier in the day than the start means the next morning.
  const sameDay = atTime(day, until);
  const ends = starts && sameDay && sameDay <= starts ? atTime(addDays(day, 1), until) : sameDay;
  const give = useMutation({
    mutationFn: () => {
      const now = new Date();
      // A pass that starts "now" (or a little before, by the time it is sent) starts when the API gets it.
      return createGuestPass(circle.id, { clientId: clientId.current, guestName: guest.trim(), startsAt: starts && starts > now ? starts.toISOString() : undefined, endsAt: ends!.toISOString(), thingIds: chosen });
    },
    onSuccess: (pass) => {
      void cache.guestPassChanged(circle.id);
      router.replace({ pathname: '/guest-pass/[id]', params: { id: pass.id } });
    },
  });
  const failed = give.error instanceof ApiError ? give.error : null;
  const timesWrong = !starts || !ends;
  const ready = guest.trim().length > 0 && !timesWrong && chosen.length > 0;
  const toggle = (id: string) => setChosen((old) => (old.includes(id) ? old.filter((one) => one !== id) : [...old, id]));

  return (
    <Screen
      header={<AppBar leading="close" title={says.title} />}
      footer={
        <>
          {give.isError && !failed?.fields.guestName ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
              {messageFor(give.error)}
            </Txt>
          ) : null}
          <Button label={says.give} size="lg" block disabled={!ready} loading={give.isPending} onPress={() => give.mutate()} />
        </>
      }>
      <View style={{ gap: 12, paddingTop: 6 }}>
        <Field label={says.who} value={guest} onChangeText={setGuest} maxLength={50} autoCapitalize="words" placeholder={says.whoPlaceholder} error={failed?.fields.guestName} />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={says.day} value={formatComingDay(day)} onPress={() => setPickingDay(true)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label={says.from} value={from} onChangeText={setFrom} maxLength={5} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={says.until} value={until} onChangeText={setUntil} maxLength={5} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <Txt variant="caption" color={timesWrong ? 'danger' : 'muted'} style={{ marginHorizontal: 4 }}>
          {timesWrong ? says.timeWrong : says.timeHint}
        </Txt>
      </View>

      <GroupLabel>{says.canOpen(firstName(guest))}</GroupLabel>
      {things.length === 0 && !pages.isPending && !lists.isPending ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: 4 }}>
          {says.pickEmpty}
        </Txt>
      ) : (
        <View style={{ marginHorizontal: -layout.rowGutter }}>
          <RowGroup>
            {things.map((thing, index) => {
              const on = chosen.includes(thing.id ?? '');
              return (
                <ThingRow
                  key={thing.id}
                  look="grouped"
                  first={index === 0}
                  thing={thing}
                  picked={on}
                  spoken={says.pick(thing.title ?? '', on)}
                  onPress={() => toggle(thing.id ?? '')}
                  trailing={on ? <CircleCheck size={22} color={colors.ok} strokeWidth={2.4} /> : <View style={{ width: 20, height: 20, margin: 1, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.lineStrong }} />}
                />
              );
            })}
          </RowGroup>
          <MoreButton pages={pages} />
          <MoreButton pages={lists} />
        </View>
      )}
      <DayPicker visible={pickingDay} onClose={() => setPickingDay(false)} title={says.dayTitle} value={day} min={today()} max={addDays(today(), DAYS_AHEAD)} onChange={setDay} />
    </Screen>
  );
}
