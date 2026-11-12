import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';

type Props = {
  /** What stands in front: a time, a day or an amount as words, a tick, an icon or an emoji. */
  front: ReactNode;
  /** Room for a figure of a few words in front ("3 sleeps"); a time or an amount needs no more than the usual. */
  wideFront?: boolean;
  title: string;
  note?: string | null;
  /** How many lines the title and the note may each take. A day's own things keep to one. */
  lines?: number;
  /** What a screen reader says for the line. */
  spoken: string;
  onPress: () => void;
  /** At the end, inside the line: the faces of the people it concerns, an arrow. */
  end?: ReactNode;
  /** At the end, beside the line: its button, pressed on its own. */
  button?: ReactNode;
  /** The first line in its card has no rule above it. */
  first: boolean;
};

/**
 * One line of Today's list, the same whatever sent it (a thing of the day, or a card from one of the
 * circle's templates): something in front, a title and a small line, and at the end faces, an arrow or a
 * button. Pressing the line opens its thing; a button beside it is pressed by itself.
 */
export function TodayLine({ front, wideFront, title, note, lines = 1, spoken, onPress, end, button, first }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Tap accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 12, paddingLeft: 14, paddingRight: button ? 12 : 14 }}>
        <View style={wideFront ? { minWidth: 44, maxWidth: 96, alignItems: 'flex-start' } : { width: 44, alignItems: 'flex-start' }}>{front}</View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="item" numberOfLines={lines}>
            {title}
          </Txt>
          {note ? (
            <Txt variant="footnote" color="muted" numberOfLines={lines}>
              {note}
            </Txt>
          ) : null}
        </View>
        {end}
      </Tap>
      {button ? <View style={{ paddingRight: 14 }}>{button}</View> : null}
    </View>
  );
}

/** A time, a day, an amount or a figure in front of a line: "15:30", "Fri", "€42", "59%". */
export function FrontWords({ children }: { children: string }) {
  return (
    <Txt variant="note" weight={800} numberOfLines={1}>
      {children}
    </Txt>
  );
}
