import { CalendarHeart, Plus, Route, Star } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { OurStoryMomentResponse, OurStoryResponse, OurStorySettings } from '@/api/generated/homeport';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDayFull, formatMonth, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { DayPicker } from '@/ui/DayPicker';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { ToggleRow } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Story = Board<OurStoryResponse, OurStorySettings>;
type Precision = 'day' | 'month' | 'year';
const say = words.couple.ourStory;
const HEART = '❤️';

/** A moment's date, as much of it as is known: "14 July 2014", "August 2015", "2015". */
export function whenOf(day: string, precision: string): string {
  return precision === 'year' ? day.slice(0, 4) : precision === 'month' ? formatMonth(day) : formatDayFull(day);
}

/**
 * 17.3 Our story. A couple's keepsake: the firsts, in order, on one line, with a count of the days since it
 * began. A moment has its date (a day, a month or only a year), a word beside it, a name, a few sentences
 * and photos; the ones that matter most carry a star. The plus adds one; a moment opens to be changed.
 */
export function OurStory({ board }: BoardScreenProps<OurStoryResponse, OurStorySettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [beginning, setBeginning] = useState(false);
  const opened = view.moments.find((one) => one.id === openId) ?? null;

  return (
    <BoardFrame
      board={board}
      title={board.title}
      subtitle={view.days === null ? undefined : say.days(view.days)}
      chip="menu"
      actions={board.canEdit ? <RoundButton label={say.add.button} onPress={() => setAdding(true)} icon={(color) => <Plus size={20} color={color} />} /> : undefined}
      menu={board.canEdit ? [{ icon: (color) => <CalendarHeart size={20} color={color} />, label: say.began.menu, note: view.sinceWords ? say.began.since(view.sinceWords) : undefined, onPress: () => setBeginning(true) }] : undefined}>
      {view.moments.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={HEART} title={say.empty.title} body={say.empty.body} action={board.canEdit ? <Button label={say.empty.button} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <View style={{ paddingTop: 16, paddingHorizontal: layout.barGutter }}>
          {/* The line the story hangs on. It starts at the first moment's dot. */}
          <View style={{ position: 'absolute', top: 26, bottom: 0, left: 27, width: 2, backgroundColor: colors.fill2 }} />
          {view.moments.map((moment) => (
            <Moment key={moment.id} moment={moment} onPress={() => setOpenId(moment.id)} />
          ))}
        </View>
      )}
      <MomentSheet board={board} visible={adding} moment={null} onClose={() => setAdding(false)} />
      <MomentSheet board={board} visible={opened !== null} moment={opened} onClose={() => setOpenId(null)} />
      <BeganSheet board={board} visible={beginning} onClose={() => setBeginning(false)} />
    </BoardFrame>
  );
}

/** One moment on the line: its dot (a star for one that matters most), its date with the word beside it, and its card. */
function Moment({ moment, onPress }: { moment: OurStoryMomentResponse; onPress: () => void }) {
  const { colors } = useTheme();
  const when = whenOf(moment.day, moment.precision);
  const photo = moment.photos[0];
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10, paddingLeft: 34 }}>
        {moment.star ? (
          <View style={{ position: 'absolute', left: -2, top: -4, width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
            <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
              <Star size={13} color={colors.onAccent} fill={colors.onAccent} />
            </View>
          </View>
        ) : (
          <View style={{ position: 'absolute', left: 4, top: 3, width: 16, height: 16, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 3, borderColor: colors.text }} />
        )}
        <Txt variant="subheading" weight={800}>
          {when}
        </Txt>
        {moment.label ? (
          <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flex: 1 }}>
            {moment.label}
          </Txt>
        ) : null}
      </View>
      <Card style={{ marginLeft: 34, marginBottom: 14 }}>
        <Tap accessibilityRole="button" accessibilityLabel={say.spoken(when, moment.label, moment.title, moment.star)} scaleTo={0.99} onPress={onPress} style={photo ? { padding: 10 } : { paddingVertical: 12, paddingHorizontal: 14 }}>
          {photo ? <Photo uri={photo.url} radius="field" style={{ height: 124, marginBottom: 8 }} /> : null}
          <View style={{ gap: photo ? 3 : 2, paddingHorizontal: photo ? 4 : 0 }}>
            <Txt variant="headline" weight={800}>
              {moment.title}
            </Txt>
            {moment.text ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
                {moment.from === 'journey' ? (
                  <View style={{ marginTop: 3 }}>
                    <Route size={13} color={colors.muted} />
                  </View>
                ) : null}
                <Txt variant="note" color="muted" style={{ flex: 1 }}>
                  {moment.text}
                </Txt>
              </View>
            ) : null}
          </View>
        </Tap>
      </Card>
    </>
  );
}

/**
 * A moment, written or changed: what happened, when (a day, or only its month or its year), the word beside
 * the date, a few sentences, a star, and a photo. An existing one can also be taken out. Someone who may
 * only look reads it here, with all its photos.
 */
