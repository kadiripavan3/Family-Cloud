import { MailOpen, Pencil, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { type TuckedNotesNoteResponse, type TuckedNotesResponse, type TuckedNotesSettings, type TuckedNotesWayResponse, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { readTime } from '@/features/plan/times';
import { BoardFrame } from '@/features/templates/BoardFrame';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { addDays, atTime, daysBetween, formatDay, formatTime, formatWeekdayDay, formatWeekdayLong, toISODate, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { AccentCard, CardButton } from '../parts/AccentCard';

type Notes = Board<TuckedNotesResponse, TuckedNotesSettings>;
type Note = TuckedNotesNoteResponse;
/** The ways a note can turn up, by the API's own words for them. */
type Way = 'this_week' | 'at' | 'lands' | 'rains';
const say = words.couple.tucked;

const isWay = (way: string): way is Way => way === 'this_week' || way === 'at' || way === 'lands' || way === 'rains';

/** When a note was found, the way it is said a few days on: "today", "on Tuesday", "on 31 Oct". */
function foundWhen(foundAt: string): string {
  const day = toISODate(new Date(foundAt));
  const ago = daysBetween(day, today());
  return ago === 0 ? say.found.today : ago === 1 ? say.found.yesterday : ago > 1 && ago < 7 ? say.found.on(formatWeekdayLong(day)) : say.found.on(formatDay(day));
}

/**
 * 17.4 Tucked notes. A note that hides and waits: written now, it turns up for the other one at a moment
 * neither of them knows, or at one its writer picks. Until then its reader is told only that a note is
 * waiting (on Today), and the API hands this screen none of it. The writer sees their own, can change how
 * it turns up and can take it back; what was found stays, for both.
 */
export function Tucked({ board }: BoardScreenProps<TuckedNotesResponse, TuckedNotesSettings>) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const [writing, setWriting] = useState(false);
  const [listing, setListing] = useState(false);
  const [timing, setTiming] = useState(false);
  const [all, setAll] = useState(false);
  /** How the next note turns up, while none is tucked away to show it. */
  const [nextWay, setNextWay] = useState<Way>('this_week');
  const tucked = view.tucked[0] ?? null;
  const way: Way = tucked && isWay(tucked.turnsUp) ? tucked.turnsUp : nextWay;
  const reader = view.readers.length === 1 ? (view.readers[0]?.name ?? null) : null;

  /** A chip was pressed: it changes how the note in the card turns up, or, with none there, how the next one will. */
  const choose = (chosen: Way) => {
    if (!tucked) return setNextWay(chosen);
    if (chosen === 'at') return setTiming(true);
    if (chosen !== tucked.turnsUp) void changes.change(tucked.id, { turnsUp: chosen });
  };

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      problem={changes.problem}
      actions={<RoundButton label={say.write.button} onPress={() => setWriting(true)} icon={(color) => <Plus size={20} color={color} />} />}
      menu={view.tucked.length ? [{ icon: (color) => <MailOpen size={20} color={color} />, label: say.still.menu, note: say.still.count(view.tucked.length), onPress: () => setListing(true) }] : undefined}>
      <View style={{ gap: 10 }}>
        {view.turnedUp.map((note) => (
          <AccentCard key={note.id} eyebrow={say.turnedUp.eyebrow(note.from?.name ?? '')} title={say.quoted(note.text)} line={say.turnedUp.line}>
            <CardButton label={say.turnedUp.keep} loading={changes.busy} onPress={() => void changes.act('found', { entryId: note.id })} />
          </AccentCard>
        ))}
        {tucked ? (
          <AccentCard eyebrow={say.tucked.eyebrow(tucked.forPerson?.name ?? '')} title={say.quoted(tucked.text)} line={lineOf(tucked, view.ways)}>
            <CardButton label={say.tucked.another} icon={(color) => <Pencil size={16} color={color} />} onPress={() => setWriting(true)} />
            {view.tucked.length > 1 ? <CardButton soft label={say.tucked.more(view.tucked.length - 1)} onPress={() => setListing(true)} /> : null}
          </AccentCard>
        ) : view.turnedUp.length === 0 ? (
          <AccentCard eyebrow={say.none.eyebrow} title={say.none.title} line={say.none.line(reader)}>
            <CardButton label={say.none.button} icon={(color) => <Pencil size={16} color={color} />} onPress={() => setWriting(true)} />
          </AccentCard>
        ) : null}
      </View>

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.turnsUp}</GroupLabel>
      <Ways ways={view.ways} value={way} reader={reader} onChange={choose} />
      <Waits ways={view.ways} way={way} />

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.found.label(view.found)}</GroupLabel>
      <Found board={board} all={all} onAll={() => setAll(true)} />

      <WriteSheet board={board} visible={writing} way={tucked ? 'this_week' : nextWay} onClose={() => setWriting(false)} />
      <StillSheet board={board} visible={listing} onClose={() => setListing(false)} />
      <AtSheet board={board} visible={timing} note={tucked} onClose={() => setTiming(false)} />
    </BoardFrame>
  );
}

