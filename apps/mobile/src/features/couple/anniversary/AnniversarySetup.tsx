import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SetupProps } from '@/features/templates/types';
import { formatDayFull, today } from '@/lib/dates';
import { layout } from '@/theme';
import { DayPicker } from '@/ui/DayPicker';
import { FieldButton } from '@/ui/Field';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const say = words.couple.anniversary.setup;

/** What the anniversary questions need before they start: the day it all began. The anniversary is that day of every year. */
export function AnniversarySetup({ onChange }: SetupProps) {
  const [since, setSince] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    onChange(since ? { settings: { since } } : null);
  }, [since, onChange]);
  return (
    <View style={{ gap: 8, paddingHorizontal: layout.rowGutter }}>
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.since} value={since ? formatDayFull(since) : say.choose} onPress={() => setPicking(true)} />
      </View>
      <Txt variant="footnote" color="muted">
        {say.note}
      </Txt>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.since} value={since ?? today()} max={today()} byYear onChange={setSince} />
    </View>
  );
}