function MomentSheet({ board, visible, moment, onClose }: { board: Story; visible: boolean; moment: OurStoryMomentResponse | null; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={moment ? (board.canEdit ? say.change.title : moment.title) : say.add.title} subtitle={moment && !board.canEdit ? words.common.join([whenOf(moment.day, moment.precision), moment.label]) : undefined}>
      {/* Another moment is another draft: nothing typed for the last one is carried over. */}
      {visible ? board.canEdit ? <Writing key={moment?.id ?? 'new'} board={board} moment={moment} onClose={onClose} /> : moment ? <Reading moment={moment} /> : null : null}
    </Sheet>
  );
}

function Reading({ moment }: { moment: OurStoryMomentResponse }) {
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.gutter }}>
      {moment.photos.map((photo) => (
        <Photo key={photo.id} uri={photo.url} radius="photo" style={{ height: 200 }} />
      ))}
      {moment.text ? <Txt variant="body">{moment.text}</Txt> : null}
    </View>
  );
}

function Writing({ board, moment, onClose }: { board: Story; moment: OurStoryMomentResponse | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [title, setTitle] = useState(moment?.title ?? '');
  const [day, setDay] = useState(moment?.day ?? today());
  const [precision, setPrecision] = useState<Precision>(moment?.precision === 'month' || moment?.precision === 'year' ? moment.precision : 'day');
  const [label, setLabel] = useState(moment?.label ?? '');
  const [text, setText] = useState(moment?.text ?? '');
  const [star, setStar] = useState(moment?.star ?? false);
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setProblem(null);
    setSending(true);
    try {
      // A photo goes up first; the moment is handed what came of it.
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      const fields = { title: title.trim(), day, precision, label: label.trim(), text: text.trim(), star };
      if (!moment) {
        if (await changes.add('moment', { ...fields, mediaId }, clientId.current)) onClose();
        return;
      }
      if (!(await changes.change(moment.id, fields))) return;
      // One more photo for a moment that is there already is an entry of its own.
      if (mediaId && !(await changes.add('photo', { momentId: moment.id, mediaId }, clientId.current))) return;
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
        <Field label={say.form.title} value={title} onChangeText={setTitle} maxLength={120} placeholder={say.form.titlePlaceholder} autoFocus={!moment} />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={say.form.when} value={whenOf(day, precision)} onPress={() => setPicking(true)} />
        </View>
      </View>
      <Segmented
        label={say.form.precision}
        value={precision}
        onChange={setPrecision}
        options={[
          { id: 'day', label: say.form.day },
          { id: 'month', label: say.form.month },
          { id: 'year', label: say.form.year },
        ]}
      />
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.form.label} value={label} onChangeText={setLabel} maxLength={60} placeholder={say.form.labelPlaceholder} />
        <Field label={say.form.text} value={text} onChangeText={setText} multiline maxLength={2000} placeholder={say.form.textPlaceholder} />
      </View>
      <ToggleRow first label={say.form.star} note={say.form.starNote} value={star} onChange={setStar} />
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        {photo ? <Photo uri={photo.uri} radius="photo" style={{ height: 160 }} label={say.form.photoChosen} /> : null}
        <Button
          label={photo ? say.form.changePhoto : moment?.photos.length ? say.form.anotherPhoto : say.form.addPhoto}
          variant="soft"
          block
          onPress={() => void pickPhoto().then((picked) => (picked ? setPhoto(picked) : undefined)).catch(() => setProblem(words.media.photosClosed))}
        />
        {problem || changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {problem ?? changes.problem}
          </Txt>
        ) : null}
        <Button label={moment ? say.change.save : say.add.save} size="lg" block disabled={!title.trim()} loading={sending || changes.busy} onPress={() => void save()} />
        {moment ? <Button label={say.change.remove} variant="quiet" block disabled={sending || changes.busy} onPress={() => void changes.remove(moment.id).then((gone) => (gone ? onClose() : undefined))} /> : null}
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.form.when} value={day} max={today()} byYear onChange={setDay} />
    </View>
  );
}

/** The day the count starts from, and what it began with: "Since a wedding in Piran". */
function BeganSheet({ board, visible, onClose }: { board: Story; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.began.title} subtitle={say.began.lead}>
      {visible ? <Beginning board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Beginning({ board, onClose }: { board: Story; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [since, setSince] = useState(board.settings.since ?? board.view.since ?? today());
  const [sinceWords, setSinceWords] = useState(board.settings.sinceWords ?? '');
  const [picking, setPicking] = useState(false);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.began.day} value={formatDayFull(since)} onPress={() => setPicking(true)} />
      </View>
      <Field label={say.began.words} value={sinceWords} onChangeText={setSinceWords} maxLength={80} placeholder={say.began.wordsPlaceholder} note={say.began.wordsNote} autoCapitalize="none" />
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      <Button label={say.began.save} size="lg" block loading={changes.busy} onPress={() => void changes.set({ since, sinceWords: sinceWords.trim() }).then((saved) => (saved ? onClose() : undefined))} />
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.began.day} value={since} max={today()} byYear onChange={setSince} />
    </View>
  );
}
