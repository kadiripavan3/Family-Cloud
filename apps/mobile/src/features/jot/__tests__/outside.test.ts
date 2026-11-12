import { widgets } from '@/test/samples/jot';

import { appGroup, snapshotOf } from '../outside';

jest.mock('@/api/generated/homeport', () => ({ getWidgets: jest.fn(), jot: jest.fn(), changeChecklistItem: jest.fn() }));
jest.mock('@/auth/signIn', () => ({ signInService: { restore: jest.fn() } }));
jest.mock('@/lib/keep', () => ({ keep: { get: async () => null, set: async () => undefined, remove: async () => undefined } }));

describe('what the app leaves for its widgets', () => {
  it('is what they show and nothing more: no ids of people, no pictures', () => {
    const snapshot = snapshotOf(widgets(), { circleId: 'c-linds', circleName: 'The Linds' }, 'https://api.example', new Date('2026-11-11T09:41:00Z'));
    expect(snapshot).toEqual({
      apiUrl: 'https://api.example',
      circleId: 'c-linds',
      circleName: 'The Linds',
      day: '2026-11-11',
      chips: ['Milk', 'Eggs', 'Bread', 'Coffee'],
      shopping: expect.objectContaining({ title: 'Groceries', left: 7, lines: expect.arrayContaining([{ id: 'i-bananas', text: 'Bananas', done: false }]) }),
      inUse: expect.objectContaining({ title: 'Groceries', by: 'Alex', you: false }),
      next: [
        { lead: '15:30', title: 'Dentist · Mia' },
        { lead: '19:00', title: 'Bins, your turn' },
        { lead: '€84', title: 'Electricity' },
      ],
      addedToday: 3,
      writtenAt: '2026-11-11T09:41:00.000Z',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/memberId|avatarUrl|m-alex/);
  });

  it('says so when there is no list', () => {
    const snapshot = snapshotOf(widgets({ shopping: null, inUse: null, chips: ['A', 'B', 'C', 'D', 'E', 'F'] }), { circleId: 'c', circleName: 'C' }, '');
    expect(snapshot.shopping).toBeNull();
    expect(snapshot.inUse).toBeNull();
    // A widget has room for four chips.
    expect(snapshot.chips).toHaveLength(4);
  });

  it("names the App Group after the app's own id, as the build does", () => {
    expect(appGroup('app.homeport.dev')).toBe('group.app.homeport.dev.jot');
  });
});
