import { codeJot, jotMade, noteJot, plumberJot } from '@/test/samples/jot';

import { type Answer, answerKey, CATEGORY, jotOf, MORNING, MORNING_ID, morningId, noteCategory, noteContent, noteLines, notePosts, NOTE_ID, postsNow, saidAfter } from '../note';

/** The pure half of the pinned note: what it says, what is posted when, and how an answer becomes a jot. */

const pinned = { circleId: 'c-linds', circleName: 'The Linds' };
const chips = ['Milk', 'Eggs', 'Bread', 'Coffee'];
const answer = (actionIdentifier: string, userText?: string, data: Record<string, unknown> | null = { jot: 'pinned', circleId: 'c-linds', chips }): Answer => ({
  actionIdentifier,
  userText,
  notification: { date: 1_000, request: { identifier: NOTE_ID, content: { data } } },
});

describe('what the pinned note says', () => {
  it('has a line to type in first, then the chips as buttons: as many as each phone shows, none opening the app', () => {
    const android = noteCategory('android', chips);
    expect(android.identifier).toBe(CATEGORY);
    expect(android.identifier).not.toMatch(/[:-]/);
    expect(android.actions.map((action) => action.buttonTitle)).toEqual(['Type', '+ Milk', '+ Eggs']);
    expect(android.actions[0]).toEqual({ identifier: 'jot.type', buttonTitle: 'Type', textInput: { submitButtonTitle: 'Add', placeholder: 'Add anything' }, options: { opensAppToForeground: false } });
    expect(android.actions[1]).toEqual({ identifier: 'jot.chip.0', buttonTitle: '+ Milk', options: { opensAppToForeground: false } });

    expect(noteCategory('ios', chips).actions.map((action) => action.identifier)).toEqual(['jot.type', 'jot.chip.0', 'jot.chip.1', 'jot.chip.2']);
    // A circle that hasn't added anything yet still gets its line.
    expect(noteCategory('ios', []).actions).toHaveLength(1);
  });

  it("lists today's lines, the oldest first, what one line made on one row", () => {
    const now = new Date(2026, 10, 11, 12, 0, 0);
    const at = (hours: number, minutes: number) => new Date(2026, 10, 11, hours, minutes).toISOString();
    const jots = [
      { ...noteJot, createdAt: at(8, 40) },
      jotMade({ id: 'j-bread', title: 'Bread', createdAt: at(8, 12) }),
      jotMade({ createdAt: at(8, 12) }),
      jotMade({ id: 'j-old', batchId: 'b-old', title: 'Yesterday', createdAt: new Date(2026, 10, 10, 9, 0).toISOString() }),
    ];
    expect(noteLines(jots, now)).toEqual(['Milk, Bread · Groceries · 8:12', 'Mia needs €5 for the class photo · Note · 8:40']);
    // Five at most: the latest five.
    const many = Array.from({ length: 8 }, (_, index) => jotMade({ id: `j-${index}`, batchId: `b-${index}`, title: `Thing ${index}`, createdAt: at(11, 59 - index) }));
    expect(noteLines(many, now)).toHaveLength(5);
    expect(noteLines(many, now)[4]).toBe('Thing 0 · Groceries · 11:59');
  });

  it('says what was added right after an answer, and that a code is waiting', () => {
    expect(saidAfter([jotMade(), jotMade({ id: 'j-bread', title: 'Bread' })])).toBe('Added: Milk and Bread');
    expect(saidAfter([plumberJot])).toBe('Added: Call the plumber');
    expect(saidAfter([codeJot])).toBe('“Gate code 4471” looks like a code. Open Homeport to say where it goes.');
    expect(saidAfter([jotMade(), codeJot])).toBe('Added: Milk · “Gate code 4471” looks like a code. Open Homeport to say where it goes.');
  });

  it('stays at the top on Android: ongoing, silent, with the circle, the lines, and what an answer needs', () => {
    const content = noteContent({ os: 'android', pinned, lines: ['Milk, Bread · Groceries · 8:12', 'A thought · Note · 8:40'], chips, addedToday: 3 });
    expect(content).toEqual({
      title: 'Jot it down',
      subtitle: 'pinned · The Linds',
      body: 'Milk, Bread · Groceries · 8:12\nA thought · Note · 8:40',
      data: { url: '/jot', jot: 'pinned', circleId: 'c-linds', circleName: 'The Linds', chips },
      categoryIdentifier: CATEGORY,
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: 'low',
    });
    expect(noteContent({ os: 'android', pinned, lines: [], chips: [], addedToday: 0 }).body).toBe('Type a line here, or tap to open the jot bar.');
    expect(noteContent({ os: 'android', pinned, lines: [], chips: [], addedToday: 1, said: 'Added: Milk' }).title).toBe('Added: Milk');
  });

  it("can't stay on an iPhone: a quiet notification that says to press and hold", () => {
    const content = noteContent({ os: 'ios', pinned, lines: ['Milk · Groceries · 8:12'], chips, addedToday: 3 });
    expect(content).toMatchObject({ title: 'Jot it down', body: 'Press and hold to type. 3 added today.', categoryIdentifier: CATEGORY, sound: false, interruptionLevel: 'passive' });
    expect(content.sticky).toBeUndefined();
    expect(noteContent({ os: 'ios', pinned, lines: [], chips, addedToday: 0 }).body).toBe('Press and hold to type.');
    expect(noteContent({ os: 'ios', pinned, lines: [], chips, addedToday: 4, said: 'Added: Milk' }).body).toBe('Added: Milk Press and hold to type. 4 added today.');
  });
});

