import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeave } from '@/features/navigation/useLeave';
import { AlwaysDark, darkTheme, withAlpha } from '@/theme';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { RoundButton } from '@/ui/RoundButton';
import { words } from '@/words';

/**
 * The photos that stand in for the phone's own wallpaper. The app can't see a person's Home Screen or Lock
 * Screen, so the pictures of them are drawn on the photos their designs use.
 */
const PHOTOS = {
  lake: require('@/assets/photos/lake.jpg'),
  autumn: require('@/assets/photos/autumn.jpg'),
  bed: require('@/assets/photos/bed-mug.jpg'),
} as const;

type Props = {
  photo: keyof typeof PHOTOS;
  /** "dim" darkens the whole photo, for something laid over it; "light" only its top and bottom, where the phone's own things stand. */
  shade?: 'dim' | 'light';
  /** Shown at the right of the top row, across from Back. */
  trailing?: ReactNode;
  /** What Back is called here, when "Back" isn't it. */
  backLabel?: string;
  children: ReactNode;
};

/**
 * The frame of Jot's screens that are laid over a photo: the jot bar, voice, and the pictures of the widgets,
 * the pinned note and the Lock Screen. Always dark, in light mode too, as their designs are. The phone's own
 * surfaces have no way back; inside the app each of these gets one, in the place of the status bar.
 */
export function OnPhoto({ photo, shade = 'dim', trailing, backLabel = words.common.back, children }: Props) {
  const { colors } = darkTheme;
  const leave = useLeave();
  const veil = shade === 'dim' ? ([withAlpha(colors.black, 0.42), withAlpha(colors.black, 0.62)] as const) : ([withAlpha(colors.black, 0.25), withAlpha(colors.black, 0.05), withAlpha(colors.black, 0.45)] as const);
  return (
    <AlwaysDark>
      <View style={{ flex: 1, backgroundColor: colors.stage }}>
        <LightStatusBar />
        <Image source={PHOTOS[photo]} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        <LinearGradient colors={veil} locations={shade === 'dim' ? [0, 1] : [0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, paddingHorizontal: 12 }}>
            <RoundButton tone="photo" label={backLabel} icon={(c) => <ArrowLeft size={20} color={c} />} onPress={leave} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{trailing}</View>
          </View>
          {children}
        </SafeAreaView>
      </View>
    </AlwaysDark>
  );
}

/** A quiet sentence on a photo: what stands in for the phone's own part here. */
export function OnPhotoNote({ children }: { children: ReactNode }) {
  const { colors } = darkTheme;
  return (
    <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: darkTheme.radius.photo, backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
      {children}
    </View>
  );
}
