import { ChevronRight, Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  name: string;
  avatarUrl?: string | null;
  /** The line under the name. */
  line?: string;
  /** True for the signed-in person's own row: it carries the small "You". */
  you?: boolean;
  /** A round plus in place of a picture, for the row that adds someone. */
  add?: boolean;
  /** What a screen reader says for the row when it can be pressed. */
  spoken?: string;
  onPress?: () => void;
  /** Shown at the right in place of the arrow, such as the pill that changes a role. */
  trailing?: ReactNode;
};

/** A person in a list: their picture, their name, a line about them, and an arrow when the row opens their page. */
export function PersonRow({ name, avatarUrl, line, you, add, spoken, onPress, trailing }: Props) {
  const { colors } = useTheme();
  const content = (
    <>
      {add ? (
        <View style={{ width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
          <Plus size={22} color={colors.text} />
        </View>
      ) : (
        <Avatar uri={avatarUrl} name={name} size={48} />
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt variant="item" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Txt>
          {you ? (
            <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.chip, backgroundColor: colors.fill }}>
              <Txt variant="micro" color="muted">
                {words.people.you}
              </Txt>
            </View>
          ) : null}
        </View>
        {line ? (
          <Txt variant="caption" weight={500} color="muted" numberOfLines={1}>
            {line}
          </Txt>
        ) : null}
      </View>
      {trailing ?? (onPress && !add ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 9, paddingHorizontal: layout.rowGutter } as const;
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken ?? words.common.spoken([name, line])} onPress={onPress} style={({ pressed }) => [frame, { backgroundColor: pressed ? colors.fill : 'transparent' }]}>
      {content}
    </Pressable>
  );
}
