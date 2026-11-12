import { newClient } from '@/test/phone';
import { event, goal, goalRow, ids, planAnswer, reminder, remindersAnswer } from '@/test/samples/plan';

import { cacheFor } from '../cache';

const stale = (client: ReturnType<typeof newClient>, key: unknown[]) => client.getQueryState(key)?.isInvalidated;

/** What a phone has loaded of Plan: the day's list, the month, Today, the Reminders screen, a reminder, an event, the goals and one goal. */
function loadedEverywhere() {
  const client = newClient();
  client.setQueryData(['/v1/circles/c-linds/plan', { day: '2026-11-11', days: 7 }], planAnswer());
  client.setQueryData(['/v1/circles/c-linds/month', { month: '2026-11' }], { month: '2026-11', days: [] });
  client.setQueryData(['/v1/circles/c-linds/today', { day: '2026-11-11' }], { items: [], fresh: [] });
  client.setQueryData(['/v1/circles/c-linds/reminders', { day: '2026-11-11' }], remindersAnswer());
  client.setQueryData(['/v1/circles/c-linds/goals', { day: '2026-11-11' }], [goalRow()]);
  client.setQueryData([`/v1/reminders/${ids.bins}`, { day: '2026-11-11' }], reminder());
  client.setQueryData([`/v1/events/${ids.party}`, { day: '2026-11-11' }], event());
  client.setQueryData([`/v1/goals/${ids.norway}`, { day: '2026-11-11' }], goal());
  client.setQueryData(['/v1/circles/c-couple/plan'], planAnswer());
  client.setQueryData(['/v1/me/settings'], {});
  return client;
}

describe('what the app does with loaded data after something of Plan changed', () => {
  it('shows a ticked reminder wherever its whole self is loaded, and asks the lists the API works out again', async () => {
    const client = loadedEverywhere();
    const ticked = reminder({ dueOn: '2026-11-13', done: true, tickedDueOn: '2026-11-11', yours: false, turn: null, note: 'Done at 10:41' });
    await cacheFor(client).reminderSaved(ticked);
    // Its own page, and its copy on the Reminders screen, show the answer at once.
    expect(client.getQueryData([`/v1/reminders/${ids.bins}`, { day: '2026-11-11' }])).toEqual(ticked);
    const list = client.getQueryData<ReturnType<typeof remindersAnswer>>(['/v1/circles/c-linds/reminders', { day: '2026-11-11' }]);
    expect(list?.yours[0]?.reminders[0]).toEqual(ticked);
    // The day's list, the month and Today are the API's to work out: whose turn is next, the dots, what is left.
    expect(stale(client, ['/v1/circles/c-linds/plan', { day: '2026-11-11', days: 7 }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/month', { month: '2026-11' }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', { day: '2026-11-11' }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/reminders', { day: '2026-11-11' }])).toBe(true);
    // Another circle, and what has nothing to do with things, are left alone.
    expect(stale(client, ['/v1/circles/c-couple/plan'])).toBe(false);
    expect(stale(client, ['/v1/me/settings'])).toBe(false);
  });

  it('writes a saved event over its own page and asks the calendar again', async () => {
    const client = loadedEverywhere();
    const saved = event({ title: "Mia's birthday party", myAnswer: 'maybe' });
    await cacheFor(client).eventSaved(saved);
    expect(client.getQueryData([`/v1/events/${ids.party}`, { day: '2026-11-11' }])).toEqual(saved);
    expect(stale(client, ['/v1/circles/c-linds/plan', { day: '2026-11-11', days: 7 }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/month', { month: '2026-11' }])).toBe(true);
    // A goal's page is not an event, whatever its id.
    expect(client.getQueryData([`/v1/goals/${ids.norway}`, { day: '2026-11-11' }])).toEqual(goal());
  });

  it('asks an event again when its guests or what is linked to it changed', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).eventGuestsChanged(event());
    expect(stale(client, [`/v1/events/${ids.party}`, { day: '2026-11-11' }])).toBe(true);
    const again = loadedEverywhere();
    await cacheFor(again).eventLinksChanged(event());
    expect(stale(again, [`/v1/events/${ids.party}`, { day: '2026-11-11' }])).toBe(true);
    expect(stale(again, [`/v1/reminders/${ids.bins}`, { day: '2026-11-11' }])).toBe(false);
  });

  it('writes a saved goal over its page, leaves its row in the list to be asked for again, and asks for the ring after money was added', async () => {
    const client = loadedEverywhere();
    const saved = goal({ title: 'Norway 2028' });
    await cacheFor(client).goalSaved(saved);
    expect(client.getQueryData([`/v1/goals/${ids.norway}`, { day: '2026-11-11' }])).toEqual(saved);
    // The row in the list is another shape: it is not overwritten with a whole goal, it is asked for again.
    expect(client.getQueryData(['/v1/circles/c-linds/goals', { day: '2026-11-11' }])).toEqual([goalRow()]);
    expect(stale(client, ['/v1/circles/c-linds/goals', { day: '2026-11-11' }])).toBe(true);

    const moved = loadedEverywhere();
    await cacheFor(moved).goalMoved(goal());
    expect(stale(moved, [`/v1/goals/${ids.norway}`, { day: '2026-11-11' }])).toBe(true);
    expect(stale(moved, ['/v1/circles/c-linds/goals', { day: '2026-11-11' }])).toBe(true);
  });

  it('asks every list of the circle again after something was made, or a typed line was filed', async () => {
    for (const made of ['eventMade', 'reminderMade', 'goalMade'] as const) {
      const client = loadedEverywhere();
      await cacheFor(client)[made]({ circleId: 'c-linds' });
      expect(stale(client, ['/v1/circles/c-linds/plan', { day: '2026-11-11', days: 7 }])).toBe(true);
      expect(stale(client, ['/v1/circles/c-linds/goals', { day: '2026-11-11' }])).toBe(true);
      expect(stale(client, ['/v1/circles/c-couple/plan'])).toBe(false);
    }
    const client = loadedEverywhere();
    client.setQueryData(['/v1/checklists/l-groceries'], { id: 'l-groceries', items: [] });
    await cacheFor(client).planLineFiled('c-linds');
    expect(stale(client, ['/v1/circles/c-linds/today', { day: '2026-11-11' }])).toBe(true);
    // A line may have gone onto a list that is open somewhere.
    expect(stale(client, ['/v1/checklists/l-groceries'])).toBe(true);
  });

  it('asks only the reminder and the Reminders screen again after a nudge', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).reminderNudged(reminder());
    expect(stale(client, [`/v1/reminders/${ids.bins}`, { day: '2026-11-11' }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/reminders', { day: '2026-11-11' }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/plan', { day: '2026-11-11', days: 7 }])).toBe(false);
  });
});
