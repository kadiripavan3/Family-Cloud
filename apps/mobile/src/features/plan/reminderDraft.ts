import type { Audience, NewReminderRequest, Recurrence, ReminderChangeRequest, ReminderResponse } from '@/api/generated/homeport';
import { formatClocks, formatWeekdayDay, phoneTimeZone } from '@/lib/dates';
import { words } from '@/words';

import { recurrenceOf } from './eventDraft';

/** What the form of a reminder holds while it is being written. */
export type ReminderDraft = {
  title: string;
  notes: string;
  /** Null: no day. It then waits for a place, or for some time. */
  day: string | null;
  time: string | null;
  repeat: Recurrence | null;
  /** Who it is given to, by member id, in the order they take turns. Empty: it is the person's own. */
  givenTo: string[];
  takesTurns: boolean;
  /** The place it waits for, in words. Empty: none. */
  place: string;
  /** Minutes before it is due; 0 for when it is due. */
  remindMinutes: number;
};

export function newReminderDraft(): ReminderDraft {
  return { title: '', notes: '', day: null, time: null, repeat: null, givenTo: [], takesTurns: false, place: '', remindMinutes: 0 };
}

export function reminderDraftOf(reminder: ReminderResponse): ReminderDraft {
  return {
    title: reminder.title,
    notes: reminder.notes,
    day: reminder.dueOn,
    time: reminder.dueTime,
    repeat: recurrenceOf(reminder.repeat),
    givenTo: reminder.givenTo.flatMap((person) => (person.memberId ? [person.memberId] : [])),
    takesTurns: reminder.takesTurns,
    place: reminder.place?.words ?? '',
    remindMinutes: reminder.remindMinutes,
  };
}

/** Taking turns needs something that repeats and two or more people to hand it between. */
export function canTakeTurns(draft: ReminderDraft): boolean {
  return !!draft.day && !!draft.repeat && draft.givenTo.length >= 2;
}

/** "Fri 13 Nov · 18:00", "Fri 13 Nov", or "Some time" without a day. */
export function dueLine(day: string | null, time: string | null): string {
  if (!day) return words.plan.reminderForm.noDay;
  return words.common.join([formatWeekdayDay(day), time ? formatClocks(time) : null]);
}

/** What to send to make the reminder a draft describes. What can't go together (a time without a day) is left out. */
export function newReminderRequest(draft: ReminderDraft, with_: { clientId: string; circleId: string; audience?: Audience }): NewReminderRequest {
  const place = draft.place.trim();
  return {
    clientId: with_.clientId,
    circleId: with_.circleId,
    title: draft.title.trim(),
    notes: draft.notes.trim() || undefined,
    dueOn: draft.day ?? undefined,
    dueTime: draft.day ? (draft.time ?? undefined) : undefined,
    timeZone: phoneTimeZone(),
    remindMinutes: draft.remindMinutes,
    repeat: draft.day ? (draft.repeat ?? undefined) : undefined,
    givenTo: draft.givenTo,
    takesTurns: canTakeTurns(draft) && draft.takesTurns,
    place: place ? { words: place } : undefined,
    audience: with_.audience,
  };
}

/** What to send to change a reminder into what a draft says. A place whose words didn't change keeps where it is. */
export function reminderChangeRequest(draft: ReminderDraft, reminder: ReminderResponse): ReminderChangeRequest {
  const place = draft.place.trim();
  const had = reminder.place?.words ?? '';
  return {
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    ...(draft.day ? { dueOn: draft.day, dueTime: draft.time ?? undefined, timeZone: reminder.timeZone } : reminder.dueOn ? { removeDue: true } : {}),
    remindMinutes: draft.remindMinutes,
    ...(draft.day && draft.repeat ? { repeat: draft.repeat } : reminder.repeat && draft.day ? { stopRepeating: true } : {}),
    givenTo: draft.givenTo,
    takesTurns: canTakeTurns(draft) && draft.takesTurns,
    ...(place === had ? {} : place ? { place: { words: place } } : { removePlace: true }),
  };
}
