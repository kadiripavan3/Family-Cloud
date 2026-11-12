import { healthOf, isWeak, variety } from '../health';

describe("the phone's verdict on a password", () => {
  it('counts the kinds of character: small letters, capitals, digits, anything else', () => {
    expect(variety('')).toBe(0);
    expect(variety('password')).toBe(1);
    expect(variety('Password')).toBe(2);
    expect(variety('Passw0rd')).toBe(3);
    expect(variety('Passw0rd!')).toBe(4);
    expect(variety('smørrebrød')).toBe(1);
    expect(variety('correct horse')).toBe(2);
  });

  it('weak: shorter than 10 characters, whatever is in it', () => {
    expect(isWeak('Aa1!Aa1!x')).toBe(true);
    expect(isWeak('Aa1!Aa1!xy')).toBe(false);
  });

  it('weak: shorter than 16 with fewer than three kinds of character', () => {
    expect(isWeak('sunshine-days')).toBe(true);
    expect(isWeak('Sunshine-days')).toBe(false);
    expect(isWeak('correcthorsebatt')).toBe(false);
    expect(isWeak('correct horse battery staple')).toBe(false);
  });

  it('weak: fewer than five different characters, however long', () => {
    expect(isWeak('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(isWeak('abababababababababab1!')).toBe(true);
    expect(isWeak('abcdeabcdeabcdeabcde')).toBe(false);
  });

  it('counts a character outside the basic plane as one', () => {
    expect(isWeak('🔑🔐🚪📶🪪💳📝🏡📅')).toBe(true);
  });

  it('says ok, weak or reused, and never leaked: no leak check is connected', () => {
    expect(healthOf('p0pcorn!Friday#night', false)).toBe('ok');
    expect(healthOf('popcorn', false)).toBe('weak');
    expect(healthOf('p0pcorn!Friday#night', true)).toBe('reused');
    expect(healthOf('popcorn', true)).toBe('reused');
    // Nothing to judge: a card, an ID, a note.
    expect(healthOf(null, false)).toBe('ok');
    expect(healthOf('', true)).toBe('ok');
    for (const password of ['', 'a', 'password', '123456', 'p0pcorn!Friday#night']) {
      for (const elsewhere of [true, false]) expect(healthOf(password, elsewhere)).not.toBe('leaked');
    }
  });
});
