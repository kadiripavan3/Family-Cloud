import { ChevronRight, Lock } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Emoji } from '@/ui/Emoji';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type RowProps = {
  /** What stands first: a person's picture (`Face`), an icon or an emoji on a tile (`Tile`). */
  leading?: ReactNode;
  title: string;
  /** The smaller line under the title. "ok" is the green of something that went well ("She opened it"). */
  line?: string | null;
  lineTone?: 'muted' | 'ok';
  /** Shown at the end: a lock, an arrow, a switch. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** The first row in its card has no line above it. */
  first?: boolean;
  /** What a screen reader says in place of the title and the line. */
  spoken?: string;
};

/**
 * One row in a card of rows on a board (`RowGroup` from src/ui is the card): something first, two lines, and
 * something at the end. A sealed letter, a slip in the jar, a switch with its sentence.
 */
export function BoardRow({ leading, title, line, lineTone = 'muted', trailing, onPress, first, spoken }: RowProps) {
  const { colors } = useTheme();
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line } as const;
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600}>
          {title}
        </Txt>
        {line ? (
          <Txt variant="footnote" weight={lineTone === 'ok' ? 700 : 500} color={lineTone}>
            {line}
          </Txt>
        ) : null}
      </View>
      {trailing}
    </>
  );
  // A row that opens nothing is plain content, so a switch inside it stays a control of its own.
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken ?? words.common.spoken([title, line])} onPress={onPress} style={({ pressed }) => [frame, { backgroundColor: pressed ? colors.fill : 'transparent' }]}>
      {content}
    </Pressable>
  );
}

/** A person at the start of a row: their picture, or their initials. */
export function Face({ uri, name, size = 34 }: { uri?: string | null; name: string; size?: number }) {
  return <Avatar uri={uri} name={name} size={size} />;
}

/** An icon or an emoji on a small grey tile at the start of a row. */
export function Tile({ emoji, icon, size = 34 }: { emoji?: string | null; icon?: (color: string) => ReactNode; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size > 40 ? radius.thumb : radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
      {emoji ? <Emoji char={emoji} size={Math.round(size * 0.53)} /> : icon?.(colors.text)}
    </View>
  );
}

/** At the end of a row that is sealed: a small lock. */
export function Sealed() {
  const { colors } = useTheme();
  return <Lock size={18} color={colors.muted} />;
}

/** At the end of a row that opens something. */
export function Arrow() {
  const { colors } = useTheme();
  return <ChevronRight size={18} color={colors.muted} />;
}
