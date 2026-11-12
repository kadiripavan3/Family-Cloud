import { View } from 'react-native';

import type { DayDotsResponse } from '@/api/generated/homeport';
import { formatWeekdayDay, fromISODate, weekdayOf } from '@/lib/dates';
import { radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { TintDots } from './tints';

type Props = {
  /** The seven days of a week, Monday first, each with a dot per person who has something on it. */
  week: readonly DayDotsResponse[];
  /** The day whose list is showing. */
  chosen: string;
  today: string;
  onChoose: (day: string) => void;
};

/**
 * The strip of seven days at the top of Plan: the letter of each day, its number, and its dots. Today is the
 * filled one; a day that was picked instead wears a ring. Pressing a day shows the list from that day on.
 */
export function WeekStrip({ week, chosen, today, onChoose }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: 10 }}>
      {week.map(({ day, dots }) => {
        const isToday = day === today;
        const on = day === chosen;
        return (
          <Tap
            key={day}
            accessibilityRole="button"
            accessibilityLabel={words.plan.home.weekDay(formatWeekdayDay(day), isToday)}
            accessibilityState={{ selected: on }}
            // Said this way, a browser hears which day is chosen as well: the web takes no `accessibilityState`.
            aria-pressed={on}
            onPress={() => onChoose(day)}
            scaleTo={0.94}
            style={{ flex: 1, alignItems: 'center', gap: 5, paddingBottom: 4 }}>
            <Txt variant="tiny" color="muted">
              {words.dates.weekdayInitials[weekdayOf(day)]}
            </Txt>
            <View style={{ width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? colors.text : 'transparent', borderWidth: on && !isToday ? 2 : 0, borderColor: colors.accent }}>
              <Txt variant="headline" weight={800} style={{ color: isToday ? colors.bg : colors.text }}>
                {fromISODate(day).getDate()}
              </Txt>
            </View>
            <TintDots dots={dots} />
          </Tap>
        );
      })}
    </View>
  );
}
