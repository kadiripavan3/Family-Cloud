import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';
import { ProgressBar } from '@/ui/ProgressBar';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * The waiting state while a key is worked out. Stretching a Vault key or a passcode takes a moment on
 * purpose; the sum is done in slices, so this keeps moving meanwhile.
 */
export function Working({ text, progress }: { text: string; progress: number | null }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={text} testID="vault-working" style={{ gap: 10, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ActivityIndicator color={colors.muted} />
        <Txt variant="note" color="muted" style={{ flex: 1 }}>
          {text}
        </Txt>
        {progress === null ? null : (
          <Txt variant="note" weight={700} color="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {words.vault.working.percent(progress)}
          </Txt>
        )}
      </View>
      <ProgressBar fraction={progress ?? 0} />
    </View>
  );
}
