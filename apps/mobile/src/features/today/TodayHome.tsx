import { useRouter } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type CircleResponse, type FreshCard, type TodayItem, type TodayResponse, useGetToday } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { headcount } from '@/features/circles/members';
import { placeHref, TAB_BAR_ROOM } from '@/features/home/places';
import { JourneyOnToday } from '@/features/journeyLink/TodayJourneyCard';
import { PayBillButton } from '@/features/money/PayBill';
import { TodayTick } from '@/features/plan/TodayTick';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Blob } from '@/ui/Blob';
import { Card } from '@/ui/Card';
import { Loading } from '@/ui/Loading';
import { MoreRow } from '@/ui/MoreRow';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { Problem } from '@/ui/Problem';
import { Rail } from '@/ui/Rail';
import { Ring } from '@/ui/Ring';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { stillOn } from './about';
import { newThingHref } from './newThings';
import { TodayCards } from './TodayCards';

/** How many of the day's things the summary names before it counts the rest. */
const NAMED = 2;

/**
 * 3.1 Today, the place Home opens on: what is on, what is due and what is new in the current circle, across
 * every place. A summary card with its ring, the cards of the circle's own templates (`TodayCards`), the
 * day's list, and what is new as a rail of cards. Every place brings its own things to these through the
 * API; this draws them all the same way and opens each by its kind. With nothing at all it is the brand-new circle's page (13.3): three ways to put the first thing in.
 */
export function TodayHome() {
  const { colors } = useTheme();
  const circle = useCircle();
  const asked = useGetToday(circle.id, { day: today() });
  const load = loadState(asked);
  const data = asked.data;

  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!data) return load.offline ? <Loading offline /> : <TodaySkeleton />;

  const nothing = data.items.length === 0 && data.fresh.length === 0 && data.cards.length === 0;
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} tintColor={colors.muted} />}>
      {nothing ? <BrandNew circle={circle} /> : <Day data={data} circle={circle} />}
    </ScrollView>
  );
}

/** The day itself: the summary card, the cards of the circle's own templates, the list, and what is new. */
function Day({ data, circle }: { data: TodayResponse; circle: CircleResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const all = data.left + data.done;
  // What the day is about: what is still on, or, on a day with nothing in the list, its first cards.
  const about = data.items.length ? stillOn(data.items) : data.cards;
  const titles = about.map((one) => one.title ?? '').filter(Boolean);
  return (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18, marginHorizontal: layout.barGutter, paddingVertical: 16, paddingLeft: 18, paddingRight: 16 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="headline" numberOfLines={2}>
            {words.today.summary.headline(titles.slice(0, NAMED), Math.max(titles.length - NAMED, 0))}
          </Txt>
          <Txt variant="caption" weight={500} color="muted" style={{ marginTop: 4 }}>
            {words.today.summary.counts(data.left, data.done)}
          </Txt>
        </View>
        <Ring progress={all === 0 ? 0 : data.done / all} emoji={words.today.summary.emoji[circle.kind]} />
      </Card>

      {/* Journey's cards (someone away, On this day, a goodnight held until bedtime) are drawn by the link with Journey; the rest as ever. */}
      <JourneyOnToday cards={data.cards}>{(rest) => <TodayCards cards={rest} />}</JourneyOnToday>

      {data.items.length ? (
        <Card style={{ marginTop: 14, marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          {data.items.map((item, index) => (
            <DayRow key={`${item.thingId}-${index}`} item={item} first={index === 0} />
          ))}
        </Card>
      ) : null}

      {data.fresh.length ? (
        <>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={words.common.seeAll(words.today.fresh)}
            onPress={() => router.navigate(placeHref('library'))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 26, marginBottom: 12, marginHorizontal: layout.barGutter }}>
            <Txt variant="subtitle">{words.today.fresh}</Txt>
            <ChevronRight size={18} color={colors.text} strokeWidth={2.6} />
          </Tap>
          <Rail>
            {data.fresh.map((card, index) => (
              <NewCard key={`${card.thingId}-${index}`} card={card} />
            ))}
          </Rail>
        </>
      ) : null}
    </>
  );
}

/** One thing of the day: what stands in front (a time, an amount, or a tick), its title and a line, and whose it is. */
function DayRow({ item, first }: { item: TodayItem; first: boolean }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const ticked = item.done === true;
  const lead = item.done === null || item.done === undefined ? (item.lead ?? '') : ticked ? words.today.done : words.today.notDone;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([lead, item.title, item.note])}
      onPress={() => open({ kind: item.kind, id: item.thingId })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View style={{ width: 44, alignItems: 'flex-start' }}>
        {item.done === null || item.done === undefined ? (
          <Txt variant="note" weight={800} numberOfLines={1}>
            {item.lead}
          </Txt>
        ) : item.kind === 'reminder' ? (
          // A reminder is ticked right here: Plan's own tick, which tells the API and every list.
          <TodayTick item={item} />
        ) : (
          <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: ticked ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: ticked ? colors.accent : 'transparent' }}>
            {ticked ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" numberOfLines={1}>
          {item.title}
        </Txt>
        {item.note ? (
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {item.note}
          </Txt>
        ) : null}
      </View>
      {item.kind === 'bill' && item.thingId ? (
        // A bill's line ends in "Pay": Money's own button, which marks the person's share as paid or opens the payee's page.
        <PayBillButton billId={item.thingId} title={item.title ?? ''} />
      ) : item.avatarUrls?.length ? (
        <View style={{ flexDirection: 'row' }}>
          {item.avatarUrls.slice(0, 2).map((uri, index) => (
            <View key={uri} style={{ marginLeft: index === 0 ? 0 : -8 }}>
              <Avatar uri={uri} name="" size={22} ring={colors.surface} />
            </View>
          ))}
        </View>
      ) : null}
    </Tap>
  );
}

/** Something new, as a small card: its picture (or its kind's icon), a label on it, a title and a line. */
function NewCard({ card }: { card: FreshCard }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const kind = kindOf(card.kind);
  const Icon = kind.icon;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([card.title, card.pill, card.note])} onPress={() => open({ kind: card.kind, id: card.thingId })} style={{ width: 158, gap: 2 }}>
      <Photo uri={card.imageUrl} radius="card" style={{ height: 158, marginBottom: 9, alignItems: 'center', justifyContent: 'center' }}>
        {card.imageUrl ? null : <Icon size={40} color={colors.muted} strokeWidth={1.6} />}
        {card.pill ? <Pill label={card.pill} tone={card.imageUrl ? 'glass' : 'accent'} style={{ position: 'absolute', top: 12, left: 12 }} /> : null}
      </Photo>
      <Txt variant="item" numberOfLines={2}>
        {card.title}
      </Txt>
      <Txt variant="caption" weight={500} color="muted" numberOfLines={1}>
        {card.note}
      </Txt>
    </Tap>
  );
}

