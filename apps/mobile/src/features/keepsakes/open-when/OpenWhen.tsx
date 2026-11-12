import { Lock, Mail, MailOpen, Pencil } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { OpenWhenLetter, OpenWhenSettings, OpenWhenView } from '@/api/generated/homeport';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { uploadSound } from '@/features/templates/media';
import { Foot } from '@/features/templates/parts/Bars';
import { BlobHead } from '@/features/templates/parts/Heads';
import { Notice } from '@/features/templates/parts/Notice';
import { PlayButton } from '@/features/templates/parts/Play';
import { BoardRow, Tile } from '@/features/templates/parts/Rows';
import { pickSound, sound } from '@/features/templates/sound';
import type { LocalSound } from '@/features/templates/soundFile';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDay, formatTime, toISODate } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { CheckRow } from '@/ui/CheckRow';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Letters = Board<OpenWhenView, OpenWhenSettings>;
const say = words.keepsakes.openWhen;

/** The pictures an envelope can carry: the moments the drawing has, and a few more. */
const EMOJI = ['🌙', '🌧️', '🎒', '🏆', '✈️', '💌', '🎂', '🌱'];
const ENVELOPE = '✉️';
const LOVE_LETTER = '💌';

/** When and by whom a letter was opened, in a sentence: "Mia opened it on 2 Nov, at 21:40". */
function openedLine(letter: OpenWhenLetter, reader: string, iAmTheReader: boolean): string {
  const at = letter.openedAt ? new Date(letter.openedAt) : null;
  return say.opened(iAmTheReader ? null : reader, at ? formatDay(toISODate(at)) : null, at ? formatTime(at) : null);
}

/**
 * 15.1 Open when… Letters that open at a moment instead of a date: a bad day, a sleepless night. The reader
 * sees the envelopes and chooses when; the writer reads their own words and is told when one was opened.
 * Nobody else reads a letter. Once opened it is the reader's to keep, and can't be changed or taken back.
 */
