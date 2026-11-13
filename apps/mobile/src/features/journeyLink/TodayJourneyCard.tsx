import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Heart, Route } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type AtHomeResponse, type AwayResponse, type CircleResponse, type JourneyPastDay, loveJourneyEntry, type TodayCard, unloveJourneyEntry, useGetJourneyAtHome } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useOpenThing } from '@/features/things/open';
import { CardLine } from '@/features/today/TodayCards';
import { formatTime, today } from '@/lib/dates';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { Eyebrow } from '@/ui/Eyebrow';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { Rail } from '@/ui/Rail';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { openInJourney } from './open';
import { HeartsSheet, withoutAPhone } from './parts';

/** The looks of Today's cards that the link with Journey draws itself. */
const AWAY = 'journey_away';
const PAST = 'journey_on_this_day';
const GOODNIGHT = 'goodnight';

/** A stretch of Today's cards, in their order: someone who is away, days from kept journeys, or cards Today draws itself. */
export type Part = { kind: 'away'; card: TodayCard; at: number } | { kind: 'past'; cards: TodayCard[] } | { kind: 'rest'; cards: TodayCard[] };

/**
 * Today's cards in their own order (`order`, lower first), cut into the stretches each is drawn by.
 * A goodnight that is `held` (it waits for bedtime) is left out; so is a card about something that isn't a
 * thing here and that nobody knows how to draw, since it could not be opened.
 */