/** 13.3 A brand-new circle: one sentence about what goes here, and three ways to put the first thing in. */
function BrandNew({ circle }: { circle: CircleResponse }) {
  const router = useRouter();
  return (
    <>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 34, marginBottom: 20, paddingHorizontal: 34 }}>
        <View style={{ marginBottom: 6 }}>
          <Blob emoji="🏡" />
        </View>
        <Txt variant="titleSmall" accessibilityRole="header" center>
          {words.today.empty.title(circle.name)}
        </Txt>
        <Txt variant="bodySmall" color="muted" center>
          {words.today.empty.body(headcount(circle).people)}
        </Txt>
      </View>
      {words.today.empty.shortcuts[circle.kind].map((shortcut) => (
        <MoreRow key={shortcut.to} emoji={shortcut.emoji} title={shortcut.label} rest={shortcut.rest} onPress={() => router.push(newThingHref(shortcut.to))} />
      ))}
    </>
  );
}

/** 13.1 Loading: grey shapes in the layout that is coming. The six icons above are there from the first frame. */
export function TodaySkeleton() {
  return (
    <View accessibilityLabel={words.states.loading}>
      <Sk height={94} radius="cardLarge" style={{ marginTop: 18, marginHorizontal: layout.barGutter }} />
      <Card style={{ marginTop: 14, marginHorizontal: layout.barGutter, borderRadius: radius.card }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Sk width={40} height={40} radius="tile" />
            <View style={{ flex: 1, gap: 7 }}>
              <Sk width="80%" height={14} radius="chip" />
              <Sk width="55%" height={12} radius="chip" />
            </View>
          </View>
        ))}
      </Card>
      <Sk width={210} height={20} radius="chip" style={{ marginTop: 26, marginBottom: 12, marginHorizontal: layout.barGutter }} />
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: layout.barGutter, overflow: 'hidden' }}>
        <Sk width={232} height={158} radius="card" />
        <Sk width={232} height={158} radius="card" />
      </View>
    </View>
  );
}
