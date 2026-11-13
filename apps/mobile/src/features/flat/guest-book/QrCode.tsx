import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { qrCode } from '@/lib/qr';
import { radius, useTheme } from '@/theme';

/** The light margin a reader needs around a code, in modules. */
const QUIET = 4;

/**
 * A text drawn as a QR code: dark modules on a white card, in light and in dark mode alike (a reader needs
 * the code dark on light), with the light margin the standard asks for. Draws nothing for a text too long
 * for a code; whoever shows it has the text itself beside it.
 */
export function QrCode({ text, size, label }: { text: string; size: number; label: string }) {
  const { colors } = useTheme();
  const code = useMemo(() => qrCode(text), [text]);
  // One path for all dark modules: each a unit square, runs of them in a row drawn as one bar.
  const path = useMemo(() => {
    if (!code) return '';
    const bars: string[] = [];
    code.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        let end = x;
        while (end + 1 < row.length && row[end + 1]) end++;
        bars.push(`M${x + QUIET} ${y + QUIET}h${end - x + 1}v1h${-(end - x + 1)}z`);
        x = end;
      }
    });
    return bars.join('');
  }, [code]);
  if (!code) return null;
  const side = code.length + 2 * QUIET;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.white }}>
      <Svg width={size} height={size} viewBox={`0 0 ${side} ${side}`}>
        <Rect x={0} y={0} width={side} height={side} fill={colors.white} />
        <Path d={path} fill={colors.black} />
      </Svg>
    </View>
  );
}
