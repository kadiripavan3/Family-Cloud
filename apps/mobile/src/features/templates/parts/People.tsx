import { ScrollView } from 'react-native';

import type { MemberResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Chip';

type Props = {
  people: readonly MemberResponse[];
  /** The chosen person's member id, or null while nobody is chosen. */
  value: string | null;
  onChange: (memberId: string) => void;
  /** Inside a sheet, whose own padding the row runs through. */
  inset?: boolean;
};

/** One of the circle's people, picked from a row of chips with their pictures: who said it, whose mark it is. */
export function PersonChips({ people, value, onChange, inset }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: inset ? layout.rowGutter : layout.barGutter }}>
      {people.map((person) => (
        <Chip key={person.id} tone="filter" label={firstName(person.name)} selected={person.id === value} onPress={() => onChange(person.id)} icon={<Avatar uri={person.avatarUrl} name={person.name} size={22} />} />
      ))}
    </ScrollView>
  );
}
