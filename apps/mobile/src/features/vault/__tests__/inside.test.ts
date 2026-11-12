import { utf8 } from '../crypto/bytes';
import { decodeInside, encodeInside, FIELDS, guestTextOf, insideOf, labelsMatch, mainSecret, NotReadable, passwordOf } from '../inside';

describe('what is inside an item', () => {
  const netflix = insideOf('login', ' Netflix ', 'netflix.com', { username: ' linds.home@example.com ', password: ' p0pcorn!Friday#night ', totp: 'GEZDGNBVGY3TQOJQ', notes: '', network: 'not a login field' });

  it('keeps the fields of its own drawer, without the empty ones, and a secret exactly as typed', () => {
    expect(netflix).toEqual({ v: 1, title: 'Netflix', site: 'netflix.com', category: 'login', fields: { username: 'linds.home@example.com', password: ' p0pcorn!Friday#night ', totp: 'GEZDGNBVGY3TQOJQ' } });
  });

  it('comes back the same from the bytes that get sealed, for every drawer', () => {
    expect(decodeInside(encodeInside(netflix))).toEqual(netflix);
    for (const category of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
      const typed = Object.fromEntries(FIELDS[category].map((field) => [field.name, `the ${field.name} of “${category}” 🔑`]));
      const inside = insideOf(category, 'A title', 'a label', typed);
      expect(Object.keys(inside.fields)).toEqual(FIELDS[category].map((field) => field.name));
      expect(decodeInside(encodeInside(inside))).toEqual(inside);
    }
  });

  it('repeats the title, the site and the drawer inside, so changed labels are noticed', () => {
    expect(labelsMatch(netflix, { title: 'Netflix', site: 'netflix.com', category: 'login' })).toBe(true);
    expect(labelsMatch(netflix, { title: 'Bank', site: 'netflix.com', category: 'login' })).toBe(false);
    expect(labelsMatch(netflix, { title: 'Netflix', site: 'evil.example', category: 'login' })).toBe(false);
    expect(labelsMatch(netflix, { title: 'Netflix', site: 'netflix.com', category: 'secret' })).toBe(false);
    expect(labelsMatch(insideOf('code', 'Door', '', { code: '4821' }), { title: 'Door', site: null, category: 'code' })).toBe(true);
  });

  it("doesn't read what isn't this app's format", () => {
    for (const bad of ['', 'not json', '4821, then the star key', '[]', 'null', '{"v":2,"title":"x","site":"","category":"login","fields":{}}', '{"v":1,"title":"x","site":"","category":"spaceship","fields":{}}', '{"v":1,"title":"x","site":"","category":"login"}']) {
      expect(() => decodeInside(utf8(bad))).toThrow(NotReadable);
    }
    expect(() => decodeInside(Uint8Array.of(0xff, 0xfe))).toThrow(NotReadable);
  });

  it('drops fields it does not know and values that are not text', () => {
    expect(decodeInside(utf8('{"v":1,"title":"x","site":"","category":"login","fields":{"password":"a","admin":"yes","pin":7}}')).fields).toEqual({ password: 'a' });
  });

  it('knows which field is the password to judge, and which one "copy" copies', () => {
    expect(passwordOf(netflix)).toBe(' p0pcorn!Friday#night ');
    expect(passwordOf(insideOf('wifi', 'Home', '', { network: 'Lind-Home', password: 'sm0rrebrod' }))).toBe('sm0rrebrod');
    expect(passwordOf(insideOf('card', 'Visa', '', { number: '4111', code: '123' }))).toBeNull();
    expect(mainSecret(netflix)).toBe(' p0pcorn!Friday#night ');
    expect(mainSecret(insideOf('card', 'Visa', '', { holder: 'Nora Lind', number: '4111 1111', code: '123' }))).toBe('4111 1111');
    expect(mainSecret(insideOf('card', 'Visa', '', { holder: 'Nora Lind', code: '123' }))).toBe('123');
    expect(mainSecret(insideOf('secret', 'Diary', '', { text: 'Not for anyone' }))).toBe('Not for anyone');
    expect(mainSecret(insideOf('login', 'Empty', '', { username: 'nora' }))).toBeNull();
  });

  it('says what a guest is shown: the code, or the network with its password', () => {
    const says = (name: string, password: string) => `${name} / ${password}`;
    expect(guestTextOf(insideOf('code', 'Door', 'home', { code: '4821, then the star key' }), says)).toBe('4821, then the star key');
    expect(guestTextOf(insideOf('wifi', 'Home', '', { network: 'Lind-Home', password: 'sm0rrebrod' }), says)).toBe('Lind-Home / sm0rrebrod');
    expect(guestTextOf(insideOf('wifi', 'Home', '', { password: 'sm0rrebrod' }), says)).toBe('sm0rrebrod');
    expect(guestTextOf(insideOf('login', 'Empty', '', {}), says)).toBeNull();
  });
});
