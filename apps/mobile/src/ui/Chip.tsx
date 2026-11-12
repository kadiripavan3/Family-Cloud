import type { ReactNode } from 'react';

import { radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Emoji } from './Emoji';
import { Tap } from './Motion';
import { Txt } from './Txt';

type Props = {
  label: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  /** "choice" is for picking several; "filter" is for one-of-many filters. */
  tone?: 'choice' | 'filter';
  icon?: ReactNode;
  /** A number shown after the label, quieter than it: how many there are of this. */
  count?: number;
};

/** A rounded, tappable label. */
export function Chip({ label, emoji, selected, onPress, tone = 'choice', icon, count }: Props) {
  const { colors } = useTheme();
  const filter = tone === 'filter';
  const bg = selected ? (filter ? colors.text : colors.fill) : colors.bg;
  const fg = selected && filter ? colors.bg : colors.text;
  return (
    <Tap
      scaleTo={0.94}
      accessibilityRole={filter ? 'button' : 'checkbox'}
      accessibilityState={filter ? { selected: !!selected } : { checked: !!selected }}
      accessibilityLabel={count === undefined ? label : words.common.withCount(label, count)}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: filter ? 6 : 8,
        paddingVertical: filter ? 9 : 10,
        paddingHorizontal: filter ? 14 : 15,
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: selected && !filter ? 2 : 1.5,
        borderColor: selected ? colors.text : colors.line,
        margin: selected && !filter ? 0 : filter ? 0 : 0.5,
      }}>
      {icon}
      {emoji ? <Emoji char={emoji} size={filter ? 20 : 24} /> : null}
      <Txt variant={filter ? 'note' : 'control'} weight={700} style={{ color: fg }}>
        {label}
      </Txt>
      {count === undefined ? null : (
        <Txt variant="small" weight={600} style={{ color: fg, opacity: 0.6 }}>
          {count}
        </Txt>
      )}
    </Tap>
  );
}
