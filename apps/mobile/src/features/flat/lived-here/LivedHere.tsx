import { useRouter } from 'expo-router';
import { Book, Euro, KeyRound, Search, UserPlus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { type LivedHereRowResponse, type LivedHereSettings, type LivedHereViewResponse, useGetBoards, useSearchCircle } from '@/api/generated/homeport';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { Arrow, BoardRow, Tile } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { thingHref, useOpenThing } from '@/features/things/open';
import { ThingRow } from '@/features/things/ThingRow';
import { newClientId } from '@/lib/ids';
import { useDebounced } from '@/lib/useDebounced';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Roll = Board<LivedHereViewResponse, LivedHereSettings>;
type Person = LivedHereRowResponse;
const say = words.flat.livedHere;

/** A year as it was typed, when it is one. */
const yearOf = (typed: string) => (/^\d{4}$/.test(typed.trim()) ? Number(typed.trim()) : null);

/**
 * 18.8 Everyone who's lived here. The roll of the flat: who lives here now, the newest first, and who lived
 * here before, with the years and a line about each. The flat writes the years and the lines itself (people
 * move in long before they start using an app) and adds the people from before the app by hand. The three
 * rows under it say what happens when someone moves out, list what is handed on to whoever comes next, and
 * lead to what a last settling-up needs.
 */
export function LivedHere({ board }: BoardScreenProps<LivedHereViewResponse, LivedHereSettings>) {
  const view = board.view;
  const [sheet, setSheet] = useState<'movesOut' | 'handedOn' | 'settling' | 'before' | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const edit = board.canEdit ? setEditing : undefined;
  const rowKey = (row: Person) => row.entryId ?? row.person?.memberId ?? row.name;

  return (
    <BoardFrame board={board} title={board.title} chip="menu" menu={board.canEdit ? [{ icon: (color) => <UserPlus size={20} color={color} />, label: say.before.open, onPress: () => setSheet('before') }] : undefined}>
      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.hereNow}</GroupLabel>
      {view.hereNow.map((row) => (
        <RollRow key={rowKey(row)} row={row} onPress={edit} />
      ))}
      {view.before.length ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.beforeLabel}</GroupLabel> : null}
      {view.before.map((row) => (
        <RollRow key={rowKey(row)} row={row} gone onPress={edit} />
      ))}
      <View style={{ height: 16 }} />
      <RowGroup>
        <Row first icon={(color) => <KeyRound size={18} color={color} />} label={say.movesOut.title} note={say.movesOut.line} onPress={() => setSheet('movesOut')} />
        <Row icon={(color) => <Book size={18} color={color} />} label={say.handedOn.title} note={view.handedOn.length ? words.flat.commas(view.handedOn.map((one) => one.thing.title ?? '')) : say.handedOn.none} onPress={() => setSheet('handedOn')} />
        <Row icon={(color) => <Euro size={18} color={color} />} label={say.settling.title} note={say.settling.line} onPress={() => setSheet('settling')} />
      </RowGroup>

      <MovesOutSheet visible={sheet === 'movesOut'} onClose={() => setSheet(null)} />
      <HandedOnSheet board={board} visible={sheet === 'handedOn'} onClose={() => setSheet(null)} />
      <SettlingSheet board={board} visible={sheet === 'settling'} onClose={() => setSheet(null)} />
      <RowSheet key={editing ? rowKey(editing) : 'new'} board={board} row={editing} visible={editing !== null || sheet === 'before'} onClose={() => (editing ? setEditing(null) : setSheet(null))} />
    </BoardFrame>
  );
}

/** One row of the roll: the years, a face (a number for several people, greyed for someone who has left), a name and a line. */
function RollRow({ row, gone, onPress }: { row: Person; gone?: boolean; onPress?: (row: Person) => void }) {
  const { colors } = useTheme();
  const name = row.you ? words.flat.you : row.name;
  const years = say.years(row.fromYear, row.untilYear);
  const content = (
    <>
      <Txt variant="footnote" weight={800} color="muted" style={{ width: 62, fontVariant: ['tabular-nums'] }}>
        {years}
      </Txt>
      {row.person || row.count < 2 ? (
        <View style={gone ? { opacity: 0.7, filter: 'grayscale(1)' } : undefined}>
          <Avatar uri={row.person?.avatarUrl} name={row.name} size={40} />
        </View>
      ) : (
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
          <Txt variant="caption" weight={800}>
            {row.count}
          </Txt>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="item">{name}</Txt>
        {row.note ? (
          <Txt variant="footnote" color="muted">
            {row.note}
          </Txt>
        ) : null}
      </View>
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: layout.rowGutter } as const;
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([name, say.yearsSpoken(row.fromYear, row.untilYear), row.note])} scaleTo={0.99} onPress={() => onPress(row)} style={frame}>
      {content}
    </Tap>
  );
}

