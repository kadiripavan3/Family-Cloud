import { Heart, Play } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { useTheme, withAlpha } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { formatDuration } from './sizes';
import type { WallItem } from './types';

/** How soft the shade behind a video's length is, so it reads on a bright picture. */
const SHADE_BLUR = 3;

type Props = {
  item: WallItem;
  onPress?: () => void;
  /** Pressing and holding: how selecting many starts. */
  onLongPress?: () => void;
  /** Show who added it, as a small picture in the corner: on a moment that several people photographed. */
  who?: boolean;
  /** Leave the heart off: in the grid for selecting, that corner is the circle that says it is picked. */
  plain?: boolean;
  /** The picture at a size for a card instead of the small one: for a tile drawn wide. */
  large?: boolean;
  /** Drawn over the picture, such as the circle that says it is selected. */
  children?: ReactNode;
  /** What a screen reader says after the photo's own words: "Selected". */
  state?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One photo or video as a tile: on the wall, in a moment, in an album, in the grid for selecting. A heart in
 * the corner when you love it, a video's length at the bottom, and pressing opens it.
 */
export function PhotoTile({ item, onPress, onLongPress, who, plain, large, children, state, style }: Props) {
  const { colors } = useTheme();
  const video = item.kind === 'video';
  const length = video && item.durationSeconds != null ? formatDuration(item.durationSeconds) : null;
  const shade = { textShadowColor: withAlpha(colors.black, 0.6), textShadowOffset: { width: 0, height: 1 }, textShadowRadius: SHADE_BLUR } as const;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([words.library.tile(video, item.title?.trim() || null, item.addedBy?.name ?? null, length), state])}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleTo={0.98}
      style={style}>
      <Photo uri={(large ? item.url : item.thumbUrl) ?? item.thumbUrl ?? item.url} radius="none" style={{ flex: 1 }}>
        {item.loved && !plain ? (
          <View style={{ position: 'absolute', right: 7, top: 7 }}>
            <Heart size={16} color={colors.white} fill={colors.like} strokeWidth={2} />
          </View>
        ) : null}
        {length ? (
          <View style={{ position: 'absolute', left: 8, bottom: 7, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Play size={10} color={colors.white} fill={colors.white} />
            <Txt variant="small" weight={700} style={[{ color: colors.white }, shade]}>
              {length}
            </Txt>
          </View>
        ) : null}
        {who && item.addedBy ? (
          <View style={{ position: 'absolute', right: 6, bottom: 6 }}>
            <Avatar uri={item.addedBy.avatarUrl} name={item.addedBy.name ?? ''} size={22} ring={colors.white} />
          </View>
        ) : null}
        {children}
      </Photo>
    </Tap>
  );
}
