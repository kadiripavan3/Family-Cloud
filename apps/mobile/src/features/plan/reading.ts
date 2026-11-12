import type { Audience, MemberResponse, NewEventRequest, NewReminderRequest, PersonRole, ReadAs, ReadItemResponse, Recurrence } from '@/api/generated/homeport';
import { addMinutes, formatClocks, formatWeekdayDay, phoneTimeZone } from '@/lib/dates';
import { firstName } from '@/lib/names';
import { words } from '@/words';

import { recurrenceOf } from './eventDraft';
import type { When } from './WhenSheet';

/**
 * "Type it": how one part of a typed line was read, and what the person corrected of that reading.
 *
 * The API reads the line (`readLine`) and says what each part is: an event, a reminder, a line on a list, a
 * note; with its day, its time, who it is for, a reminder ahead of it and how often it comes round. The
 * person can correct each of those. A correction remembers what it corrected, so when the sentence is typed
 * on and that piece is read differently, the reading wins again: the correction was for the old one.
 */

/** A correction: what the piece was read as when it was corrected, and what it was corrected to. */
type Fixed<T> = { was: T; now: T };

/** What was corrected of one part of the line, by piece. */
export type Fixes = {
  as?: Fixed<ReadAs>;
  when?: Fixed<When>;
  /** Who, by member id. Null: nobody in particular. */
  person?: Fixed<string | null>;
  /** Minutes before. Null: no reminder. */
  remind?: Fixed<number | null>;
  repeat?: Fixed<Recurrence | null>;
  /** Where, in words. Null: no place. */
  place?: Fixed<string | null>;
};
export type Piece = keyof Fixes;

/** One part of the line as it stands: what the API read, with the corrections that still hold on top. */
export type Read = {
  as: ReadAs;
  title: string;
  when: When;
  personId: string | null;
  personRole: PersonRole | null;
  remindMinutes: number | null;
  repeat: Recurrence | null;
  place: string | null;
  /** The pieces whose correction holds. With any of them it is made from these fields, not from the sentence. */
  fixed: readonly Piece[];
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What the API read for each piece that can be corrected, before any correction. */
function asRead(item: ReadItemResponse) {
  return {
    as: item.as,
    when: { day: item.day, time: item.time, endTime: item.endTime } satisfies When,
    person: item.person?.memberId ?? null,
    remind: item.remindMinutes,
    repeat: recurrenceOf(item.repeat),
    place: item.place?.words ?? null,
  };
}

/** One part of the line with the person's corrections: a correction holds while the piece is still read as it was. */
export function readOf(item: ReadItemResponse, fixes: Fixes = {}): Read {
  const read = asRead(item);
  const fixed: Piece[] = [];
  const now = <K extends Piece>(piece: K): (typeof read)[K] => {
    const fix = fixes[piece] as Fixed<(typeof read)[K]> | undefined;
    if (!fix || !same(fix.was, read[piece])) return read[piece];
    fixed.push(piece);
    return fix.now;
  };
  const as = now('as');
  const personId = now('person');
  return {
    as,
    title: item.title,
    when: now('when'),
    personId,
    // What a name means is kept as it was read; a name that was picked is who it is for, or who it is given to.
    personRole: personId ? (item.personRole ?? (as === 'reminder' ? 'given_to' : 'for')) : null,
    remindMinutes: now('remind'),
    repeat: now('repeat'),
    place: now('place'),
    fixed,
  };
}

/** The corrections after one piece was set. Setting it back to what was read is no correction at all. */
export function fixOf<K extends Piece>(item: ReadItemResponse, fixes: Fixes = {}, piece: K, now: NonNullable<Fixes[K]>['now']): Fixes {
  const was = asRead(item)[piece];
  const next = { ...fixes };
  if (same(was, now)) delete next[piece];
  else next[piece] = { was, now } as Fixes[K];
  return next;
}

/** "Sat 14 Nov · 10:00 to 10:30", "Sat 14 Nov", or nothing without a day: when, the way the API writes it. */
export function whenLabel(when: When): string | null {
  if (!when.day) return null;
  return words.common.join([formatWeekdayDay(when.day), when.time ? formatClocks(when.time, when.endTime) : null]);
}

/** "For Leo", "Given to Alex", "With Alex", "About Leo", or "For you": who, the way the API writes it. */
export function whoLabel(read: Read, members: readonly MemberResponse[]): string {
  const member = members.find((one) => one.id === read.personId);
  if (!member || !read.personRole) return words.plan.quick.noOne;
  if (member.you && (read.personRole === 'for' || read.personRole === 'given_to')) return words.plan.quick.forYou;
  return words.plan.quick.who[read.personRole](firstName(member.name));
}

type Making = { clientId: string; circleId: string; audience?: Audience; today: string; members: readonly MemberResponse[] };

/**
 * The event a corrected reading makes, the way the API itself files one from a line: "Haircut for Leo" is
 * called "Haircut · Leo", Leo is coming, and it shows on his page. Without a day it is today.
 */
export function eventOf(read: Read, making: Making): NewEventRequest {
  const person = making.members.find((one) => one.id === read.personId);
  const someoneElse = !!person && !person.you;
  const role = read.personRole;
  return {
    clientId: making.clientId,
    circleId: making.circleId,
    title: (someoneElse && role === 'for' ? `${read.title} · ${firstName(person.name)}` : read.title).slice(0, 200),
    day: read.when.day ?? making.today,
    time: read.when.time ?? undefined,
    // A reminder that was turned into an event has a start and no end: half an hour, as the reader gives one.
    endTime: read.when.time ? (read.when.endTime ?? addMinutes(read.when.time, 30)) : undefined,
    timeZone: phoneTimeZone(),
    place: read.place ?? undefined,
    remindMinutes: read.remindMinutes ?? undefined,
    repeat: read.repeat ?? undefined,
    guests: someoneElse && (role === 'for' || role === 'with') ? [{ memberId: person.id }] : [],
    about: person && (role === 'for' || role === 'about') ? [person.id] : undefined,
    audience: making.audience,
  };
}

/** The reminder a corrected reading makes, the way the API itself files one: given to the person it names, unless that is you or a pet. */
export function reminderOf(read: Read, making: Making): NewReminderRequest {
  const person = making.members.find((one) => one.id === read.personId);
  const role = read.personRole;
  const given = !!person && !person.you && role === 'given_to' && person.kind !== 'pet';
  const day = read.when.day;
  return {
    clientId: making.clientId,
    circleId: making.circleId,
    title: read.title.slice(0, 200),
    dueOn: day ?? undefined,
    dueTime: day ? (read.when.time ?? undefined) : undefined,
    timeZone: phoneTimeZone(),
    remindMinutes: read.remindMinutes ?? undefined,
    repeat: day ? (read.repeat ?? undefined) : undefined,
    givenTo: given ? [person.id] : [],
    about: person && (role === 'for' || role === 'about') ? [person.id] : undefined,
    audience: making.audience,
  };
}
