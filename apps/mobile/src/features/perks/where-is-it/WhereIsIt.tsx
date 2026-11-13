import { Camera, ImagePlus, Search, X } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { WhereIsItItemResponse, WhereIsItResponse, WhereIsItSettings } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { BoardFrame, BoardMore } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { CtaBar } from '@/features/templates/parts/Bars';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { daysBetween, formatDay, formatDayFull, formatDayOfYear, formatTime, formatTimeOfDay, toISODate, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { useDebounced } from '@/lib/useDebounced';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Eyebrow } from '@/ui/Eyebrow';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Sheet } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { ItemTile, Label, PeoplePick, type Picture, PicturePick, PICTURES, Up } from '../parts';

type Things = Board<WhereIsItResponse, WhereIsItSettings>;
type Item = WhereIsItItemResponse;
const say = words.perks.whereIsIt;
const PIN = '📍';
const BOX = '📦';
const OFFERED: readonly Picture[] = ['box', 'key', 'tree', 'bag', 'card', 'tent', 'suitcase', 'tools'];

/** When something was put where it is, in the sentence's own words: "today", "yesterday", "on 14 September". */
function whenPut(day: string | null): string | null {
  if (!day) return null;
  const ago = daysBetween(day, today());
  if (ago === 0) return say.today;
  if (ago === 1) return say.yesterday;
  return say.onDay(day.slice(0, 4) === today().slice(0, 4) ? formatDayOfYear(day) : formatDayFull(day));
}

/** What else to know about a thing, then who put it there and when: "Tent, pegs and both mats. Alex put them there on 14 September." */
const aboutOf = (item: Item) => say.about(item.note, say.put(item.putBy?.name ?? null, whenPut(item.putOn), item));

/** Where a thing was last seen since, by whom, and when: the time for today, the day before that. */
function lastSeenOf(item: Item): string | null {
  if (!item.seen) return null;
  const when = item.seenAt ? (toISODate(new Date(item.seenAt)) === today() ? formatTimeOfDay(formatTime(item.seenAt)) : formatDay(toISODate(new Date(item.seenAt)))) : null;
  return say.lastSeen(item.seen, item.seenBy?.name ?? null, when);
}

/**
 * 16.6 Where is it? The question asked in every house. The page opens on a box to ask in; a question is
 * answered by the API ("where's the tent" finds the tent), with the photo and the place on top, and
 * everything else that is put away under it. A thing kept to a few people is there for them alone: the API
 * leaves it out for everyone else, so this page never holds it. Anyone who sees a thing can say where they
 * last saw it.
 *
 * While a question is being asked the page looks as the drawing has it: the box is the bar, with Cancel.
 * At rest the board's own bar stands above it, with the way back and More.
 */
