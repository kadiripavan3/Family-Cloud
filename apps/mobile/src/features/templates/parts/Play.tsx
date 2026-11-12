import { Pause, Play } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import type { BoardMedia } from '@/api/generated/homeport';
import { radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { playSound, sound } from '../sound';
import { Notice } from './Notice';

// One recording plays at a time, whichever button started it.
let playing: string | null = null;
let stop: (() => void) | null = null;
const heard = new Set<() => void>();
const say = (id: string | null) => {
  playing = id;
  heard.forEach((listener) => listener());
};

/** Starts a recording, or stops it when it is the one playing. Starting one stops whatever played before. */
export function togglePlay(media: { id: string; url: string }): void {
  const wasThis = playing === media.id;
  stop?.();
  stop = null;
  if (wasThis) return;
  say(media.id);
  stop = playSound(media.url, () => {
    if (playing === media.id) say(null);
  });
}

/** The id of the recording that is playing now, or null. */
export function useNowPlaying(): string | null {
  return useSyncExternalStore(
    (listener) => {
      heard.add(listener);
      return () => {
        heard.delete(listener);
      };
    },
    () => playing,
    () => null,
  );
}

type Props = {
  media: BoardMedia;
  /** What it is a recording of, for a screen reader: "Play Leo's voice". */
  label: string;
  /**
   * "round" is the accent circle beside a wave; "chip" the small grey chip with the length after the
   * triangle; "icon" the bare triangle at the end of a line.
   */
  look?: 'round' | 'chip' | 'icon';
};

/**
 * Plays a recording back, and stops it when pressed again. Where this build can't play sound (the phone
 * build's own audio is still to come), pressing says so in a sentence.
 */
export function PlayButton({ media, label, look = 'icon' }: Props) {
  const { colors } = useTheme();
  const on = useNowPlaying() === media.id;
  const [notice, setNotice] = useState<string | null>(null);
  const press = () => (sound.canPlay ? togglePlay(media) : setNotice(words.templates.sound.cantPlay));
  const spoken = on ? words.templates.sound.stop(label) : label;
  const Icon = on ? Pause : Play;

  return (
    <>
      {look === 'round' ? (
        <Tap accessibilityRole="button" accessibilityLabel={spoken} onPress={press} scaleTo={0.92} style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
          <Icon size={18} color={colors.onAccent} fill={colors.onAccent} style={{ marginLeft: on ? 0 : 2 }} />
        </Tap>
      ) : look === 'chip' ? (
        <Tap accessibilityRole="button" accessibilityLabel={spoken} hitSlop={9} onPress={press} scaleTo={0.94} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.fill }}>
          <Icon size={10} color={colors.text} fill={colors.text} />
          {media.seconds === null ? null : (
            <Txt variant="small" weight={700}>
              {words.templates.sound.clock(media.seconds)}
            </Txt>
          )}
        </Tap>
      ) : (
        <Tap accessibilityRole="button" accessibilityLabel={spoken} hitSlop={15} onPress={press}>
          <View>
            <Icon size={14} color={colors.text} fill={colors.text} />
          </View>
        </Tap>
      )}
      <Notice text={notice} onClose={() => setNotice(null)} />
    </>
  );
}