/**
 * What the flat writes about one row of the roll, or about people from before the app (a new row when
 * `row` is null). Someone of the circle has their years and a line; people from before also a name and how
 * many they were, and can be taken off the roll again.
 */
function RowSheet({ board, row, visible, onClose }: { board: Roll; row: Person | null; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const member = row?.person ?? null;
  const left = row ? row.untilYear !== null : true;
  const [name, setName] = useState(row && !member ? row.name : '');
  const [count, setCount] = useState(row && !member ? String(row.count) : '1');
  const [from, setFrom] = useState(row ? String(row.fromYear) : '');
  const [until, setUntil] = useState(row?.untilYear ? String(row.untilYear) : '');
  const [note, setNote] = useState(row?.note ?? '');
  const [fromYear, untilYear] = [yearOf(from), yearOf(until)];
  const people = /^\d{1,2}$/.test(count.trim()) && Number(count.trim()) >= 1 ? Number(count.trim()) : null;
  const inOrder = fromYear === null || untilYear === null || untilYear >= fromYear;
  const ready = member ? fromYear !== null && (!left || untilYear !== null) && inOrder : !!name.trim() && people !== null && fromYear !== null && untilYear !== null && inOrder;

  const save = async () => {
    const saved = member
      ? await changes.add('resident', { memberId: member.memberId, fromYear, untilYear: left ? untilYear : undefined, note: note.trim() }, clientId.current)
      : row?.entryId
        ? await changes.change(row.entryId, { name: name.trim(), count: people, fromYear, untilYear, note: note.trim() })
        : await changes.add('before', { name: name.trim(), count: people, fromYear, untilYear, note: note.trim() || undefined }, clientId.current);
    if (!saved) return;
    clientId.current = newClientId();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={member ? (row?.you ? say.edit.you : say.edit.title(row?.name ?? '')) : row ? row.name : say.before.title} subtitle={member ? say.edit.lead : say.before.lead}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        {member ? null : (
          <>
            <Field label={say.before.name} value={name} onChangeText={setName} maxLength={80} placeholder={say.before.namePlaceholder} />
            <Field label={say.before.count} value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={2} />
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label={say.edit.from} value={from} onChangeText={setFrom} keyboardType="number-pad" maxLength={4} />
          </View>
          {left ? (
            <View style={{ flex: 1 }}>
              <Field label={say.edit.until} value={until} onChangeText={setUntil} keyboardType="number-pad" maxLength={4} />
            </View>
          ) : null}
        </View>
        <Field label={say.edit.note} value={note} onChangeText={setNote} maxLength={160} placeholder={say.edit.notePlaceholder} error={!inOrder ? say.edit.outOfOrder : changes.problem} />
        <Button label={say.edit.save} size="lg" block disabled={!ready} loading={changes.busy} onPress={() => void save()} />
        {row && !member && row.entryId ? <Button label={say.before.remove} variant="soft" size="lg" block disabled={changes.busy} onPress={() => void changes.remove(row.entryId!).then((gone) => (gone ? onClose() : undefined))} /> : null}
      </View>
    </Sheet>
  );
}

/** What happens when someone moves out, in plain sentences, and where it is done: on their page under People. */
function MovesOutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Sheet visible={visible} onClose={onClose} title={say.movesOut.title}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.gutter }}>
        {say.movesOut.body.map((sentence) => (
          <Txt key={sentence} variant="body">
            {sentence}
          </Txt>
        ))}
        <Button
          label={say.movesOut.people}
          variant="soft"
          size="lg"
          block
          onPress={() => {
            onClose();
            router.navigate('/people');
          }}
        />
      </View>
    </Sheet>
  );
}

