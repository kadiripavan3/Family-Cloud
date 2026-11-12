import { View } from 'react-native';

import { radius, type TypeVariant, useTheme } from '@/theme';
import { words } from '@/words';

import { Txt } from './Txt';
import { Tap } from './Motion';

type Props = {
  /** What to show, already written the way it should read: "1.2k", "48 GB". */
  value: string | number;
  label: string;
  /** What a screen reader says in place of the value, when the value is shortened. */
  spoken?: string | number;
  /** A thin line before this one: at its left in a row, above it in a stack. */
  divider?: boolean;
  onPress?: () => void;
  /** A small dot before the value, in this colour. */
  dot?: string;
  /** "row" is one of several side by side, centred. "stack" is one under another, left aligned. */
  layout?: 'row' | 'stack';
  /** The text style of the value. */
  size?: Extract<TypeVariant, 'subheading' | 'titleSmall' | 'title'>;
  /** A colour for both lines, for a stat that sits on a photo. */
  color?: string;
};

/** A number with a word under it: "3 circles", "214 notes". */
export function Stat({ value, label, spoken, divider, onPress, dot, layout = 'row', size = 'subheading', color }: Props) {
  const { colors } = useTheme();
  const row = layout === 'row';
  const frame = row
    ? ({ flex: 1, alignItems: 'center', paddingHorizontal: 4, borderLeftWidth: divider ? 1 : 0, borderLeftColor: colors.line } as const)
    : ({ paddingVertical: 8, borderTopWidth: divider ? 1 : 0, borderTopColor: colors.line } as const);
  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: dot }} /> : null}
        <Txt variant={size} numberOfLines={1} style={color ? { color } : undefined}>
          {value}
        </Txt>
      </View>
      <Txt variant={row ? 'small' : 'tiny'} color="muted" style={color ? { color, opacity: 0.8 } : undefined}>
        {label}
      </Txt>
    </>
  );
  const says = words.common.stat(spoken ?? value, label);
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={says} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={says} onPress={onPress} style={frame}>
      {content}
    </Tap>
  );
}