export function OpenWhen({ board }: BoardScreenProps<OpenWhenView, OpenWhenSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const reader = view.forPerson?.name ?? '';
  const [writing, setWriting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const letter = view.letters.find((one) => one.id === openId) ?? null;
  const iWrite = board.canEdit && !view.youAreTheReader;

  return (
    <BoardFrame
      board={board}
      chipLook={{ icon: (color) => <Mail size={13} color={color} />, label: view.youAreTheReader ? say.forYou : say.forName(reader) }}
      footer={
        <Foot fine={view.youAreTheReader ? say.fineReader : say.fine(reader)}>
          {iWrite ? <Button label={view.letters.length ? say.another : say.first} size="lg" block icon={(color) => <Pencil size={19} color={color} />} onPress={() => setWriting(true)} /> : null}
        </Foot>
      }>
      <BlobHead tight emoji={board.emoji || LOVE_LETTER} title={board.title} line={view.youAreTheReader ? say.leadReader : say.lead(reader, view.letters.length > 0 && view.letters.every((one) => one.mine))} />
      {view.letters.length === 0 ? (
        <View style={{ paddingTop: 24 }}>
          <EmptyState emoji={ENVELOPE} title={say.empty.title} body={view.youAreTheReader ? say.empty.bodyReader : say.empty.body(reader)} />
        </View>
      ) : (
        <RowGroup>
          {view.letters.map((one, index) => (
            <BoardRow
              key={one.id}
              first={index === 0}
              leading={<Tile emoji={one.emoji ?? ENVELOPE} />}
              title={say.envelope(one.when)}
              line={one.opened ? openedLine(one, reader, view.youAreTheReader) : say.sealedLine({ voice: one.hasVoice, forward: one.forwardOn !== null }, view.youAreTheReader ? null : reader)}
              lineTone={one.opened ? 'ok' : 'muted'}
              trailing={one.opened ? <MailOpen size={18} color={colors.muted} /> : <Lock size={18} color={colors.muted} />}
              onPress={() => setOpenId(one.id)}
            />
          ))}
        </RowGroup>
      )}
      <WriteSheet board={board} visible={writing} reader={reader} onClose={() => setWriting(false)} />
      <LetterSheet board={board} letter={letter} reader={reader} onClose={() => setOpenId(null)} />
    </BoardFrame>
  );
}

/**
 * An envelope, pressed. Whoever may read the letter (its writer; the reader once it is open) reads it here.
 * The reader, or an adult with a child who has no phone of their own, can open it: once, after being asked.
 * Anyone else is told it is sealed.
 */
function LetterSheet({ board, letter, reader, onClose }: { board: Letters; letter: OpenWhenLetter | null; reader: string; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const view = board.view;
  const [asking, setAsking] = useState(false);
  const close = () => {
    setAsking(false);
    changes.forget();
    onClose();
  };
  const readable = letter !== null && (letter.text !== null || letter.voice !== null);
  // Sealed, and not this person's to open or to read: the envelope is all there is.
  if (letter && !readable && !letter.canOpen) return <Notice title={say.envelope(letter.when)} text={say.notYours(reader)} onClose={close} />;

  const open = async () => {
    if (letter && (await changes.act('open', { entryId: letter.id }))) setAsking(false);
  };

  return (
    <Sheet visible={letter !== null} onClose={close} title={letter ? say.envelope(letter.when) : undefined} subtitle={letter ? (letter.opened ? openedLine(letter, reader, view.youAreTheReader) : letter.mine ? say.yours(reader) : say.fromName(letter.from?.name ?? '')) : undefined}>
      {letter ? (
        <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.gutter }}>
          {readable ? (
            <>
              {letter.text ? <Txt variant="bodyLarge">{letter.text}</Txt> : null}
              {letter.voice ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <PlayButton look="round" media={letter.voice} label={say.playVoice} />
                  <Txt variant="footnote" weight={700}>
                    {words.templates.sound.clock(letter.voice.seconds ?? 0)}
                  </Txt>
                </View>
              ) : null}
            </>
          ) : (
            <Txt variant="callout" color="muted">
              {say.sealedForYou}
            </Txt>
          )}
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {letter.canOpen ? (
            asking ? (
              <View style={{ gap: 10 }}>
                <Txt variant="callout" weight={700}>
                  {view.youAreTheReader ? say.open.ask : say.open.askWith(reader)}
                </Txt>
                <Button label={say.open.yes} size="lg" block loading={changes.busy} onPress={() => void open()} />
                <Button label={say.open.no} variant="soft" size="lg" block onPress={() => setAsking(false)} />
              </View>
            ) : (
              <Button label={view.youAreTheReader ? say.open.button : say.open.buttonWith(reader)} size="lg" block icon={(color) => <MailOpen size={18} color={color} />} onPress={() => setAsking(true)} />
            )
          ) : null}
          {letter.mine && !letter.opened && board.canEdit && !asking ? <Button label={say.takeBack} variant="soft" size="lg" block onPress={() => void changes.remove(letter.id).then((gone) => (gone ? close() : undefined))} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** A new letter: what the envelope says, its picture, the words, and a voice message if there is one. */
function WriteSheet({ board, visible, reader, onClose }: { board: Letters; visible: boolean; reader: string; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.write.title} subtitle={say.write.lead(reader)}>
      {visible ? <Writing board={board} reader={reader} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Writing({ board, reader, onClose }: { board: Letters; reader: string; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [when, setWhen] = useState('');
  const [emoji, setEmoji] = useState(EMOJI[0]!);
  const [text, setText] = useState('');
  const [forward, setForward] = useState(false);
  const [recording, setRecording] = useState<LocalSound | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = recording ? await uploadSound(recording) : undefined;
      if (await changes.add('letter', { when: when.trim(), emoji, text: text.trim() || undefined, mediaId, forwardOn: forward ? 'journey' : undefined }, clientId.current)) onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };
  const chooseSound = async () => {
    if (!sound.canAdd) return setNotice(words.templates.sound.cantRecord);
    const picked = await pickSound();
    if (picked) setRecording(picked);
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={say.write.when} value={when} onChangeText={setWhen} maxLength={120} autoFocus placeholder={say.write.whenPlaceholder} />
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={say.write.picture} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: layout.rowGutter }}>
        {EMOJI.map((one, index) => (
          <Tap
            key={one}
            accessibilityRole="radio"
            accessibilityLabel={say.write.pictures[index] ?? one}
            aria-checked={one === emoji}
            scaleTo={0.92}
            onPress={() => setEmoji(one)}
            style={{ width: 44, height: 44, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: 2, borderColor: one === emoji ? colors.text : colors.fill }}>
            <Emoji char={one} size={24} />
          </Tap>
        ))}
      </View>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.write.text} value={text} onChangeText={setText} multiline maxLength={20000} placeholder={say.write.textPlaceholder} />
        {recording ? (
          <Txt variant="callout" weight={700} accessibilityLiveRegion="polite">
            {words.templates.sound.attached(words.templates.sound.clock(recording.seconds ?? 0))}
          </Txt>
        ) : null}
        <Button label={recording ? say.write.changeVoice : say.write.addVoice} variant="soft" block onPress={() => void chooseSound()} />
        <CheckRow label={say.write.forward(reader)} checked={forward} onChange={setForward} />
        {problem || changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {problem ?? changes.problem}
          </Txt>
        ) : null}
        <Button label={say.write.save} size="lg" block disabled={!when.trim() || (!text.trim() && !recording)} loading={sending || changes.busy} onPress={() => void save()} />
      </View>
      <Notice text={notice} onClose={() => setNotice(null)} />
    </View>
  );
}
