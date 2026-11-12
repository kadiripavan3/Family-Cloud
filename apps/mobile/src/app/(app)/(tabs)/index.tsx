import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentType, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircleSwitchSheet } from '@/features/circles/CircleSwitchSheet';
import { useCircle } from '@/features/circles/current';
import { HOME_PLACES, type HomePlace, isShut, PLACE_EMOJI, placeFrom } from '@/features/home/places';
import { PlaceShut } from '@/features/home/PlaceShut';
import { SearchPill } from '@/features/home/SearchPill';
import { LibraryHome } from '@/features/library/LibraryHome';
import { MoneyHome } from '@/features/money/MoneyHome';
import { NotesHome } from '@/features/notes/NotesHome';
import { PlanHome } from '@/features/plan/PlanHome';
import { TodayHome } from '@/features/today/TodayHome';
import { VaultHome } from '@/features/vault/VaultHome';
import { useTheme } from '@/theme';
import { EmojiTabs } from '@/ui/EmojiTabs';
import { words } from '@/words';

/** What stands under the row of six, by the place that is chosen. Each is one component in its place's own folder. */
const PLACES: Record<HomePlace, ComponentType> = { today: TodayHome, plan: PlanHome, notes: NotesHome, library: LibraryHome, money: MoneyHome, vault: VaultHome };

const TABS = HOME_PLACES.map((id) => ({ id, label: words.common.places[id], emoji: PLACE_EMOJI[id] }));

/**
 * 3 Home: the search pill with the round circle button, the row of six places, and under it the chosen
 * place. Which place is showing is part of the address ("/?place=money"), so a link can open Home on any of
 * them. The pill and the row stay; the place has the rest of the screen and scrolls by itself.
 */
export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const place = placeFrom(useLocalSearchParams<{ place?: string }>().place);
  const [choosingCircle, setChoosingCircle] = useState(false);
  const Place = PLACES[place];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <SearchPill
        place={place}
        circle={circle}
        onSearch={() => router.push(place === 'today' ? '/search' : { pathname: '/search', params: { place } })}
        onCircle={() => setChoosingCircle(true)}
      />
      <EmojiTabs six tabs={TABS} value={place} onChange={(next) => router.setParams({ place: next === 'today' ? undefined : next })} />
      {/* Another circle is another Home: nothing a place remembers of the last circle is carried over. */}
      <View key={circle.id} style={{ flex: 1 }}>
        {isShut(circle, place) ? <PlaceShut place={place} circle={circle} /> : <Place />}
      </View>
      <CircleSwitchSheet visible={choosingCircle} onClose={() => setChoosingCircle(false)} />
    </SafeAreaView>
  );
}
