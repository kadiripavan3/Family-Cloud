import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, type LucideIcon, Moon, Pencil, Send, Sun, Wifi } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { getGetJotWaysQueryKey, saveJotWays, useGetJots, useGetJotWays, type WaysResponse } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { KIND_ICONS } from '@/features/jot/kinds';
import { NoteCard, NoteHead, NoteLine } from '@/features/jot/Note';
import { OnPhoto, OnPhotoNote } from '@/features/jot/OnPhoto';
import { phoneDay } from '@/features/jot/phone';
import { ensurePinnedNote, turnOffPinnedNote, turnOnPinnedNote } from '@/features/jot/pinned/service';
import { batches, todaysJots } from '@/features/jot/today';
import { useJotting } from '@/features/jot/useJotting';
import { pushSupport } from '@/features/notifications/support';
import { PageProblem } from '@/features/states/PageProblem';
import { formatTime } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { radius, textStyle, useTheme, withAlpha } from '@/theme';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Toggle } from '@/ui/Toggle';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** How many of today's lines the note lists, as the real one does. */
const LINES = 5;

/**
 * 14.3 A note pinned in notifications, as the app shows it: the note as it looks in the phone's
 * notifications, drawn from today's jots, with a line that adds for real. The switch under it turns the
 * real note on where one can exist (a phone build; see features/jot/pinned/service.ts). In a browser and in
 * Expo Go the switch still saves the choice, and the line under it says where the note will show.
 */
