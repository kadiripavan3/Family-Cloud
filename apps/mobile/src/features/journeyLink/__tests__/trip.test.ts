import { isOver } from '../jobs';
import { takeOnly, tellHref, tellOnly } from '../tell/start';
import { becomesTitle, stageLines, tripDates } from '../trip/dates';

jest.mock('@/api/generated/homeport', () => ({}));

describe('a trip in words', () => {
  it('writes its days as short as they go', () => {
    expect(tripDates('2027-04-03', '2027-04-17')).toBe('3 to 17 Apr');
    expect(tripDates('2027-03-28', '2027-04-03')).toBe('28 Mar to 3 Apr');
  });

  it('says what stands under each stage, by the stage it is in', () => {
    expect(stageLines('plan', '2027-04-03', '2027-04-17')).toEqual({ plan: 'now', go: '3 to 17 Apr', keep: 'after' });
    expect(stageLines('go', '2027-04-03', '2027-04-17')).toEqual({ plan: 'done', go: 'now', keep: 'after' });
    expect(stageLines('keep', '2027-04-03', '2027-04-17')).toEqual({ plan: 'done', go: 'done', keep: 'now' });
  });

  it('says when it becomes a journey: on a day to come, today, or still', () => {
    expect(becomesTitle('2027-04-03', '2026-11-12')).toBe('On 3 April this becomes a journey');
    expect(becomesTitle('2027-04-03', '2027-04-03')).toBe('Today this can become a journey');
    expect(becomesTitle('2027-04-03', '2027-04-05')).toBe('This can still become a journey');
  });
});

describe('the way into telling a journey', () => {
  it('names what it is drafted from in the address', () => {
    expect(tellHref({ moment: 'p-1' })).toEqual({ pathname: '/journey/tell/new', params: { moment: 'p-1' } });
    expect(tellHref({ album: 'a-1', circleId: 'c-linds' })).toEqual({ pathname: '/journey/tell/new', params: { album: 'a-1', circle: 'c-linds' } });
  });

  it('hands over what was picked once', () => {
    expect(takeOnly()).toBeNull();
    tellOnly(['p-1', 'p-2']);
    expect([...(takeOnly() ?? [])]).toEqual(['p-1', 'p-2']);
    expect(takeOnly()).toBeNull();
  });
});

describe('a job', () => {
  it('is over once it is done or has failed', () => {
    expect(isOver({ status: 'done' })).toBe(true);
    expect(isOver({ status: 'failed' })).toBe(true);
    expect(isOver({ status: 'running' })).toBe(false);
    expect(isOver({ status: 'waiting' })).toBe(false);
    expect(isOver(null)).toBe(false);
  });
});
