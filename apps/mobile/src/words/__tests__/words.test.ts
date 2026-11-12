import { brand } from '@/theme/tokens';
import { catalogFor, locale, type Words, words } from '@/words';
import { en } from '@/words/en';
import { compact, formatList, plural, spelled } from '@/words/en/plural';

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
    // Journey is named where the two apps meet: the one account, bringing things in from it, and the way over
    // to it. Nowhere is this app called by its name.
    expect(all.filter(([, text]) => /Journey/.test(text)).map(([path]) => path)).toEqual([
      'setup.bringIn.journey.label',
      'signIn.welcome.oneAccount.1.text',
      'signIn.choose.body',
      'signIn.choose.journeyAccount',
      'you.swap',
      'you.swapSheet.title',
      'you.swapSheet.body',
      'you.account.title',
      'you.account.later',
      'you.rows.deleteAccountNote',
      'you.security.signInNote',
    ]);
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

  it("says what depends on the kind of circle in one place, each kind in its own words", () => {
    expect(Object.keys(words.kinds)).toEqual(['family', 'couple', 'flat', 'crew', 'solo']);
    expect(Object.values(words.kinds).map((kind) => kind.emoji)).toEqual(['👪', '❤️', '🏠', '🤝', '🔒']);
    expect(Object.values(words.kinds).map((kind) => kind.called)).toEqual(['the family', 'the two of you', 'the flat', 'the crew', 'you']);
    expect(words.kinds.family.everyone('The Linds')).toBe('Everyone in The Linds');
    expect(words.kinds.couple.everyone('Nora and Alex')).toBe('The two of you');
    expect(words.kinds.flat.chip('Trubarjeva 9')).toBe('The flat');
    expect(words.kinds.crew.chip('Lisbon crew')).toBe('Lisbon crew');
    expect(words.kinds.solo.name).toBe('Just me');
    // Every kind says the same things, so a screen can ask any of them without looking which it is.
    for (const kind of Object.values(words.kinds)) expect(Object.keys(kind)).toEqual(Object.keys(words.kinds.family));
  });

  it('counts the people of a circle, and names its pets', () => {
    expect(words.circles.people(4, ['Biscuit'])).toBe('4 people and Biscuit');
    expect(words.circles.people(2)).toBe('2 people');
    expect(words.circles.people(1)).toBe('Just you');
    expect(words.circles.people(1, ['Biscuit', 'Momo'])).toBe('1 person and Biscuit and Momo');
    expect(words.circles.yours.onlyYou(38)).toBe('38 things only you can see');
    expect(words.circles.yours.onlyYou(1)).toBe('1 thing only you can see');
  });

  it('says who sees a thing', () => {
    expect(words.sharing.chip.some(['Alex'])).toBe('Alex and you');
    expect(words.sharing.chip.some(['Alex', 'Mia'])).toBe('Alex, Mia and you');
    expect(words.sharing.chip.some(['Alex', 'Mia', 'Leo'])).toBe('Alex and 2 more');
    expect(words.sharing.chip.not(['Mia'])).toBe('Not Mia');
    expect(words.sharing.sheet.everyoneNote(4)).toBe('All four, and anyone who joins later');
    expect(words.sharing.sheet.everyoneNote(2)).toBe('Both of you, and anyone who joins later');
    expect(words.sharing.sheet.everyoneNote(12)).toBe('All 12, and anyone who joins later');
    expect(words.sharing.sheet.about('Groceries', 'a list', 'The Linds')).toBe('“Groceries”, a list in The Linds');
    expect(formatList(['Mia', 'Leo', 'Alex'])).toBe('Mia, Leo and Alex');
    expect(spelled(3)).toBe('three');
  });

  it('has a word for every kind of thing, and one for a kind it has not met', () => {
    expect(words.things.kind('page')).toEqual({ name: 'Page', a: 'a page' });
    expect(words.things.kind('vault_item').a).toBe('something in the Vault');
    expect(words.things.kind('something_new')).toEqual({ name: 'Thing', a: 'a thing' });
    expect(words.things.kind(undefined).name).toBe('Thing');
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
