import { useState } from 'react';
import { View } from 'react-native';

import type { Recurrence, Unit, Weekday } from '@/api/generated/homeport';
import { weekdayOf } from '@/lib/dates';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Tap } from '@/ui/Motion';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { PickRow } from './PickRow';

const UNITS: readonly Unit[] = ['day', 'week', 'month', 'year'];
const WEEK: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Null: it happens once. */
  value: Recurrence | null;
  onChange: (next: Recurrence | null) => void;
  /** The day it starts on, when one is known: "every week" then begins as that day of the week. */
  day?: string | null;
};

/**
 * Picks how often something comes round: not at all, or every day, week, month or year; a week also says
 * on which days. What was read from a sentence ("every other Thursday") keeps its every-other.
 */
export function RepeatSheet({ visible, onClose, value, onChange, day }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.repeat.title}>
      <Picking value={value} onChange={onChange} onClose={onClose} day={day} />
    </Sheet>
  );
}

function Picking({ value, onChange, onClose, day }: Omit<Props, 'visible'>) {
  const { colors } = useTheme();
  const says = words.plan.repeat;
  const [draft, setDraft] = useState<Recurrence | null>(value);
  const days = draft?.days ?? [];

  const choose = (unit: Unit) =>
    setDraft((old) => ({
      unit,
      // How often it skips ("every other") belongs to the unit it was said with.
      every: old?.unit === unit ? old.every : undefined,
      days: unit === 'week' ? (old?.unit === 'week' && old.days?.length ? old.days : day ? [WEEK[weekdayOf(day)]!] : []) : undefined,
      until: old?.until,
    }));
  const toggle = (weekday: Weekday) =>
    setDraft((old) => {
      if (!old) return old;
      const next = WEEK.filter((one) => (one === weekday ? !days.includes(one) : days.includes(one)));
      return { ...old, days: next };
    });

  return (
    <View>
      <PickRow first label={says.none} chosen={draft === null} onPress={() => setDraft(null)} />
      {UNITS.map((unit) => (
        <View key={unit}>
          <PickRow label={draft?.unit === unit ? says.label({ unit, every: draft.every, days: unit === 'week' ? [] : undefined }) : says.units[unit]} chosen={draft?.unit === unit} onPress={() => choose(unit)} />
          {unit === 'week' && draft?.unit === 'week' ? (
            <View accessibilityLabel={says.onDays} style={{ flexDirection: 'row', gap: 6, paddingBottom: 12, paddingHorizontal: layout.gutter }}>
              {WEEK.map((id, index) => {
                const { letter, name } = says.days[index]!;
                const on = days.includes(id);
                return (
                  <Tap
                    key={id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={name}
                    accessibilityState={{ checked: on }}
                    // Said this way, a browser hears whether it is chosen as well: the web takes no `accessibilityState`.
                    aria-checked={on}
                    onPress={() => toggle(id)}
                    scaleTo={0.9}
                    style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? colors.text : colors.fill }}>
                    <Txt variant="control" weight={800} style={{ color: on ? colors.bg : colors.text }}>
                      {letter}
                    </Txt>
                  </Tap>
                );
              })}
            </View>
          ) : null}
        </View>
      ))}
      <View style={{ paddingTop: 12, paddingHorizontal: layout.barGutter }}>
        <Button
          label={words.common.done}
          size="lg"
          block
          onPress={() => {
            onChange(draft);
            onClose();
          }}
        />
      </View>
    </View>
  );
}
