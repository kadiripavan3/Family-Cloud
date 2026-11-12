import { router } from 'expo-router';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { words } from '@/words';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Txt } from './Txt';

type Props = {
  onRetry: () => void;
  /** The way out to Home. By default: open Home, then draw again. */
  onHome?: () => void;
  /** What went wrong, in the code's own words. Shown small, and only where a developer asked for it. */
  detail?: string;
};

/**
 * Shown in place of a screen that broke. It says so plainly and offers one way on.
 * It needs nothing around it (no safe-area or data providers), so it can stand in for the whole app.
 */
export function ErrorScreen({ onRetry, onHome, detail }: Props) {
  const { colors } = useTheme();
  const home =
    onHome ??
    (() => {
      // A screen that breaks every time it is drawn can't be left with "Try again". Home can.
      try {
        router.replace('/');
      } catch {
        // The navigator itself is what broke: drawing again is all that is left.
      }
      onRetry();
    });
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 16, paddingVertical: 48, backgroundColor: colors.bg }}>
      <EmptyState
        emoji="🛠️"
        title={words.states.broken.title}
        body={words.states.broken.body}
        action={
          <View style={{ gap: 10, alignItems: 'center' }}>
            <Button label={words.common.tryAgain} inline onPress={onRetry} />
            <Button label={words.common.goHome} inline variant="line" onPress={home} />
          </View>
        }
      />
      {detail ? (
        <Txt variant="footnote" color="muted" center selectable style={{ marginHorizontal: 34 }}>
          {detail}
        </Txt>
      ) : null}
    </View>
  );
}
