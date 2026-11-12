import type { TodayCard, TodayItem } from '@/api/generated/homeport';

/** Something with no time of its own sorts to the end of the day: this many minutes since midnight. */
const NO_TIME = 1440;

/**
 * What the day is still about, for the summary card's bold line: the things that are not done and not over
 * yet, in the day's own order. A thing with a time counts until that time has passed; one without a time
 * counts all day. When all of it is done or over, the day is about everything that was on.
 */
export function stillOn(items: readonly TodayItem[], now: Date = new Date()): TodayItem[] {
  const minute = now.getHours() * 60 + now.getMinutes();
  const open = items.filter((item) => item.done !== true);
  const ahead = open.filter((item) => (item.minute ?? NO_TIME) >= NO_TIME || (item.minute ?? NO_TIME) >= minute);
  return ahead.length ? ahead : open.length ? open : [...items];
}

/** Where each of a day's cards is drawn. */
export type CardParts = {
  /** The card that is the day's headline, at the top beside the ring. Null: the day's own list is summed up there. */
  headline: TodayCard | null;
  /** The cards that are lines of the day's list, after the day's own things. */
  lines: TodayCard[];
  /** The cards that stand side by side in the rail under the list. */
  rail: TodayCard[];
};

/** True for a card that is a title and a line and nothing else: no figure to show large, no picture, no button. */
const onlyWords = (card: TodayCard) => !card.figure && !card.imageUrl && !card.action;

/**
 * Lays a day's cards out, in their own order (`order`, lower first), by what each one carries and never by
 * who sent it:
 *
 *  - the first card with a picture starts the rail, and what is sorted after it stands there with it;
 *  - of the cards before it, the first that is only words is the day's headline ("Friday is yours to plan");
 *  - the others before it are lines of the day's list, each with its figure or its emoji in front and its
 *    button at the end.
 */
export function partsOf(cards: readonly TodayCard[]): CardParts {
  const sorted = [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const firstPicture = sorted.findIndex((card) => !!card.imageUrl);
  const before = firstPicture < 0 ? sorted : sorted.slice(0, firstPicture);
  const headline = before.find(onlyWords) ?? null;
  return { headline, lines: before.filter((card) => card !== headline), rail: firstPicture < 0 ? [] : sorted.slice(firstPicture) };
}
