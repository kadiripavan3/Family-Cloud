import { circle, linds } from '@/test/samples';

import { HOME_PLACES, isShut, placeFrom, placeHref } from '../places';

describe("Home's six places", () => {
  it('are read from the address, and Today when it names none', () => {
    expect(placeFrom('money')).toBe('money');
    expect(placeFrom(['vault', 'plan'])).toBe('vault');
    expect(placeFrom(undefined)).toBe('today');
    expect(placeFrom('settings')).toBe('today');
  });

  it('have an address each, so a link can open Home on any of them', () => {
    expect(placeHref('today')).toBe('/');
    expect(placeHref('money')).toEqual({ pathname: '/', params: { place: 'money' } });
    expect(HOME_PLACES).toEqual(['today', 'plan', 'notes', 'library', 'money', 'vault']);
  });

  it('shut Money and the Vault for a teen or a child, and nothing for anyone else', () => {
    const forMia = circle({ myRole: 'child' });
    const forTeen = circle({ myRole: 'teen' });
    expect(HOME_PLACES.filter((place) => isShut(forMia, place))).toEqual(['money', 'vault']);
    expect(HOME_PLACES.filter((place) => isShut(forTeen, place))).toEqual(['money', 'vault']);
    expect(HOME_PLACES.filter((place) => isShut(linds, place))).toEqual([]);
  });
});
