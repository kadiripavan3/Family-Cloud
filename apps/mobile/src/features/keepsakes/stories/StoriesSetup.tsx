import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SetupProps } from '@/features/templates/types';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Field } from '@/ui/Field';
import { words } from '@/words';

const say = words.keepsakes.stories.setup;

/** What the stories need before they start: whose they are. Someone outside the circle, who gets a link a week and needs no app. */
export function StoriesSetup({ onChange }: SetupProps) {
  const [name, setName] = useState('');
  useEffect(() => {
    const teller = name.trim();
    onChange(teller ? { title: say.name(firstName(teller)), settings: { tellerName: teller } } : null);
  }, [name, onChange]);
  return (
    <View style={{ paddingHorizontal: layout.rowGutter }}>
      <Field label={say.teller} value={name} onChangeText={setName} maxLength={50} placeholder={say.tellerPlaceholder} note={say.note} autoCapitalize="words" />
    </View>
  );
}
