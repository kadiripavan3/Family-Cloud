import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { ThingBrief } from '@/api/generated/homeport';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { layout, radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { kindOf } from './kinds';
import { useOpenThing } from './open';

type Props = {
  /** The thing, as every list of mixed kinds gets it from the API. */
  thing: ThingBrief;
  /** The second line, in place of the thing's own few words on where it stands: the words a search found inside it. */
  line?: string | null;
  /**
   * "tile" stands alone in a list, its icon on a tile and its audience chip at the end (search). "grouped"
   * is one of several in a `RowGroup` card, with an arrow at the end (a person's page, links, a guest pass).
   */
  look?: 'tile' | 'grouped';
  /** For "grouped": the first row in its card has no line above it. */
  first?: boolean;
  /** Shown at the end, in place of the chip or the arrow: a tick on a guest pass. */
  trailing?: ReactNode;
  /** What pressing does, in place of opening the thing. */
  onPress?: () => void;
  /**
   * For a list to pick things from (what goes on a guest pass): the row is a box to tick, and this says
   * whether it is ticked. Give `onPress` to tick it and `trailing` to draw the tick.
   */
  picked?: boolean;
  /** What a screen reader says in place of the row's own title, kind and line. */
  spoken?: string;
};

/**
 * A thing of any kind as a row: an icon by its kind, its title, a line on where it stands (`glance`), and
 * who sees it. Pressing opens the thing, whatever kind it is.
 */
export function ThingRow({ thing, line, look = 'tile', first, trailing, onPress, picked, spoken }: Props) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const kind = kindOf(thing.kind);
  const Icon = kind.icon;
  const title = words.things.titleOr(thing.title, thing.kind);
  const second = line ?? thing.glance ?? null;
  const tile = look === 'tile';
  return (
    <Pressable
      accessibilityRole={picked === undefined ? 'button' : 'checkbox'}
      accessibilityLabel={spoken ?? words.things.row(title, kind.name, second)}
      accessibilityState={picked === undefined ? undefined : { checked: picked }}
      // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
      aria-checked={picked}
      onPress={onPress ?? (() => open(thing))}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? colors.fill : 'transparent' },
        tile ? { minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter } : { minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line },
      ]}>
      {tile ? (
        <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
          <Icon size={20} color={colors.text} />
        </View>
      ) : (
        <Icon size={22} color={colors.text} />
      )}
      <View style={{ flex: 1, gap: tile ? 3 : 1 }}>
        <Txt variant="item" weight={tile ? 700 : 600} numberOfLines={1}>
          {title}
        </Txt>
        {second ? (
          <Txt variant="footnote" color="muted" numberOfLines={tile ? 1 : 2}>
            {second}
          </Txt>
        ) : null}
      </View>
      {trailing ?? (tile ? <AudienceChip thing={thing} quiet /> : <ChevronRight size={18} color={colors.muted} />)}
    </Pressable>
  );
}