export function partsOf(cards: readonly TodayCard[], held: (card: TodayCard) => boolean = () => false): Part[] {
  const parts: Part[] = [];
  let away = 0;
  for (const card of [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (card.look === AWAY) {
      parts.push({ kind: 'away', card, at: away });
      away += 1;
      continue;
    }
    if (card.look === GOODNIGHT && held(card)) continue;
    if (card.look !== PAST && !card.thingId) continue;
    const kind = card.look === PAST ? 'past' : 'rest';
    const last = parts[parts.length - 1];
    if (last && last.kind !== 'away' && last.kind === kind) last.cards.push(card);
    else parts.push({ kind, cards: [card] });
  }
  return parts;
}

/**
 * True while a goodnight still waits for bedtime: it is meant for today, and the phone's clock hasn't
 * reached the time it is shown from. Until Journey at home has answered, nothing is known about it, so it waits.
 */
export function waitsForBedtime(card: TodayCard, atHome: AtHomeResponse | undefined, failed: boolean, day: string, clock: string): boolean {
  if (!atHome) return !failed;
  const goodnight = atHome.goodnights.find((one) => one.id === card.thingId);
  return !!goodnight && goodnight.forDay === day && clock < goodnight.showFrom;
}

/**
 * How a card of Today is recognised as one the link with Journey draws itself: by its `look`. "journey_away"
 * is someone of the circle on a journey (it has no `thingId` and no `kind`: it is not a thing here), and
 * "journey_on_this_day" a day from a kept journey of an earlier year (its thing is the book's page). A
 * "goodnight" card is not one of these: it is a thing here, drawn as a line like any card of Today, only
 * held back until bedtime (`useBedtimeHold`) and then put first (`JourneyOnToday`).
 */
export function isJourneyCard(card: TodayCard): boolean {
  return card.look === AWAY || card.look === PAST;
}

/**
 * Says which of Today's cards still wait: `const held = useBedtimeHold(cards)`, then leave out every card
 * for which `held(card)` is true. Only a goodnight ever waits, until the circle's bedtime on the phone's
 * clock; while one does, the clock is looked at again every half minute, so it appears by itself.
 */
export function useBedtimeHold(cards: readonly TodayCard[]): (card: TodayCard) => boolean {
  const circle = useCircle();
  const has = cards.some((card) => card.look === GOODNIGHT);
  const asked = useGetJourneyAtHome(circle.id, { day: today() }, { query: { enabled: has } });
  const atHome = asked.data;
  const failed = asked.isError;
  const day = today();
  // What the phone's clock says is kept as state: the page is drawn from it, and drawn again when it moves on.
  const [clock, setClock] = useState(() => formatTime(new Date()));
  const held = (card: TodayCard) => card.look === GOODNIGHT && waitsForBedtime(card, atHome, failed, day, clock);
  const holding = cards.some(held);
  useEffect(() => {
    if (!holding) return;
    const timer = setInterval(() => setClock(formatTime(new Date())), 30_000);
    return () => clearInterval(timer);
  }, [holding]);
  return held;
}

/**
 * One of Journey's cards on Today, drawn by its look (see `isJourneyCard`). Someone who is away is a card
 * as wide as the page: who, which journey and how far along, their latest entry, a heart that stays at home
 * and the way to it in Journey. A day from a kept journey is a small picture card, made to stand in a rail,
 * that opens its book. The card brings what it needs itself (Journey at home, for the current circle), so
 * it can be mounted wherever Today puts its cards. Anything else draws nothing.
 */
export function TodayJourneyCard({ card }: { card: TodayCard }) {
  const circle = useCircle();
  const atHome = useGetJourneyAtHome(circle.id, { day: today() }, { query: { enabled: isJourneyCard(card) } }).data;
  if (card.look === AWAY) return <AwayCard card={card} away={awayOf(card, atHome?.away)} circle={circle} />;
  if (card.look === PAST) return <PastDayCard card={card} past={atHome?.onThisDay} />;
  return null;
}

/** Who a "someone is away" card is about, among the people Journey at home says are away: the card's two lines are made of their name and their journey. */
export function awayOf(card: TodayCard, away: readonly AwayResponse[] | undefined): AwayResponse | undefined {
  if (!away?.length) return undefined;
  return away.find((one) => !!one.who.name && !!card.title?.startsWith(one.who.name) && !!one.journey.title && !!card.line?.startsWith(one.journey.title)) ?? (away.length === 1 ? away[0] : undefined);
}

type Props = {
  /** Every card of Today, as the API sent them. */
  cards: readonly TodayCard[];
  /** Draws the day with the cards that are not Journey's, the way Today lays its cards out. Called once. */
  children: (rest: TodayCard[]) => ReactNode;
};

/**
 * 10.8 Journey, at home: Today with Journey's cards around it. A goodnight whose bedtime has come stands
 * first, as a line with its "Play"; someone of the circle who is away gets a card of their own; then the
 * day; and the days from kept journeys stand side by side under "On this day", below it. Everything that is
 * not Journey's is handed back to Today to lay out (`children`), in the order the API gave.
 */
export function JourneyOnToday({ cards, children }: Props) {
  const held = useBedtimeHold(cards);
  const parts = partsOf(cards, held);
  const past = parts.flatMap((part) => (part.kind === 'past' ? part.cards : []));
  const rest = parts.flatMap((part) => (part.kind === 'rest' ? part.cards : []));
  const nights = rest.filter((card) => card.look === GOODNIGHT);
  return (
    <>
      {nights.length ? (
        <Card style={{ marginTop: 16, marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          {nights.map((card, index) => (
            <CardLine key={`${card.thingId}-${index}`} card={card} first={index === 0} />
          ))}
        </Card>
      ) : null}
      {parts.map((part) => (part.kind === 'away' ? <TodayJourneyCard key={`away-${part.at}`} card={part.card} /> : null))}
      {children(rest.filter((card) => card.look !== GOODNIGHT))}
      {past.length ? <OnThisDay cards={past} /> : null}
    </>
  );
}

/** "Alex is on a journey": who, which journey and how far along, how many entries are new, and the latest one. */
function AwayCard({ card, away, circle }: { card: TodayCard; away: AwayResponse | undefined; circle: CircleResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const says = words.together.atHome;
  const [hearts, setHearts] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const latest = away?.latest;
  const entryId = latest?.entryId;

  const heart = useMutation({
    mutationFn: ({ as, loved }: { as: string | null; loved: boolean }) => (loved ? loveJourneyEntry : unloveJourneyEntry)(circle.id, entryId ?? '', as ? { as } : undefined),
    onSuccess: (everyone) => cache.awayHearted(circle.id, everyone),
    onError: (error) => setSaid(messageFor(error)),
  });
  const open = () =>
    void openInJourney(away?.journey.openUrl).then((how) => {
      if (how !== 'opened') setSaid(how === 'browser' ? words.together.open.browser : words.together.open.missing);
    });
  // Who gave a heart, the person's own said as "You": the API names them among the others too.
  const lovedLine = says.lovedBy(
    (latest?.lovedBy ?? []).filter((person) => person.memberId !== circle.myMemberId).map((person) => firstName(person.name)),
    !!latest?.loved,
  );
  const lit = !!latest?.loved || (latest?.lovedBy?.length ?? 0) > 0;
  // In a home with children a heart can be theirs: then the sheet asks whose. Otherwise the heart is the person's own.
  const pressHeart = () => (withoutAPhone(circle).length ? setHearts(true) : heart.mutate({ as: null, loved: !latest?.loved }));

  return (
    <Card style={{ marginTop: 16, marginHorizontal: layout.barGutter, borderRadius: radius.panel, overflow: 'hidden' }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([card.title, card.line, card.figure])} onPress={() => router.push('/journey/at-home')} scaleTo={0.99} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
        <Avatar uri={away?.who.avatarUrl} name={away?.who.name ?? ''} size={38} />
        <View style={{ flex: 1 }}>
          <Txt variant="control" weight={800} numberOfLines={1}>
            {card.title}
          </Txt>
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {card.line}
          </Txt>
        </View>
        {card.figure ? (
          <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.tile, backgroundColor: colors.accent }}>
            <Txt variant="small" weight={800} style={{ color: colors.onAccent }}>
              {card.figure}
            </Txt>
          </View>
        ) : null}
      </Tap>
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([latest?.title ?? card.title, card.action])} onPress={open} scaleTo={0.985}>
          <Photo uri={latest?.imageUrl ?? card.imageUrl} radius="card" style={{ height: 172, marginBottom: 12 }}>
            <Pill label={words.together.apps.journey.name} icon={(c) => <Route size={12} color={c} />} style={{ position: 'absolute', top: 12, left: 12 }} />
          </Photo>
          {latest ? (
            <>
              <Eyebrow>{words.common.join([latest.label, latest.place])}</Eyebrow>
              <Txt variant="subheading" numberOfLines={2} style={{ marginTop: 3 }}>
                {latest.title}
              </Txt>
            </>
          ) : null}
        </Tap>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 30, marginTop: 12 }}>
          {entryId ? (
            <Tap accessibilityRole="button" accessibilityLabel={lovedLine ? says.lovedSpoken(lovedLine) : says.loveSpoken(latest?.title ?? '')} disabled={heart.isPending} hitSlop={8} onPress={pressHeart} scaleTo={0.94} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <Heart size={18} color={lit ? colors.like : colors.text} fill={lit ? colors.like : 'transparent'} />
              <Txt variant="caption" weight={700} numberOfLines={1} style={{ color: lit ? colors.like : colors.text, flexShrink: 1 }}>
                {lovedLine ?? says.love}
              </Txt>
            </Tap>
          ) : null}
          <View style={{ flex: 1 }} />
          {card.action ? (
            <Tap accessibilityRole="button" accessibilityLabel={card.action} hitSlop={8} onPress={open} scaleTo={0.96} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Txt variant="caption" weight={800} color="accentText">
                {card.action}
              </Txt>
              <ChevronRight size={16} color={colors.accentText} />
            </Tap>
          ) : null}
        </View>
        {said ? (
          <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: 8 }}>
            {said}
          </Txt>
        ) : null}
      </View>
      <HeartsSheet visible={hearts} onClose={() => setHearts(false)} circle={circle} lovedBy={latest?.lovedBy ?? []} loved={!!latest?.loved} busy={heart.isPending} onChange={(as, loved) => heart.mutate({ as, loved })} />
    </Card>
  );
}

