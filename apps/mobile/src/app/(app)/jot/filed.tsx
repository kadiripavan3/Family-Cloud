import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Mic } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type JotResponse, useGetJots, useGetJotWays } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { KIND_ICONS } from '@/features/jot/kinds';
import { MoveSheet } from '@/features/jot/MoveSheet';
import { HeldCode, NoteCard, NoteHead, NoteLine, NoteLink } from '@/features/jot/Note';
import { OnPhoto } from '@/features/jot/OnPhoto';
import { phoneDay } from '@/features/jot/phone';
import { todaysJots } from '@/features/jot/today';
import { useJotting } from '@/features/jot/useJotting';
import { PageProblem } from '@/features/states/PageProblem';
import { formatTime } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { radius, useTheme } from '@/theme';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 14.4 It files itself: what was jotted today and where each line went, drawn as the note in the
 * notifications shows it. Every line can be undone, or moved to another kind or list. Something that looks
 * like a code hasn't been put anywhere: it waits here for "Keep in the Vault" or "It's just a note".
 */
export default function Filed() {
  const circle = useCircle();
  const asked = useGetJots(circle.id, { day: phoneDay(), limit: 100 });
  const load = loadState(asked);
  return (
    <OnPhoto photo="autumn">
      {load.error ? (
        <PageProblem tone="onPhoto" error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !asked.data ? (
        <Loading tone="onPhoto" offline={load.offline} />
      ) : (
        <Jots jots={asked.data.items} />
      )}
    </OnPhoto>
  );
}

function Jots({ jots }: { jots: JotResponse[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const pinned = useGetJotWays(circle.id).data?.pinnedNote ?? false;
  const { undo, move, keepInVault } = useJotting(circle.id);
  const [folded, setFolded] = useState(false);
  const [moving, setMoving] = useState<JotResponse | null>(null);
  const { fresh, latest, earlier } = todaysJots(jots);
  const head = latest.length === 0 ? words.jot.filed.none(pinned) : fresh ? words.jot.filed.just(latest.length, pinned) : words.jot.filed.today(latest.length, pinned);
  const problem = [undo, move].find((one) => one.isError && !moving)?.error;

  /** The lines of one card: what was filed, each with Move and Undo, then what is still held back. */
  const lines = (shown: JotResponse[], withTime: boolean) => (
    <>
      {shown
        .filter((jot) => jot.became !== 'code')
        .map((jot) => (
          <NoteLine key={jot.id} icon={KIND_ICONS[jot.became]} title={jot.title} small={withTime ? words.jot.filed.whereAt(jot.where, formatTime(jot.createdAt)) : jot.where}>
            <NoteLink label={words.jot.filed.move} spoken={words.jot.filed.moveLine(jot.title)} onPress={() => setMoving(jot)} />
            <NoteLink label={words.jot.filed.undo} spoken={words.jot.filed.undoLine(jot.title)} disabled={undo.isPending} onPress={() => undo.mutate(jot)} />
          </NoteLine>
        ))}
      {shown
        .filter((jot) => jot.became === 'code')
        .map((jot) => (
          <HeldCode key={jot.id} jot={jot} busy={move.isPending && move.variables?.jot.id === jot.id} onVault={() => keepInVault(jot)} onNote={() => move.mutate({ jot, to: 'note' })} />
        ))}
    </>
  );

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingTop: 10, paddingHorizontal: 10, paddingBottom: 30 }}>
      <NoteCard>
        <NoteHead
          small={head}
          trailing={
            <Tap accessibilityRole="button" accessibilityLabel={folded ? words.jot.filed.expand : words.jot.filed.collapse} aria-expanded={!folded} hitSlop={14} onPress={() => setFolded(!folded)}>
              {folded ? <ChevronDown size={16} color={colors.muted} /> : <ChevronUp size={16} color={colors.muted} />}
            </Tap>
          }
        />
        {folded ? null : latest.length === 0 ? (
          <Txt variant="callout" color="muted">
            {words.jot.filed.empty}
          </Txt>
        ) : (
          lines(latest, !fresh)
        )}
        {problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {messageFor(problem)}
          </Txt>
        ) : null}
        {/* The line doesn't take typing here: like a widget's, it opens the jot bar. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 3, paddingLeft: 16, paddingRight: 6, borderRadius: radius.pill, backgroundColor: colors.fill }}>
          <Tap accessibilityRole="button" accessibilityLabel={words.jot.filed.add} onPress={() => router.push('/jot')} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
            <Txt variant="item" weight={500} color="muted">
              {words.jot.filed.add}
            </Txt>
          </Tap>
          <Tap accessibilityRole="button" accessibilityLabel={words.jot.bar.voice} hitSlop={4} onPress={() => router.push('/jot/voice')} scaleTo={0.9} style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <Mic size={17} color={colors.onAccent} />
          </Tap>
        </View>
      </NoteCard>

      {earlier.length ? (
        <NoteCard>
          <NoteHead small={words.jot.filed.earlier} />
          {lines(earlier, true)}
        </NoteCard>
      ) : null}

      <MoveSheet
        jot={moving}
        circleId={circle.id}
        problem={move.isError ? messageFor(move.error) : null}
        onClose={() => {
          setMoving(null);
          move.reset();
        }}
        onMove={(to, listId) => (moving ? move.mutate({ jot: moving, to, listId }, { onSuccess: () => setMoving(null) }) : undefined)}
      />
    </ScrollView>
  );
}
