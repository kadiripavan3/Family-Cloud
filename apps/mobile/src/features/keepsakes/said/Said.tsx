import { Play, Search, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type SaidQuote, type SaidSettings, type SaidView, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { uploadSound } from '@/features/templates/media';
import { AddBar } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import { PlayButton } from '@/features/templates/parts/Play';
import { PersonChips } from '@/features/templates/parts/People';
import { pickSound, sound } from '@/features/templates/sound';
import type { LocalSound } from '@/features/templates/soundFile';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { daysBetween, formatDayFull, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

type Quotes = Board<SaidView, SaidSettings>;
const say = words.keepsakes.said;

/** Which quotes the chips show: everyone's, one person's (by member id), or only those with a recording. */
type Filter = { member?: string; voice?: boolean };
const SPEECH = '💬';
const LOOKING = '🔍';

/**
 * 15.3 Things they said. The sentences worth keeping, each with who said it and how old they were (the API
 * works the age out from the birthday), and a voice clip where one was caught. Chips show one person's or
 * only those with a voice; the magnifier searches the words. The box at the end adds one: who said it, the
 * words, and a recording if there is one.
 */
export function Said({ board }: BoardScreenProps<SaidView, SaidSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const [filter, setFilter] = useState<Filter>({});
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const q = searching && typed.trim().length >= 2 ? typed.trim() : undefined;
  // A search looks through everything that was said, whatever chip was chosen before it.
  const shown: Filter = searching ? {} : filter;
  const plain = !shown.member && !shown.voice && !q;

  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'quote', member: shown.member, filter: shown.voice ? 'voice' : undefined, q, day: today() }, { query: paged });
  // One template's list holds that template's own: on this board every entry is a quote.
  const loaded = rows(asked.data) as SaidQuote[] | undefined;
  // Everyone's newest thirty came with the board: they are there before the list has answered.
  const quotes = loaded ?? (plain ? view.latest : undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = quotes?.find((one) => one.id === openId) ?? null;

  const stopSearching = () => {
    setSearching(false);
    setTyped('');
  };

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      scroll={false}
      actions={
        searching ? <RoundButton label={say.closeSearch} onPress={stopSearching} icon={(color) => <X size={20} color={color} />} /> : <RoundButton label={say.search} onPress={() => setSearching(true)} icon={(color) => <Search size={20} color={color} />} />
      }
      footer={board.canEdit ? <AddQuote board={board} about={filter.member} /> : undefined}>
      {searching ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginHorizontal: layout.barGutter, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
          <Search size={19} color={colors.muted} />
          <TextInput
            accessibilityLabel={say.search}
            placeholder={say.search}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={typed}
            onChangeText={setTyped}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            style={[webNoOutline, textStyle('bodySmall', 500, { oneLine: true }), { flex: 1, minHeight: 46, padding: 0, color: colors.text }]}
          />
        </View>
      ) : (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
            <Chip tone="filter" label={say.everyone} count={view.total} selected={plain} onPress={() => setFilter({})} />
            {view.people.map(({ person }) => (
              <Chip
                key={person.memberId}
                tone="filter"
                label={person.name ?? ''}
                selected={filter.member === person.memberId}
                onPress={() => setFilter({ member: person.memberId })}
                icon={<Avatar uri={person.avatarUrl} name={person.name ?? ''} size={22} />}
              />
            ))}
            <Chip tone="filter" label={say.withVoice} selected={!!filter.voice} onPress={() => setFilter({ voice: true })} icon={<Play size={15} color={filter.voice ? colors.bg : colors.text} />} />
          </ScrollView>
        </View>
      )}
      <View style={{ flex: 1, marginTop: 16 }}>
        {asked.isError && !quotes ? (
          <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
            {messageFor(asked.error)}
          </Txt>
        ) : (
          <List
            data={quotes ?? []}
            keyOf={(quote) => quote.id}
            row={(quote) => <QuoteCard quote={quote} onPress={() => setOpenId(quote.id)} />}
            bottom={24}
            loadingMore={asked.isFetchingNextPage || (!quotes && asked.isPending)}
            {...more(asked)}
            empty={
              quotes ? (
                <View style={{ paddingTop: 40 }}>
                  {plain ? <EmptyState emoji={SPEECH} title={say.empty.title} body={say.empty.body} /> : <EmptyState emoji={LOOKING} title={say.none.title} body={q ? say.none.search(q) : say.none.filter} />}
                </View>
              ) : null
            }
          />
        )}
      </View>
      <QuoteSheet board={board} quote={opened} onClose={() => setOpenId(null)} />
    </BoardFrame>
  );
}

