import { NOW, pinClock } from '@/test/samples/flat';

import { recentDay, writtenAgo } from '../days';
import { exactMoney, roundMoney, signedMoney } from '../money';
import { called, calledAll, isMe } from '../people';

describe("the flat's days, money and names", () => {
  beforeEach(() => pinClock());
  afterEach(() => jest.useRealTimers());

  it('names a day that is not long ago the way a flatmate would', () => {
    expect(recentDay('2026-11-12')).toBe('today');
    expect(recentDay('2026-11-11')).toBe('yesterday');
    expect(recentDay('2026-11-10')).toBe('Tuesday');
    expect(recentDay('2026-11-06')).toBe('Friday');
    expect(recentDay('2026-11-05')).toBe('5 Nov');
    expect(recentDay('2025-12-12')).toBe('12 Dec 2025');
    // A day that is still to come is called by its date.
    expect(recentDay('2026-11-14')).toBe('14 Nov');
  });

  it('says how long ago something was written, in whole words', () => {
    const ago = (minutes: number) => writtenAgo(new Date(NOW.getTime() - minutes * 60_000).toISOString());
    expect(ago(0)).toBe('just now');
    expect(ago(1)).toBe('a minute ago');
    expect(ago(59)).toBe('59 minutes ago');
    expect(ago(60)).toBe('an hour ago');
    expect(ago(5 * 60)).toBe('5 hours ago');
    expect(ago(24 * 60)).toBe('yesterday');
    expect(ago(3 * 24 * 60)).toBe('3 days ago');
    expect(ago(9 * 24 * 60)).toBe('3 Nov');
  });

  it('writes money with its cents in a column, rounded at a glance, and signed for in and out', () => {
    expect(exactMoney(2000)).toBe('€20.00');
    expect(exactMoney(640)).toBe('€6.40');
    expect(roundMoney(6079)).toBe('€61');
    expect(roundMoney(2806)).toBe('€28');
    expect(roundMoney(7050)).toBe('€71');
    expect(signedMoney(-890)).toBe('−€8.90');
    expect(signedMoney(2000)).toBe('+€20.00');
    expect(exactMoney(1000, 'XXXX')).toBe('10.00 XXXX');
  });

  it('calls the viewer "You", first in a row', () => {
    const kai = { memberId: 'm-kai', name: 'Kai', avatarUrl: null };
    const lea = { memberId: 'm-lea', name: 'Lea', avatarUrl: null };
    expect(called(kai, 'm-kai')).toBe('You');
    expect(called(lea, 'm-kai')).toBe('Lea');
    expect(called(null, 'm-kai')).toBe('');
    expect(isMe(kai, 'm-kai')).toBe(true);
    expect(isMe(kai, null)).toBe(false);
    expect(calledAll([lea, null, kai], 'm-kai')).toEqual(['You', 'Lea']);
  });
});
