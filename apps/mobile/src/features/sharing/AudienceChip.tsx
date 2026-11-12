import { EyeOff, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type AudienceChip as ChipAnswer, useGetMe } from '@/api/generated/homeport';
import { useCircleIfAny, useCircles } from '@/features/circles/current';
import { firstName } from '@/lib/names';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { AudienceSheet } from './AudienceSheet';

/** As much of a thing as its chip needs. Every answer of the API that shows a thing has these. */
export type Shared = { id?: string; circleId?: string; mine?: boolean; chip?: ChipAnswer };

type Props = {
  /** The thing, as the API sent it: a page, a list, a row in a search. */
  thing: Shared;
  /** Only say who sees it. For a chip inside a row that is itself pressed: without this, pressing the chip opens the audience sheet. */
  quiet?: boolean;
};

/** How many pictures a chip shows before the person's own. */
const FACES = 2;

/**
 * The small chip on every thing that says who can see it: a lock and "Only you", the pictures and "Alex and
 * you", the circle's emoji and its name, or an eye with a line through it and "Not Mia" while it is hidden
 * from someone. Pressing it opens the one sheet that changes this (`AudienceSheet`).
 *
 *     <AudienceChip thing={page} />
 */
export function AudienceChip({ thing, quiet }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const circles = useCircles();
  const current = useCircleIfAny();
  const circle = circles.find((one) => one.id === thing.circleId) ?? current;
  const me = useGetMe().data?.profile;
  const chip = thing.chip ?? {};

  const hiddenFrom = chip.hiddenFrom ?? [];
  const others = (chip.people ?? []).filter((person) => person.memberId !== circle?.myMemberId);
  const label = hiddenFrom.length
    ? words.sharing.chip.not(hiddenFrom)
    : chip.audience === 'circle' && circle
      ? words.kinds[circle.kind].chip(circle.name)
      : chip.audience === 'some'
        ? others.length === 0 && thing.mine === false
          ? words.sharing.chip.withYou
          : words.sharing.chip.some(others.map((person) => firstName(person.name)))
        : words.sharing.chip.onlyYou;
  const color = hiddenFrom.length ? colors.accentText : colors.text;

  const content = (
    <>
      {hiddenFrom.length ? (
        <EyeOff size={13} color={color} />
      ) : chip.audience === 'circle' && circle ? (
        <Emoji char={words.kinds[circle.kind].emoji} size={16} />
      ) : chip.audience === 'some' ? (
        <View style={{ flexDirection: 'row', marginLeft: -2 }}>
          {others.slice(0, FACES).map((person, index) => (
            <View key={person.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -6 }}>
              <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={18} ring={colors.fill} />
            </View>
          ))}
          <View style={{ marginLeft: others.length ? -6 : 0 }}>
            <Avatar uri={me?.avatarUrl} name={me?.displayName ?? ''} size={18} ring={colors.fill} />
          </View>
        </View>
      ) : (
        <Lock size={13} color={color} />
      )}
      <Txt variant="small" weight={700} numberOfLines={1} style={{ color }}>
        {label}
      </Txt>
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: hiddenFrom.length ? colors.accentSoft : colors.fill } as const;

  if (quiet || !thing.id) {
    return (
      <View accessible accessibilityLabel={words.sharing.chip.spokenQuiet(label)} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <>
      {/* Drawn 26 pt high; the finger still gets 44. */}
      <Tap accessibilityRole="button" accessibilityLabel={words.sharing.chip.spoken(label)} hitSlop={9} onPress={() => setOpen(true)} scaleTo={0.94} style={frame}>
        {content}
      </Tap>
      <AudienceSheet thingId={thing.id} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
