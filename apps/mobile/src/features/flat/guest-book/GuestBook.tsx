import { ImagePlus, PenLine, Printer, RefreshCw, ScanLine, Share } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type GuestBookLineResponse, type GuestBookSettings, type GuestBookViewResponse, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { Notice } from '@/features/templates/parts/Notice';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDayFull, formatMonthName, monthOf, addMonths, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { shareText } from '@/lib/share';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { List } from '@/ui/List';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { called, useFlat } from '../people';
import { QrCode } from './QrCode';

type Book = Board<GuestBookViewResponse, GuestBookSettings>;
type Line = GuestBookLineResponse;
const say = words.flat.guestBook;
const KEY = '🔑';

/** The small line under what a guest wrote: who they are, and how long they stayed. The month is named while the stay is still recent. */
function guestLine(line: Line): string {
  const recent = monthOf(line.day) >= addMonths(monthOf(today()), -1);
  return say.guest(line.name, line.about, line.nights, recent ? formatMonthName(line.day) : null);
}

/**
 * 18.7 The guest book. A code by the front door: guests scan it and leave a line and a photo, with no app
 * and no account. The page is the book, newest first. What comes through the door waits at the top, seen
 * only by the people who live here, until one of them lets it in or turns it away. "Print" shows the code,
 * drawn here from the door's link; the button in the bar shares the link.
 */
