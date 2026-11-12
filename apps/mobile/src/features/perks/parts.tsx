import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { MemberResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Emoji } from '@/ui/Emoji';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * The small pieces the seven fair-and-fun boards share and no other place draws: the row with a 44-point
 * tile (`.up` in the drawings), the tile itself, the label over a group, and the two pickers their sheets
 * use (a picture for a thing, some of the circle's people).
 */

type UpProps = {
  /** What stands first: an emoji or an icon on a tile, or a face. */
  leading?: ReactNode;
  title: string;
  line?: string | null;
  /** Shown at the end: whose turn it is, an amount, a chip. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** What a screen reader says in place of the title and the line. */
  spoken?: string;
  /** True when what stands at the end is pressed by itself (a tick): the row then opens with its words only. */
  split?: boolean;
};

/** One row of a list: something first, a bold line with a quieter one under it, and something at the end. */
export function Up({ leading, title, line, trailing, onPress, spoken, split }: UpProps) {
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter } as const;
  const text = (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="item">{title}</Txt>
      {line ? (
        <Txt variant="footnote" color="muted">
          {line}
        </Txt>
      ) : null}
    </View>
  );
  const label = spoken ?? words.common.spoken([title, line]);
  if (!onPress) {
    return (
      <View style={frame}>
        {leading}
        {text}
        {trailing}
      </View>
    );
  }
  if (split) {
    return (
      <View style={frame}>
        <Tap accessibilityRole="button" accessibilityLabel={label} scaleTo={0.99} onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {leading}
          {text}
        </Tap>
        {trailing}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} scaleTo={0.99} onPress={onPress} style={frame}>
      {leading}
      {text}
      {trailing}
    </Tap>
  );
}

/** The tile a row starts with: an emoji on grey, as large as the drawings have it there, or an icon ("accent" puts it on the accent's soft ground). */
export function ItemTile({ emoji, icon, tone = 'plain', size = 44 }: { emoji?: string | null; icon?: (color: string) => ReactNode; tone?: 'plain' | 'accent'; size?: number }) {
  const { colors } = useTheme();
  const accent = tone === 'accent';
  return (
    <View style={{ width: size, height: size, borderRadius: size > 50 ? radius.card : radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? colors.accentSoft : colors.fill }}>
      {emoji ? <Emoji char={emoji} size={Math.round(size * 0.6)} /> : icon?.(accent ? colors.accentText : colors.text)}
    </View>
  );
}

/** The small capital line over a group of rows. */
export function Label({ children }: { children: string }) {
  return <GroupLabel style={{ marginHorizontal: layout.gutter }}>{children}</GroupLabel>;
}

/** A number or an amount at the end of a row. */
export function Amount({ children, tone = 'plain' }: { children: string | number; tone?: 'plain' | 'ok' }) {
  return (
    <Txt variant="item" weight={800} color={tone === 'ok' ? 'ok' : 'text'} style={{ fontVariant: ['tabular-nums'] }}>
      {children}
    </Txt>
  );
}

/** The pictures a thing on one of these boards can be given, by the name the catalog has for each. */
export const PICTURES = {
  film: '🎬',
  car: '🚗',
  pizza: '🍕',
  bath: '🛁',
  dog: '🐶',
  trophy: '🏆',
  target: '🎯',
  basket: '🧺',
  tent: '⛺',
  swim: '🏊',
  pancakes: '🥞',
  run: '🏃',
  cake: '🎂',
  tree: '🎄',
  plane: '✈️',
  present: '🎁',
  party: '🎉',
  moon: '🌙',
  box: '📦',
  key: '🔑',
  bag: '🎒',
  card: '🪪',
  suitcase: '🧳',
  tools: '🛠️',
  tick: '✅',
  books: '📚',
  phone: '📱',
  screen: '📺',
  salad: '🥗',
} as const;
export type Picture = keyof typeof PICTURES;

type PictureProps = {
  /** What the row of pictures is for, for a screen reader: "A picture for it". */
  label: string;
  options: readonly Picture[];
  /** The chosen emoji, or null while none is. */
  value: string | null;
  onChange: (emoji: string) => void;
};

/** One of a few pictures, each on a tile: the chosen one has a dark edge. */
export function PicturePick({ label, options, value, onChange }: PictureProps) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((one) => {
        const emoji = PICTURES[one];
        const on = emoji === value;
        return (
          <Tap
            key={one}
            accessibilityRole="radio"
            accessibilityLabel={words.perks.pictures[one]}
            aria-checked={on}
            scaleTo={0.92}
            onPress={() => onChange(emoji)}
            style={{ width: 44, height: 44, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: 2, borderColor: on ? colors.text : colors.fill }}>
            <Emoji char={emoji} size={24} />
          </Tap>
        );
      })}
    </View>
  );
}

type PeopleProps = {
  people: readonly MemberResponse[];
  /** The member ids that are chosen. */
  value: readonly string[];
  onChange: (memberIds: string[]) => void;
  /** A chip before the people that stands for all of them ("Everyone"): chosen while nobody is picked by name. */
  everyone?: string;
};

/** Some of the circle's people, picked from a row of chips with their pictures: who a chart is for, who a thing is kept to. */
export function PeoplePick({ people, value, onChange, everyone }: PeopleProps) {
  const { colors } = useTheme();
  const chip = (key: string, label: string, on: boolean, press: () => void, face?: ReactNode) => (
    <Tap
      key={key}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={on}
      scaleTo={0.94}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={press}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.text : colors.bg, borderWidth: 1.5, borderColor: on ? colors.text : colors.line }}>
      {face}
      <Txt variant="note" weight={700} style={{ color: on ? colors.bg : colors.text }}>
        {label}
      </Txt>
    </Tap>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: layout.rowGutter }}>
      {everyone ? chip('everyone', everyone, value.length === 0, () => onChange([])) : null}
      {people.map((person) => {
        const on = value.includes(person.id);
        return chip(person.id, firstName(person.name), on, () => onChange(on ? value.filter((id) => id !== person.id) : [...value, person.id]), <Avatar uri={person.avatarUrl} name={person.name} size={22} />);
      })}
    </ScrollView>
  );
}

/** True when the signed-in person may act for this member: it is them, or someone without a phone of their own in a circle they run. */
export function standsInFor(circle: { myMemberId: string; iRunIt: boolean; members: readonly MemberResponse[] } | undefined, memberId: string | undefined): boolean {
  if (!circle || !memberId) return false;
  if (circle.myMemberId === memberId) return true;
  const member = circle.members.find((one) => one.id === memberId);
  return !!member && member.kind !== 'person' && member.status !== 'left' && circle.iRunIt;
}
