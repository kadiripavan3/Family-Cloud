import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';

import { TintDot } from './tints';

type Props = {
  label: string;
  /** With a face: one person's chip, with their picture and the dot of their tint. Without: "Everyone". */
  person?: { name: string; avatarUrl?: string | null; tint: number };
  on: boolean;
  onPress: () => void;
};

/** A chip that filters a calendar to one person: their face, the dot they are drawn with, and their name. */
export function PersonChip({ label, person, on, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-pressed={on}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      scaleTo={0.94}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 37, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.text : colors.bg, borderWidth: 1.5, borderColor: on ? colors.text : colors.line }}>
      {person ? (
        <>
          <View style={{ marginVertical: -3, marginLeft: -6 }}>
            <Avatar uri={person.avatarUrl} name={person.name} size={22} />
          </View>
          <TintDot tint={person.tint} />
        </>
      ) : null}
      <Txt variant="note" weight={700} style={{ color: on ? colors.bg : colors.text }}>
        {label}
      </Txt>
    </Tap>
  );
}
