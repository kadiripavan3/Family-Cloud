import { Calendar } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { addMinutes, formatClock, formatWeekdayDay, today } from '@/lib/dates';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { words } from '@/words';

import { minutesOf, readTime } from './times';

/** When something is: its day, and for something with a time when it starts and ends ("09:30"). */
export type When = { day: string | null; time: string | null; endTime: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  value: When;
  onChange: (next: When) => void;
  /** An event has an end and always a day; a reminder has one time, and may have no day at all. */
  kind: 'event' | 'reminder';
};

/** How long an event lasts when only its start is said. */
const HALF_AN_HOUR = 30;

/**
 * Picks when: the day from a calendar, and the time typed the way it is said ("9:30", "14:00", "7pm"),
 * read back under the box as it is typed. An event has a start and an end; a reminder one time, and it may
 * have no day.
 */
export function WhenSheet({ visible, onClose, value, onChange, kind }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.when.title}>
      <Picking value={value} onChange={onChange} onClose={onClose} kind={kind} />
    </Sheet>
  );
}

/** The sheet's inside. It starts from the value each time the sheet opens. */
function Picking({ value, onChange, onClose, kind }: Omit<Props, 'visible'>) {
  const says = words.plan.when;
  const [day, setDay] = useState(value.day);
  const [starts, setStarts] = useState(value.time ? formatClock(value.time) : '');
  const [ends, setEnds] = useState(value.endTime ? formatClock(value.endTime) : '');
  const [pickingDay, setPickingDay] = useState(false);
  const [tried, setTried] = useState(false);

  const start = starts.trim() ? readTime(starts) : null;
  const end = ends.trim() ? readTime(ends) : null;
  const startProblem = starts.trim() && !start ? says.timeProblem : null;
  const endProblem = ends.trim() && !end ? says.timeProblem : ends.trim() && !start ? says.endNeedsStart : start && end && minutesOf(end) < minutesOf(start) ? says.endsBefore : null;

  const done = () => {
    if (startProblem || endProblem) return setTried(true);
    // An event with a start and no end said lasts half an hour, as the line reader has it.
    onChange({ day, time: day ? start : null, endTime: day && start && kind === 'event' ? (end ?? addMinutes(start, HALF_AN_HOUR)) : null });
    onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.barGutter }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <FieldButton label={says.day} value={day ? formatWeekdayDay(day) : says.noDay} icon={<Calendar size={18} />} onPress={() => setPickingDay(true)} />
      </View>
      {kind === 'reminder' && day ? <Button label={says.removeDay} variant="soft" size="sm" onPress={() => setDay(null)} /> : null}
      {day ? (
        <>
          <Field
            label={kind === 'event' ? says.starts : says.time}
            value={starts}
            onChangeText={setStarts}
            placeholder={says.timePlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            error={tried || start === null ? startProblem : null}
            note={start ? says.readAs(formatClock(start)) : says.timeNote}
          />
          {kind === 'event' ? (
            <Field
              label={says.ends}
              value={ends}
              onChangeText={setEnds}
              placeholder={start ? formatClock(addMinutes(start, HALF_AN_HOUR)) : says.timePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              error={tried || end === null ? endProblem : null}
              note={end ? says.readAs(formatClock(end)) : undefined}
            />
          ) : null}
        </>
      ) : null}
      <Button label={words.common.done} size="lg" block onPress={done} />
      <DayPicker visible={pickingDay} onClose={() => setPickingDay(false)} title={says.pickDay} value={day ?? today()} onChange={setDay} />
    </View>
  );
}