export function GuestBook({ board }: BoardScreenProps<GuestBookViewResponse, GuestBookSettings>) {
  const view = board.view;
  const { me } = useFlat(board.circleId);
  const changes = useBoardChanges(board);
  const [sheet, setSheet] = useState<'code' | 'write' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [turningAway, setTurningAway] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title?: string; text: string } | null>(null);

  // The newest thirty lines came with the board. A longer book is read a page at a time.
  const long = view.guests > view.latest.length;
  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'line', day: today() }, { query: { ...paged, enabled: long } });
  // One template's list holds that template's own: on this board every entry that is listed is a line. Those that wait stand above the book, not in it.
  const loaded = (rows(asked.data) as Line[] | undefined)?.filter((line) => !line.waiting);
  const lines = (long ? loaded : undefined) ?? view.latest;
  const opened = lines.find((line) => line.id === openId) ?? null;
  const mayWrite = view.decides && board.canEdit;

  const share = async () => {
    if (!view.link) return setNotice({ text: say.share.notYours });
    const how = await shareText(say.share.message(board.title, view.link));
    if (how !== 'shared') setNotice({ title: how === 'copied' ? say.share.copiedTitle : undefined, text: how === 'copied' ? say.share.copied : say.share.failed });
  };
  const menu: MenuRow[] = mayWrite ? [{ icon: (color) => <PenLine size={20} color={color} />, label: say.write.open, onPress: () => setSheet('write') }] : [];

  const header = (
    <View>
      <NoteBox
        soft
        icon={(color) => <ScanLine size={20} color={color} />}
        title={say.code.title}
        trailing={
          view.link ? (
            <View style={{ alignSelf: 'center' }}>
              <Button label={say.code.print} size="sm" inline onPress={() => setSheet('code')} />
            </View>
          ) : undefined
        }
        style={{ marginHorizontal: layout.barGutter, marginBottom: 16 }}>
        {say.count(view.guests, view.nights, view.since)}
      </NoteBox>
      {view.waiting.length ? (
        <View style={{ marginBottom: 6 }}>
          <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{say.waiting.label}</GroupLabel>
          {view.waiting.map((line) => (
            <Card key={line.id} style={{ gap: 12, marginHorizontal: layout.barGutter, marginBottom: 10, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
              <LineBody line={line} />
              {mayWrite ? (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <Button label={say.waiting.no} spoken={say.waiting.noSpoken(line.name)} variant="soft" size="sm" inline disabled={changes.busy} onPress={() => setTurningAway(line.id)} />
                  <Button label={say.waiting.yes} spoken={say.waiting.yesSpoken(line.name)} size="sm" inline disabled={changes.busy} onPress={() => void changes.act('let_in', { entryId: line.id })} />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      scroll={false}
      problem={changes.problem}
      menu={menu}
      actions={<RoundButton label={say.share.button} onPress={() => void share()} icon={(color) => <Share size={20} color={color} />} />}>
      {asked.isError && long && !loaded ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {messageFor(asked.error)}
        </Txt>
      ) : (
        <List
          data={lines}
          keyOf={(line) => line.id}
          header={header}
          row={(line) => (
            <Card style={{ marginHorizontal: layout.barGutter, marginBottom: 10 }}>
              <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.quoted(line.text), guestLine(line)])} scaleTo={0.99} onPress={() => setOpenId(line.id)} style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
                <LineBody line={line} />
              </Tap>
            </Card>
          )}
          bottom={24}
          loadingMore={long && asked.isFetchingNextPage}
          {...(long ? more(asked) : {})}
          empty={
            view.waiting.length ? null : (
              <View style={{ paddingTop: 24 }}>
                <EmptyState emoji={board.emoji || KEY} title={say.empty.title} body={view.link ? say.empty.body : say.empty.bodyGuest} />
              </View>
            )
          }
        />
      )}

      <CodeSheet board={board} visible={sheet === 'code'} onClose={() => setSheet(null)} />
      <WriteSheet board={board} visible={sheet === 'write'} onClose={() => setSheet(null)} />
      <LineSheet board={board} line={opened} me={me} onClose={() => setOpenId(null)} />
      <ConfirmSheet
        visible={turningAway !== null}
        onClose={() => setTurningAway(null)}
        title={say.waiting.ask}
        body={say.waiting.askBody}
        confirm={say.waiting.no}
        busy={changes.busy}
        problem={changes.problem}
        onConfirm={() => void (turningAway ? changes.remove(turningAway).then((gone) => (gone ? setTurningAway(null) : undefined)) : undefined)}
      />
      <Notice title={notice?.title} text={notice?.text ?? null} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/** What a guest left, as the drawing has it: their photo (or their initial where there is none), the line in quotes, and who they are under it. */
function LineBody({ line }: { line: Line }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Photo uri={line.photo?.thumbUrl ?? line.photo?.url} radius="tile" style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label={line.photo ? say.photoOf(line.name) : undefined}>
        {line.photo ? null : (
          <Txt variant="subtitle" accessible={false} style={{ color: colors.muted }}>
            {line.name.trim().charAt(0).toUpperCase()}
          </Txt>
        )}
      </Photo>
      <View style={{ flex: 1 }}>
        <Txt variant="headline" weight={800} color="muted" style={{ marginBottom: 6 }}>
          {say.quoted(line.text)}
        </Txt>
        <Txt variant="footnote" color="muted">
          {guestLine(line)}
        </Txt>
      </View>
    </View>
  );
}

/** A line, pressed: the photo at its size, the day, who let it in, and, for the people who live here, taking it out of the book. */
function LineSheet({ board, line, me, onClose }: { board: Book; line: Line | null; me: string | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  return (
    <Sheet visible={line !== null} onClose={onClose} title={line ? say.quoted(line.text) : undefined} subtitle={line ? words.common.join([guestLine(line), formatDayFull(line.day)]) : undefined}>
      {line ? (
        <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {line.photo ? <Photo uri={line.photo.url} radius="photo" style={{ height: 240 }} label={say.photoOf(line.name)} /> : null}
          {line.letInBy ? (
            <Txt variant="callout" color="muted">
              {line.fromTheDoor ? say.letInBy(called(line.letInBy, me)) : say.writtenBy(called(line.letInBy, me))}
            </Txt>
          ) : null}
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {board.view.decides && board.canEdit ? <Button label={say.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(line.id).then((gone) => (gone ? onClose() : undefined))} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Prints the page that is showing. A browser can; a phone build needs a part that isn't in the app yet. */
function printPage(): boolean {
  const browser = globalThis as { print?: () => void };
  if (Platform.OS !== 'web' || typeof browser.print !== 'function') return false;
  browser.print();
  return true;
}

/**
 * The code by the door: the link drawn as a QR code to print and tape up, the link itself to copy, and a
 * new code for when the old one has gone further than it should (the old one stops working at once).
 */
function CodeSheet({ board, visible, onClose }: { board: Book; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const link = board.view.link;
  return (
    <Sheet visible={visible} onClose={onClose} title={say.code.title} subtitle={say.code.lead}>
      {link ? (
        <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <QrCode text={link} size={232} label={say.code.spoken} />
            <Txt variant="caption" color="muted" center>
              {say.code.under(board.title)}
            </Txt>
          </View>
          <LinkBox url={link} copyLabel={say.code.copy} />
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          <Button label={say.code.printIt} size="lg" block icon={(color) => <Printer size={18} color={color} />} onPress={() => (printPage() ? undefined : setNotice(say.code.cantPrint))} />
          {board.canEdit ? <Button label={say.code.renew} variant="soft" size="lg" block icon={(color) => <RefreshCw size={18} color={color} />} onPress={() => setAsking(true)} /> : null}
        </View>
      ) : null}
      <ConfirmSheet
        visible={asking}
        onClose={() => setAsking(false)}
        title={say.code.renewAsk}
        body={say.code.renewBody}
        confirm={say.code.renewYes}
        busy={changes.busy}
        problem={changes.problem}
        onConfirm={() => void changes.act('new_code').then((saved) => (saved ? setAsking(false) : undefined))}
      />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </Sheet>
  );
}

/** A line written in by someone who lives here, for a guest who left theirs on paper or said it at the door. It is in the book at once. */
function WriteSheet({ board, visible, onClose }: { board: Book; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [text, setText] = useState('');
  const [nights, setNights] = useState('');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stayed = /^\d{1,4}$/.test(nights.trim()) && Number(nights.trim()) >= 1 ? Number(nights.trim()) : null;

  const write = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      const added = await changes.add('line', { name: name.trim(), about: about.trim() || undefined, text: text.trim(), nights: stayed ?? undefined, mediaId }, clientId.current);
      if (!added) return;
      clientId.current = newClientId();
      setName('');
      setAbout('');
      setText('');
      setNights('');
      setPhoto(null);
      onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={say.write.title} subtitle={say.write.lead}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.write.name} value={name} onChangeText={setName} maxLength={50} />
        <Field label={say.write.about} value={about} onChangeText={setAbout} maxLength={80} placeholder={say.write.aboutPlaceholder} />
        <Field label={say.write.text} value={text} onChangeText={setText} maxLength={300} multiline />
        <Field label={say.write.nights} value={nights} onChangeText={setNights} keyboardType="number-pad" maxLength={4} error={nights.trim() && stayed === null ? say.write.badNights : null} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={photo ? say.write.changePhoto : say.write.photo}
            hitSlop={8}
            scaleTo={0.94}
            onPress={() => void pickPhoto().then((picked) => (picked ? setPhoto(picked) : undefined)).catch(() => setProblem(words.media.photosClosed))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
            <ImagePlus size={16} color={colors.accentText} />
            <Txt variant="caption" weight={700} style={{ color: colors.accentText }}>
              {photo ? say.write.changePhoto : say.write.photo}
            </Txt>
          </Tap>
          {photo ? <Photo uri={photo.uri} radius="chip" style={{ width: 34, height: 34 }} label={say.write.photoChosen} /> : null}
        </View>
        {(problem ?? changes.problem) ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {problem ?? changes.problem}
          </Txt>
        ) : null}
        <Button label={say.write.save} size="lg" block disabled={!name.trim() || !text.trim() || (!!nights.trim() && stayed === null)} loading={sending || changes.busy} onPress={() => void write()} />
      </View>
    </Sheet>
  );
}