describe('what is posted when', () => {
  it('posts the note now and again every morning, the morning one without the news of the moment', () => {
    const posts = notePosts({ os: 'ios', pinned, lines: [], chips, addedToday: 2, said: 'Added: Milk' });
    expect(posts.map((post) => [post.identifier, post.when])).toEqual([
      [NOTE_ID, 'now'],
      [MORNING_ID, MORNING],
    ]);
    expect(posts[0]!.content.body).toMatch(/^Added: Milk /);
    expect(posts[1]!.content.body).toBe('Press and hold to type. 2 added today.');
  });

  it("gives Android's morning note the same name, so it takes the place of the one that is there", () => {
    expect(morningId('android')).toBe(NOTE_ID);
    expect(morningId('ios')).toBe(MORNING_ID);
    expect(notePosts({ os: 'android', pinned, lines: [], chips, addedToday: 0 }).map((post) => post.identifier)).toEqual([NOTE_ID, NOTE_ID]);
  });

  it('posts after switching on and after each add; on coming to the front only Android, and only when the note is gone', () => {
    for (const os of ['ios', 'android'] as const) {
      expect(postsNow(os, 'switched-on', [])).toBe(true);
      expect(postsNow(os, 'added', [NOTE_ID])).toBe(true);
    }
    expect(postsNow('android', 'front', [])).toBe(true);
    expect(postsNow('android', 'front', ['something-else'])).toBe(true);
    expect(postsNow('android', 'front', [NOTE_ID])).toBe(false);
    expect(postsNow('ios', 'front', [])).toBe(false);
  });
});

describe('how an answer becomes a jot', () => {
  it('jots what was typed, as it was typed', () => {
    expect(jotOf(answer('jot.type', '  Call the plumber tomorrow at 9 '))).toEqual({ kind: 'jot', circleId: 'c-linds', text: 'Call the plumber tomorrow at 9' });
    expect(jotOf(answer('jot.type', '   '))).toBeNull();
    expect(jotOf(answer('jot.type'))).toBeNull();
  });

  it("jots a chip from its button, by the chip's place among the note's chips", () => {
    expect(jotOf(answer('jot.chip.0'))).toEqual({ kind: 'jot', circleId: 'c-linds', text: 'Milk' });
    expect(jotOf(answer('jot.chip.2'))).toEqual({ kind: 'jot', circleId: 'c-linds', text: 'Bread' });
    expect(jotOf(answer('jot.chip.9'))).toBeNull();
    expect(jotOf(answer('jot.chip.0', undefined, { jot: 'pinned', circleId: 'c-linds' }))).toBeNull();
  });

  it('opens the bar on a plain tap, and leaves every other notification alone', () => {
    expect(jotOf(answer('expo.modules.notifications.actions.DEFAULT'))).toEqual({ kind: 'open' });
    expect(jotOf(answer('jot.type', 'Milk', { url: '/activity' }))).toBeNull();
    expect(jotOf(answer('jot.type', 'Milk', null))).toBeNull();
    expect(jotOf(answer('jot.type', 'Milk', { jot: 'pinned' }))).toBeNull();
    expect(jotOf(answer('something.else'))).toBeNull();
  });

  it('tells one answer from the next, so the same one is jotted once', () => {
    expect(answerKey(answer('jot.type', 'Milk'))).toBe(answerKey(answer('jot.type', 'Milk')));
    expect(answerKey(answer('jot.type', 'Milk'))).not.toBe(answerKey(answer('jot.type', 'Eggs')));
    expect(answerKey(answer('jot.chip.0'))).not.toBe(answerKey(answer('jot.chip.1')));
  });
});
