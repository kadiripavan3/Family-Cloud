import { ImagePlus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type GoodJarSettings, type GoodJarSlip, type GoodJarView, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { AddBar } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import { Arrow, BoardRow, Face, Sealed, Tile } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { formatDayLong, formatDayOfYear, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { GroupLabel, Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Jar = Board<GoodJarView, GoodJarSettings>;
const say = words.keepsakes.goodJar;
/** This year's jar and an earlier one, where they stand as rows. */
const THIS_YEAR = '✨';
const A_JAR = '🫙';

/** Where the slips lie in the glass, as the drawing has them: from the left, from the bottom, how far each is turned, and which colour. */
const SLIPS: readonly [left: number, bottom: number, turn: number, tint: number][] = [
  [14, 10, -8, 0], [62, 8, 6, 2], [108, 12, -14, 1], [28, 30, 12, 3], [84, 32, -4, 0], [118, 36, 20, 4], [10, 52, -18, 5], [56, 54, 9, 2],
  [104, 60, -10, 0], [30, 76, 4, 1], [80, 80, -22, 3], [14, 98, 16, 0], [64, 102, -6, 4], [112, 88, 12, 2], [40, 122, -12, 5], [92, 124, 8, 0],
];

/**
 * 15.6 The good things jar. Everyone drops in one good thing whenever it happens: a line, a photo, a
 * drawing. Until it opens on the last day of the year, everyone sees that a slip is there and whose it is,
 * and only the person who wrote it down reads it. Then the year is read back, and earlier years stay open.
 */
export function GoodJar({ board: opened }: BoardScreenProps<GoodJarView, GoodJarSettings>) {
  /** An earlier year that is being looked at, in place of this year's jar. */
  const [year, setYear] = useState<number | undefined>(undefined);
  const { board, problem: partProblem } = useBoardPart(opened, year === undefined ? undefined : String(year));
  const view = board.view;
  const [openId, setOpenId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const slip = view.latest.find((one) => one.id === openId) ?? null;
  const opens = formatDayOfYear(view.opensOn);
  const past = year !== undefined && view.year === year;

  return (
    <BoardFrame board={board} problem={partProblem} footer={board.canEdit && !past ? <AddSlip board={board} /> : undefined}>
      <JarPicture count={view.count} />
      <Heading center style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>
        {say.count(view.count)}
      </Heading>
      <Lead center style={{ marginHorizontal: layout.rowGutter }}>
        {past ? say.leadPast(view.year) : view.open ? say.leadOpen : say.lead(opens, view.opensOn.endsWith('-12-31'))}
      </Lead>
      <View style={{ height: 16 }} />
      {view.open || past ? (
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Button label={say.read.button} onPress={() => setReading(true)} style={{ alignSelf: 'center' }} />
        </View>
      ) : null}
      {view.latest.length ? (
        <RowGroup>
          {view.latest.map((one, index) => (
            <BoardRow
              key={one.id}
              first={index === 0}
              leading={<Face uri={one.who?.avatarUrl} name={one.who?.name ?? ''} />}
              title={say.slipTitle(one.who?.name ?? '', one.what, one.place)}
              line={say.slipLine(formatDayLong(one.day), one.fromJourney, one.mine && one.sealed === false && !view.open)}
              trailing={one.sealed ? <Sealed /> : <Arrow />}
              spoken={words.common.spoken([say.slipTitle(one.who?.name ?? '', one.what, one.place), formatDayLong(one.day), one.sealed ? say.sealedWord : null])}
              onPress={() => setOpenId(one.id)}
            />
          ))}
        </RowGroup>
      ) : (
        <Txt variant="callout" color="muted" center style={{ marginHorizontal: layout.gutter }}>
          {say.empty}
        </Txt>
      )}

      {opened.view.years.length ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.earlier}</GroupLabel>
          <RowGroup>
            {past ? <BoardRow first leading={<Tile emoji={THIS_YEAR} />} title={say.thisYear(opened.view.year)} line={say.count(opened.view.count)} trailing={<Arrow />} onPress={() => setYear(undefined)} /> : null}
            {opened.view.years.filter((one) => one.year !== year).map((one, index) => (
              <BoardRow key={one.year} first={index === 0 && !past} leading={<Tile emoji={A_JAR} />} title={say.yearTitle(one.year)} line={say.count(one.count)} trailing={<Arrow />} onPress={() => setYear(one.year)} />
            ))}
          </RowGroup>
        </>
      ) : null}

      <SlipSheet slip={slip} opens={opens} onClose={() => setOpenId(null)} />
      <ReadSheet board={board} visible={reading} onClose={() => setReading(false)} />
    </BoardFrame>
  );
}

/** The jar: a lid, the glass, and as many slips in it as there are good things, up to the sixteen the glass holds. */
function JarPicture({ count }: { count: number }) {
  const { colors } = useTheme();
  const tints = [colors.accent, colors.tint1, colors.tint2, colors.tint3, colors.tint4, colors.tint5];
  return (
    <View accessible={false} style={{ alignSelf: 'center', width: 168, height: 196, marginTop: 4, marginBottom: 14 }}>
      <View style={{ position: 'absolute', top: 16, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: radius.sheet, backgroundColor: colors.fill, borderWidth: 3, borderColor: colors.fill2 }}>
        {SLIPS.slice(0, Math.min(count, SLIPS.length)).map(([left, bottom, turn, tint], index) => (
          <View key={index} style={{ position: 'absolute', left: left - 3, bottom: bottom - 3, width: 46, height: 17, borderRadius: radius.chip, backgroundColor: tints[tint], transform: [{ rotate: `${turn}deg` }] }} />
        ))}
      </View>
      <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 22, borderRadius: radius.chip, backgroundColor: colors.accent }} />
    </View>
  );
}

