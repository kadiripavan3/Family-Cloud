import { ImagePlus, Search, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type DictionarySettings, type DictionaryViewResponse, type DictionaryWordResponse, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { AddBar } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { fromISODate, timeAgo, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { DayPicker } from '@/ui/DayPicker';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { List } from '@/ui/List';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { splitDraft } from './draft';

type Book = Board<DictionaryViewResponse, DictionarySettings>;
const say = words.crew.dictionary;
const BOOK = '📄';
const LOOKING = '💬';

/** What a form for a word starts from: what was typed into the box at the end of the page, or a word that is being changed. */
type Draft = { id?: string; word: string; meaning: string; part: string | null; coinedBy: string | null; origin: string; firstRecorded: string | null; seeAlso: string };

/** A day with its year, always: "4 Oct 2026". A word is first recorded once, and it stays that day. */
function dayWithYear(day: string): string {
  const date = fromISODate(day);
  return words.dates.day(date.getDate(), date.getMonth(), date.getFullYear());
}

/** Who coined a word, as the line under it names them. Null when nobody is named. */
function coinerOf(word: DictionaryWordResponse): string | null {
  return word.you ? say.you : (word.coinedBy?.name ?? word.coinedByName ?? null);
}

/** The line under a word: where it came from and who coined it. */
function sourceOf(word: DictionaryWordResponse): string {
  const who = coinerOf(word);
  if (word.firstRecorded) return say.firstRecorded(word.origin, dayWithYear(word.firstRecorded), word.you ? say.byYou : who);
  return words.common.join([who, word.origin, word.seeAlso ? say.seeAlso(word.seeAlso) : null]);
}

/**
 * 19.6 The dictionary. The words only this crew understands, each with what kind of word it is, what it
 * means, and where it came from. The newest come with the board; the rest is read a page at a time. More
 * holds the search; the box at the end starts a new word.
 */
export function Dictionary({ board }: BoardScreenProps<DictionaryViewResponse, DictionarySettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const q = searching && typed.trim().length >= 2 ? typed.trim() : undefined;
  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'word', q, day: today() }, { query: paged });
  // One template's list holds that template's own: in a dictionary every entry is a word.
  const loaded = rows(asked.data) as DictionaryWordResponse[] | undefined;
  // The newest fifty came with the board: they are there before the list has answered.
  const found = loaded ?? (q ? undefined : view.words);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = found?.find((one) => one.id === openId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Counts the words added from this phone: each one stands first, so the list goes back to its top to show it. */
  const [added, setAdded] = useState(0);

  const stopSearching = () => {
    setSearching(false);
    setTyped('');
  };
  const begin = (text: string) => {
    setDraft({ ...splitDraft(text), part: null, coinedBy: null, origin: '', firstRecorded: null, seeAlso: '' });
    return true;
  };
  const change = (word: DictionaryWordResponse) => {
    setOpenId(null);
    setDraft({ id: word.id, word: word.word, meaning: word.meaning, part: word.part, coinedBy: word.coinedBy?.memberId ?? null, origin: word.origin ?? '', firstRecorded: word.firstRecorded, seeAlso: word.seeAlso ?? '' });
  };

  return (
    <BoardFrame
      board={board}
      title={board.title}
      subtitle={say.count(view.total)}
      scroll={false}
      menu={[searching ? { icon: (color) => <X size={20} color={color} />, label: say.closeSearch, onPress: stopSearching } : { icon: (color) => <Search size={20} color={color} />, label: say.search, onPress: () => setSearching(true) }]}
      footer={board.canEdit ? <AddBar placeholder={say.add} maxLength={580} onSubmit={begin} onMic={() => setNotice(say.micNote)} micLabel={say.mic} /> : undefined}>
      {searching ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginHorizontal: layout.barGutter, paddingLeft: 16, paddingRight: 6, borderRadius: radius.pill, backgroundColor: colors.fill }}>
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
          <RoundButton label={say.closeSearch} onPress={stopSearching} icon={(color) => <X size={18} color={color} />} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {asked.isError && !found ? (
          <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
            {messageFor(asked.error)}
          </Txt>
        ) : (
          <List
            // A list keeps its place when rows are put in above it. A search and a new word both begin at the top, so each gets a list of its own.
            key={`${q ?? ''}:${added}`}
            data={found ?? []}
            keyOf={(word) => word.id}
            row={(word) => <WordCard word={word} onPress={() => setOpenId(word.id)} />}
            top={8}
            bottom={24}
            loadingMore={asked.isFetchingNextPage || (!found && asked.isPending)}
            {...more(asked)}
            empty={found ? <View style={{ paddingTop: 40 }}>{q ? <EmptyState emoji={LOOKING} title={say.none.title} body={say.none.body(q)} /> : <EmptyState emoji={board.emoji || BOOK} title={say.empty.title} body={say.empty.body} />}</View> : null}
          />
        )}
      </View>
      <WordSheet board={board} word={opened} onClose={() => setOpenId(null)} onChange={change} />
      <FormSheet board={board} draft={draft} onClose={() => setDraft(null)} onAdded={() => setAdded((count) => count + 1)} />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/** One word as the dictionary prints it: the word, what kind it is in slanted letters, what it means, and where it came from. */
function WordCard({ word, onPress }: { word: DictionaryWordResponse; onPress: () => void }) {
  const source = sourceOf(word);
  const who = word.coinedBy?.name ?? word.coinedByName ?? '';
  return (
    <Card style={{ marginHorizontal: layout.barGutter, marginBottom: 10 }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([word.part ? say.wordSpoken(word.word, word.part) : word.word, word.meaning, source])} scaleTo={0.99} onPress={onPress} style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
        <Txt variant="subtitle">
          {word.word}
          {word.part ? (
            <Txt variant="caption" italic color="muted">
              {say.afterWord(word.part)}
            </Txt>
          ) : null}
        </Txt>
        <Txt variant="body" style={{ marginTop: 4, marginBottom: 8 }}>
          {word.meaning}
        </Txt>
        {source ? (
          // The line may run a little into the card's own edge, as the drawing's longest one does, before it breaks.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: -8 }}>
            {who ? <Avatar uri={word.coinedBy?.avatarUrl} name={who} size={20} /> : null}
            <Txt variant="footnote" color="muted" numberOfLines={2} style={{ flex: 1 }}>
              {source}
            </Txt>
          </View>
        ) : null}
      </Tap>
    </Card>
  );
}

type WordSheetProps = { board: Book; word: DictionaryWordResponse | null; onClose: () => void; onChange: (word: DictionaryWordResponse) => void };

/** A word, pressed: its photo when it has one, when it was written down, and the ways to put it right or take it out. */
function WordSheet({ board, word, onClose, onChange }: WordSheetProps) {
  const changes = useBoardChanges(board);
  const close = () => {
    changes.forget();
    onClose();
  };
  return (
    <Sheet visible={word !== null} onClose={close} title={word?.word} subtitle={word?.part ?? undefined}>
      {word ? (
        <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {word.photo ? <Photo uri={word.photo.url} radius="photo" style={{ height: 180 }} label={say.photoOf(word.word)} /> : null}
          <Txt variant="bodyLarge">{word.meaning}</Txt>
          <Txt variant="footnote" color="muted">
            {words.common.join([sourceOf(word), say.added(timeAgo(word.addedAt))])}
          </Txt>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {board.canEdit ? (
            <>
              <Button label={say.change} variant="soft" size="lg" block onPress={() => onChange(word)} />
              <Button label={say.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(word.id).then((gone) => (gone ? close() : undefined))} />
            </>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** The form for a word: a new one, begun in the box at the end of the page, or one that is being put right. */
function FormSheet({ board, draft, onClose, onAdded }: { board: Book; draft: Draft | null; onClose: () => void; onAdded: () => void }) {
  return (
    <Sheet visible={draft !== null} onClose={onClose} title={draft?.id ? say.form.changeTitle : say.form.title} subtitle={say.form.lead}>
      {draft ? <Writing board={board} draft={draft} onClose={onClose} onAdded={onAdded} /> : null}
    </Sheet>
  );
}

function Writing({ board, draft, onClose, onAdded }: { board: Book; draft: Draft; onClose: () => void; onAdded: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  const [word, setWord] = useState(draft.word);
  const [meaning, setMeaning] = useState(draft.meaning);
  const [part, setPart] = useState<string | null>(draft.part);
  const [coinedBy, setCoinedBy] = useState<string | null>(draft.coinedBy ?? circle?.myMemberId ?? null);
  const [origin, setOrigin] = useState(draft.origin);
  const [firstRecorded, setFirstRecorded] = useState<string | null>(draft.firstRecorded);
  const [seeAlso, setSeeAlso] = useState(draft.seeAlso);
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A kind the crew wrote itself (a word that came with an older entry) stands with the ones offered.
  const parts = part && !say.parts.includes(part) ? [...say.parts, part] : say.parts;

  const save = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      // What is left empty is taken away from a word that had it; a new word simply goes without.
      const fields = { word: word.trim(), meaning: meaning.trim(), part, coinedByMemberId: coinedBy ?? undefined, origin: origin.trim() || null, firstRecorded, seeAlso: seeAlso.trim() || null, ...(mediaId ? { mediaId } : null) };
      const saved = draft.id ? await changes.change(draft.id, fields) : await changes.add('word', fields, clientId.current);
      if (!saved) return;
      if (!draft.id) onAdded();
      onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.form.word} value={word} onChangeText={setWord} maxLength={80} autoFocus={!draft.word} placeholder={say.form.wordPlaceholder} />
        <Field label={say.form.meaning} value={meaning} onChangeText={setMeaning} multiline maxLength={500} autoFocus={!!draft.word && !draft.meaning} placeholder={say.form.meaningPlaceholder} />
      </View>
      <View>
        <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.form.part}</GroupLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: layout.rowGutter }}>
          {parts.map((one) => (
            <Chip key={one} tone="filter" label={one} selected={one === part} onPress={() => setPart(one === part ? null : one)} />
          ))}
        </ScrollView>
      </View>
      {people.length ? (
        <View>
          <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.form.coinedBy}</GroupLabel>
          <PersonChips inset people={people} value={coinedBy} onChange={setCoinedBy} />
        </View>
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.form.origin} value={origin} onChangeText={setOrigin} maxLength={160} placeholder={say.form.originPlaceholder} />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={say.form.firstRecorded} value={firstRecorded ? dayWithYear(firstRecorded) : say.form.noDay} onPress={() => setPicking(true)} />
        </View>
        <Field label={say.form.seeAlso} value={seeAlso} onChangeText={setSeeAlso} maxLength={80} placeholder={say.form.seeAlsoPlaceholder} />
        {photo ? <Photo uri={photo.uri} radius="photo" style={{ height: 150 }} label={say.form.photoChosen} /> : null}
        <Button
          label={photo ? say.form.changePhoto : say.form.choosePhoto}
          variant="soft"
          block
          icon={(color) => <ImagePlus size={18} color={color} />}
          onPress={() =>
            void pickPhoto()
              .then((picked) => (picked ? setPhoto(picked) : undefined))
              .catch(() => setProblem(words.media.photosClosed))
          }
        />
        {problem || changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {problem ?? changes.problem}
          </Txt>
        ) : null}
        <Button label={draft.id ? say.form.saveChange : say.form.save} size="lg" block disabled={!word.trim() || !meaning.trim()} loading={sending || changes.busy} onPress={() => void save()} />
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.form.firstRecorded} value={firstRecorded ?? today()} max={today()} byYear onChange={setFirstRecorded} />
    </View>
  );
}
