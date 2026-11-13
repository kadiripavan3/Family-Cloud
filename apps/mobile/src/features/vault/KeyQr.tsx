import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { qrCode } from '@/lib/qr';
import { radius, useTheme } from '@/theme';
import { words } from '@/words';

/** The light border a code needs around it to be read, in squares (the standard asks for four). */
const QUIET = 4;

/** The Vault key as a QR code, on a tile: for a camera, or a photo that goes on paper. Drawn here from the text; nothing is fetched. */
export function KeyQr({ text, size }: { text: string; size: number }) {
  const { colors } = useTheme();
  const squares = qrCode(text);
  // (A text too long for a code: a Vault key never is.)
  if (!squares) return <View style={{ width: size, height: size, borderRadius: radius.chip, backgroundColor: colors.fill }} />;
  const side = squares.length + QUIET * 2;
  let path = '';
  squares.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    });
  });
  // Dark on light in both themes: a camera reads it that way round.
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={words.vault.key.qr} testID="vault-key-qr" style={{ width: size, height: size, borderRadius: radius.chip, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.white }}>
      <Svg width={size - 3} height={size - 3} viewBox={`0 0 ${side} ${side}`}>
        <Path d={path} fill={colors.black} />
      </Svg>
    </View>
  );
}
