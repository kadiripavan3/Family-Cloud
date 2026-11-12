import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';

/** How long a notice stays: long enough to read two lines. */
const STAYS_MS = 6000;

/**
 * A sentence that answers a press and then goes by itself: "Copied", or why something can't be done here.
 *
 *     const [say, notice] = useNotice();
 *     … onPress={() => say(words.plan.event.copied)} …
 *     {notice}        // last in the screen: it floats over its bottom edge
 */
export function useNotice(): [say: (text: string) => void, notice: ReactNode] {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const say = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(next);
    timer.current = setTimeout(() => setText(null), STAYS_MS);
  }, []);
  const notice = text ? (
    <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: Math.max(insets.bottom, 12) + 84, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ maxWidth: 420, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: colors.text, boxShadow: shadow.md }}>
        <Txt variant="caption" weight={700} center style={{ color: colors.bg }}>
          {text}
        </Txt>
      </View>
    </View>
  ) : null;
  return [say, notice];
}