/** The line under a note that is still tucked away: when it will have turned up by, the time that was set, or what it waits for. */
function lineOf(note: Note, ways: readonly TuckedNotesWayResponse[]): string {
  if (note.turnsUp === 'at' && note.at) return say.tucked.at(formatWeekdayDay(toISODate(new Date(note.at))), formatTime(note.at));
  if (note.waiting) return say.tucked.waiting(ways.find((one) => one.way === note.turnsUp)?.waitsFor ?? null);
  return note.before ? say.tucked.before(formatWeekdayLong(note.before)) : say.tucked.someTime;
}

/** The ways a note can turn up, as chips, in the API's order. */
function Ways({ ways, value, reader, onChange, inset }: { ways: readonly TuckedNotesWayResponse[]; value: Way; reader: string | null; onChange: (way: Way) => void; inset?: boolean }) {
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: inset ? layout.rowGutter : layout.barGutter }}>
        {ways.map(({ way }) => (isWay(way) ? <Chip key={way} tone="filter" label={say.ways[way](reader)} selected={way === value} onPress={() => onChange(way)} /> : null))}
      </ScrollView>
    </View>
  );
}

/** Said under the chips for a way nothing sends the signal for yet: the note is kept, and waits. */
function Waits({ ways, way, inset }: { ways: readonly TuckedNotesWayResponse[]; way: Way; inset?: boolean }) {
  const chosen = ways.find((one) => one.way === way);
  if (!chosen || chosen.works) return null;
  return (
    <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: inset ? layout.rowGutter : layout.gutter }}>
      {say.waits(chosen.waitsFor)}
    </Txt>
  );
}

/** What was found so far: the last five as the board sends them, or, once asked for, all of them a page at a time. */
function Found({ board, all, onAll }: { board: Notes; all: boolean; onAll: () => void }) {
  const view = board.view;
  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'note', day: today() }, { query: { ...paged, enabled: all } });
  // The list holds every note this person may read; the ones still tucked away are not "found".
  const loaded = (rows(asked.data) as Note[] | undefined)?.filter((note) => note.found);
  const notes = all && loaded ? loaded : view.foundLately;
  if (view.found === 0) {
    return (
      <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
        {say.found.none}
      </Txt>
    );
  }
  return (
    <>
      {notes.map((note) => (
        <FoundCard key={note.id} note={note} />
      ))}
      {!all && view.found > view.foundLately.length ? (
        <Button label={say.found.all(view.found)} variant="soft" style={{ alignSelf: 'center', marginTop: 4 }} onPress={onAll} />
      ) : all && (asked.hasNextPage || asked.isPending) ? (
        <Button label={words.common.showMore} variant="soft" loading={asked.isFetchingNextPage || asked.isPending} style={{ alignSelf: 'center', marginTop: 4 }} onPress={() => void asked.fetchNextPage()} />
      ) : null}
    </>
  );
}

