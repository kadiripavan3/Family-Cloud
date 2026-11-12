import { ideaLine, putInLine, slipTags } from '../facts';

const leo = { memberId: 'm-leo', name: 'Leo', avatarUrl: null };
const idea = (over: Partial<Parameters<typeof ideaLine>[0]> = {}) => ({ by: leo, place: 'home', minutes: null, cents: 0, addedOn: '2026-06-14', ...over });

describe("what the Saturday jar says about an idea", () => {
  it('names who put it in and the two things most worth knowing', () => {
    expect(ideaLine(idea())).toBe('Leo · at home · free');
    expect(ideaLine(idea({ place: 'indoors', minutes: 240, cents: 6000 }))).toBe('Leo · half a day · about €60');
    expect(ideaLine(idea({ minutes: 30 }))).toBe('Leo · at home · 30 minutes');
    expect(ideaLine(idea({ place: null, minutes: null, cents: null, by: null }))).toBe('free');
  });

  it('says how long in the words a family uses', () => {
    const long = (minutes: number) => ideaLine(idea({ place: 'outdoors', minutes, cents: 500 })).split(' · ')[1];
    expect(long(45)).toBe('45 minutes');
    expect(long(60)).toBe('1 hour');
    expect(long(90)).toBe('1½ hours');
    expect(long(120)).toBe('2 hours');
    expect(long(180)).toBe('3 hours');
    expect(long(240)).toBe('half a day');
    expect(long(480)).toBe('a whole day');
  });

  it('puts what it costs, how long it takes and where on the slip, and the rest only when it is known', () => {
    const picnic = idea({ place: 'outdoors', minutes: 120 });
    expect(slipTags(picnic, { weather: null, everyoneFree: null, people: 4 })).toEqual(['Free', '2 hours', 'Outdoors']);
    expect(slipTags(picnic, { weather: 'Dry until 4', everyoneFree: true, people: 4 })).toEqual(['Free', '2 hours', 'Dry until 4', 'All four free']);
    expect(slipTags(idea({ place: null, minutes: null, cents: 6000 }), { weather: null, everyoneFree: false, people: 4 })).toEqual(['About €60']);
  });

  it('says when an idea was dropped in', () => {
    expect(putInLine(idea(), '2026-11-12')).toBe('Leo put this one in, back in June');
    expect(putInLine(idea({ addedOn: '2025-06-14' }), '2026-11-12')).toBe('Leo put this one in, back in June 2025');
    expect(putInLine(idea({ addedOn: '2026-11-03' }), '2026-11-12')).toBe('Leo put this one in this month');
    expect(putInLine(idea({ by: null }), '2026-11-12')).toBe('Someone put this one in, back in June');
  });
});
