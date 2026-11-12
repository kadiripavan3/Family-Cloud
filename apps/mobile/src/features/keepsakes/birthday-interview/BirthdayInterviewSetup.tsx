import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { membersOf } from '@/features/circles/members';
import { PersonChips } from '@/features/templates/parts/People';
import type { SetupProps } from '@/features/templates/types';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { GroupLabel } from '@/ui/Heading';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const say = words.keepsakes.interview.setup;

/**
 * What the birthday interview needs before it starts: whose it is. The ages come from their birthday, so
 * someone whose page has none can be chosen but not started with: the note says where to add it.
 */
export function BirthdayInterviewSetup({ circle, onChange }: SetupProps) {
  const people = membersOf(circle).filter((member) => member.kind !== 'pet');
  const [forId, setForId] = useState<string | null>(null);
  const chosen = people.find((member) => member.id === forId);
  useEffect(() => {
    onChange(chosen?.birthday ? { title: say.name(firstName(chosen.name)), settings: { forMemberId: chosen.id } } : null);
  }, [chosen, onChange]);
  return (
    <View>
      <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{say.forWhom}</GroupLabel>
      <PersonChips inset people={people} value={forId} onChange={setForId} />
      {chosen && !chosen.birthday ? (
        <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {say.noBirthday(firstName(chosen.name))}
        </Txt>
      ) : null}
    </View>
  );
}