export function WhereIsIt({ board: opened }: BoardScreenProps<WhereIsItResponse, WhereIsItSettings>) {
  const { colors } = useTheme();
  const [typed, setTyped] = useState('');
  const [focused, setFocused] = useState(false);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const question = useDebounced(typed.trim());
  const show = typed.trim().length >= 2 && question.length >= 2 ? question : undefined;
  const { board, waiting, problem } = useBoardPart(opened, show);
  const view = board.view;
  const asking = focused || typed.length > 0;
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const found = show ? view.found : null;
  const looked = [...(view.found ? [view.found] : []), ...view.items].find((one) => one.id === openId) ?? null;

  const cancel = () => {
    setTyped('');
    field.current?.blur();
    setFocused(false);
  };

  const bar = (
    <View>
      {asking ? null : <AppBar title={board.title} trailing={<BoardMore board={board} />} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: asking ? 5 : 0, paddingBottom: 10, paddingHorizontal: layout.barGutter }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingLeft: 14, paddingRight: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: asking ? colors.text : colors.fill, backgroundColor: asking ? colors.bg : colors.fill }}>
          <Search size={19} color={colors.muted} style={{ flexShrink: 0 }} />
          <TextInput
            ref={field}
            accessibilityLabel={say.ask}
            placeholder={say.ask}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={typed}
            onChangeText={setTyped}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[webNoOutline, textStyle('headline', 600, { oneLine: true }), { flex: 1, minWidth: 0, minHeight: 24, padding: 0, color: colors.text }]}
          />
          {typed ? (
            <Tap accessibilityRole="button" accessibilityLabel={say.clear} hitSlop={11} onPress={() => setTyped('')} scaleTo={0.9} style={{ width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
              <X size={13} color={colors.text} strokeWidth={2.6} />
            </Tap>
          ) : null}
        </View>
        {asking ? (
          <Tap accessibilityRole="button" accessibilityLabel={say.cancel} hitSlop={12} onPress={cancel}>
            <Txt variant="item">{say.cancel}</Txt>
          </Tap>
        ) : null}
      </View>
    </View>
  );

  return (
    <BoardFrame
      board={board}
      bar={bar}
      problem={problem}
      floating={
        board.canEdit ? (
          <CtaBar title={say.add.title} line={say.add.line}>
            <Button label={say.add.button} size="sm" inline icon={(color) => <Camera size={16} color={color} />} onPress={() => setAdding(true)} />
          </CtaBar>
        ) : undefined
      }>
      {view.count === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 100 }}>
          <EmptyState emoji={board.emoji || PIN} title={say.empty.title} body={say.empty.body} />
        </View>
      ) : (
        <>
          {found ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.foundSpoken(found.name, found.place), aboutOf(found)])} scaleTo={0.99} onPress={() => setOpenId(found.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, marginHorizontal: layout.barGutter, padding: 12, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
              {found.photo ? (
                <Photo uri={found.photo.thumbUrl ?? found.photo.url} radius="photo" style={{ width: 104, height: 104 }} label={say.photoOf(found.name)} />
              ) : (
                <View style={{ width: 104, height: 104, borderRadius: radius.photo, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
                  <Emoji char={found.emoji ?? BOX} size={48} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Eyebrow>{say.found}</Eyebrow>
                <Txt variant="subtitle" style={{ marginTop: 3 }}>
                  {found.place}
                </Txt>
                <Txt variant="caption" weight={500} color="muted" style={{ marginTop: 4 }}>
                  {words.common.spoken([aboutOf(found), lastSeenOf(found)])}
                </Txt>
              </View>
            </Tap>
          ) : show && !waiting ? (
            <View style={{ gap: 4, marginTop: 8, marginHorizontal: layout.barGutter, padding: 16, borderRadius: radius.panel, backgroundColor: colors.fill }}>
              <Txt variant="subheading">{say.notFound.title(show)}</Txt>
              <Txt variant="callout" color="muted">
                {say.notFound.body}
              </Txt>
            </View>
          ) : null}
          {view.items.length ? <Label>{found ? say.others : say.all}</Label> : null}
          {view.items.map((item) => (
            <Up
              key={item.id}
              leading={<ItemTile emoji={item.emoji ?? BOX} />}
              title={item.name}
              line={lastSeenOf(item) ?? item.place}
              trailing={<AudienceChip quiet thing={{ circleId: board.circleId, mine: item.mine, chip: item.only.length ? { audience: 'some', people: item.only, hiddenFrom: [] } : board.chip }} />}
              onPress={() => setOpenId(item.id)}
            />
          ))}
        </>
      )}
      <ItemSheet board={board} item={looked} onClose={() => setOpenId(null)} />
      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
    </BoardFrame>
  );
}

/**
 * A thing, pressed: its photo, its place and what else to know. Anyone who sees it can say where they last
 * saw it; whoever may change the list can give it a new place (which forgets where it was last seen) or take
 * it off.
 */
