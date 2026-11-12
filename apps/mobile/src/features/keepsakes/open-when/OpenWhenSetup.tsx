import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { membersOf } from '@/features/circles/members';
import { PersonChips } from '@/features/templates/parts/People';
import type { SetupProps } from '@/features/templates/types';
import { layout } from '@/theme';
import { GroupLabel } from '@/ui/Heading';
import { words } from '@/words';

/** What "Open when…" needs before it starts: who the letters are for. One of the circle's people, not a pet and not yourself. */
export function OpenWhenSetup({ circle, onChange }: SetupProps) {
  const people = membersOf(circle).filter((member) => member.kind !== 'pet' && member.id !== circle.myMemberId);
  const [forId, setForId] = useState<string | null>(null);
  useEffect(() => {
    onChange(forId ? { settings: { forMemberId: forId } } : null);
  }, [forId, onChange]);
  return (
    <View>
      <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{words.keepsakes.openWhen.setup.forWhom}</GroupLabel>
      <PersonChips inset people={people} value={forId} onChange={setForId} />
    </View>
  );
}
