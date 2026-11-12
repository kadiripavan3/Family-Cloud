import { WifiOff } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';

import { darkTheme, useTheme } from '@/theme';
import { words } from '@/words';

import { Txt } from './Txt';

type Props = {
  /**
   * The request is waiting for a connection (a query's `isPaused`) and there is nothing to show yet:
   * say so, instead of spinning for as long as the phone is offline.
   */
  offline?: boolean;
  /** "onPhoto" when it sits on a photo or on the dark stage, where the page's own colours can't be read. */
  tone?: 'page' | 'onPhoto';
};

/** Shown while a part of a screen is on its way. A whole page that is loading draws its skeleton instead. */
export function Loading({ offline, tone = 'page' }: Props) {
  const theme = useTheme();
  const colors = tone === 'onPhoto' ? darkTheme.colors : theme.colors;
  if (offline) {
    return (
      <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
        <WifiOff size={24} color={colors.muted} />
        <Txt variant="titleSmall" accessibilityRole="header" center style={{ color: colors.text }}>
          {words.states.offline.title}
        </Txt>
        <Txt variant="bodySmall" center style={{ color: colors.muted }}>
          {words.states.offline.body}
        </Txt>
      </View>
    );
  }
  return (
    <View accessibilityLabel={words.states.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}
