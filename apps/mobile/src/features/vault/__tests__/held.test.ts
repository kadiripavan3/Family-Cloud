import { draftFromHeld } from '../held';

describe('a code Jot held back, as the start of a Vault item', () => {
  it('takes the last word as the code and the rest as the title', () => {
    expect(draftFromHeld('Gate code 4471')).toEqual({ category: 'code', title: 'Gate code', site: '', fields: { code: '4471' }, expiresOn: null });
    expect(draftFromHeld('  Bike lock   19-04-77 ')).toMatchObject({ title: 'Bike lock', fields: { code: '19-04-77' } });
  });

  it('takes one word alone as the code and leaves the title to be typed', () => {
    expect(draftFromHeld('4471')).toMatchObject({ category: 'code', title: '', fields: { code: '4471' } });
  });

  it('starts empty from nothing', () => {
    expect(draftFromHeld('   ')).toEqual({ category: 'code', title: '', site: '', fields: {}, expiresOn: null });
  });
});
