import { usePathname } from 'expo-router';
import { WifiOff } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChangeNotSent, useOnline } from '@/api/online';
import { darkTheme, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How tall the strip's one line is. The screens move down by this much while it shows. */
export const STRIP_HEIGHT = 30;

/**
 * Screens that say "you're offline" in their own words, with what it means there (a shared list says that
 * its ticks are saved and will catch up). The strip would only say it twice. None is built yet: a screen
 * that does this adds its address here.
 */
const SAYS_SO_ITSELF: RegExp[] = [];

/**
 * Screens whose top is a photo or the dark stage, with a light status bar. There the strip is dark as well,
 * so the clock and the battery above it stay readable. None is built yet inside the signed-in app.
 */
const DARK_ON_TOP: RegExp[] = [];

type Props = {
  children: ReactNode;
  /** The two lists above. They are the app's own; a test gives its own to try each case. */
  saysSoItself?: readonly RegExp[];
  darkOnTop?: readonly RegExp[];
};

/**
 * Offline: while the phone has no connection, a slim strip across the top of the app says so. It is part of
 * the layout: the screens move down to make room, so it never sits on top of anything. It goes when the
 * connection is back. Wrap the app's screens in it.
 */
export function OfflineStrip({ children, saysSoItself = SAYS_SO_ITSELF, darkOnTop = DARK_ON_TOP }: Props) {
  const online = useOnline();
  const path = usePathname();
  const shown = !online && !saysSoItself.some((screen) => screen.test(path));
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, marginTop: shown ? STRIP_HEIGHT : 0 }}>{children}</View>
      {shown ? <Strip dark={darkOnTop.some((screen) => screen.test(path))} /> : null}
    </View>
  );
}

/**
 * The strip itself. Every screen leaves the phone's status bar free at its top; moved down by the strip's
 * height, that free band ends exactly where the strip ends. So the strip covers it: the status bar's own
 * area, and one line under it.
 */
function Strip({ dark }: { dark: boolean }) {
  const theme = useTheme();
  const colors = dark ? darkTheme.colors : theme.colors;
  const insets = useSafeAreaInsets();
  // A tick or a switch that couldn't be sent has no room to say so itself; for a few seconds the strip does.
  const notSent = useChangeNotSent();
  const headline = notSent ? words.states.strip.notSent.headline : words.states.offline.title;
  const rest = notSent ? words.states.strip.notSent.rest : words.states.strip.offlineRest;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(160)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={words.states.strip.spoken(headline, rest)}
      // Nothing under it can be tapped anyway; this keeps it out of the way of a swipe from the top edge.
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top + STRIP_HEIGHT,
        paddingTop: insets.top,
        backgroundColor: dark ? colors.stage : colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16 }}>
        <WifiOff size={14} color={colors.warn} />
        <Txt variant="footnote" weight={700} numberOfLines={1} style={{ color: colors.text, flexShrink: 1 }}>
          {headline}
          <Txt variant="footnote" weight={500} style={{ color: colors.muted }}>
            {'  '}
            {rest}
          </Txt>
        </Txt>
      </View>
    </Animated.View>
  );
}
