import { Image as ImageIcon, Lock, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { TimeCapsuleItem, TimeCapsuleSettings, TimeCapsuleView } from '@/api/generated/homeport';
import { formatDay, formatDayFull, toISODate } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { Photo } from '@/ui/Photo';
import { RowGroup } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { BoardFrame } from '../BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto, uploadSound } from '../media';
import { Foot } from '../parts/Bars';
import { BlobHead } from '../parts/Heads';
import { Notice } from '../parts/Notice';
import { PlayButton } from '../parts/Play';
import { Arrow, BoardRow, Face, Sealed, Tile } from '../parts/Rows';
import { pickSound, sound } from '../sound';
import type { LocalSound } from '../soundFile';
import type { Board, BoardScreenProps } from '../types';
import { useBoardChanges } from '../useBoard';

type Capsule = Board<TimeCapsuleView, TimeCapsuleSettings>;
const say = words.templates.timeCapsule;

/** The line under what is written on an envelope: its own note, or how much is inside and when it was sealed. */
function lineOf(item: TimeCapsuleItem): string {
  if (item.draft) return say.draftLine;
  if (item.note) return item.note;
  const inside = item.pages ? say.pages(item.pages) : item.seconds ? words.templates.sound.length(item.seconds) : item.photos ? say.photos(item.photos) : null;
  return words.common.join([inside, item.kind === 'letter' && item.sealedAt ? say.sealedOn(formatDay(toISODate(new Date(item.sealedAt)))) : null]);
}

/**
 * 5.9 The time capsule. A page that seals: how long until it opens, and what is sealed inside as closed
 * envelopes, with who each is from. Anyone who may change it can add a letter, a photo or a voice message;
 * once sealed nobody reads it before the day, the person who wrote it included. A draft is its writer's
 * alone until they seal it.
 */
export function TimeCapsule({ board }: BoardScreenProps<TimeCapsuleView, TimeCapsuleSettings>) {
  const view = board.view;
  const [adding, setAdding] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const item = view.items.find((one) => one.id === openItem) ?? null;
  const opens = formatDayFull(view.opensOn);

  return (
    <BoardFrame
      board={board}
      footer={
        view.open ? (
          <Foot fine={say.opened(opens)} />
        ) : (
          <Foot fine={say.fine}>{board.canEdit ? <Button label={say.add.button} size="lg" block icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding(true)} /> : null}</Foot>
        )
      }>
      <BlobHead emoji={board.emoji || '⏳'} title={board.title} line={view.open ? say.openedLine(opens) : words.common.join([say.opens(opens), say.toGo(view.daysToGo)])} progress={view.progress} />
      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{view.open ? say.inside : say.sealedInside}</GroupLabel>
      {view.items.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {say.empty}
        </Txt>
      ) : (
        <RowGroup>
          {view.items.map((one, index) => (
            <BoardRow
              key={one.id}
              first={index === 0}
              leading={one.kind === 'photos' ? <Tile icon={(color) => <ImageIcon size={18} color={color} />} /> : <Face uri={one.from?.avatarUrl} name={one.from?.name ?? one.fromName ?? one.title} />}
              title={one.title}
              line={lineOf(one)}
              trailing={one.sealed ? <Sealed /> : <Arrow />}
              spoken={words.common.spoken([one.title, lineOf(one), one.sealed ? say.sealedWord : null])}
              onPress={() => setOpenItem(one.id)}
            />
          ))}
        </RowGroup>
      )}
      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
      <ItemSheet board={board} item={item} opens={opens} onClose={() => setOpenItem(null)} />
    </BoardFrame>
  );
}

