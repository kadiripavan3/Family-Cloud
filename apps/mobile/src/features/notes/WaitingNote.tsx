import { CloudOff, TriangleAlert, WifiOff } from 'lucide-react-native';
import { View } from 'react-native';

import { useOnline } from '@/api/online';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { NoteBox } from '@/ui/NoteBox';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useChanges } from './changes/outbox';
import type { QueueView, Target } from './changes/types';

type Props = {
  target: Target;
  /** What waits for this list or page (`useWaiting(target)`). */
  waiting: QueueView;
  /** The two sentences in this screen's own words: with no connection, and with one that gets no answer. */
  offline: string;
  resting: string;
};

/**
 * 13.2 Offline, at the top of a list or a page: while the phone has no connection, a calm box says that
 * what is changed here is saved on the phone and will catch up. (These screens say it in their own words,
 * so the strip across the top of the app stays away: `SAYS_SO_ITSELF` in `OfflineStrip`.) The same box
 * says so when there is a connection but the API doesn't answer; when changes were tried often enough it
 * offers to try again or to let them go; and it says what came back as "gone" or "refused".
 */
export function WaitingNote({ target, waiting, offline, resting }: Props) {
  const { colors, shadow } = useTheme();
  const online = useOnline();
  const changes = useChanges();
  const frame = { marginHorizontal: layout.barGutter, marginBottom: 8 } as const;
  return (
    <>
      {!online || (waiting.held && !waiting.stuck) ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[frame, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.photo, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassLine, boxShadow: shadow.sm }]}>
          {online ? <CloudOff size={22} color={colors.warn} /> : <WifiOff size={22} color={colors.warn} />}
          <Txt variant="note" weight={600} style={{ flex: 1 }}>
            {online ? resting : offline}
          </Txt>
        </View>
      ) : null}
      {waiting.stuck ? (
        <View style={[frame, { gap: 8 }]}>
          <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={words.notes.waiting.stuckTitle(waiting.changes.length)}>
            {waiting.stuck}
          </NoteBox>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" label={words.notes.waiting.tryAgain} onPress={() => changes.retry(target)} />
            <Button size="sm" variant="line" label={words.notes.waiting.letGo} onPress={() => changes.discard(target)} />
          </View>
        </View>
      ) : null}
      {waiting.notices.length ? (
        <NoteBox
          tone="warn"
          icon={(c) => <TriangleAlert size={20} color={c} />}
          title={words.notes.waiting.noticeTitle}
          style={frame}
          trailing={<Button size="sm" variant="soft" inline label={words.notes.waiting.ok} onPress={() => changes.dismiss(target)} />}>
          {[...new Set(waiting.notices.map((notice) => notice.said))].join('\n')}
        </NoteBox>
      ) : null}
    </>
  );
}
