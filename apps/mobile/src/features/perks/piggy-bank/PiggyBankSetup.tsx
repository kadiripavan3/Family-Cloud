import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { membersOf } from '@/features/circles/members';
import { PersonChips } from '@/features/templates/parts/People';
import type { SetupProps } from '@/features/templates/types';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { GroupLabel } from '@/ui/Heading';
import { words } from '@/words';

/**
 * What a piggy bank needs before it starts: whose it is. The children stand first; it is named after its
 * child ("Mia's piggy bank"). The interest and what a star is worth are the bank's rules, set on its page.
 */
export function PiggyBankSetup({ circle, onChange }: SetupProps) {
  const people = membersOf(circle).filter((member) => member.kind !== 'pet');
  const order = [...people.filter((member) => member.kind === 'child'), ...people.filter((member) => member.kind !== 'child')];
  const [forId, setForId] = useState<string | null>(null);
  const child = order.find((member) => member.id === forId);
  const name = child ? firstName(child.name) : null;
  useEffect(() => {
    onChange(forId && name ? { title: words.perks.piggyBank.setup.title(name), settings: { forMemberId: forId } } : null);
  }, [forId, name, onChange]);
  return (
    <View>
      <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{words.perks.piggyBank.setup.forWhom}</GroupLabel>
      <PersonChips inset people={order} value={forId} onChange={setForId} />
    </View>
  );
}
