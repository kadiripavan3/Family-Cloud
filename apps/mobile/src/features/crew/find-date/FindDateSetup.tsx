import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SetupProps } from '@/features/templates/types';
import { addDays, daysBetween, formatWeekday, today } from '@/lib/dates';
import { layout } from '@/theme';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { words } from '@/words';

const say = words.crew.findDate.setup;
/** The API offers 62 days at most. */
const LONGEST = 61;

/**
 * What "When can everyone?" asks before it starts: what it is for (the name the day gets in the calendar,
 * and what people with the link read), and the first and last day to offer. It starts as it is too: the
 * three weeks from today.
 */
export function FindDateSetup({ onChange }: SetupProps) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(addDays(today(), 20));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  useEffect(() => {
    onChange({ title: name.trim() || undefined, settings: { from, to } });
  }, [name, from, to, onChange]);

  const startOn = (day: string) => {
    setFrom(day);
    // The last day follows when it would fall before the first, or further off than the API offers.
    if (to < day || daysBetween(day, to) > LONGEST) setTo(addDays(day, 20));
  };

  return (
    <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.name} value={name} onChangeText={setName} maxLength={200} placeholder={say.namePlaceholder} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <FieldButton label={say.from} value={formatWeekday(from)} onPress={() => setPicking('from')} />
        <FieldButton label={say.to} value={formatWeekday(to)} onPress={() => setPicking('to')} />
      </View>
      <DayPicker visible={picking === 'from'} onClose={() => setPicking(null)} title={say.from} value={from} min={today()} onChange={startOn} />
      <DayPicker visible={picking === 'to'} onClose={() => setPicking(null)} title={say.to} value={to} min={from} max={addDays(from, LONGEST)} onChange={setTo} />
    </View>
  );
}
