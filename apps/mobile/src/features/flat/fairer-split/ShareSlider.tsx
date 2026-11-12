import { useRef, useState } from 'react';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';

type Props = {
  /** Where the knob stands, 0 to 1. */
  place: number;
  /** The knob is being dragged to here, 0 to 1. */
  onMove: (place: number) => void;
  /** A drag begins, and ends: the page remembers where every share stood when it began. */
  onGrab?: () => void;
  onDrop?: () => void;
  /** A screen reader's step up or down: one notch more, one notch less. */
  onNudge: (by: 1 | -1) => void;
  /** Whose share it is, for a screen reader: "Your share". */
  label: string;
  /** What it stands at, said out loud: "€372". */
  valueText: string;
  /** Drawn, but it can't be dragged: someone who may only look, or a split with one person. */
  locked?: boolean;
};

/** How tall the strip is that a finger can grab: the track is 6 pt, the knob 24. */
const GRAB = 32;
const KNOB = 24;

/**
 * A slider drawn as the drawing has it: a thin track, the part up to the knob in the accent colour, a round
 * white knob. A finger that moves sideways anywhere along it moves the knob by as much as it moved; one that
 * moves up or down is the page's, which scrolls. Written here because the app has no slider and may not add
 * a library for one; it knows nothing about money.
 */
export function ShareSlider({ place, onMove, onGrab, onDrop, onNudge, label, valueText, locked }: Props) {
  const { colors, shadow } = useTheme();
  const [width, setWidth] = useState(0);
  // Where the finger went down, and where the knob stood when the drag became the slider's.
  const down = useRef({ x: 0, y: 0 });
  const grabbed = useRef({ x: 0, place: 0 });
  const at = Math.min(Math.max(place, 0), 1);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      // Said this way, a browser hears where it stands as well: the web takes neither `accessibilityValue` nor `accessibilityState`.
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(at * 100)}
      aria-valuetext={valueText}
      aria-disabled={!!locked}
      accessibilityState={{ disabled: !!locked }}
      accessibilityActions={locked ? [] : [{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => (event.nativeEvent.actionName === 'increment' ? onNudge(1) : event.nativeEvent.actionName === 'decrement' ? onNudge(-1) : undefined)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponderCapture={(event) => {
        down.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        return false;
      }}
      onMoveShouldSetResponder={(event) => {
        const [dx, dy] = [event.nativeEvent.pageX - down.current.x, event.nativeEvent.pageY - down.current.y];
        return !locked && Math.abs(dx) > 3 && Math.abs(dx) > Math.abs(dy);
      }}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        grabbed.current = { x: event.nativeEvent.pageX, place: at };
        onGrab?.();
      }}
      onResponderMove={(event) => {
        if (width > 0) onMove(Math.min(Math.max(grabbed.current.place + (event.nativeEvent.pageX - grabbed.current.x) / width, 0), 1));
      }}
      onResponderRelease={onDrop}
      onResponderTerminate={onDrop}
      style={{ height: GRAB, justifyContent: 'center' }}>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.fill2 }}>
        <View style={{ width: `${at * 100}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', top: (GRAB - KNOB) / 2, left: `${at * 100}%`, width: KNOB, height: KNOB, marginLeft: -KNOB / 2, borderRadius: radius.pill, backgroundColor: colors.white, boxShadow: shadow.knob }} />
    </View>
  );
}
