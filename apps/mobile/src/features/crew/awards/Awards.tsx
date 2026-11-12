import { Check, ImagePlus, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { AwardsAwardResponse, AwardsNomineeResponse, AwardsSettings, AwardsViewResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { CtaBar } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import { PersonChips } from '@/features/templates/parts/People';
import { Arrow, BoardRow, Tile } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Eyebrow } from '@/ui/Eyebrow';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Shelf = Board<AwardsViewResponse, AwardsSettings>;
const say = words.crew.awards;
const TROPHY = '🏆';
const BALLOT = '🗳️';
/** The pictures an award can carry. The trophy is the usual one. */
const EMOJI = ['🏆', '📷', '⭐', '🎉', '💬', '🧳'];

/** Who an award went to, as its card names them: "Kai", "You", "Kai and Lea" for a tie. Null when nobody won. */
function winnersOf(award: AwardsAwardResponse, myMemberId: string | undefined): { names: string[]; first: AwardsNomineeResponse } | null {
  const winners = award.nominees.filter((nominee) => nominee.winner);
  const first = winners[0];
  if (!first) return null;
  return { names: winners.map((nominee) => (nominee.person?.memberId === myMemberId ? say.you : (nominee.person?.name ?? ''))), first };
}

/** The line under a decided award: who won and what for, or with how many of the votes. */
function decidedLine(award: AwardsAwardResponse, myMemberId: string | undefined): string {
  const won = winnersOf(award, myMemberId);
  if (!won) return say.nobodyVoted;
  if (won.names.length > 1) return say.tied(won.names, won.first.votes ?? 0);
  return words.common.join([won.names[0], won.first.what ?? say.votesOf(won.first.votes ?? 0, award.totalVotes ?? 0, won.first.ownVoteIncluded, won.first.person?.memberId === myMemberId)]);
}

/**
 * 19.8 The awards. At the end of each year the crew votes its own awards, in categories it invents. An
 * award is decided when everyone has voted; whatever is still open is decided on New Year's Eve. Until
 * then the API says only how many have voted, and that is all this screen shows of a vote. Every year
 * stays on the shelf: "Past years" reads an earlier one.
 */
export function Awards({ board: opened }: BoardScreenProps<AwardsViewResponse, AwardsSettings>) {
  /** An earlier year that is being looked at, in place of this year's awards. */
  const [year, setYear] = useState<number | undefined>(undefined);
  const { board, problem: partProblem } = useBoardPart(opened, year === undefined ? undefined : String(year));
  const view = board.view;
  const past = year !== undefined && view.year === year;
  const myMemberId = useCircles().find((one) => one.id === board.circleId)?.myMemberId;
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const award = view.awards.find((one) => one.id === openId) ?? null;
  const thisYear = opened.view.year;
  const others = opened.view.years;

  return (
    <BoardFrame
      board={board}
      title={past ? say.titleOf(view.year) : board.title}
      chip="menu"
      problem={partProblem}
      actions={<RoundButton label={say.add.button} onPress={() => (board.canEdit ? setAdding(true) : setNotice(say.viewOnly))} icon={(color) => <Plus size={20} color={color} />} />}
      floating={
        past ? (
          <CtaBar title={say.titleOf(view.year)} line={say.past.line}>
            <Button label={say.past.back(thisYear)} variant="soft" size="sm" inline onPress={() => setYear(undefined)} />
          </CtaBar>
        ) : (
          <CtaBar title={view.open ? say.bar.decided : say.bar.opens} line={others.length ? say.bar.beside(others) : say.bar.first}>
            <Button label={say.past.button} variant="soft" size="sm" inline onPress={() => (others.length ? setChoosing(true) : setNotice(say.past.none))} />
          </CtaBar>
        )
      }>
      <View style={{ height: 8 }} />
      {view.awards.length === 0 ? (
        <View style={{ paddingTop: 40 }}>
          <EmptyState emoji={TROPHY} title={say.empty.title} body={say.empty.body} action={board.canEdit && !past ? <Button label={say.add.button} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        view.awards.map((one) => <AwardCard key={one.id} award={one} myMemberId={myMemberId} onPress={() => setOpenId(one.id)} />)
      )}

      <AwardSheet board={board} award={award} myMemberId={myMemberId} onClose={() => setOpenId(null)} />
      <AddSheet
        board={opened}
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          // A new award belongs to this year: that is where it shows.
          setYear(undefined);
          setAdding(false);
        }}
      />
      <Sheet visible={choosing} onClose={() => setChoosing(false)} title={say.past.title} subtitle={say.past.lead}>
        <View style={{ paddingTop: 4 }}>
          {others.map((one, index) => (
            <BoardRow
              key={one}
              first={index === 0}
              leading={<Tile emoji={TROPHY} />}
              title={say.titleOf(one)}
              trailing={<Arrow />}
              onPress={() => {
                setChoosing(false);
                setYear(one);
              }}
            />
          ))}
        </View>
      </Sheet>
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/**
 * One award. Decided: its picture, who won and what for, and the winner's face (or the photo that won) at
 * the end. Still voting: a ballot box, how many have voted, and the Vote button.
 */
function AwardCard({ award, myMemberId, onPress }: { award: AwardsAwardResponse; myMemberId: string | undefined; onPress: () => void }) {
  const { colors, shadow } = useTheme();
  const won = award.decided ? winnersOf(award, myMemberId) : null;
  const line = award.decided ? decidedLine(award, myMemberId) : say.haveVoted(award.voted, award.asked);
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: layout.barGutter, marginBottom: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.cardLarge } as const;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([award.name, award.decided ? say.decided : say.voting, line])}
      scaleTo={0.99}
      onPress={onPress}
      // An award that is still open has no ground of its own, only an outline.
      style={[frame, award.decided ? { backgroundColor: colors.surface, boxShadow: shadow.sm } : { borderWidth: 1.5, borderColor: colors.fill2, paddingVertical: 10.5, paddingHorizontal: 12.5 }]}>
      <Emoji char={award.decided ? award.emoji || TROPHY : BALLOT} size={34} />
      <View style={{ flex: 1, gap: 4 }}>
        <Eyebrow>{award.decided ? say.decided : say.voting}</Eyebrow>
        <Txt variant="headline" weight={800} numberOfLines={2}>
          {award.name}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={2}>
          {line}
        </Txt>
      </View>
      {award.decided ? (
        won ? (
          won.first.photo ? (
            <Photo uri={won.first.photo.thumbUrl ?? won.first.photo.url} radius="tile" style={{ width: 52, height: 52 }} />
          ) : (
            <View style={{ width: 46, height: 46, marginHorizontal: 4 }}>
              <Avatar uri={won.first.person?.avatarUrl} name={won.first.person?.name ?? ''} size={46} />
              <View style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.accent }} />
            </View>
          )
        ) : null
      ) : (
        // The card itself opens the vote; the button is how the drawing says so.
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: award.youVoted ? colors.fill : colors.accent }}>
          <Txt variant="callout" weight={700} style={{ color: award.youVoted ? colors.text : colors.onAccent }}>
            {award.youVoted ? say.voted : say.vote}
          </Txt>
        </View>
      )}
    </Tap>
  );
}

