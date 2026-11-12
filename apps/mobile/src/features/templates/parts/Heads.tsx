import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Emoji } from '@/ui/Emoji';
import { Txt } from '@/ui/Txt';

type BlobProps = {
  emoji: string;
  title: string;
  line?: string | null;
  /** How much of a wait is over, 0 to 100: a thin bar under the line. */
  progress?: number;
  /** A smaller round picture and less room under it, for a page whose list starts right below. */
  tight?: boolean;
};

/** The top of a keepsake's page: a big emoji on a soft circle, its name, and a line under it. */
export function BlobHead({ emoji, title, line, progress, tight }: BlobProps) {
  const { colors } = useTheme();
  const size = tight ? 96 : 120;
  return (
    <View style={{ alignItems: 'center', gap: 4, marginTop: 6, marginHorizontal: 24, marginBottom: tight ? 14 : 18 }}>
      <View style={{ width: size, height: size, marginBottom: 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
        <Emoji char={emoji} size={tight ? 55 : 70} />
      </View>
      <Txt variant="titleLarge" accessibilityRole="header" center style={{ marginTop: 6 }}>
        {title}
      </Txt>
      {line ? (
        <Txt variant="note" weight={600} color="muted" center>
          {line}
        </Txt>
      ) : null}
      {progress === undefined ? null : (
        <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }} style={{ width: 180, height: 6, marginTop: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
          <View style={{ width: `${Math.min(Math.max(progress, 0), 100)}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
        </View>
      )}
    </View>
  );
}

/** The top of a page about one person: their picture (or their initials), a title and a line. */
export function PersonHead({ uri, name, title, line }: { uri?: string | null; name: string; title: string; line?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2, marginHorizontal: 20, marginBottom: 16 }}>
      <Avatar uri={uri} name={name} size={84} />
      <View style={{ flex: 1 }}>
        <Txt variant="title" accessibilityRole="header">
          {title}
        </Txt>
        {line ? (
          <Txt variant="note" weight={600} color="muted">
            {line}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}
