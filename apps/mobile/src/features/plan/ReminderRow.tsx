import { Check, MapPin } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { ReminderResponse } from '@/api/generated/homeport';
import { useOpenThing } from '@/features/things/open';
import { formatWeekdayDay } from '@/lib/dates';
import { layout, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { NoteMark } from './PlanEntry';
import { Tick } from './Tick';
import type { TickAsk } from './useTick';

type Props = {
  reminder: ReminderResponse;
  /**
   * "yours" has a tick in front. "asked" has the face of whoever has it, and a Nudge or a done mark at the
   * end. "place" has a pin in front, and the face of whoever it waits for when that isn't you.
   */
  look: 'yours' | 'asked' | 'place';
  /** Whether it shows as ticked: what was just pressed, else what the API says (`useTick().shown`). */
  ticked: boolean;
  onTick: (ask: TickAsk) => void;
  onNudge?: (reminder: ReminderResponse) => void;
  nudging?: boolean;
};

/** One reminder in a list: what stands in front by where it is listed, its title, the API's line about it, and what can be done from here. */
export function ReminderRow({ reminder, look, ticked, onTick, onNudge, nudging }: Props) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const done = look === 'yours' ? ticked : reminder.done;
  const holder = reminder.turn ?? reminder.givenTo[0] ?? null;
  const names = words.common.join(reminder.givenTo.map((person) => person.name ?? ''));

  let leading: ReactNode;
  if (look === 'yours') {
    // A tick is for the day it is due on; a tick that is there is taken away for the day it was given for.
    const dueOn = ticked ? (reminder.tickedDueOn ?? reminder.dueOn) : reminder.dueOn;
    leading = (
      <Tick
        label={words.plan.entry.tick(reminder.title, reminder.dueOn ? formatWeekdayDay(reminder.dueOn) : words.plan.reminders.someTime)}
        done={ticked}
        onChange={reminder.canTick ? (next) => onTick({ id: reminder.id, done: next, dueOn }) : undefined}
      />
    );
  } else if (look === 'asked') {
    leading = <Avatar uri={holder?.avatarUrl} name={holder?.name ?? ''} size={24} />;
  } else {
    leading = <MapPin size={18} color={colors.muted} />;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 10, paddingHorizontal: layout.rowGutter }}>
      {leading}
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([reminder.title, reminder.note])} onPress={() => open({ kind: 'reminder', id: reminder.id })} scaleTo={0.985} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="lead" weight={600} numberOfLines={2} style={{ color: done ? colors.muted : colors.text, textDecorationLine: done ? 'line-through' : 'none' }}>
            {reminder.title}
          </Txt>
          {reminder.note ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <NoteMark icon={look === 'place' || done ? 'none' : reminder.noteIcon} color={colors.muted} />
              <Txt variant="footnote" color="muted" numberOfLines={2} style={{ flexShrink: 1 }}>
                {reminder.note}
              </Txt>
            </View>
          ) : null}
        </View>
        {look === 'asked' && reminder.done ? <Check size={18} color={colors.muted} accessibilityLabel={words.plan.reminders.doneMark} /> : null}
        {look === 'place' && !reminder.yours && holder ? <Avatar uri={holder.avatarUrl} name={holder.name ?? ''} size={24} /> : null}
      </Tap>
      {look === 'asked' && reminder.canNudge && onNudge ? (
        <Button label={words.plan.reminders.nudge} spoken={words.plan.reminders.nudgeSpoken(names, reminder.title)} variant="soft" size="sm" inline loading={nudging} onPress={() => onNudge(reminder)} />
      ) : null}
    </View>
  );
}
