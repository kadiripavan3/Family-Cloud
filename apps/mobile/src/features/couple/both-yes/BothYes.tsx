import { Check, Heart, Lock, Plus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { BothYesDeckResponse, BothYesIdeaResponse, BothYesResponse, BothYesSettings } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { Arrow, Sealed, Tile } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { formatWeekdayDay, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { DayPicker } from '@/ui/DayPicker';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { ToggleRow } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { UpRow } from '../parts/UpRow';

type Decks = Board<BothYesResponse, BothYesSettings>;
type Deck = BothYesDeckResponse;
const say = words.couple.bothYes;
const BALLOT = '🗳️';
/** As many decks as fit side by side in one bar; more than that are chips that scroll. */
const IN_A_BAR = 4;

/** The line under a deck in "Also deciding": how far this person is, who has finished, or what a locked one holds. */
function deckLine(deck: Deck, others: readonly string[], both: boolean): string {
  if (deck.locked) return say.deck.locked(deck.seen, deck.matches, both);
  const finished = deck.finished.map((person) => person.name ?? '');
  const still = others.filter((name) => !finished.includes(name));
  if (deck.youFinished) return still.length ? say.deck.youFinished(still) : say.deck.allFinished(deck.matches);
  return finished.length ? say.deck.theyFinished(finished) : say.deck.progress(deck.seen, deck.ideas);
}

/**
 * 17.7 Both said yes. For every small decision that turns into a negotiation: each of the people who answer
 * says yes or no to one idea at a time, in private. The page shows only what all of them said yes to; what
 * only one wanted stays unknown to the other, and the API never sends it. A deck is one decision (dinner,
 * a film, a holiday, names); a deck the app keeps behind the phone's lock stays shut where there is none.
 */
export function BothYes({ board }: BoardScreenProps<BothYesResponse, BothYesSettings>) {
  // The deck that is open stays open while it is answered, also once its last idea is through.
  const [deckId, setDeckId] = useState<string | undefined>(board.view.deck?.id);
  const part = useBoardPart(board, deckId);
  const view = part.board.view;
  const changes = useBoardChanges(board);
  const circle = useCircles().find((one) => one.id === board.circleId);
  const [adding, setAdding] = useState(false);
  const open = view.deck;
  const deck = view.decks.find((one) => one.id === (open?.id ?? deckId)) ?? null;
  const both = view.people.length === 2;
  /** The first names of the others who answer: who can't see this person's answers. */
  const others = view.people.filter((person) => person.memberId !== circle?.myMemberId).map((person) => person.name ?? '');

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      problem={changes.problem ?? part.problem}
      actions={board.canEdit ? <RoundButton label={say.add.button} onPress={() => setAdding(true)} icon={(color) => <Plus size={20} color={color} />} /> : undefined}>
      {view.decks.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={BALLOT} title={say.empty.title} body={say.empty.body} action={board.canEdit ? <Button label={say.empty.button} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <>
          {view.decks.length <= IN_A_BAR ? (
            <Segmented label={say.decks} value={deck?.id ?? ''} onChange={setDeckId} options={view.decks.map((one) => ({ id: one.id, label: one.label }))} />
          ) : (
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
                {view.decks.map((one) => (
                  <Chip key={one.id} tone="filter" label={one.label} selected={one.id === deck?.id} onPress={() => setDeckId(one.id)} />
                ))}
              </ScrollView>
            </View>
          )}

          {deck?.locked ? (
            <Slip icon="lock" title={say.locked.title(deck.name)} line={say.locked.line} />
          ) : open?.card && view.youAnswer ? (
            <>
              <Slip emoji={open.card.emoji ?? deck?.emoji} title={open.card.text} line={words.common.join([say.card.count(open.number, open.of), say.card.private(others)])} />
              <Answer idea={open.card} busy={changes.busy || part.waiting} onSay={(yes) => void changes.act('say', { ideaId: open.card?.id, yes })} />
            </>
          ) : open && open.of === 0 ? (
            <Slip emoji={deck?.emoji} title={say.noIdeas.title(deck?.name ?? '')} line={board.canEdit ? say.noIdeas.line : say.watching.line} />
          ) : open ? (
            <Slip emoji={deck?.emoji} title={view.youAnswer ? say.through.title(deck?.name ?? '') : say.watching.title(view.people.map((person) => person.name ?? ''))} line={view.youAnswer ? say.through.line(open.of) : say.watching.line} />
          ) : null}

          {open && !deck?.locked && open.matches.length ? <Matches matches={open.matches} both={both} /> : null}

          {view.decks.length > 1 ? (
            <>
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.also}</GroupLabel>
              {view.decks
                .filter((one) => one.id !== deck?.id)
                .map((one) => (
                  <UpRow key={one.id} leading={<Tile emoji={one.emoji ?? BALLOT} size={44} />} title={one.name} line={deckLine(one, others, both)} trailing={one.locked ? <Sealed /> : <Arrow />} onPress={() => setDeckId(one.id)} />
                ))}
            </>
          ) : null}
        </>
      )}
      <AddSheet board={board} deck={deck?.locked ? null : deck} visible={adding} onClose={() => setAdding(false)} onDeck={setDeckId} />
    </BoardFrame>
  );
}