/**
 * What is handed on to the next person: things of the flat (the house rules, the bin days), each opened
 * with a tap. Anyone who may change the roll adds one by finding it by its name, and takes one off again.
 */
function HandedOnSheet({ board, visible, onClose }: { board: Roll; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const changes = useBoardChanges(board);
  const [typed, setTyped] = useState('');
  const sent = useDebounced(typed.trim());
  const found = useSearchCircle(board.circleId, { q: sent }, { query: { enabled: visible && sent.length >= 2, placeholderData: (last) => last } });
  const handed = board.view.handedOn;
  const already = new Set(handed.map((one) => one.thing.id));
  const hits = sent.length >= 2 ? (found.data?.hits ?? []).flatMap((hit) => (hit.thing && hit.thing.id !== board.id && !already.has(hit.thing.id) ? [hit.thing] : [])) : [];
  return (
    <Sheet visible={visible} onClose={onClose} title={say.handedOn.title} subtitle={say.handedOn.lead} tall>
      <View style={{ paddingTop: 6 }}>
        {handed.length ? (
          <RowGroup>
            {handed.map((one, index) => (
              <ThingRow
                key={one.entryId}
                thing={one.thing}
                look="grouped"
                first={index === 0}
                trailing={board.canEdit ? <RoundButton label={say.handedOn.remove(one.thing.title ?? '')} onPress={() => void changes.remove(one.entryId)} icon={(color) => <X size={18} color={color} />} /> : undefined}
                onPress={() => {
                  onClose();
                  open(one.thing);
                }}
              />
            ))}
          </RowGroup>
        ) : (
          <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
            {say.handedOn.empty}
          </Txt>
        )}
        {board.canEdit ? (
          <View style={{ gap: 10, marginTop: 18, paddingHorizontal: layout.rowGutter }}>
            <Field label={say.handedOn.find} value={typed} onChangeText={setTyped} maxLength={60} autoCorrect={false} placeholder={say.handedOn.findPlaceholder} accessory={<Search size={18} color={colors.muted} />} error={changes.problem} />
            {hits.slice(0, 6).map((thing) => (
              <Button key={thing.id} label={thing.title ?? ''} spoken={say.handedOn.add(thing.title ?? '')} variant="soft" block disabled={changes.busy} onPress={() => void changes.add('handed_on', { thingId: thing.id }).then((added) => (added ? setTyped('') : undefined))} />
            ))}
            {sent.length >= 2 && found.data && hits.length === 0 ? (
              <Txt variant="footnote" color="muted">
                {say.handedOn.nothingFound(sent)}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const SPLIT = '📊';
const POT = '💰';

/** A last settling-up: what there is to settle before someone goes, and the flat's own boards that do the sums. */
function SettlingSheet({ board, visible, onClose }: { board: Roll; visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const boards = useGetBoards(board.circleId, undefined, { query: { enabled: visible } });
  const sums = (boards.data?.items ?? []).filter((one) => one.template === 'fairer_split' || one.template === 'kitty');
  const go = (href: Parameters<typeof router.navigate>[0]) => {
    onClose();
    router.navigate(href);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={say.settling.title}>
      <View style={{ gap: 12, paddingTop: 6 }}>
        <View style={{ gap: 12, paddingHorizontal: layout.gutter }}>
          {say.settling.body.map((sentence) => (
            <Txt key={sentence} variant="body">
              {sentence}
            </Txt>
          ))}
        </View>
        {sums.length ? (
          <RowGroup>
            {sums.map((one, index) => (
              <BoardRow key={one.id} first={index === 0} leading={<Tile emoji={one.emoji || (one.template === 'kitty' ? POT : SPLIT)} />} title={one.title ?? ''} line={one.glance} trailing={<Arrow />} onPress={() => go(thingHref({ kind: 'board', id: one.id ?? '' }))} />
            ))}
          </RowGroup>
        ) : (
          <View style={{ paddingHorizontal: layout.rowGutter }}>
            <Button label={say.settling.templates} variant="soft" size="lg" block onPress={() => go('/templates')} />
          </View>
        )}
      </View>
    </Sheet>
  );
}
