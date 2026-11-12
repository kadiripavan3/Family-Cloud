import { Bell, MapPin, Paperclip, Repeat } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { NoteIcon, PlanEntryResponse } from '@/api/generated/homeport';
import { useOpenThing } from '@/features/things/open';
import { formatWeekdayDay } from '@/lib/dates';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Faces, facesOf } from './Faces';
import { Tick } from './Tick';
import { TintDot } from './tints';
import type { TickAsk } from './useTick';

/** The small icon in front of a line's note, by what the note is about. */
export function NoteMark({ icon, color, size = 13 }: { icon: NoteIcon | undefined; color: string; size?: number }): ReactNode {
  switch (icon) {
    case 'repeat':
      return <Repeat size={size} color={color} />;
    case 'pin':
      return <MapPin size={size} color={color} />;
    case 'bell':
      return <Bell size={size} color={color} />;
    case 'clip':
      return <Paperclip size={size} color={color} />;
    default:
      return null;
  }
}

type Props = {
  entry: PlanEntryResponse;
  /** Whether its tick shows as ticked: what was just pressed, else what the list says (`useTick().shown`). */
  ticked: boolean;
  onTick: (ask: TickAsk) => void;
  /** For a line that is still open from before: said under its title, since it stands under no day of its own. */
  wasDue?: boolean;
};

/**
 * One line of a day: what stands in front (a time and when it ends, an amount, or nothing), and a card with
 * the title, a small line under it, and whose it is. An event carries a coloured dot and faces; a job
 * carries a tick; a bill that another place brought carries its amount and a way to pay. Pressing the card
 * opens the thing, whatever kind it is.
 */
export function PlanEntry({ entry, ticked, onTick, wasDue }: Props) {
  const { colors, shadow } = useTheme();
  const open = useOpenThing();
  const job = entry.done !== null && entry.done !== undefined;
  const faces = facesOf(entry.avatarUrls);
  // A dot says whose it is, next to their face. A job of your own has neither.
  const dotted = !job || faces.length > 0;
  const note = words.common.join([wasDue ? words.plan.home.wasDue(formatWeekdayDay(entry.day)) : null, entry.note]);
  const thing = { kind: entry.kind, id: entry.thingId };
  // Ticking is for the next time a job is due; a tick that is there can be taken away by whoever may change the job.
  const mayTick = job && !!entry.thingId && (ticked ? entry.canEdit || entry.canTick : entry.canTick);
  const bill = (entry.kind as string) === 'bill';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingVertical: 4, paddingHorizontal: 16 }}>
      <View style={{ width: 42, paddingTop: 12, alignItems: 'flex-end' }}>
        {entry.lead ? (
          <Txt variant="caption" weight={800} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {entry.lead}
          </Txt>
        ) : null}
        {entry.leadEnd ? (
          <Txt variant="tiny" weight={600} color="muted" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {entry.leadEnd}
          </Txt>
        ) : null}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingVertical: 11, paddingLeft: 14, paddingRight: 12, borderRadius: radius.photo, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
        {job ? (
          <Tick
            label={words.plan.entry.tick(entry.title, formatWeekdayDay(entry.day))}
            done={ticked}
            onChange={mayTick ? (done) => onTick({ id: entry.thingId!, done, dueOn: entry.day }) : undefined}
          />
        ) : null}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={words.plan.entry.spoken(entry.lead, entry.title, note)}
          disabled={!entry.thingId}
          onPress={() => open(thing)}
          scaleTo={0.985}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {dotted ? <TintDot tint={entry.whose?.tint ?? 0} /> : null}
              <Txt variant="item" numberOfLines={1} style={{ flexShrink: 1, color: ticked ? colors.muted : colors.text, textDecorationLine: ticked ? 'line-through' : 'none' }}>
                {entry.title}
              </Txt>
            </View>
            {note ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
                <NoteMark icon={entry.noteIcon} color={colors.muted} />
                <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {note}
                </Txt>
              </View>
            ) : null}
          </View>
          {bill ? null : <Faces people={faces} />}
        </Tap>
        {bill ? <Button label={words.plan.entry.pay} variant="soft" size="sm" inline onPress={() => open(thing)} /> : null}
      </View>
    </View>
  );
}

/** The name of a day above its lines: "Today" with "Wed 11 Nov" after it, or the date alone. */
export function DayHeader({ title, rest }: { title: string; rest?: string | null }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={words.common.spoken([title, rest])} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16, marginBottom: 6, marginHorizontal: 20 }}>
      <Txt variant="subheading">{title}</Txt>
      {rest ? (
        <Txt variant="footnote" weight={600} color="muted">
          {rest}
        </Txt>
      ) : null}
    </View>
  );
}
