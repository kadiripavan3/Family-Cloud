import { Search, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type HeardQuoteResponse, type HeardSettings, type HeardViewResponse, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { membersOf } from '@/features/circles/members';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { AddBar } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { daysBetween, formatDay, formatDayFull, formatTime, toISODate, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { List } from '@/ui/List';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { recentDay } from '../days';
import { useFlat } from '../people';

type Quotes = Board<HeardViewResponse, HeardSettings>;
type Quote = HeardQuoteResponse;
const say = words.flat.heard;
const SPEECH = '💬';
const LOOKING = '🔍';

/** Who said it, as the card names them: "You" for the viewer, a name written in for someone outside the flat. */
const saidBy = (quote: Quote) => (quote.you ? words.flat.you : (quote.who?.name ?? quote.whoName ?? ''));

/**
 * What stands after the name: the few words on when or what about, or else when it was said: "Sunday, 11:40"
 * within the week (the time when it was written down that same day), the date after that.
 */
function afterName(quote: Quote): string {
  if (quote.about) return quote.about;
  const ago = daysBetween(quote.day, today());
  if (ago < 0 || ago >= 7) return formatDay(quote.day);
  const written = new Date(quote.writtenAt);
  return toISODate(written) === quote.day ? say.dayAndTime(recentDay(quote.day), formatTime(written)) : recentDay(quote.day);
}

/**
 * 18.6 Heard in the kitchen. The lines that deserve to outlive the tenancy, each with who said it and when
 * or what about. The chips show one person's; the magnifier searches the words; the box at the end writes
 * one down for whoever said it. Someone who moved out is still named under what they said.
 */
export function Heard({ board }: BoardScreenProps<HeardViewResponse, HeardSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const [member, setMember] = useState<string | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const q = searching && typed.trim().length >= 2 ? typed.trim() : undefined;
  // A search looks through everything that was said, whoever's chip was chosen before it.
  const shownMember = searching ? undefined : member;
  const plain = !shownMember && !q;

  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'quote', member: shownMember, q, day: today() }, { query: paged });
  // One template's list holds that template's own: on this board every entry is a quote.
  const loaded = rows(asked.data) as Quote[] | undefined;
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
      footer={board.canEdit ? <AddQuote board={board} about={member} /> : undefined}>
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
            <Chip tone="filter" label={say.all} count={view.total} selected={plain} onPress={() => setMember(undefined)} />
            {view.people.map(({ person, you }) => (
              <Chip
                key={person.memberId}
                tone="filter"
                label={you ? words.flat.you : (person.name ?? '')}
                selected={member === person.memberId}
                onPress={() => setMember(person.memberId)}
                icon={
                  <View style={{ marginVertical: -3, marginLeft: -6 }}>
                    <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={22} />
                  </View>
                }
              />
            ))}
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
            // Another person's lines, or what a search found, are another list: it starts at its top, not where the last one was scrolled to.
            key={`${shownMember ?? 'all'} ${q ?? ''}`}
            data={quotes ?? []}
            keyOf={(quote) => quote.id}
            row={(quote) => <QuoteCard quote={quote} onPress={() => setOpenId(quote.id)} />}
            bottom={24}
            loadingMore={asked.isFetchingNextPage || (!quotes && asked.isPending)}
            {...more(asked)}
            empty={
              quotes ? (
                <View style={{ paddingTop: 40 }}>
                  {plain ? <EmptyState emoji={SPEECH} title={say.empty.title} body={say.empty.body} /> : <EmptyState emoji={LOOKING} title={say.none.title} body={q ? say.none.search(q) : say.none.person} />}
                </View>
              ) : null
            }
          />
        )}
      </View>
      <QuoteSheet key={opened?.id ?? 'none'} board={board} quote={opened} onClose={() => setOpenId(null)} />
    </BoardFrame>
  );
}

