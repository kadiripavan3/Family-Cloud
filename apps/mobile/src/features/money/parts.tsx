import { ChevronRight, Table } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { type StyleProp, type TextStyle, View, type ViewStyle } from 'react-native';

import type { PersonBrief } from '@/api/generated/homeport';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** Figures line up under each other: every digit as wide as the next. */
export const FIGURES: TextStyle = { fontVariant: ['tabular-nums'] };

/** An emoji on a soft square tile: what a bill or an expense is, at a glance. */
export function EmojiTile({ emoji, size = 44 }: { emoji: string; size?: 40 | 44 | 60 }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size === 60 ? radius.photo : radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
      <Emoji char={emoji} size={size === 60 ? 30 : 22} />
    </View>
  );
}

/** The tile every sheet has: a small table on the accent's soft ground. */
export function SheetTile() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
      <Table size={20} color={colors.accentText} />
    </View>
  );
}

/** An amount at the end of a row. */
export function Amount({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <Txt variant="item" weight={800} numberOfLines={1} style={[FIGURES, color ? { color } : null]}>
      {children}
    </Txt>
  );
}

/** A section's title with its small arrow right after it: pressing it opens the whole list. */
export function SectionTitle({ title, onPress, style }: { title: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.seeAll(title)} onPress={onPress} style={[{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: 20, marginBottom: 10, marginHorizontal: layout.barGutter }, style]}>
      <Txt variant="subtitle">{title}</Txt>
      <ChevronRight size={18} color={colors.text} strokeWidth={2.6} />
    </Tap>
  );
}

/** A few faces, each overlapping the one before. `ring` is the colour of what they stand on. */
export function Faces({ people, size = 22, ring, overlap = 8 }: { people: readonly PersonBrief[]; size?: number; ring: string; overlap?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.map((person, index) => (
        <View key={person.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -overlap }}>
          <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={size} ring={ring} />
        </View>
      ))}
    </View>
  );
}

/** A small pill with a coloured dot: where something stands, in a few words. */
export function DotPill({ label, tone }: { label: string; tone: 'warn' | 'ok' }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.tile, backgroundColor: colors.fill }}>
      <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: tone === 'warn' ? colors.warn : colors.ok }} />
      <Txt variant="small" weight={700}>
        {label}
      </Txt>
    </View>
  );
}

/** The thin bar under the month's sum: how much of it is paid. */
export function PaidBar({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  const part = Math.min(Math.max(fraction, 0), 1);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(part * 100) }} style={{ height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
      <View style={{ width: `${part * 100}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
    </View>
  );
}

/** A sentence about something that went wrong while saving, in the API's own words. */
export function Trouble({ message, style }: { message: string | null | undefined; style?: StyleProp<TextStyle> }) {
  if (!message) return null;
  return (
    <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={[{ marginHorizontal: layout.gutter, marginTop: 10 }, style]}>
      {message}
    </Txt>
  );
}

/** A few choices as chips in a row that wraps, the chosen one in ink: how often a bill comes, how it is paid. */
export function ChoiceChips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Tap
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: on }}
            // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
            aria-checked={on}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onChange(option.id)}
            scaleTo={0.94}
            style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? colors.text : colors.line, backgroundColor: on ? colors.text : colors.bg }}>
            <Txt variant="note" weight={700} style={{ color: on ? colors.bg : colors.text }}>
              {option.label}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

/** The small label over a group of choices in a form. */
export function FormLabel({ children }: { children: ReactNode }) {
  return (
    <Txt variant="caption" color="muted" style={{ marginTop: 6, marginHorizontal: 4 }}>
      {children}
    </Txt>
  );
}
