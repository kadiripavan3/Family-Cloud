import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';

/** How long a sentence stays up: long enough to read two short lines. */
const STAYS_MS = 4500;

/**
 * The dark pill near the bottom of a screen that says what just happened ("Added 5 to Summer 2026"), or
 * why something that is drawn can't work here yet. It goes by itself after a few seconds.
 *
 *     const { say, toast } = useToast();
 *     … say(words.library.select.shared(result)) …
 *     return <View>…{toast}</View>;
 */
export function useToast(bottom: number = 112): { say: (message: string) => void; toast: ReactElement | null } {
  const { colors, shadow } = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const say = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), STAYS_MS);
  }, []);
  const toast = message ? (
    <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ maxWidth: 340, paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.cardLarge, backgroundColor: colors.text, boxShadow: shadow.md }}>
        <Txt variant="note" weight={700} center style={{ color: colors.bg }}>
          {message}
        </Txt>
      </View>
    </View>
  ) : null;
  return { say, toast };
}
