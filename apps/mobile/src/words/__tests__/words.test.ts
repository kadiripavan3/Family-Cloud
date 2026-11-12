import { brand } from '@/theme/tokens';
import { catalogFor, locale, type Words, words } from '@/words';
import { en } from '@/words/en';
import { compact, plural } from '@/words/en/plural';

/** Every plain sentence in a catalog, by where it is kept: "common.back" → "Back". */
function sentences(value: unknown, path: string, into: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') into[path] = value;
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) sentences(inner, path ? `${path}.${key}` : key, into);
  return into;
}

describe('the catalog of words', () => {
  it('is English until another language is added', () => {
    expect(words).toBe(en);
    expect(locale.startsWith('en')).toBe(true);
    expect(words.common.back).toBe('Back');
  });

  it('picks a catalog by the language of the phone, and English when it has none', () => {
    // German words: the type makes it say everything English says, in whatever words it likes.
    const de: Words = { ...en, common: { ...en.common, back: 'Zurück' } };
    const available = { en, de };

    expect(catalogFor('de-AT', available)).toEqual({ words: de, locale: 'de-AT' });
    expect(catalogFor('de', available).words.common.back).toBe('Zurück');
    expect(catalogFor('en-GB', available)).toEqual({ words: en, locale: 'en-GB' });
    // No French yet: English, and dates and numbers written the English way too.
    expect(catalogFor('fr-FR', available)).toEqual({ words: en, locale: 'en' });
    // A regional catalog is for its region only.
    expect(catalogFor('pt-BR', { en, 'pt-BR': de }).words).toBe(de);
    expect(catalogFor('pt-PT', { en, 'pt-BR': de }).words).toBe(en);
  });

  it('has something to say under every key', () => {
    const all = sentences(en, '');
    expect(Object.keys(all).length).toBeGreaterThan(100);
    expect(Object.entries(all).filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it("calls the app by the name in the tokens, and nothing of the sister app's is left but its name", () => {
    expect(words.common.appName).toBe(brand.name);
    expect(words.states.unreachable).toBe("Can't reach Homeport right now. Check your connection and try again.");
    const all = Object.entries(sentences(en, ''));
    // Journey is named where the two apps meet: the one account. Nowhere is this app called by its name.
    expect(all.filter(([, text]) => /Journey/.test(text)).map(([path]) => path)).toEqual(['signIn.welcome.oneAccount.1.text', 'signIn.choose.body', 'signIn.choose.journeyAccount']);
    expect(all.filter(([, text]) => /\b(journeys?|entry|entries|followers?|following)\b/.test(text))).toEqual([]);
  });

  it('keeps plurals and word order inside the sentence', () => {
    expect(plural(1, 'photo')).toBe('1 photo');
    expect(plural(3, 'photo')).toBe('3 photos');
    expect(plural(4, 'person', 'people')).toBe('4 people');
    expect(compact(999)).toBe('999');
    expect(words.common.compact(1200)).toBe('1.2k');
    expect(words.common.compact(48_300)).toBe('48k');
    expect(words.signIn.choose.continueAs('Nora Lind')).toBe('Continue as Nora Lind');
    expect(words.common.stepOf(2, 3)).toBe('Step 2 of 3');
  });

  it('names the six places once, and uses the name Notes has in the tokens', () => {
    expect(Object.values(words.common.places)).toEqual(['Today', 'Plan', 'Notes', 'Library', 'Money', 'Vault']);
    expect(words.signIn.howItWorks.sixPlaces.picture).toBe('The six places: Today, Plan, Notes, Library, Money, Vault.');
    expect(words.signIn.howItWorks.sixPlaces.body).toMatch(/^Today, Plan, Notes, Library, Money and the Vault\./);
  });

  it('joins facts that stand side by side, leaving out the ones that are missing', () => {
    expect(words.common.join(['Wed 15:30', null, 'Dentist', undefined, false, ''])).toBe('Wed 15:30 · Dentist');
    expect(words.common.spoken(['Start date', '', '3 Apr'])).toBe('Start date. 3 Apr');
  });

  it('marks the parts of a sentence that are drawn differently', () => {
    expect(words.signIn.welcome.oneAccount).toEqual(['One account with ', { mark: 'bold', text: 'Journey' }]);
    expect(words.signIn.code.sentTo('nora@example.com')).toEqual(['Enter the code we sent to ', { mark: 'email', text: 'nora@example.com' }, '.']);
  });

  it('writes days and times the English way', () => {
    expect(words.dates.day(3, 3)).toBe('3 Apr');
    expect(words.dates.day(3, 3, 2025)).toBe('3 Apr 2025');
    expect(words.dates.dayLong(1, 3)).toBe('1 April');
    expect(words.dates.month(3, 2026)).toBe('April 2026');
    expect(words.dates.minutesAgo(5)).toBe('5 min ago');
  });
});
