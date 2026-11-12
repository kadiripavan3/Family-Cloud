import { Image } from 'expo-image';
import { View } from 'react-native';

import { initials } from '@/lib/names';
import { radius, useTheme } from '@/theme';

import { Txt } from './Txt';

type Props = { uri?: string | null; name: string; size?: number; ring?: string };

/** A person's picture, or their initials when they have none. */
export function Avatar({ uri, name, size = 40, ring }: Props) {
  const { colors } = useTheme();
  const frame = { width: size, height: size, borderRadius: radius.pill, borderWidth: ring ? Math.max(2, size / 19) : 0, borderColor: ring };
  if (uri) {
    // `recyclingKey`: a reused list row never shows the person who was there before.
    return <Image source={{ uri }} recyclingKey={uri} style={[frame, { backgroundColor: colors.fill2 }]} contentFit="cover" accessibilityLabel={name} />;
  }
  return (
    <View accessible accessibilityLabel={name} style={[frame, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }]}>
      <Txt weight={800} allowFontScaling={false} style={{ fontSize: size * 0.34, lineHeight: size * 0.42, letterSpacing: -0.3 }}>
        {initials(name)}
      </Txt>
    </View>
  );
}
