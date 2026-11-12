import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { radius, useTheme } from '@/theme';
import { words } from '@/words';

import { qrCode } from './qr';

/** The light border a code needs around it to be read, in squares. */
const QUIET = 2;

/** The Vault key as a QR code, on a tile: for a camera, or a photo that goes on paper. Drawn here from the text; nothing is fetched. */
export function KeyQr({ text, size }: { text: string; size: number }) {
  const { colors } = useTheme();
  let squares: boolean[][];
  try {
    squares = qrCode(text);
  } catch {
    return <View style={{ width: size, height: size, borderRadius: radius.chip, backgroundColor: colors.fill }} />;
  }
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
