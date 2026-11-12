import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  /** What stands first: a face or a tile, 44 points wide. */
  leading: ReactNode;
  title: string;
  line?: string | null;
  /** Shown at the end: an arrow, a lock. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** What a screen reader says in place of the title and the line. */
  spoken?: string;
};

/** A row that stands on the page itself, not in a card: a date there has been, a deck that is also being decided. */
export function UpRow({ leading, title, line, trailing, onPress, spoken }: Props) {
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" weight={700} numberOfLines={2}>
          {title}
        </Txt>
        {line ? (
          <Txt variant="footnote" color="muted" numberOfLines={2}>
            {line}
          </Txt>
        ) : null}
      </View>
      {trailing}
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: 20 } as const;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken ?? words.common.spoken([title, line])} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken ?? words.common.spoken([title, line])} scaleTo={0.98} onPress={onPress} style={frame}>
      {content}
    </Tap>
  );
}
