import { useRouter } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { layout, radius, useTheme } from '@/theme';
import { words } from '@/words';

import { RoundButton } from './RoundButton';
import { Txt } from './Txt';
import { Tap } from './Motion';

type Props = {
  title?: string;
  subtitle?: string;
  /** "back" shows an arrow, "close" a cross, "none" leaves the space empty. */
  leading?: 'back' | 'close' | 'none';
  /** Shown at the left edge instead of the back arrow, such as a Cancel link. */
  left?: ReactNode;
  /** Shown at the right edge, such as a Save button. */
  trailing?: ReactNode;
  /** Shown in the middle instead of a title, such as step progress. */
  center?: ReactNode;
};

/** The bar at the top of a screen: a way back, an optional title, and an optional action. */
export function AppBar({ title, subtitle, leading = 'back', left, trailing, center }: Props) {
  const router = useRouter();
  // The same rule as `useLeave` (features/navigation), which the design system can't import: go back, or Home
  // when the app was opened straight onto this screen and there is nowhere to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ minHeight: 56, paddingHorizontal: layout.barGutter, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ minWidth: 40, alignItems: 'flex-start' }}>
        {left ?? (leading === 'none' ? null : (
          <RoundButton
            label={leading === 'back' ? words.common.back : words.common.close}
            onPress={leave}
            icon={(c) => (leading === 'back' ? <ArrowLeft size={20} color={c} /> : <X size={20} color={c} />)}
          />
        ))}
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {center ?? (
          <>
            {title ? (
              <Txt variant="subheading" accessibilityRole="header" numberOfLines={1}>
                {title}
              </Txt>
            ) : null}
            {subtitle ? (
              <Txt variant="small" color="muted" numberOfLines={1}>
                {subtitle}
              </Txt>
            ) : null}
          </>
        )}
      </View>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{trailing}</View>
    </View>
  );
}

/** Three bars showing how far through a short flow the person is. */
export function StepProgress({ step, of = 3 }: { step: number; of?: number }) {
  return (
    <View accessible accessibilityLabel={words.common.stepOf(step, of)} style={{ flexDirection: 'row', gap: 6, width: 170 }}>
      {Array.from({ length: of }, (_, i) => (
        <StepBar key={i} on={i < step} />
      ))}
    </View>
  );
}

function StepBar({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: on ? colors.accent : colors.fill2 }} />;
}

/** A text action in the bar, such as Save or Cancel. */
export function BarLink({ label, onPress, quiet, disabled }: { label: string; onPress?: () => void; quiet?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} hitSlop={12} onPress={onPress}>
      <Txt variant="item" weight={800} style={{ color: quiet ? colors.muted : colors.accentText, opacity: disabled ? 0.4 : 1 }}>
        {label}
      </Txt>
    </Tap>
  );
}
