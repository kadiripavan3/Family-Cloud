import { audience, hiddenFromMia, sharedWithSome } from '@/test/samples';

import { accessOf, changeOf, draftOf, needsName, sameDraft } from '../audience';

const [alex, mia, leo] = sharedWithSome.people;

describe('what the audience sheet sends', () => {
  it('starts as what the API says', () => {
    expect(draftOf(sharedWithSome)).toEqual({ audience: 'some', everyoneEdits: true, access: { 'm-alex': 'edit', 'm-mia': 'view', 'm-leo': 'none' }, hidden: {} });
    expect(draftOf(audience())).toEqual({ audience: 'me', everyoneEdits: true, access: { 'm-alex': 'none', 'm-mia': 'none', 'm-leo': 'none' }, hidden: {} });
  });

  it('keeps who it is hidden from, and until when', () => {
    const draft = draftOf(hiddenFromMia);
    expect(draft.hidden).toEqual({ 'm-mia': '2026-12-04' });
    // What Mia may do when the day comes isn't said while it is hidden: she gets to look.
    expect(draft.access['m-mia']).toBe('view');
    expect(changeOf(draft, hiddenFromMia)).toEqual({ audience: 'circle', everyoneEdits: true, people: [], hiddenFrom: [{ memberId: 'm-mia', through: '2026-12-04' }] });
  });

  it('sends the people who may see it, and nobody who may not', () => {
    const draft = { ...draftOf(sharedWithSome), access: { 'm-alex': 'view' as const, 'm-mia': 'none' as const, 'm-leo': 'edit' as const } };
    expect(changeOf(draft, sharedWithSome).people).toEqual([
      { memberId: 'm-alex', access: 'view' },
      { memberId: 'm-leo', access: 'edit' },
    ]);
  });

  it('sends nobody and hides nothing for "Only you"', () => {
    const draft = { ...draftOf(hiddenFromMia), audience: 'me' as const };
    expect(changeOf(draft, hiddenFromMia)).toEqual({ audience: 'me', everyoneEdits: true, people: [], hiddenFrom: [] });
  });

  it('hides for good when no day is picked', () => {
    const draft = { ...draftOf(sharedWithSome), hidden: { 'm-mia': null } };
    expect(changeOf(draft, sharedWithSome).hiddenFrom).toEqual([{ memberId: 'm-mia' }]);
  });

  it('says what each person may do under each choice', () => {
    const some = draftOf(sharedWithSome);
    expect([alex, mia, leo].map((person) => accessOf(some, person!, 'notes'))).toEqual(['edit', 'view', 'none']);
    expect(accessOf({ ...some, audience: 'me' }, alex!, 'notes')).toBe('none');
    expect(accessOf({ ...some, audience: 'circle' }, leo!, 'notes')).toBe('edit');
    expect(accessOf({ ...some, audience: 'circle', everyoneEdits: false }, alex!, 'notes')).toBe('view');
  });

  it('knows who "everyone" does not reach: a guest, and the young in Money and the Vault', () => {
    expect(needsName(mia!, 'notes')).toBe(false);
    expect(needsName(mia!, 'money')).toBe(true);
    expect(needsName(mia!, 'vault')).toBe(true);
    expect(needsName(alex!, 'money')).toBe(false);
    expect(needsName({ ...alex!, role: 'guest' }, 'notes')).toBe(true);
    // With everyone, in Money: Mia sees a bill only when she is named, so her own choice is sent.
    const bill = { ...sharedWithSome, place: 'money' as const, audience: 'circle' as const };
    expect(accessOf(draftOf(bill), mia!, 'money')).toBe('view');
    expect(changeOf(draftOf(bill), bill).people).toEqual([{ memberId: 'm-mia', access: 'view' }]);
  });

  it('knows when nothing changed', () => {
    const start = draftOf(sharedWithSome);
    expect(sameDraft(start, { ...start, access: { ...start.access } }, sharedWithSome)).toBe(true);
    expect(sameDraft(start, { ...start, audience: 'circle' }, sharedWithSome)).toBe(false);
    // A choice that doesn't count under "Only you" is not a change.
    const mine = draftOf(audience());
    expect(sameDraft(mine, { ...mine, access: { ...mine.access, 'm-alex': 'edit' } }, audience())).toBe(true);
  });
});
