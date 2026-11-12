import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SetupProps } from '@/features/templates/types';
import { layout } from '@/theme';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { words } from '@/words';

import type { Unit } from './amounts';

const say = words.crew.walk.setup;

/** How far it is, as typed ("2,100", "2100 km", "500 000"), in the board's own measure: metres for kilometres, steps for steps. Null when it isn't a distance. */
function readGoal(typed: string, unit: Unit): number | null {
  const text = typed
    .trim()
    .toLowerCase()
    .replace(/\s*(km|steps?)$/, '')
    .replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const goal = Math.round(Number(text) * (unit === 'steps' ? 1 : 1000));
  return goal >= 1 && goal <= 100_000_000_000 ? goal : null;
}

/**
 * What a walk needs before it starts: where from and where to (names only: no map is loaded), what is
 * counted, and how far it is. Without the distance there is nothing to walk towards, so Start waits for it.
 */
export function WalkTogetherSetup({ onChange }: SetupProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [unit, setUnit] = useState<Unit>('km');
  const [far, setFar] = useState('');
  const goal = readGoal(far, unit);

  useEffect(() => {
    onChange(goal === null ? null : { title: to.trim() ? say.titleFor(to.trim()) : undefined, settings: { from: from.trim() || undefined, to: to.trim() || undefined, unit, goal } });
  }, [from, to, unit, goal, onChange]);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.from} value={from} onChangeText={setFrom} maxLength={60} placeholder={say.fromPlaceholder} />
        <Field label={say.to} value={to} onChangeText={setTo} maxLength={60} placeholder={say.toPlaceholder} />
      </View>
      <Segmented
        label={say.unit}
        value={unit}
        onChange={setUnit}
        style={{ marginHorizontal: layout.rowGutter }}
        options={[
          { id: 'km', label: say.km },
          { id: 'steps', label: say.steps },
        ]}
      />
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={unit === 'steps' ? say.farSteps : say.farKm} value={far} onChangeText={setFar} keyboardType="decimal-pad" placeholder={unit === 'steps' ? '1,000,000' : '2,100'} note={say.note} />
      </View>
    </View>
  );
}
