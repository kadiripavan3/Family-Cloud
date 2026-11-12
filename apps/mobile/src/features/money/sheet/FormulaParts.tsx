import { View } from 'react-native';

import type { PartResponse } from '@/api/generated/homeport';
import { radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';

type ChipProps = {
  text: string;
  /** A column's chip stands on the accent's soft ground; a function's on grey. */
  column?: boolean;
  /** A little taller, for the chips that are tapped to build a formula. */
  pick?: boolean;
  spoken?: string;
  onPress?: () => void;
};

/** One chip of a formula: a function (SUM) or a column (Cost). In the pickers it can be pressed. */
export function FxChip({ text, column, pick, spoken, onPress }: ChipProps) {
  const { colors } = useTheme();
  const frame = { minHeight: pick ? 30 : 26, justifyContent: 'center', paddingHorizontal: pick ? 11 : 9, borderRadius: radius.chip, backgroundColor: column ? colors.accentSoft : colors.fill } as const;
  const label = (
    <Txt variant="caption" weight={800} numberOfLines={1} style={{ color: column ? colors.accentText : colors.text }}>
      {text}
    </Txt>
  );
  if (!onPress) return <View style={frame}>{label}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken ?? text} hitSlop={{ top: 7, bottom: 7, left: 3, right: 3 }} onPress={onPress} scaleTo={0.92} style={frame}>
      {label}
    </Tap>
  );
}

/**
 * A formula as chips, the way the API sends its parts: functions and columns as chips, and the signs and
 * words between them ("−", "is ticked") as quiet text.
 */
export function FormulaParts({ parts }: { parts: readonly PartResponse[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'function' || part.kind === 'column' ? (
          <FxChip key={index} text={part.text} column={part.kind === 'column'} />
        ) : (
          <Txt key={index} variant="item" weight={800} color="muted">
            {part.text}
          </Txt>
        ),
      )}
    </>
  );
}
