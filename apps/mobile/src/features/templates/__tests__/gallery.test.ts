import { coupleGallery, gallery, startedLive, startedPlain } from '@/test/samples/templates';

import { cardsOf, chipsOf, firstFilter, opensAfterStart } from '../gallery';

const names = (cards: { name?: string }[]) => cards.map((card) => card.name);

describe("the gallery's chips and cards", () => {
  it('gives a family All 53 first, then Keepsakes and its topics, and Fair and fun at the end', () => {
    expect(firstFilter('family')).toBe('all');
    expect(chipsOf(gallery())).toEqual([
      { id: 'all', label: 'All 53' },
      { id: 'keepsakes', label: 'Keepsakes', emoji: '💌' },
      { id: 'topic:home', label: 'Home', emoji: '🏠' },
      { id: 'topic:kids', label: 'Kids', emoji: '🧒' },
      { id: 'topic:food', label: 'Food', emoji: '🍳' },
      { id: 'fair_and_fun', label: 'Fair and fun', emoji: '🎲' },
    ]);
  });

  it("gives a couple its own first, with how many, then its topics, then All 53", () => {
    expect(firstFilter('couple')).toBe('yours');
    expect(chipsOf(coupleGallery).map((chip) => [chip.label, chip.emoji, chip.count])).toEqual([
      ['For two', '❤️', 16],
      ['Home', undefined, undefined],
      ['Money', undefined, undefined],
      ['Trips', undefined, undefined],
      ['All 53', undefined, undefined],
      ['Fair and fun', '🎲', undefined],
    ]);
    expect(firstFilter('flat')).toBe('yours');
    expect(firstFilter('crew')).toBe('yours');
    expect(firstFilter('solo')).toBe('all');
  });

  it('shows templates and keepsakes under All, in the order served, and fair and fun on its own', () => {
    expect(names(cardsOf(gallery(), 'all', ''))).toEqual(['Weekly meal plan', 'Chore wheel', 'Packing list', 'House manual', 'Time capsule', 'Things they said', 'Date ideas', 'The wedding']);
    expect(names(cardsOf(gallery(), 'fair_and_fun', ''))).toEqual(['Whose turn?']);
    expect(names(cardsOf(gallery(), 'keepsakes', ''))).toEqual(['Time capsule', 'Things they said']);
  });

  it("shows a kind's own, and a topic across every shelf", () => {
    expect(names(cardsOf(coupleGallery, 'yours', ''))).toEqual(['Date ideas', 'The wedding']);
    expect(names(cardsOf(gallery(), 'topic:home', ''))).toEqual(['Chore wheel', 'House manual']);
    expect(names(cardsOf(gallery(), 'topic:together', ''))).toEqual(['Whose turn?', 'Date ideas', 'The wedding']);
  });

  it('searches names and lines of every card, whatever chip is chosen', () => {
    expect(names(cardsOf(gallery(), 'keepsakes', 'WHO'))).toEqual(['House manual', 'Whose turn?']);
    expect(names(cardsOf(gallery(), 'all', '  letters '))).toEqual(['Time capsule']);
    expect(cardsOf(gallery(), 'all', 'zebra')).toEqual([]);
  });

  it('opens the board of a template that does work, and the first thing a plain one made', () => {
    expect(opensAfterStart(startedLive)).toEqual({ kind: 'board', id: '33333333-3333-4333-8333-333333333333' });
    expect(opensAfterStart(startedPlain)).toEqual({ kind: 'page', id: '44444444-4444-4444-8444-444444444444' });
    expect(opensAfterStart({ board: null, made: [] })).toBeNull();
  });
});
