import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { checkNumbers } from './crypto/checkWords';

/** The three check words of a recovery, worked out from the new phone's temporary public key: the same on both phones, or it is not the same recovery. */
export function checkWordsOf(tempPublicKey: string): string[] {
  try {
    return checkNumbers(tempPublicKey).map((number) => words.vault.checkWords[number] ?? '');
  } catch {
    return [];
  }
}

/** The check words, large enough to read out over the phone. */
export function CheckWords({ tempPublicKey, label }: { tempPublicKey: string; label: string }) {
  const { colors } = useTheme();
  const picked = checkWordsOf(tempPublicKey);
  if (picked.length === 0) return null;
  return (
    <View accessible accessibilityLabel={words.common.spoken([label, picked.join(', ')])} testID="check-words" style={{ gap: 4, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
      <Txt variant="label" color="accentText">
        {label}
      </Txt>
      <Txt variant="subtitle">{words.vault.checkWordsLine(picked)}</Txt>
    </View>
  );
}
