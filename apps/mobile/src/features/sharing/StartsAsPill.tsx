import { ChevronDown, Lock } from 'lucide-react-native';

import type { Audience, CircleResponse } from '@/api/generated/homeport';
import { radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  circle: CircleResponse;
  /** "me" or "circle": a thing that doesn't exist yet can't be shared with some people. */
  value: Audience;
  onChange: (next: Audience) => void;
};

/**
 * Who a new thing starts as seen by, as a pill that looks like the audience chip: "Only you" or the whole
 * circle. Pressing it changes to the other. (Once the thing exists, its `AudienceChip` opens every choice.)
 */
export function StartsAsPill({ circle, value, onChange }: Props) {
  const { colors } = useTheme();
  const everyone = value === 'circle';
  const kind = words.kinds[circle.kind];
  const label = everyone ? kind.chip(circle.name) : words.sharing.chip.onlyYou;
  // A circle of one has nobody to share with.
  const alone = circle.kind === 'solo';
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.today.plus.seenByLabel(label)}
      disabled={alone}
      hitSlop={9}
      onPress={() => onChange(everyone ? 'me' : 'circle')}
      scaleTo={0.94}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.fill }}>
      {everyone ? <Emoji char={kind.emoji} size={16} /> : <Lock size={13} color={colors.text} />}
      <Txt variant="small" weight={700} numberOfLines={1}>
        {label}
      </Txt>
      {alone ? null : <ChevronDown size={13} color={colors.text} />}
    </Tap>
  );
}
