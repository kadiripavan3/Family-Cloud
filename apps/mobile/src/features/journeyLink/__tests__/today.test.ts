import { atHome, away, awayCard, goodnight, goodnightCard, id, pastCard } from '@/test/samples/together';

import { awayOf, isJourneyCard, partsOf, waitsForBedtime } from '../TodayJourneyCard';

jest.mock('@/api/generated/homeport', () => ({}));
jest.mock('@/features/circles/current', () => ({}));

const kitty = { thingId: id(50), kind: 'board' as const, look: 'kitty', emoji: '🫙', title: 'The kitty is low', line: '€12 left', figure: '€12', imageUrl: null, action: 'Top up', order: 30 };
const walk = { ...kitty, thingId: id(51), look: 'walk_together', title: 'Walk together', order: 40 };

describe("Journey's cards among Today's", () => {
  it('recognises its own by their look: someone away, and a day from a kept journey', () => {
    expect(isJourneyCard(awayCard)).toBe(true);
    expect(isJourneyCard(pastCard)).toBe(true);
    // A goodnight is Today's own card; it is only held back until bedtime.
    expect(isJourneyCard(goodnightCard)).toBe(false);
    expect(isJourneyCard(kitty)).toBe(false);
  });

  it('keeps the order the API gave, and hands back everything that is not its own in stretches', () => {
    const parts = partsOf([pastCard, walk, awayCard, kitty, goodnightCard]);
    expect(parts.map((part) => part.kind)).toEqual(['rest', 'away', 'rest', 'past']);
    expect(parts[0]).toEqual({ kind: 'rest', cards: [goodnightCard] });
    expect(parts[1]).toEqual({ kind: 'away', card: awayCard, at: 0 });
    expect(parts[2]).toEqual({ kind: 'rest', cards: [kitty, walk] });
    expect(parts[3]).toEqual({ kind: 'past', cards: [pastCard] });
  });

  it('leaves out a goodnight that still waits, and a card about nothing that can be opened', () => {
    const stray = { ...kitty, thingId: null, kind: undefined, look: 'something_new' };
    const parts = partsOf([goodnightCard, stray, kitty], (card) => card.look === 'goodnight');
    expect(parts).toEqual([{ kind: 'rest', cards: [kitty] }]);
  });

  it('counts the people who are away, each a card of their own', () => {
    const second = { ...awayCard, title: 'Lea is on a journey', order: 21 };
    expect(partsOf([awayCard, second]).map((part) => (part.kind === 'away' ? part.at : null))).toEqual([0, 1]);
  });

  it('holds a goodnight until bedtime on the day it is for', () => {
    const home = atHome();
    expect(waitsForBedtime(goodnightCard, home, false, '2026-11-12', '19:59')).toBe(true);
    expect(waitsForBedtime(goodnightCard, home, false, '2026-11-12', '20:00')).toBe(false);
    expect(waitsForBedtime(goodnightCard, home, false, '2026-11-12', '07:30')).toBe(true);
    // One from an earlier day has waited long enough.
    expect(waitsForBedtime(goodnightCard, atHome({ goodnights: [goodnight({ forDay: '2026-11-11' })] }), false, '2026-11-12', '07:30')).toBe(false);
  });

  it('waits while nothing is known about it yet, and shows it rather than lose it when that can not be asked', () => {
    expect(waitsForBedtime(goodnightCard, undefined, false, '2026-11-12', '21:00')).toBe(true);
    expect(waitsForBedtime(goodnightCard, undefined, true, '2026-11-12', '07:00')).toBe(false);
  });

  it('finds who an "away" card is about by their name and their journey', () => {
    const lea = away({ who: { memberId: 'm-lea', name: 'Lea', avatarUrl: null }, journey: { ...away().journey, title: 'Alentejo on foot' } });
    expect(awayOf(awayCard, [lea, away()])?.who.name).toBe('Alex');
    expect(awayOf({ ...awayCard, title: 'Lea is on a journey', line: 'Alentejo on foot · Day 2' }, [lea, away()])?.who.name).toBe('Lea');
    // The only one who is away is the one, whatever the card says; among several, nobody is guessed.
    expect(awayOf({ ...awayCard, title: 'Someone is away' }, [away()])?.who.name).toBe('Alex');
    expect(awayOf({ ...awayCard, title: 'Someone is away' }, [lea, away()])).toBeUndefined();
    expect(awayOf(awayCard, undefined)).toBeUndefined();
  });
});