/** The slip the idea is written on, a little askew: its emoji (or a lock), its words, and a small line. */
function Slip({ emoji, icon, title, line }: { emoji?: string | null; icon?: 'lock'; title: string; line: string }) {
  const { colors, shadow } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6, marginTop: 14, marginHorizontal: 24, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: radius.cardLarge, backgroundColor: colors.surface, boxShadow: shadow.md, transform: [{ rotate: '-1.5deg' }] }}>
      {icon === 'lock' ? <Lock size={44} color={colors.muted} strokeWidth={1.8} /> : <Emoji char={emoji || BALLOT} size={52} />}
      <Txt variant="title" weight={800} center accessibilityRole="header">
        {title}
      </Txt>
      <Txt variant="caption" color="muted" center>
        {line}
      </Txt>
    </View>
  );
}

/** No and yes: two round buttons under the slip. */
function Answer({ idea, busy, onSay }: { idea: BothYesIdeaResponse; busy: boolean; onSay: (yes: boolean) => void }) {
  const { colors, shadow } = useTheme();
  const round = { width: 58, height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.md, opacity: busy ? 0.5 : 1 } as const;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 26, marginTop: 14 }}>
      <Tap accessibilityRole="button" accessibilityLabel={say.card.no(idea.text)} accessibilityState={{ disabled: busy }} aria-disabled={busy} disabled={busy} onPress={() => onSay(false)} style={[round, { backgroundColor: colors.surface }]}>
        <X size={24} color={colors.text} strokeWidth={2.4} />
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel={say.card.yes(idea.text)} accessibilityState={{ disabled: busy }} aria-disabled={busy} disabled={busy} onPress={() => onSay(true)} style={[round, { backgroundColor: colors.accent }]}>
        <Heart size={24} color={colors.onAccent} fill={colors.onAccent} strokeWidth={2.4} />
      </Tap>
    </View>
  );
}

/** What everyone said yes to in the open deck. Nothing else of anyone's answers is ever here. */
function Matches({ matches, both }: { matches: readonly BothYesIdeaResponse[]; both: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginHorizontal: layout.barGutter, padding: 14, borderRadius: radius.card, backgroundColor: colors.accentSoft }}>
      <Check size={24} color={colors.accentText} />
      <View style={{ flex: 1 }}>
        <Txt variant="headline" weight={800}>
          {say.match.title(
            matches.map((match) => match.text),
            both,
          )}
        </Txt>
        <Txt variant="footnote" color="muted">
          {say.match.line(both)}
        </Txt>
      </View>
    </View>
  );
}

/** What the + adds: an idea to the deck that is open, or a new deck. */
function AddSheet({ board, deck, visible, onClose, onDeck }: { board: Decks; deck: Deck | null; visible: boolean; onClose: () => void; onDeck: (id: string) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title}>
      {visible ? <Adding board={board} deck={deck} onClose={onClose} onDeck={onDeck} /> : null}
    </Sheet>
  );
}

function Adding({ board, deck, onClose, onDeck }: { board: Decks; deck: Deck | null; onClose: () => void; onDeck: (id: string) => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [what, setWhat] = useState<'idea' | 'deck'>(deck ? 'idea' : 'deck');
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState('');
  const [label, setLabel] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [picking, setPicking] = useState(false);

  const save = async () => {
    const typed = text.trim();
    if (what === 'idea') {
      if (await changes.add('idea', { deckId: deck?.id, text: typed, emoji: emoji.trim() || undefined }, clientId.current)) onClose();
      return;
    }
    const added = await changes.add('deck', { name: typed, label: label.trim() || typed, emoji: emoji.trim() || undefined, day: day ?? undefined, locked }, clientId.current);
    if (!added) return;
    onDeck(added);
    onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      {deck ? (
        <Segmented
          label={say.add.what}
          value={what}
          onChange={setWhat}
          options={[
            { id: 'idea', label: say.add.idea(deck.label) },
            { id: 'deck', label: say.add.deck },
          ]}
        />
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={what === 'idea' ? say.add.ideaLabel : say.add.deckLabel} value={text} onChangeText={setText} maxLength={what === 'idea' ? 200 : 80} autoFocus placeholder={what === 'idea' ? say.add.ideaPlaceholder : say.add.deckPlaceholder} />
        {what === 'deck' ? <Field label={say.add.tab} value={label} onChangeText={setLabel} maxLength={20} placeholder={say.add.tabPlaceholder} note={say.add.tabNote} /> : null}
        <Field label={say.add.emoji} value={emoji} onChangeText={setEmoji} maxLength={16} placeholder={say.add.emojiPlaceholder} />
        {what === 'deck' ? (
          <View style={{ flexDirection: 'row' }}>
            <FieldButton label={say.add.day} value={day ? formatWeekdayDay(day) : say.add.noDay} onPress={() => setPicking(true)} />
          </View>
        ) : null}
      </View>
      {what === 'deck' ? <ToggleRow first label={say.add.locked} note={say.add.lockedNote} value={locked} onChange={setLocked} /> : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        <Button label={what === 'idea' ? say.add.saveIdea : say.add.saveDeck} size="lg" block disabled={!text.trim()} loading={changes.busy} onPress={() => void save()} />
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.add.day} value={day ?? today()} min={today()} onChange={setDay} />
    </View>
  );
}