/** One line: the words, then who said them and when or what about. */
function QuoteCard({ quote, onPress }: { quote: Quote; onPress: () => void }) {
  const { colors } = useTheme();
  const who = saidBy(quote);
  const rest = afterName(quote);
  return (
    <Card style={{ marginHorizontal: layout.barGutter, marginBottom: 10 }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.quoted(quote.text), words.common.join([who, rest])])} scaleTo={0.99} onPress={onPress} style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
        <Txt variant="subtitle" style={{ marginBottom: 10 }}>
          {say.quoted(quote.text)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar uri={quote.who?.avatarUrl} name={quote.who?.name ?? quote.whoName ?? ''} size={26} />
          <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flex: 1 }}>
            <Txt variant="footnote" weight={800} style={{ color: colors.text }}>
              {who}
            </Txt>
            {words.common.after(rest)}
          </Txt>
        </View>
      </Tap>
    </Card>
  );
}

/** A line, pressed: the day it was said and who wrote it down, a few words on when or what about, and the way to take it out again. */
function QuoteSheet({ board, quote, onClose }: { board: Quotes; quote: Quote | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [about, setAbout] = useState(quote?.about ?? '');
  return (
    <Sheet visible={quote !== null} onClose={onClose} title={quote ? say.quoted(quote.text) : undefined} subtitle={quote ? say.written(saidBy(quote), formatDayFull(quote.day), quote.mine ? null : (quote.writtenBy?.name ?? null), quote.mine) : undefined}>
      {quote && board.canEdit ? (
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Field label={say.about.label} value={about} onChangeText={setAbout} maxLength={120} placeholder={say.about.placeholder} error={changes.problem} />
          <Button label={say.about.save} size="lg" block disabled={about.trim() === (quote.about ?? '')} loading={changes.busy} onPress={() => void changes.change(quote.id, { about: about.trim() }).then((saved) => (saved ? onClose() : undefined))} />
          <Button label={say.remove} variant="soft" size="lg" block disabled={changes.busy} onPress={() => void changes.remove(quote.id).then((gone) => (gone ? onClose() : undefined))} />
        </View>
      ) : null}
    </Sheet>
  );
}

/**
 * The box at the end of the page, as the drawing has it: the words, and nothing else. Whoever's chip is
 * showing said them; with everyone showing, a small sheet asks who it was: one of the flat, or a name
 * written in for someone who doesn't live here.
 */
function AddQuote({ board, about }: { board: Quotes; about: string | undefined }) {
  const { circle } = useFlat(board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [notice, setNotice] = useState<string | null>(null);
  /** The words that wait for their speaker, and what the box is told once they are added or put down. */
  const [asking, setAsking] = useState<{ text: string; done: (added: boolean) => void } | null>(null);
  const [name, setName] = useState('');

  const add = async (text: string, by: { saidByMemberId?: string; saidByName?: string }) => {
    if (!(await changes.add('quote', { text, ...by }, clientId.current))) return false;
    clientId.current = newClientId();
    return true;
  };
  const answer = async (by: { saidByMemberId?: string; saidByName?: string }) => {
    if (!asking) return;
    const added = await add(asking.text, by);
    if (!added) return;
    asking.done(true);
    setAsking(null);
    setName('');
  };
  const putDown = () => {
    asking?.done(false);
    setAsking(null);
  };

  return (
    <>
      <AddBar
        placeholder={say.add}
        busy={changes.busy}
        problem={asking ? null : changes.problem}
        onSubmit={(text) => (about ? add(text, { saidByMemberId: about }) : new Promise<boolean>((done) => setAsking({ text, done })))}
        onMic={() => setNotice(say.micNote)}
        micLabel={say.mic}
      />
      <Sheet visible={asking !== null} onClose={putDown} title={say.who.title} subtitle={asking ? say.quoted(asking.text) : undefined}>
        <View style={{ gap: 12, paddingTop: 6 }}>
          <PersonChips inset people={people} value={null} onChange={(id) => void answer({ saidByMemberId: id })} />
          <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
            <Field label={say.who.other} value={name} onChangeText={setName} maxLength={50} placeholder={say.who.otherPlaceholder} error={changes.problem} />
            <Button label={say.who.add} variant="soft" size="lg" block disabled={!name.trim()} loading={changes.busy} onPress={() => void answer({ saidByName: name.trim() })} />
          </View>
        </View>
      </Sheet>
      <Notice text={notice} onClose={() => setNotice(null)} />
    </>
  );
}
