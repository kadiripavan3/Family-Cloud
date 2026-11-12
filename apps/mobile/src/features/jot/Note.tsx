import { KeyRound, Lock, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import type { JotResponse } from '@/api/generated/homeport';
import { radius, useTheme } from '@/theme';
import { BrandMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The pieces of the card that looks like the app's own notification: the pinned note, and what was filed. */

/** The card itself. */
export function NoteCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, shadow } = useTheme();
  return <View style={[{ gap: 9, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, borderRadius: radius.stage, backgroundColor: colors.surface, boxShadow: shadow.md }, style]}>{children}</View>;
}

/** Its first row: the app's mark and name, a few quiet words ("pinned · The Linds"), and what stands at the right. */
export function NoteHead({ small, trailing }: { small: string; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
      <View style={{ borderRadius: radius.pill, overflow: 'hidden' }}>
        <BrandMark size={24} />
      </View>
      <Txt variant="caption" weight={800}>
        {words.common.appName}
      </Txt>
      <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flex: 1 }}>
        {small}
      </Txt>
      {trailing}
    </View>
  );
}

/** One line of it: an icon, what it is, where it went, and what can be done with it. */
export function NoteLine({ icon: Icon, title, small, children }: { icon: LucideIcon; title: string; small: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 }}>
      <Icon size={17} color={colors.accentText} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="control" numberOfLines={2}>
          {title}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {small}
        </Txt>
      </View>
      {children}
    </View>
  );
}

/** A word at the end of a line that does something: Undo, Move. */
export function NoteLink({ label, spoken, onPress, disabled }: { label: string; spoken: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={{ disabled: !!disabled }} disabled={disabled} hitSlop={12} onPress={onPress} style={{ opacity: disabled ? 0.4 : 1 }}>
      <Txt variant="caption" weight={800} color="accentText">
        {label}
      </Txt>
    </Tap>
  );
}

type HeldProps = {
  jot: JotResponse;
  onVault: () => void;
  onNote: () => void;
  /** "It's just a note" is on its way. */
  busy?: boolean;
};

/**
 * Something that looks like a code or a password. It hasn't been kept anywhere; the person says where it
 * goes: the Vault, or "it's just a note".
 */
export function HeldCode({ jot, onVault, onNote, busy }: HeldProps) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
        <KeyRound size={18} color={colors.accentText} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Txt variant="callout" weight={800}>
            {words.jot.held.title(jot.title)}
          </Txt>
          <Txt variant="footnote" color="muted">
            {words.jot.held.body}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button size="sm" label={words.jot.held.vault} icon={(c) => <Lock size={15} color={c} />} onPress={onVault} />
        <Button size="sm" variant="soft" label={words.jot.held.note} loading={busy} onPress={onNote} />
      </View>
    </View>
  );
}
