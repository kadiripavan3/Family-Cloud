import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { layout, radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Card } from './Card';
import { Toggle } from './Toggle';
import { Txt } from './Txt';

/** A group of settings rows on one raised card. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>{children}</Card>;
}

type RowProps = {
  icon?: (color: string) => ReactNode;
  label: string;
  note?: string;
  /** Shown at the right in grey, such as the current choice. */
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  first?: boolean;
  /** Shown at the right instead of the arrow. */
  trailing?: ReactNode;
};

/** One row in a settings group: an icon, a label, an optional note and value, and an arrow when it opens something. */
export function Row({ icon, label, note, value, onPress, danger, first, trailing }: RowProps) {
  const { colors } = useTheme();
  const color = danger ? colors.danger : colors.text;
  const content = (
    <>
      {icon ? <View style={{ width: 34, height: 34, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>{icon(color)}</View> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600} style={{ color }}>
          {label}
        </Txt>
        {note ? (
          <Txt variant="footnote" color="muted">
            {note}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt variant="callout" color="muted">
          {value}
        </Txt>
      ) : null}
      {trailing ?? (onPress && !danger ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line } as const;
  // A row that opens nothing is plain content, so a switch inside it stays a control of its own.
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([label, value, note])}
      onPress={onPress}
      style={({ pressed }) => [frame, { backgroundColor: pressed ? colors.fill : 'transparent' }]}>
      {content}
    </Pressable>
  );
}

/** A row with a switch. */
export function ToggleRow({ label, note, value, onChange, first, locked }: { label: string; note?: string; value: boolean; onChange?: (next: boolean) => void; first?: boolean; locked?: boolean }) {
  return (
    <Row
      first={first}
      label={label}
      note={note}
      trailing={
        <View style={{ opacity: locked ? 0.45 : 1 }} pointerEvents={locked ? 'none' : 'auto'}>
          <Toggle label={label} value={value} onChange={(next) => onChange?.(next)} />
        </View>
      }
    />
  );
}