/** How long ago a quote was said, for the few days it is still news: "today", "yesterday", "4 days ago". Nothing after a week. */
function sinceOf(day: string): string | null {
  const days = daysBetween(day, today());
  return days >= 0 && days < 7 ? say.since(days) : null;
}

/** One quote: the words, then who said it, how old they were, and the recording where there is one. */
function QuoteCard({ quote, onPress }: { quote: SaidQuote; onPress: () => void }) {
  const { colors } = useTheme();
  const who = quote.who?.name ?? quote.whoName ?? '';
  const rest = words.common.join([quote.age, sinceOf(quote.day)]);
  return (
    <Card style={{ marginHorizontal: layout.barGutter, marginBottom: 10 }}>
      <Tap accessibilityRole="button" accessibilityLabel={say.quoteSpoken(quote.text, who, quote.age)} scaleTo={0.99} onPress={onPress} style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
        <Txt variant="subtitle" style={{ marginBottom: 10 }}>
          {say.quoted(quote.text)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar uri={quote.who?.avatarUrl} name={who} size={26} />
          <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flex: 1 }}>
            <Txt variant="footnote" weight={800} style={{ color: colors.text }}>
              {who}
            </Txt>
            {rest ? say.afterName(rest) : null}
          </Txt>
          {quote.voice ? <PlayButton look="chip" media={quote.voice} label={say.playVoice(who)} /> : null}
        </View>
      </Tap>
    </Card>
  );
}

/** A quote, pressed: the day it was said and who wrote it down, and the way to take it out again. */
function QuoteSheet({ board, quote, onClose }: { board: Quotes; quote: SaidQuote | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  return (
    <Sheet visible={quote !== null} onClose={onClose} title={quote ? say.quoted(quote.text) : undefined} subtitle={quote ? say.written(quote.who?.name ?? quote.whoName ?? '', sinceOf(quote.day), formatDayFull(quote.day), quote.writtenBy?.name ?? null) : undefined}>
      {quote ? (
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {board.canEdit ? <Button label={say.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(quote.id).then((gone) => (gone ? onClose() : undefined))} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** The box at the end of the page: who said it (a row of the circle's people), the words, and the microphone for a clip of it. */
function AddQuote({ board, about }: { board: Quotes; about: string | undefined }) {
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  // Children say most of what is worth keeping: they stand first.
  const order = [...people.filter((member) => member.kind === 'child'), ...people.filter((member) => member.kind !== 'child')];
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [picked, setPicked] = useState<string | null>(null);
  const [recording, setRecording] = useState<LocalSound | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const who = picked ?? about ?? board.view.people[0]?.person.memberId ?? order[0]?.id ?? null;

  const add = async (text: string) => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = recording ? await uploadSound(recording) : undefined;
      const added = await changes.add('quote', { text, saidByMemberId: who ?? undefined, mediaId }, clientId.current);
      if (!added) return false;
      clientId.current = newClientId();
      setRecording(null);
      return true;
    } catch (error) {
      setProblem(messageFor(error));
      return false;
    } finally {
      setSending(false);
    }
  };
  const mic = async () => {
    if (recording) return setRecording(null);
    if (!sound.canAdd) return setNotice(words.templates.sound.cantRecord);
    const chosen = await pickSound();
    if (chosen) setRecording(chosen);
  };

  return (
    <>
      <AddBar
        placeholder={say.add}
        busy={sending || changes.busy}
        problem={problem ?? changes.problem}
        onSubmit={add}
        onMic={() => void mic()}
        micOn={recording !== null}
        micLabel={recording ? words.templates.sound.remove : words.templates.sound.add}
        above={
          <View style={{ gap: 8 }}>
            <PersonChips people={order} value={who} onChange={setPicked} />
            {recording ? (
              <Txt variant="footnote" weight={700} accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.gutter }}>
                {words.templates.sound.attached(words.templates.sound.clock(recording.seconds ?? 0))}
              </Txt>
            ) : null}
          </View>
        }
      />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </>
  );
}