function ItemSheet({ board, item, onClose }: { board: Things; item: Item | null; onClose: () => void }) {
  return (
    <Sheet visible={item !== null} onClose={onClose} title={item?.name} subtitle={item?.place}>
      {item ? <Looked key={item.id} board={board} item={item} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Looked({ board, item, onClose }: { board: Things; item: Item; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [seen, setSeen] = useState('');
  const [place, setPlace] = useState('');
  const then = (done: unknown) => (done ? onClose() : undefined);
  const lastSeen = lastSeenOf(item);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      {item.photo ? <Photo uri={item.photo.url} radius="photo" style={{ height: 200 }} label={say.photoOf(item.name)} /> : null}
      <Txt variant="callout" color="muted">
        {aboutOf(item)}
      </Txt>
      {lastSeen ? (
        <Txt variant="callout" weight={700}>
          {lastSeen}
        </Txt>
      ) : null}
      <Field label={say.item.seenWhere} value={seen} onChangeText={setSeen} maxLength={200} autoCapitalize="none" placeholder={say.item.seenPlaceholder} error={changes.problem} />
      <Button label={say.item.saySeen} size="lg" block disabled={!seen.trim()} loading={changes.busy} onPress={() => void changes.act('seen', { entryId: item.id, place: seen.trim() }).then(then)} />
      {board.canEdit ? (
        <>
          <Field label={say.item.newPlace} value={place} onChangeText={setPlace} maxLength={200} placeholder={item.place} />
          <Button label={say.item.move} variant="soft" block disabled={!place.trim() || place.trim() === item.place || changes.busy} onPress={() => void changes.change(item.id, { place: place.trim() }).then(then)} />
          <Button label={say.item.remove} variant="quiet" block disabled={changes.busy} onPress={() => void changes.remove(item.id).then(then)} />
        </>
      ) : null}
    </View>
  );
}

/** Putting something away: what it is, where, what else to know, a photo of the place, and who it is for. */
function AddSheet({ board, visible, onClose }: { board: Things; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.form.title} subtitle={say.form.lead}>
      {visible ? <AddItem board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddItem({ board, onClose }: { board: Things; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const circle = useCircles().find((one) => one.id === board.circleId);
  // Whoever keeps a thing to some people is always one of them, so they aren't offered themselves.
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet' && member.id !== circle.myMemberId) : [];
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [emoji, setEmoji] = useState<string>(PICTURES.box);
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [only, setOnly] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      const fields = { name: name.trim(), place: place.trim(), emoji, note: note.trim() || undefined, mediaId, onlyMemberIds: only.length ? only : undefined };
      if (await changes.add('item', fields, clientId.current)) onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.form.name} value={name} onChangeText={setName} maxLength={120} autoFocus placeholder={say.form.namePlaceholder} error={problem ?? changes.problem} />
        <Field label={say.form.place} value={place} onChangeText={setPlace} maxLength={200} placeholder={say.form.placePlaceholder} />
        <Field label={say.form.note} value={note} onChangeText={setNote} maxLength={300} placeholder={say.form.notePlaceholder} />
        <PicturePick label={say.form.picture} options={OFFERED} value={emoji} onChange={setEmoji} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button
            label={photo ? say.form.changePhoto : say.form.addPhoto}
            variant="soft"
            size="sm"
            inline
            icon={(color) => <ImagePlus size={16} color={color} />}
            onPress={() =>
              void pickPhoto()
                .then((picked) => (picked ? setPhoto(picked) : undefined))
                .catch(() => setProblem(words.media.photosClosed))
            }
          />
          {photo ? <Photo uri={photo.uri} radius="chip" style={{ width: 36, height: 36 }} label={say.form.photoChosen} /> : null}
        </View>
      </View>
      {people.length ? (
        <View>
          <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
            {say.form.only}
          </Txt>
          <PeoplePick people={people} value={only} onChange={setOnly} everyone={say.form.everyone} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Button label={say.form.save} size="lg" block disabled={!name.trim() || !place.trim()} loading={sending || changes.busy} onPress={() => void save()} />
      </View>
    </View>
  );
}
