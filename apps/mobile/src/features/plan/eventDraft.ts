import type { Audience, EventChangeRequest, EventResponse, NewEventRequest, Recurrence, RepeatResponse } from '@/api/generated/homeport';
import { addDays, daysBetween, formatClocks, formatWeekdayDay, phoneTimeZone } from '@/lib/dates';
import { words } from '@/words';

/** What the form of an event holds while it is being written. Times are as the API keeps them ("09:30"); no time means all day. */
export type EventDraft = {
  title: string;
  day: string;
  time: string | null;
  endTime: string | null;
  place: string;
  notes: string;
  /** Who is coming, by member id, in the order they were picked. The first one is who it is for. */
  guests: string[];
  /** Minutes before it starts. Null: no reminder. */
  remindMinutes: number | null;
  repeat: Recurrence | null;
};

/** How often something comes round, as it is sent: what the API answered, without its label. */
export function recurrenceOf(repeat: RepeatResponse | Recurrence | null | undefined): Recurrence | null {
  if (!repeat) return null;
  return { unit: repeat.unit, every: repeat.every, days: repeat.days?.length ? repeat.days : undefined, until: repeat.until ?? undefined };
}

export function newEventDraft(day: string): EventDraft {
  return { title: '', day, time: null, endTime: null, place: '', notes: '', guests: [], remindMinutes: null, repeat: null };
}

export function eventDraftOf(event: EventResponse): EventDraft {
  return {
    title: event.title,
    day: event.day,
    time: event.time,
    endTime: event.endTime,
    place: event.place,
    notes: event.notes,
    guests: event.guests.flatMap((guest) => (guest.memberId ? [guest.memberId] : [])),
    remindMinutes: event.remindMinutes,
    repeat: recurrenceOf(event.repeat),
  };
}

/** "Sat 14 Nov · 10:00 to 10:30", "Sat 14 Nov · All day", or "Sat 5 Dec to Sun 6 Dec" for one that runs over several days. */
export function whenLine(day: string, time: string | null, endTime: string | null, endDay?: string | null): string {
  if (endDay && endDay !== day) {
    const from = words.common.join([formatWeekdayDay(day), time ? formatClocks(time) : null]);
    const to = words.common.join([formatWeekdayDay(endDay), endTime ? formatClocks(endTime) : null]);
    return words.plan.event.days(from, to);
  }
  return words.common.join([formatWeekdayDay(day), time ? formatClocks(time, endTime) : words.plan.event.allDay]);
}

/** What to send to make the event a draft describes. */
export function newEventRequest(draft: EventDraft, with_: { clientId: string; circleId: string; audience?: Audience }): NewEventRequest {
  return {
    clientId: with_.clientId,
    circleId: with_.circleId,
    title: draft.title.trim(),
    day: draft.day,
    time: draft.time ?? undefined,
    endTime: draft.time ? (draft.endTime ?? undefined) : undefined,
    timeZone: phoneTimeZone(),
    place: draft.place.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    remindMinutes: draft.remindMinutes ?? undefined,
    repeat: draft.repeat ?? undefined,
    guests: draft.guests.map((memberId) => ({ memberId })),
    // The first one it is for is whose page it shows on.
    about: draft.guests.length ? [draft.guests[0]!] : undefined,
    audience: with_.audience,
  };
}

/**
 * What to send to change an event into what a draft says. When it is always goes whole (day, time, end and
 * time zone together); one that lasted several days keeps its length. Who is coming is changed one person at
 * a time, on the event itself.
 */
export function eventChangeRequest(draft: EventDraft, event: EventResponse): EventChangeRequest {
  return {
    title: draft.title.trim(),
    day: draft.day,
    time: draft.time ?? undefined,
    endDay: addDays(draft.day, Math.max(daysBetween(event.day, event.endDay), 0)),
    endTime: draft.time ? (draft.endTime ?? undefined) : undefined,
    timeZone: event.timeZone,
    place: draft.place.trim(),
    notes: draft.notes.trim(),
    ...(draft.remindMinutes === null ? (event.remindMinutes === null ? {} : { stopReminding: true }) : { remindMinutes: draft.remindMinutes }),
    ...(draft.repeat === null ? (event.repeat ? { stopRepeating: true } : {}) : { repeat: draft.repeat }),
  };
}
