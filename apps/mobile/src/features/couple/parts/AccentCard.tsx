import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { radius, useTheme, withAlpha } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';

type Props = {
  /** The small capital line on top: "Tucked away for Alex". */
  eyebrow: string;
  /** The words the card is about, large. */
  title: string;
  /** A smaller line under them. */
  line?: string | null;
  /** The card's buttons (`CardButton`), side by side. */
  children?: ReactNode;
};

/**
 * The card in the accent colour at the top of a couple's page: what is going on right now, in a few large
 * words, with one or two buttons. The note that is tucked away, the date that is being planned.
 */
export function AccentCard({ eyebrow, title, line, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6, marginTop: 4, marginHorizontal: 16, padding: 18, borderRadius: radius.panel, backgroundColor: colors.accent }}>
      <Txt variant="label" numberOfLines={2} style={{ color: colors.onAccent, opacity: 0.7 }}>
        {eyebrow}
      </Txt>
      <Txt variant="title" weight={800} accessibilityRole="header" style={{ color: colors.onAccent }}>
        {title}
      </Txt>
      {line ? (
        <Txt variant="caption" style={{ color: colors.onAccent, opacity: 0.8 }}>
          {line}
        </Txt>
      ) : null}
      {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{children}</View> : null}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** Shown before the label. Receives the colour the label uses. */
  icon?: (color: string) => ReactNode;
  /** The second button of a card: a shade of the card instead of white. */
  soft?: boolean;
  loading?: boolean;
};

/** A small button on an `AccentCard`: white with the accent's words, or a soft shade of the card for the second one. */
export function CardButton({ label, onPress, icon, soft, loading }: ButtonProps) {
  const { colors } = useTheme();
  const ink = soft ? colors.onAccent : colors.accent;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!loading }}
      disabled={loading}
      scaleTo={0.96}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: soft ? withAlpha(colors.black, 0.1) : colors.onAccent }}>
      {loading ? <ActivityIndicator size="small" color={ink} /> : icon?.(ink)}
      <Txt variant="callout" weight={700} numberOfLines={1} style={{ color: ink }}>
        {label}
      </Txt>
    </Tap>
  );
}
