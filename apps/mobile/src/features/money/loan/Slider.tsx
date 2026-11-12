import { useState } from 'react';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { FIGURES } from '../parts';

type Props = {
  /** What is being set: "Borrowed". */
  label: string;
  /** The value as it is read: "€240,000". */
  shown: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
};

/** How tall the strip is that the finger can land on; the track itself is a thin line in its middle. */
const TOUCH = 28;
const KNOB = 24;

/**
 * A slider: a label with its value, a track that fills from the left, and a round knob. Dragging anywhere
 * along the track moves it, a step at a time; a screen reader moves it a step up or down.
 */
export function Slider({ label, shown, value, min, max, step, onChange }: Props) {
  const { colors, shadow } = useTheme();
  const [width, setWidth] = useState(0);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const part = max > min ? (clamp(value) - min) / (max - min) : 0;
  /** The value under the finger, to the nearest step. */
  const moveTo = (x: number) => {
    if (width <= 0) return;
    const next = clamp(min + Math.round((Math.min(Math.max(x / width, 0), 1) * (max - min)) / step) * step);
    if (next !== value) onChange(next);
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Txt variant="caption" color="muted">
          {label}
        </Txt>
        <Txt variant="headline" weight={800} style={FIGURES}>
          {shown}
        </Txt>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={words.money.loan.slider(label, shown)}
        accessibilityValue={{ min, max, now: value, text: shown }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => onChange(clamp(value + (event.nativeEvent.actionName === 'increment' ? step : -step)))}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => moveTo(event.nativeEvent.locationX)}
        onResponderMove={(event) => moveTo(event.nativeEvent.locationX)}
        style={{ height: TOUCH, justifyContent: 'center' }}>
        {/* The finger always lands on the strip itself, so where it is counts from the strip's own left edge. */}
        <View pointerEvents="none" style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.fill2 }}>
          <View style={{ width: `${part * 100}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', top: (TOUCH - KNOB) / 2, left: part * width - KNOB / 2, width: KNOB, height: KNOB, borderRadius: radius.pill, backgroundColor: colors.white, boxShadow: shadow.knob }} />
      </View>
    </View>
  );
}
