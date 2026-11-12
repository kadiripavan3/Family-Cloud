import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SetupProps } from '@/features/templates/types';
import { layout } from '@/theme';
import { Field } from '@/ui/Field';
import { words } from '@/words';

const say = words.crew.whereNext.setup;

/**
 * What "Where next?" asks before it starts: what the vote is called, and when the trip would be, in the
 * crew's own words ("Spring 2027"). Both can be left empty.
 */
export function WhereNextSetup({ onChange }: SetupProps) {
  const [name, setName] = useState('');
  const [when, setWhen] = useState('');
  useEffect(() => {
    onChange({ title: name.trim() || undefined, settings: when.trim() ? { when: when.trim() } : {} });
  }, [name, when, onChange]);
  return (
    <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.name} value={name} onChangeText={setName} maxLength={200} placeholder={say.namePlaceholder} />
      <Field label={say.when} value={when} onChangeText={setWhen} maxLength={60} placeholder={say.whenPlaceholder} />
    </View>
  );
}