/** A slip, pressed: the person who wrote it down (and everyone, once the jar is open) reads it; anyone else is told when it opens. */
function SlipSheet({ slip, opens, onClose }: { slip: GoodJarSlip | null; opens: string; onClose: () => void }) {
  if (slip?.sealed) return <Notice title={say.slipTitle(slip.who?.name ?? '', slip.what, slip.place)} text={say.sealedUntil(opens)} onClose={onClose} />;
  return (
    <Sheet visible={slip !== null} onClose={onClose} title={slip ? say.slipTitle(slip.who?.name ?? '', slip.what, slip.place) : undefined} subtitle={slip ? formatDayLong(slip.day) : undefined}>
      {slip ? (
        <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.gutter }}>
          {slip.picture ? <Photo uri={slip.picture.url} radius="photo" style={{ height: 220 }} label={say.picture} /> : null}
          {slip.text ? <Txt variant="bodyLarge">{slip.text}</Txt> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** The year read back: every slip of the jar that is showing, newest first, a page at a time. Only for a jar that is open. */
function ReadSheet({ board, visible, onClose }: { board: Jar; visible: boolean; onClose: () => void }) {
  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'slip', filter: String(board.view.year), day: today() }, { query: { ...paged, enabled: visible } });
  // One template's list holds that template's own: in a jar every entry is a slip.
  const slips = rows(asked.data) as GoodJarSlip[] | undefined;
  return (
    <Sheet visible={visible} onClose={onClose} title={say.read.title(board.view.year)} tall>
      {asked.isError && !slips ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {messageFor(asked.error)}
        </Txt>
      ) : !slips ? (
        <View style={{ minHeight: 200 }}>
          <Loading />
        </View>
      ) : (
        <View style={{ gap: 18, paddingTop: 6, paddingHorizontal: layout.gutter }}>
          {slips.map((one) => (
            <View key={one.id} style={{ gap: 6 }}>
              {one.picture ? <Photo uri={one.picture.thumbUrl ?? one.picture.url} radius="photo" style={{ height: 160 }} label={say.picture} /> : null}
              {one.text ? <Txt variant="bodyLarge">{one.text}</Txt> : null}
              <Txt variant="footnote" color="muted">
                {words.common.join([one.who?.name, formatDayLong(one.day)])}
              </Txt>
            </View>
          ))}
          <MoreButton pages={asked} />
        </View>
      )}
    </Sheet>
  );
}

/** The box at the end of the page: a good thing in a line, with a photo or a drawing of it if there is one. */
function AddSlip({ board }: { board: Jar }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const drop = async (text: string) => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      if (!(await changes.add('slip', { text, mediaId }, clientId.current))) return false;
      clientId.current = newClientId();
      setPhoto(null);
      return true;
    } catch (error) {
      setProblem(messageFor(error));
      return false;
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <AddBar
        placeholder={say.add}
        busy={sending || changes.busy}
        problem={problem ?? changes.problem}
        onSubmit={drop}
        // Saying it out loud is the phone's own dictation; in a browser the words are typed.
        onMic={() => setNotice(say.micNote)}
        micLabel={say.mic}
        above={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: layout.barGutter }}>
            <Tap accessibilityRole="button" accessibilityLabel={photo ? say.changePhoto : say.addPhoto} hitSlop={8} scaleTo={0.94} onPress={() => void pickPhoto().then((picked) => (picked ? setPhoto(picked) : undefined)).catch(() => setProblem(words.media.photosClosed))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
              <ImagePlus size={16} color={colors.accentText} />
              <Txt variant="caption" weight={700} style={{ color: colors.accentText }}>
                {photo ? say.changePhoto : say.addPhoto}
              </Txt>
            </Tap>
            {photo ? <Photo uri={photo.uri} radius="chip" style={{ width: 34, height: 34 }} label={say.photoChosen} /> : null}
          </View>
        }
      />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </>
  );
}
