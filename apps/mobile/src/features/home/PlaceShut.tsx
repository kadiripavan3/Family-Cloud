import { View } from 'react-native';

import type { CircleResponse } from '@/api/generated/homeport';
import { EmptyState } from '@/ui/EmptyState';
import { words } from '@/words';

import type { HomePlace } from './places';

/** In place of Money or the Vault for a teen or a child: the place is there, and says plainly that it is shut for them. */
export function PlaceShut({ place, circle }: { place: HomePlace; circle: CircleResponse }) {
  const name = words.common.places[place];
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 120 }}>
      <EmptyState emoji="🔒" title={words.today.shut.title(name)} body={words.today.shut.body(name, circle.name)} />
    </View>
  );
}