export default function Pinned() {
  const circle = useCircle();
  const jots = useGetJots(circle.id, { day: phoneDay(), limit: 100 });
  const ways = useGetJotWays(circle.id);
  const load = loadState(jots, ways);
  return (
    <OnPhoto photo="autumn">
      {load.error ? (
        <PageProblem tone="onPhoto" error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !jots.data || !ways.data ? (
        <Loading tone="onPhoto" offline={load.offline} />
      ) : (
        <Note ways={ways.data} lines={batches(todaysJots(jots.data.items).latest.concat(todaysJots(jots.data.items).earlier)).slice(-LINES)} />
      )}
    </OnPhoto>
  );
}

function Note({ ways, lines }: { ways: WaysResponse; lines: ReturnType<typeof batches> }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const client = useQueryClient();
  const cache = useCache();
  const support = pushSupport();
  const { file } = useJotting(circle.id);
  const [text, setText] = useState('');
  const [folded, setFolded] = useState(false);
  /** What came of switching the real note on, on this phone. */
  const [blocked, setBlocked] = useState(false);
  const clientId = useRef(newClientId());

  // The account says the note is on and this phone hasn't got it yet (a new phone): it goes up, without asking anything.
  useEffect(() => {
    if (ways.pinnedNote) void ensurePinnedNote({ circleId: circle.id, circleName: circle.name });
  }, [ways.pinnedNote, circle.id, circle.name]);

  const typed = text.trim();
  const add = () => {
    if (!typed || file.isPending) return;
    file.mutate(
      { text: typed, source: 'app', clientId: clientId.current },
      {
        onSuccess: () => {
          clientId.current = newClientId();
          setText('');
        },
      },
    );
  };
  const save = useMutation({
    mutationFn: (pinnedNote: boolean) => saveJotWays(circle.id, { pinnedNote }),
    onMutate: (pinnedNote) => void client.setQueryData<WaysResponse>(getGetJotWaysQueryKey(circle.id), (old) => (old ? { ...old, pinnedNote } : old)),
    onSuccess: (saved) => void cache.jotWaysSaved(circle.id, saved),
    onError: () => void client.invalidateQueries({ queryKey: getGetJotWaysQueryKey(circle.id) }),
  });
  const pin = async (next: boolean) => {
    save.mutate(next);
    setBlocked(false);
    if (!next) return turnOffPinnedNote();
    setBlocked((await turnOnPinnedNote({ circleId: circle.id, circleName: circle.name })) === 'blocked');
  };
  const where = support !== 'ready' ? words.jot.pinned.where[support] : blocked ? words.jot.pinned.where.blocked : words.jot.pinned.where[Platform.OS === 'ios' ? 'ios' : 'android'];
  const problem = [file, save].find((one) => one.isError)?.error;

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 6, paddingHorizontal: 10, paddingBottom: 30 }}>
        {/* The phone's quick-settings tiles. Only "Jot" is the app's own: from any screen, it opens the jot bar. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 2 }}>
          <Tile icon={Wifi} label={words.jot.pinned.tiles.wifi} on />
          <Tile icon={Moon} label={words.jot.pinned.tiles.quiet} />
          <Tile icon={Sun} label={words.jot.pinned.tiles.torch} />
          <Tile icon={Pencil} label={words.jot.pinned.tiles.jot} spoken={words.jot.pinned.jotTile} onPress={() => router.push('/jot')} />
        </View>

        <NoteCard>
          <NoteHead
            small={words.jot.pinned.head(circle.name)}
            trailing={
              <Tap accessibilityRole="button" accessibilityLabel={folded ? words.jot.filed.expand : words.jot.filed.collapse} aria-expanded={!folded} hitSlop={14} onPress={() => setFolded(!folded)}>
                {folded ? <ChevronDown size={16} color={colors.muted} /> : <ChevronUp size={16} color={colors.muted} />}
              </Tap>
            }
          />
          {folded ? null : lines.length === 0 ? (
            <Txt variant="callout" color="muted">
              {words.jot.pinned.empty}
            </Txt>
          ) : (
            lines.map((row) => <NoteLine key={row.id} icon={KIND_ICONS[row.became]} title={row.titles.join(', ')} small={words.jot.filed.whereAt(row.where, formatTime(row.at))} />)
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 3, paddingLeft: 16, paddingRight: 6, borderRadius: radius.pill, backgroundColor: colors.fill }}>
            <TextInput
              accessibilityLabel={words.jot.pinned.field}
              placeholder={words.jot.pinned.field}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={text}
              onChangeText={setText}
              maxLength={2000}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={add}
              style={[webNoOutline, textStyle('item', 600, { oneLine: true }), { flex: 1, minWidth: 0, minHeight: 24, padding: 0, color: colors.text }]}
            />
            <Tap
              accessibilityRole="button"
              accessibilityLabel={words.jot.pinned.send}
              accessibilityState={{ disabled: !typed, busy: file.isPending }}
              disabled={!typed || file.isPending}
              hitSlop={4}
              onPress={add}
              scaleTo={0.9}
              style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: typed ? 1 : 0.5 }}>
              <Send size={17} color={colors.onAccent} />
            </Tap>
          </View>
          {problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {messageFor(problem)}
            </Txt>
          ) : null}
        </NoteCard>

        <OnPhotoNote>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 38 }}>
            <Txt variant="item" weight={700} color="onPhoto" style={{ flex: 1 }}>
              {words.jot.pinned.switch}
            </Txt>
            <Toggle label={words.jot.pinned.switch} value={ways.pinnedNote} onChange={(next) => void pin(next)} />
          </View>
          <Txt variant="footnote" color="onPhoto" accessibilityLiveRegion="polite" style={{ marginTop: 6, opacity: 0.84 }}>
            {where}
          </Txt>
        </OnPhotoNote>
      </ScrollView>
    </AvoidKeyboard>
  );
}

/** One quick-settings tile. The phone's own are scenery; the app's can be pressed. */
function Tile({ icon: Icon, label, on, spoken, onPress }: { icon: LucideIcon; label: string; on?: boolean; spoken?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const color = on ? colors.onAccent : colors.white;
  const inside = (
    <>
      <Icon size={20} color={color} />
      <Txt variant="callout" weight={700} numberOfLines={1} style={{ flex: 1, color }}>
        {label}
      </Txt>
    </>
  );
  const frame = { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? colors.accent : withAlpha(colors.white, 0.16) } as const;
  if (!onPress) return <View style={frame}>{inside}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken ?? label} onPress={onPress} style={frame}>
      {inside}
    </Tap>
  );
}
