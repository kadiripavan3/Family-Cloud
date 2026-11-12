import { Search } from 'lucide-react-native';
import { View } from 'react-native';

import type { CircleResponse } from '@/api/generated/homeport';
import { layout, radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import type { HomePlace } from './places';

type Props = {
  /** The place that is showing: the pill says what a search from here finds. */
  place: HomePlace;
  /** The current circle: the round button carries its kind's emoji. */
  circle: CircleResponse;
  onSearch: () => void;
  onCircle: () => void;
};

/** The pill at the top of Home: pressing it searches, and the round button at its end changes the circle. */
export function SearchPill({ place, circle, onSearch, onCircle }: Props) {
  const { colors, shadow } = useTheme();
  const says = words.search.pill[place];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 62, marginTop: 10, marginHorizontal: layout.barGutter, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
      <Tap accessibilityRole="button" accessibilityLabel={says.title} onPress={onSearch} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, paddingLeft: 22 }}>
        <Search size={22} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Txt variant="item" numberOfLines={1}>
            {says.title}
          </Txt>
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {says.sub}
          </Txt>
        </View>
      </Tap>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={words.circles.switchLabel(circle.name)}
        onPress={onCircle}
        scaleTo={0.9}
        style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
        <Emoji char={words.kinds[circle.kind].emoji} size={25} />
      </Tap>
    </View>
  );
}
