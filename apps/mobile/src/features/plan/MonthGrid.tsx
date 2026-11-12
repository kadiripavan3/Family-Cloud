import { View } from 'react-native';

import type { MonthDayResponse } from '@/api/generated/homeport';
import { fromISODate } from '@/lib/dates';
import { radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { TintDots } from './tints';

type Props = {
  /** Whole weeks, Monday first, that hold the month: the API sends them, with a dot per person on each day. */
  days: readonly MonthDayResponse[];
  /** The day whose list shows under the grid. */
  chosen: string;
  today: string;
  onChoose: (day: string) => void;
};

/**
 * The month at a glance: seven columns, a number for each day and a dot per person who has something on it.
 * Today is the filled one, the chosen day wears a ring, and the days of the months before and after that
 * fill the first and last weeks are pale.
 */
export function MonthGrid({ days, chosen, today, onChoose }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 12, marginHorizontal: 10 }}>
      <View style={{ flexDirection: 'row', paddingBottom: 6 }}>
        {words.dates.weekdayInitials.map((letter, index) => (
          <Txt key={index} variant="tiny" weight={800} color="muted" center accessible={false} style={{ flex: 1 }}>
            {letter}
          </Txt>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map(({ day, inMonth, dots }) => {
          const date = fromISODate(day);
          const isToday = day === today;
          const on = day === chosen;
          return (
            <Tap
              key={day}
              accessibilityRole="button"
              accessibilityLabel={words.plan.month.day(words.dates.dayInCalendar(date.getDate(), date.getMonth(), date.getFullYear()), isToday)}
              accessibilityState={{ selected: on }}
              // Said this way, a browser hears which day is chosen as well: the web takes no `accessibilityState`.
              aria-pressed={on}
              onPress={() => onChoose(day)}
              scaleTo={0.92}
              style={{ width: `${100 / 7}%`, minHeight: 46, alignItems: 'center', gap: 3 }}>
              <View style={{ width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? colors.text : 'transparent', borderWidth: on ? 2 : 0, borderColor: colors.accent }}>
                <Txt variant="item" weight={isToday ? 800 : 700} style={{ color: isToday ? colors.bg : inMonth ? colors.text : colors.lineStrong }}>
                  {date.getDate()}
                </Txt>
              </View>
              <TintDots dots={dots} />
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
