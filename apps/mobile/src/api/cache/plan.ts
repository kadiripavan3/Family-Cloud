import type { EventResponse, GoalResponse, ReminderResponse } from '@/api/generated/homeport';

import type { CacheTools } from './tools';

/** True for a loaded event: only its own page holds a whole one. */
const isEvent = (old: Record<string, unknown>) => 'guests' in old && 'myAnswer' in old;
/** True for a loaded reminder: its own page, and each one on the Reminders screen. */
const isReminder = (old: Record<string, unknown>) => 'givenTo' in old && 'canNudge' in old;
/** True for a loaded goal's own page (a goal's row in the list of goals has no pace). */
const isGoal = (old: Record<string, unknown>) => 'pace' in old && 'months' in old;

/**
 * Plan: events, reminders, goals. What the app does to what it has loaded when something of this place
 * changes: one function per thing that can happen, made of `tools` (see tools.ts). Screens call them through
 * `useCache()`.
 *
 * The day's list, the month, Today, the Reminders screen and the list of goals are all worked out by the
 * API (whose turn it is next, the dots, the ring), so after a change they are asked for again; the thing
 * the API sent back is shown at once wherever its whole self is loaded.
 */
export const planCache = (tools: CacheTools) => ({
  /** An event was made (by its form, or by a line that was read): every list of the circle is asked for again. */
  eventMade: (event: { circleId: string }) => tools.thingMade(event.circleId),

  /** An event was changed, answered, or its guests changed: the API sent it back. */
  eventSaved: (event: EventResponse) => {
    tools.put(isEvent, event);
    return tools.thingChanged(event);
  },

  /** Someone was put on an event, taken off it, or their answer was changed for them: the event is asked for again. */
  eventGuestsChanged: (event: { id: string; circleId: string }) => tools.thingChanged(event),

  /** What is linked to an event changed (a list, a budget or an album was made for it, or taken off): the event and its links are asked for again. */
  eventLinksChanged: (event: { id: string; circleId: string }) => tools.thingChanged(event),

  /** A reminder was made: every list of the circle is asked for again. */
  reminderMade: (reminder: { circleId: string }) => tools.thingMade(reminder.circleId),

  /** A reminder was changed, ticked, or its tick taken away: the API sent it back, with whose turn it is now. */
  reminderSaved: (reminder: ReminderResponse) => {
    tools.put(isReminder, reminder);
    return tools.thingChanged(reminder);
  },

  /** Whoever has a reminder was nudged: another nudge has to wait an hour, which the reminder itself says. */
  reminderNudged: (reminder: { id: string; circleId: string }) => Promise.all([tools.staleAbout(reminder.id), tools.stale(`/v1/circles/${reminder.circleId}/reminders`)]),

  /** A goal was made: every list of the circle is asked for again. */
  goalMade: (goal: { circleId: string }) => tools.thingMade(goal.circleId),

  /** A goal was changed: the API sent it back. */
  goalSaved: (goal: GoalResponse) => {
    tools.put(isGoal, goal);
    return tools.thingChanged(goal);
  },

  /** Something was put into a goal, or taken back: the ring, the pace and the months are the API's to work out. */
  goalMoved: (goal: { id: string; circleId: string }) => tools.thingChanged(goal),

  /** A typed line was filed (an event, a reminder, a line on a list, a page): whatever it made is in the circle's lists. */
  planLineFiled: (circleId: string) => Promise.all([tools.thingMade(circleId), tools.stale('/v1/checklists/')]),
});
