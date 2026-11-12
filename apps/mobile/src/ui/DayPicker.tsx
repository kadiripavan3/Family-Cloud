import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { fromISODate, toISODate } from '@/lib/dates';
import { layout, radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Sheet } from './Sheet';
import { Txt } from './Txt';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** The chosen day, as "2026-04-03". */
  value: string;
  onChange: (day: string) => void;
  /** The earliest and latest days that can be picked. */
  min?: string;
  max?: string;
};

/** A month calendar in a sheet, for picking one day. Days outside the allowed range are greyed out. */
export function DayPicker({ visible, onClose, title, value, onChange, min, max }: Props) {
  const { colors } = useTheme();
  const chosen = fromISODate(value);
  const [shown, setShown] = useState({ year: chosen.getFullYear(), month: chosen.getMonth() });
  // Each time the sheet opens it starts on the month of the chosen day, not on the month it was left on.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setShown({ year: chosen.getFullYear(), month: chosen.getMonth() });
  }

  const first = new Date(shown.year, shown.month, 1);
  const blanks = (first.getDay() + 6) % 7; // weeks start on Monday
  const count = new Date(shown.year, shown.month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const move = (by: number) => {
    const next = new Date(shown.year, shown.month + by, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
  };
  const lastOfPrevious = toISODate(new Date(shown.year, shown.month, 0));
  const firstOfNext = toISODate(new Date(shown.year, shown.month + 1, 1));
  const canGoBack = !min || lastOfPrevious >= min;
  const canGoForward = !max || firstOfNext <= max;

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingHorizontal: layout.barGutter, paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 8 }}>
          <MonthButton label={words.dates.previousMonth} disabled={!canGoBack} onPress={() => move(-1)} icon={<ChevronLeft size={20} color={colors.text} />} />
          <Txt variant="headline" accessibilityLiveRegion="polite" weight={800}>
            {words.dates.month(shown.month, shown.year)}
          </Txt>
          <MonthButton label={words.dates.nextMonth} disabled={!canGoForward} onPress={() => move(1)} icon={<ChevronRight size={20} color={colors.text} />} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          {words.dates.weekdayInitials.map((d, i) => (
            <Txt key={i} variant="label" color="muted" center accessible={false} style={{ flex: 1, paddingVertical: 6 }}>
              {d}
            </Txt>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 46 }} />;
            const iso = toISODate(new Date(shown.year, shown.month, day));
            const off = (min !== undefined && iso < min) || (max !== undefined && iso > max);
            const on = iso === value;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={words.dates.dayInCalendar(day, shown.month, shown.year)}
                accessibilityState={{ selected: on, disabled: off }}
                disabled={off}
                onPress={() => {
                  onChange(iso);
                  onClose();
                }}
                style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.accent : 'transparent' }}>
                  <Txt variant="item" weight={on ? 800 : 600} style={{ color: on ? colors.onAccent : colors.text, opacity: off ? 0.3 : 1 }}>
                    {day}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

function MonthButton({ label, disabled, onPress, icon }: { label: string; disabled: boolean; onPress: () => void; icon: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{ width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, opacity: disabled ? 0.35 : 1 }}>
      {icon}
    </Pressable>
  );
}
