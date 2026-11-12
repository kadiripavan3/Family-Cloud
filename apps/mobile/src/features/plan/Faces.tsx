import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';

type Face = { name?: string | null; avatarUrl?: string | null };

type Props = {
  /** Whose faces, in order. A line of the day's list knows only their pictures. */
  people: readonly Face[];
  /** 22 on a card or in a row, 28 next to "9 going". */
  size?: number;
  /** How many at most. */
  most?: number;
  /** The colour around each face: what it lies on. The card's own by default. */
  ring?: string;
};

/** A few small faces overlapping in a row: who something concerns. */
export function Faces({ people, size = 22, most = 3, ring }: Props) {
  const { colors } = useTheme();
  if (people.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.slice(0, most).map((person, index) => (
        <View key={`${person.avatarUrl ?? person.name ?? ''}-${index}`} style={{ marginLeft: index === 0 ? 0 : -8 }}>
          <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={size} ring={ring ?? colors.surface} />
        </View>
      ))}
    </View>
  );
}

/** The same, from pictures alone. */
export function facesOf(avatarUrls: readonly string[] | null | undefined): Face[] {
  return (avatarUrls ?? []).map((avatarUrl) => ({ avatarUrl }));
}