/** A note that was found: its words, who wrote it, and who found it when. */
function FoundCard({ note }: { note: Note }) {
  const from = note.from?.name ?? '';
  const when = note.foundAt ? say.found.when(note.mine ? (note.forPerson?.name ?? null) : null, foundWhen(note.foundAt), formatTime(note.foundAt)) : null;
  return (
    <Card style={{ marginHorizontal: layout.barGutter, marginBottom: 10, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
      <Txt variant="subtitle" weight={800} style={{ marginBottom: 10 }}>
        {say.quoted(note.text)}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar uri={note.from?.avatarUrl} name={from} size={26} />
        <Txt variant="footnote" color="muted" style={{ flex: 1 }}>
          <Txt variant="footnote" weight={800}>
            {note.mine ? say.you : from}
          </Txt>
          {when ? words.common.after(when) : null}
        </Txt>
      </View>
    </Card>
  );
}

/** A new note: its words, who it is for when there is a choice, and how it turns up. */
function WriteSheet({ board, visible, way, onClose }: { board: Notes; visible: boolean; way: Way; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.write.title} subtitle={say.write.lead}>
      {visible ? <Writing board={board} startsAs={way} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Writing({ board, startsAs, onClose }: { board: Notes; startsAs: Way; onClose: () => void }) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [text, setText] = useState('');
  const [way, setWay] = useState<Way>(startsAs);
  const [forId, setForId] = useState<string | null>(view.readers[0]?.memberId ?? null);
  const [day, setDay] = useState(addDays(today(), 1));
  const [time, setTime] = useState('');
  const [picking, setPicking] = useState(false);
  const reader = view.readers.find((one) => one.memberId === forId)?.name ?? null;
  const at = way === 'at' ? atTime(day, readTime(time) ?? '') : null;
  // (A time that has passed already is the API's to refuse: it knows the moment better than a screen that was left open.)
  const ready = text.trim().length > 0 && (way !== 'at' || at !== null);

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={say.write.note} value={text} onChangeText={setText} multiline maxLength={1000} autoFocus placeholder={say.write.placeholder} />
      </View>
      {view.readers.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: layout.rowGutter }}>
          {view.readers.map((person) => (
            <Chip key={person.memberId} tone="filter" label={person.name ?? ''} selected={person.memberId === forId} onPress={() => setForId(person.memberId ?? null)} icon={<Avatar uri={person.avatarUrl} name={person.name ?? ''} size={22} />} />
          ))}
        </ScrollView>
      ) : null}
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.rowGutter }}>
          {say.turnsUp}
        </Txt>
        <Ways inset ways={view.ways} value={way} reader={reader} onChange={setWay} />
        <Waits inset ways={view.ways} way={way} />
      </View>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        {way === 'at' ? <AtFields day={day} time={time} onDay={() => setPicking(true)} onTime={setTime} /> : null}
        <NoteBox soft icon={(color) => <MailOpen size={20} color={color} />}>
          {say.write.hidden(reader)}
        </NoteBox>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        <Button
          label={say.write.save}
          size="lg"
          block
          disabled={!ready}
          loading={changes.busy}
          onPress={() => void changes.add('note', { text: text.trim(), forMemberId: view.readers.length > 1 ? (forId ?? undefined) : undefined, turnsUp: way, at: at ? at.toISOString() : undefined }, clientId.current).then((added) => (added ? onClose() : undefined))}
        />
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.at.day} value={day} min={today()} onChange={setDay} />
    </View>
  );
}

/** The day and the time of a note that turns up at a moment its writer picks. The time is typed the way it is said. */
function AtFields({ day, time, onDay, onTime }: { day: string; time: string; onDay: () => void; onTime: (time: string) => void }) {
  const read = readTime(time);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.at.day} value={formatWeekdayDay(day)} onPress={onDay} />
      </View>
      <Field
        label={say.at.time}
        value={time}
        onChangeText={onTime}
        maxLength={8}
        placeholder={say.at.timePlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        error={time.trim() && !read ? say.at.notATime : null}
        note={read ? say.at.reads(read) : null}
      />
    </View>
  );
}

/** A time for the note that is tucked away already: "tomorrow at half past seven". */
function AtSheet({ board, visible, note, onClose }: { board: Notes; visible: boolean; note: Note | null; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.at.title} subtitle={say.at.lead}>
      {visible && note ? <PickingAt board={board} note={note} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PickingAt({ board, note, onClose }: { board: Notes; note: Note; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [day, setDay] = useState(note.at ? toISODate(new Date(note.at)) : addDays(today(), 1));
  const [time, setTime] = useState(note.at ? formatTime(note.at) : '');
  const [picking, setPicking] = useState(false);
  const at = atTime(day, readTime(time) ?? '');
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <AtFields day={day} time={time} onDay={() => setPicking(true)} onTime={setTime} />
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      <Button label={say.at.save} size="lg" block disabled={!at} loading={changes.busy} onPress={() => (at ? void changes.change(note.id, { turnsUp: 'at', at: at.toISOString() }).then((saved) => (saved ? onClose() : undefined)) : undefined)} />
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.at.day} value={day} min={today()} onChange={setDay} />
    </View>
  );
}

/** The notes this person has tucked away that haven't turned up: each can be taken back until it has. */
function StillSheet({ board, visible, onClose }: { board: Notes; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const notes = board.view.tucked;
  return (
    <Sheet visible={visible} onClose={onClose} title={say.still.title} subtitle={say.still.lead}>
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.gutter, marginBottom: 8 }}>
          {changes.problem}
        </Txt>
      ) : null}
      <RowGroup>
        {notes.map((note, index) => (
          <View key={note.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="item" weight={600}>
                {say.quoted(note.text)}
              </Txt>
              <Txt variant="footnote" color="muted">
                {words.common.join([say.still.forName(note.forPerson?.name ?? ''), lineOf(note, board.view.ways)])}
              </Txt>
            </View>
            <Button label={say.still.takeBack} spoken={say.still.takeBackSpoken(note.text)} variant="soft" size="sm" inline loading={changes.busyWith === note.id} onPress={() => void changes.remove(note.id).then((gone) => (gone && notes.length === 1 ? onClose() : undefined))} />
          </View>
        ))}
      </RowGroup>
    </Sheet>
  );
}