/** "On this day": days of kept journeys that fell on today's date in earlier years, side by side under their heading. */
export function OnThisDay({ cards }: { cards: readonly TodayCard[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const says = words.together.atHome;
  return (
    <>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={words.common.seeAll(says.onThisDay)}
        onPress={() => router.push('/journey/kept')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 26, marginBottom: 12, marginHorizontal: layout.barGutter }}>
        <Txt variant="subtitle">{says.onThisDay}</Txt>
        <ChevronRight size={18} color={colors.text} strokeWidth={2.6} />
      </Tap>
      <Rail>
        {cards.map((card, index) => (
          <TodayJourneyCard key={`${card.thingId}-${index}`} card={card} />
        ))}
      </Rail>
    </>
  );
}

/** A day from a kept journey, as a small picture card: how long ago on the picture, what the day was called, and which day of the journey. It opens the book. */
function PastDayCard({ card, past }: { card: TodayCard; past: readonly JourneyPastDay[] | undefined }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const says = words.together.atHome;
  // What Journey at home knows of the same day: how long ago, and which day of the journey.
  const day = past?.find((one) => one.pageId === card.thingId && one.title === card.title);
  const line = day ? says.keptDay(day.label) : card.line;
  const ago = day?.yearsAgo ? says.ago(day.yearsAgo) : null;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([card.title, ago, line])} onPress={() => open({ kind: card.kind ?? 'page', id: card.thingId })} style={{ width: 158, gap: 2 }}>
      <Photo uri={day?.imageUrl ?? card.imageUrl} radius="card" style={{ height: 158, marginBottom: 9 }}>
        {ago ? <Pill label={ago} style={{ position: 'absolute', top: 12, left: 12 }} /> : null}
      </Photo>
      <Txt variant="item" numberOfLines={2}>
        {card.title}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {day ? <Route size={12} color={colors.muted} /> : null}
        <Txt variant="caption" weight={500} color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {line}
        </Txt>
      </View>
    </Tap>
  );
}
