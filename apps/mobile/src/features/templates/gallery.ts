import type { CircleKind, TemplateCard, TemplateGalleryResponse, TemplateTopic, ThingBrief } from '@/api/generated/homeport';
import { words } from '@/words';

/**
 * Which cards a chip shows: everything to start from, this kind of circle's own, one of the shelves, or one
 * topic. A topic is written `topic:home`.
 */
export type Filter = 'all' | 'yours' | 'keepsakes' | 'fair_and_fun' | `topic:${TemplateTopic}`;

export type GalleryChip = { id: Filter; label: string; emoji?: string; count?: number };

/** The emoji of each topic, where a kind of circle's chips are drawn with one. */
const TOPIC_EMOJI: Record<TemplateTopic, string> = { home: '🏠', kids: '🧒', food: '🍳', money: '💰', trips: '✈️', landlord: '🔑', together: '🎉', memories: '💌' };

/** True for the kinds of circle whose gallery opens on everything (a family, a circle of one); the others open on their own. */
const opensOnAll = (kind: CircleKind) => kind === 'family' || kind === 'solo';

/** The chip a gallery opens on: "All 53" for a family, "For two" for a couple. */
export function firstFilter(kind: CircleKind): Filter {
  return opensOnAll(kind) ? 'all' : 'yours';
}

/**
 * The row of chips, as the drawings have it for each kind of circle and with the counts the API serves.
 * A family: All 53, Keepsakes, then its topics. A couple, a flat, a crew: their own first ("For two 16"),
 * their topics, then All 53. Fair and fun is counted on its own and stands at the end for everyone.
 */
export function chipsOf(gallery: TemplateGalleryResponse): GalleryChip[] {
  const say = words.templates.gallery.chips;
  const all: GalleryChip = { id: 'all', label: say.all(gallery.total) };
  const fun: GalleryChip = { id: 'fair_and_fun', label: say.fairAndFun, emoji: '🎲' };
  const withEmoji = opensOnAll(gallery.kind);
  const topics = gallery.topics.map((topic): GalleryChip => ({ id: `topic:${topic}`, label: say.topics[topic], emoji: withEmoji ? TOPIC_EMOJI[topic] : undefined }));
  if (withEmoji) return [all, { id: 'keepsakes', label: say.keepsakes, emoji: '💌' }, ...topics, fun];
  return [{ id: 'yours', label: say.yours[gallery.kind], emoji: words.kinds[gallery.kind].emoji, count: gallery.yours }, ...topics, all, fun];
}

/** True for a card on the two shelves "All 53" counts: templates and keepsakes. */
const counted = (card: TemplateCard) => card.group !== 'fair_and_fun';

/**
 * The cards to draw, in the order the API serves them (this kind of circle's own first). Words typed into
 * the search look through every card's name and line, whatever chip is chosen.
 */
export function cardsOf(gallery: TemplateGalleryResponse, filter: Filter, search: string): TemplateCard[] {
  const typed = search.trim().toLowerCase();
  if (typed) return gallery.templates.filter((card) => `${card.name ?? ''} ${card.line ?? ''}`.toLowerCase().includes(typed));
  switch (filter) {
    case 'all':
      return gallery.templates.filter(counted);
    case 'yours':
      return gallery.templates.filter((card) => card.yours && counted(card));
    case 'keepsakes':
    case 'fair_and_fun':
      return gallery.templates.filter((card) => card.group === filter);
    default:
      return gallery.templates.filter((card) => `topic:${card.topic}` === filter);
  }
}

/** What to open once a template has started: its board, or the first page or list it made. Null when it made nothing to open. */
export function opensAfterStart(started: { board: { id: string } | null; made: ThingBrief[] }): { kind: string; id: string } | null {
  if (started.board) return { kind: 'board', id: started.board.id };
  const first = started.made[0];
  return first?.id ? { kind: first.kind ?? 'page', id: first.id } : null;
}
