import { useRouter } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type CircleResponse, type FreshCard, type TodayItem, type TodayResponse, useGetToday } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { headcount } from '@/features/circles/members';
import { RunningLow } from '@/features/flat/RunningLow';
import { placeHref, TAB_BAR_ROOM } from '@/features/home/places';
import { useNotice } from '@/features/plan/Notice';
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

import { partsOf, stillOn } from './about';
import { newThingHref } from './newThings';
import { SplitButton } from './SplitButton';
import { CardLine, HeadlineCard, PictureCard } from './TodayCards';
import { FrontWords, TodayLine } from './TodayLine';

/** How many of the day's things the summary names before it counts the rest. */
const NAMED = 2;

/**
 * 3.1 Today, the place Home opens on: what is on, what is due and what is new in the current circle, across
 * every place. It is one screen for every kind of circle and draws whatever the API's Today holds:
 *
 *  - the headline card with its ring: the first card that is only words ("Friday is yours to plan"), or,
 *    where nobody sent one, the day's own list summed up ("Dentist · Mia, Take the bins out and 1 more");
 *  - the list: the day's things (a time, a day, an amount, a tick or an icon in front), then the cards that
 *    are lines (a figure or an emoji in front, a button at the end);
 *  - the rail under the kind's own heading ("New in the library", "The two of you", "From the crew"): the
 *    cards with a picture, then what is new.
 *
 * Every place brings its own things to these through the API; this draws them all the same way and opens
 * each by its kind. With nothing at all it is the brand-new circle's page (13.3): three ways to put the
 * first thing in.
 */
export function TodayHome() {
  const { colors } = useTheme();
  const circle = useCircle();
  const asked = useGetToday(circle.id, { day: today() });
  const load = loadState(asked);
  const data = asked.data;
  const [say, notice] = useNotice();

  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!data) return load.offline ? <Loading offline /> : <TodaySkeleton />;

  const nothing = data.items.length === 0 && data.fresh.length === 0 && data.cards.length === 0;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} tintColor={colors.muted} />}>
        {nothing ? <BrandNew circle={circle} /> : <Day data={data} circle={circle} say={say} />}
      </ScrollView>
      {notice}
    </View>
  );
}

/** The day itself: the headline card, the list, and the rail of what the circle keeps and what is new. */
function Day({ data, circle, say }: { data: TodayResponse; circle: CircleResponse; say: (text: string) => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const parts = partsOf(data.cards);
  const all = data.left + data.done;
  const progress = all === 0 ? 0 : data.done / all;
  const emoji = words.today.summary.emoji[circle.kind];
  const section = words.today.section[circle.kind];
  const two = headcount(circle).people === 2;
  return (
    <>
      {parts.headline ? <HeadlineCard card={parts.headline} progress={progress} emoji={emoji} /> : <Summary data={data} progress={progress} emoji={emoji} />}

      {data.items.length + parts.lines.length ? (
        <Card style={{ marginTop: 14, marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          {data.items.map((item, index) => (
            <DayRow key={`${item.thingId}-${index}`} item={item} first={index === 0} two={two} say={say} />
          ))}
          {parts.lines.map((card, index) => (
            <CardLine key={`${card.thingId}-${index}`} card={card} first={data.items.length === 0 && index === 0} />
          ))}
        </Card>
      ) : null}

      {/* What a flat is running low on: the flat's own piece, with its own heading. It draws nothing without a kitty. */}
      {circle.kind === 'flat' ? <RunningLow circle={circle} /> : null}

      {parts.rail.length + data.fresh.length ? (
        <>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={words.common.seeAll(section)}
            // What is new lives in the Library; a rail that holds the circle's own boards leads to where those start.
            onPress={() => (parts.rail.length ? router.push('/templates') : router.navigate(placeHref('library')))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 26, marginBottom: 12, marginHorizontal: layout.barGutter }}>
            <Txt variant="subtitle">{section}</Txt>
            <ChevronRight size={18} color={colors.text} strokeWidth={2.6} />
          </Tap>
          <Rail>
            {parts.rail.map((card, index) => (
              <PictureCard key={`${card.thingId}-${index}`} card={card} />
            ))}
            {data.fresh.map((card, index) => (
              <NewCard key={`${card.thingId}-${index}`} card={card} />
            ))}
          </Rail>
        </>
      ) : null}
    </>
  );
}

/** The headline card of a day nobody sent a headline for: its first things by their titles, and how much is left and done. */
function Summary({ data, progress, emoji }: { data: TodayResponse; progress: number; emoji: string }) {
  // What the day is about: what is still on, or, on a day with nothing in the list, its first cards.
  const about = data.items.length ? stillOn(data.items) : [...data.cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const titles = about.map((one) => one.title ?? '').filter(Boolean);
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18, marginHorizontal: layout.barGutter, paddingVertical: 16, paddingLeft: 18, paddingRight: 16 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="headline" numberOfLines={2}>
          {words.today.summary.headline(titles.slice(0, NAMED), Math.max(titles.length - NAMED, 0))}
        </Txt>
        <Txt variant="caption" weight={500} color="muted" style={{ marginTop: 4 }}>
          {words.today.summary.counts(data.left, data.done)}
        </Txt>
      </View>
      <Ring progress={progress} emoji={emoji} />
    </Card>
  );
}

/**
 * One thing of the day: what stands in front (a time, a day or an amount; a tick; or its kind's icon), its
 * title and a line, and whose it is. A line about shared costs has its button at the end instead
 * (`SplitButton`), once the split has said there is something to remind of or to settle.
 */
function DayRow({ item, first, two, say }: { item: TodayItem; first: boolean; two: boolean; say: (text: string) => void }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const ticks = item.done !== null && item.done !== undefined;
  const ticked = item.done === true;
  const Icon = kindOf(item.kind).icon;
  let front: ReactNode;
  if (!ticks) front = item.lead ? <FrontWords>{item.lead}</FrontWords> : <Icon size={20} color={colors.text} />;
  // A reminder is ticked right here: Plan's own tick, which tells the API and every list.
  else if (item.kind === 'reminder') front = <TodayTick item={item} />;
  else {
    front = (
      <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: ticked ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: ticked ? colors.accent : 'transparent' }}>
        {ticked ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
    );
  }
  const faces = item.avatarUrls?.length ? (
    <View style={{ flexDirection: 'row' }}>
      {item.avatarUrls.slice(0, 2).map((uri, index) => (
        <View key={uri} style={{ marginLeft: index === 0 ? 0 : -8 }}>
          <Avatar uri={uri} name="" size={22} ring={colors.surface} />
        </View>
      ))}
    </View>
  ) : null;
  const split = item.kind === 'split' && item.thingId ? item.thingId : null;
  return (
    <TodayLine
      first={first}
      front={front}
      // (A line with a button beside it has less room: its title may take a second line.)
      lines={split ? 2 : 1}
      title={item.title ?? ''}
      note={item.note}
      spoken={words.common.spoken([ticks ? (ticked ? words.today.done : words.today.notDone) : (item.lead ?? ''), item.title, item.note])}
      onPress={() => open({ kind: item.kind, id: item.thingId })}
      end={split ? undefined : faces}
      button={split ? <SplitButton splitId={split} title={item.title ?? ''} two={two} say={say} fallback={faces} /> : undefined}
    />
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
