import { ChevronRight } from 'lucide-react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { layout, radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Emoji } from './Emoji';
import { Tap } from './Motion';
import { Txt } from './Txt';

type Props = {
  emoji: string;
  /** The bold part: what pressing it does. */
  title: string;
  /** Said after it, lighter: what that could be. */
  rest?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** One more way on, as a soft row: an emoji, a bold line with a few lighter words after it, and an arrow. */
export function MoreRow({ emoji, title, rest, onPress, style }: Props) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([title, rest])}
      onPress={onPress}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, marginTop: 12, marginHorizontal: layout.barGutter, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.photo, backgroundColor: colors.fill }, style]}>
      <Emoji char={emoji} size={26} />
      <Txt variant="callout" weight={700} numberOfLines={2} style={{ flex: 1 }}>
        <Txt variant="callout" weight={800}>
          {title}
        </Txt>
        {rest ? words.common.after(rest) : null}
      </Txt>
      <ChevronRight size={18} color={colors.muted} />
    </Tap>
  );
}