type AwardSheetProps = { board: Shelf; award: AwardsAwardResponse | null; myMemberId: string | undefined; onClose: () => void };

/**
 * An award, pressed. While it is open: the nominees, each a choice for this person's one vote (pressing
 * their own choice again takes the vote back), a way to nominate someone, and deciding it early. Once it
 * is decided: how many votes each nominee had.
 */
function AwardSheet({ board, award, myMemberId, onClose }: AwardSheetProps) {
  const changes = useBoardChanges(board);
  const [nominating, setNominating] = useState(false);
  const [asking, setAsking] = useState(false);
  const close = () => {
    setNominating(false);
    setAsking(false);
    changes.forget();
    onClose();
  };
  return (
    <Sheet visible={award !== null} onClose={close} title={award?.name} subtitle={award ? (award.decided ? say.sheet.decided(award.totalVotes ?? 0) : say.sheet.voting(award.voted, award.asked)) : undefined}>
      {award ? (
        <View style={{ paddingTop: 4 }}>
          {award.nominees.length === 0 ? (
            <Txt variant="callout" color="muted" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
              {say.sheet.noNominees}
            </Txt>
          ) : null}
          <View accessibilityRole={award.decided ? undefined : 'radiogroup'}>
            {award.nominees.map((nominee) => (
              <NomineeRow
                key={nominee.id}
                nominee={nominee}
                award={award}
                you={nominee.person?.memberId === myMemberId}
                disabled={changes.busy}
                onPress={() => void (award.yourNomineeId === nominee.id ? changes.act('unvote', { awardId: award.id }) : changes.act('vote', { nomineeId: nominee.id }))}
              />
            ))}
          </View>
          <View style={{ gap: 10, paddingTop: 8, paddingHorizontal: layout.rowGutter }}>
            {changes.problem ? (
              <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
                {changes.problem}
              </Txt>
            ) : null}
            {award.decided ? null : (
              <Txt variant="footnote" color="muted">
                {say.sheet.private}
              </Txt>
            )}
            {!award.decided && board.canEdit ? (
              nominating ? (
                <Nominating board={board} award={award} onDone={() => setNominating(false)} />
              ) : (
                <>
                  <Button label={say.nominate.button} variant="soft" size="lg" block onPress={() => setNominating(true)} />
                  {asking ? (
                    <>
                      <Txt variant="callout" weight={700}>
                        {say.decide.ask}
                      </Txt>
                      <Button label={say.decide.yes} size="lg" block loading={changes.busy} onPress={() => void changes.act('decide', { awardId: award.id }).then((done) => (done ? setAsking(false) : undefined))} />
                    </>
                  ) : (
                    <Button label={say.decide.button} variant="soft" size="lg" block onPress={() => setAsking(true)} />
                  )}
                  {award.mine ? <Button label={say.sheet.remove} variant="soft" size="lg" block onPress={() => void changes.remove(award.id).then((gone) => (gone ? close() : undefined))} /> : null}
                </>
              )
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

type NomineeProps = { nominee: AwardsNomineeResponse; award: AwardsAwardResponse; you: boolean; disabled: boolean; onPress: () => void };

/** One nominee: who, what for, and either the choice to vote for them or, once decided, their votes. */
function NomineeRow({ nominee, award, you, disabled, onPress }: NomineeProps) {
  const { colors } = useTheme();
  const name = you ? say.you : (nominee.person?.name ?? '');
  const chosen = award.yourNomineeId === nominee.id;
  const content = (
    <>
      {nominee.photo ? <Photo uri={nominee.photo.thumbUrl ?? nominee.photo.url} radius="tile" style={{ width: 40, height: 40 }} /> : <Avatar uri={nominee.person?.avatarUrl} name={nominee.person?.name ?? ''} size={40} />}
      <View style={{ flex: 1 }}>
        <Txt variant="item" numberOfLines={1}>
          {name}
        </Txt>
        {nominee.what ? (
          <Txt variant="footnote" color="muted" numberOfLines={2}>
            {nominee.what}
          </Txt>
        ) : null}
      </View>
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: layout.rowGutter } as const;
  if (award.decided) {
    return (
      <View accessible accessibilityLabel={words.common.spoken([name, nominee.what, say.sheet.votes(nominee.votes ?? 0), nominee.winner ? say.sheet.won : null])} style={frame}>
        {content}
        <Txt variant="caption" weight={nominee.winner ? 800 : 600} color={nominee.winner ? 'text' : 'muted'}>
          {say.sheet.votes(nominee.votes ?? 0)}
        </Txt>
      </View>
    );
  }
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityLabel={words.common.spoken([say.sheet.voteFor(nominee.person?.name ?? '', you), nominee.what])}
      accessibilityState={{ checked: chosen, disabled }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-checked={chosen}
      disabled={disabled}
      scaleTo={0.99}
      onPress={onPress}
      style={frame}>
      {content}
      <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: chosen ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: chosen ? colors.accent : 'transparent' }}>{chosen ? <Check size={15} color={colors.onAccent} strokeWidth={3} /> : null}</View>
    </Tap>
  );
}

/** Naming someone for an award: who, what for, and a photo when the award is for one. */
function Nominating({ board, award, onDone }: { board: Shelf; award: AwardsAwardResponse; onDone: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  const [who, setWho] = useState<string | null>(null);
  const [what, setWhat] = useState('');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      if (await changes.add('nominee', { awardId: award.id, memberId: who, what: what.trim() || undefined, mediaId }, clientId.current)) onDone();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ marginHorizontal: -layout.rowGutter }}>
        <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.nominate.who}</GroupLabel>
        <PersonChips inset people={people} value={who} onChange={setWho} />
      </View>
      <Field label={say.nominate.what} value={what} onChangeText={setWhat} maxLength={120} placeholder={say.nominate.whatPlaceholder} />
      {photo ? <Photo uri={photo.uri} radius="photo" style={{ height: 140 }} label={say.nominate.photoChosen} /> : null}
      <Button
        label={photo ? say.nominate.changePhoto : say.nominate.choosePhoto}
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
      <Button label={say.nominate.save} size="lg" block disabled={!who} loading={sending || changes.busy} onPress={() => void add()} />
      <Button label={words.common.cancel} variant="soft" size="lg" block onPress={onDone} />
    </View>
  );
}

/** A new award for this year: a category the crew invents, and its picture. */
function AddSheet({ board, visible, onClose, onAdded }: { board: Shelf; visible: boolean; onClose: () => void; onAdded: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <Adding board={board} onAdded={onAdded} /> : null}
    </Sheet>
  );
}

function Adding({ board, onAdded }: { board: Shelf; onAdded: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI[0]!);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.add.name} value={name} onChangeText={setName} maxLength={80} autoFocus placeholder={say.add.namePlaceholder} error={changes.problem} />
      <View accessibilityRole="radiogroup" accessibilityLabel={say.add.picture} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EMOJI.map((one, index) => (
          <Tap
            key={one}
            accessibilityRole="radio"
            accessibilityLabel={say.add.pictures[index] ?? one}
            aria-checked={one === emoji}
            scaleTo={0.92}
            onPress={() => setEmoji(one)}
            style={{ width: 44, height: 44, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: 2, borderColor: one === emoji ? colors.text : colors.fill }}>
            <Emoji char={one} size={24} />
          </Tap>
        ))}
      </View>
      <Button label={say.add.save} size="lg" block disabled={!name.trim()} loading={changes.busy} onPress={() => void changes.add('award', { name: name.trim(), emoji }, clientId.current).then((added) => (added ? onAdded() : undefined))} />
    </View>
  );
}
