import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SetupProps } from '@/features/templates/types';
import { addDays, formatDayFull, fromISODate, today, toISODate } from '@/lib/dates';
import { layout } from '@/theme';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { words } from '@/words';

const say = words.crew.predictions.setup;

/** The same day five years on: how far out the predictions look unless the crew says otherwise. */
function fiveYearsOn(day: string): string {
  const date = fromISODate(day);
  date.setFullYear(date.getFullYear() + 5);
  return toISODate(date);
}

/**
 * What Predictions asks before it starts: the day they open (after today; five years on unless another is
 * chosen) and what that day is, in the crew's words. The name follows the year they open in, unless one is typed.
 */
export function PredictionsSetup({ onChange }: SetupProps) {
  const [name, setName] = useState('');
  const [opensOn, setOpensOn] = useState(fiveYearsOn(today()));
  const [occasion, setOccasion] = useState('');
  const [picking, setPicking] = useState(false);
  const year = fromISODate(opensOn).getFullYear();

  useEffect(() => {
    onChange({ title: name.trim() || say.titleFor(year), settings: { opensOn, occasion: occasion.trim() || undefined } });
  }, [name, opensOn, occasion, year, onChange]);

  return (
    <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.name} value={name} onChangeText={setName} maxLength={200} placeholder={say.titleFor(year)} />
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.opensOn} value={formatDayFull(opensOn)} onPress={() => setPicking(true)} />
      </View>
      <Field label={say.occasion} value={occasion} onChangeText={setOccasion} maxLength={80} placeholder={say.occasionPlaceholder} />
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.opensOn} value={opensOn} min={addDays(today(), 1)} byYear onChange={setOpensOn} />
    </View>
  );
}