/** One thing in the capsule, pressed: a sealed one says when it opens and nothing more; a draft or an opened one shows what is inside. */
function ItemSheet({ board, item, opens, onClose }: { board: Capsule; item: TimeCapsuleItem | null; opens: string; onClose: () => void }) {
  const changes = useBoardChanges(board);
  if (item?.sealed) return <Notice title={item.title} text={say.sealedUntil(opens)} onClose={onClose} />;
  return (
    <Sheet visible={item !== null} onClose={onClose} title={item?.title} subtitle={item?.draft ? say.draftNote : undefined}>
      {item ? (
        <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.gutter }}>
          {item.text ? <Txt variant="body">{item.text}</Txt> : null}
          {item.media?.kind === 'photo' ? <Photo uri={item.media.url} radius="photo" style={{ height: 240 }} /> : null}
          {item.media?.kind === 'audio' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <PlayButton look="round" media={item.media} label={say.play(item.title)} />
              <Txt variant="footnote" weight={700}>
                {words.templates.sound.clock(item.media.seconds ?? 0)}
              </Txt>
            </View>
          ) : null}
          {item.pictures.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.pictures.map((picture) => (
                <Photo key={picture.id} uri={picture.thumbUrl ?? picture.url} radius="tile" style={{ width: 96, height: 96 }} />
              ))}
            </View>
          ) : null}
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {item.draft ? (
            <View style={{ gap: 10 }}>
              <Button label={say.seal} size="lg" block icon={(color) => <Lock size={18} color={color} />} loading={changes.busy} onPress={() => void changes.act('seal', { entryId: item.id }).then((sealed) => (sealed ? onClose() : undefined))} />
              <Button label={say.removeDraft} variant="soft" size="lg" block onPress={() => void changes.remove(item.id).then((gone) => (gone ? onClose() : undefined))} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

type Kind = 'letter' | 'photo' | 'voice';

/** Add to the capsule: a letter that is typed, a photo, or a voice message. Sealed at once, or (a letter) kept as a draft first. */
function AddSheet({ board, visible, onClose }: { board: Capsule; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <Adding board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Adding({ board, onClose }: { board: Capsule; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [kind, setKind] = useState<Kind>('letter');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [recording, setRecording] = useState<LocalSound | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ready = kind === 'letter' ? text.trim().length > 0 : kind === 'photo' ? photo !== null : recording !== null;

  const add = async (seal: boolean) => {
    setProblem(null);
    setSending(true);
    try {
      // A photo or a recording goes up first; the capsule is handed what came of it.
      const mediaId = kind === 'photo' && photo ? await uploadPhoto(photo) : kind === 'voice' && recording ? await uploadSound(recording) : undefined;
      const fields = kind === 'letter' ? { text: text.trim(), seal } : { mediaId, note: note.trim() || undefined, seal: true };
      if (await changes.add(kind, fields, clientId.current)) onClose();
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
    <View style={{ gap: 14, paddingTop: 6 }}>
      <Segmented
        label={say.add.kind}
        value={kind}
        onChange={setKind}
        options={[
          { id: 'letter', label: say.add.letter },
          { id: 'photo', label: say.add.photo },
          { id: 'voice', label: say.add.voice },
        ]}
      />
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        {kind === 'letter' ? (
          <Field label={say.add.letterLabel} value={text} onChangeText={setText} multiline maxLength={20000} autoFocus placeholder={say.add.letterPlaceholder} />
        ) : kind === 'photo' ? (
          <>
            {photo ? <Photo uri={photo.uri} radius="photo" style={{ height: 180 }} label={say.add.photoChosen} /> : null}
            <Button label={photo ? say.add.changePhoto : say.add.choosePhoto} variant="soft" block onPress={() => void pickPhoto().then((picked) => (picked ? setPhoto(picked) : undefined)).catch(() => setProblem(words.media.photosClosed))} />
            <Field label={say.add.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.add.notePlaceholder} />
          </>
        ) : (
          <>
            {recording ? (
              <Txt variant="callout" weight={700} accessibilityLiveRegion="polite">
                {words.templates.sound.attached(words.templates.sound.clock(recording.seconds ?? 0))}
              </Txt>
            ) : null}
            <Button label={recording ? say.add.changeRecording : say.add.chooseRecording} variant="soft" block onPress={() => void chooseSound()} />
            <Field label={say.add.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.add.notePlaceholder} />
          </>
        )}
        <NoteBox icon={(color) => <Lock size={20} color={color} />}>{say.add.sealNote}</NoteBox>
        {problem || changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {problem ?? changes.problem}
          </Txt>
        ) : null}
        <Button label={say.add.seal} size="lg" block disabled={!ready} loading={sending || changes.busy} onPress={() => void add(true)} />
        {kind === 'letter' ? <Button label={say.add.draft} variant="soft" size="lg" block disabled={!ready || sending || changes.busy} onPress={() => void add(false)} /> : null}
      </View>
      <Notice text={notice} onClose={() => setNotice(null)} />
    </View>
  );
}
