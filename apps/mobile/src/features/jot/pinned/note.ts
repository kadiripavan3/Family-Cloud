import type { NotificationAction, NotificationContentInput } from 'expo-notifications';

import type { JotResponse } from '@/api/generated/homeport';
import { formatTime, toISODate } from '@/lib/dates';
import { words } from '@/words';

import { batches } from '../today';

/**
 * The pinned note: a notification with a line to type in. This file is its pure half: what the note says,
 * what is posted when, and how an answer to it becomes a jot. Nothing here touches the phone, so all of it
 * is tried in tests (note.test.ts). The half that does touch the phone is `service.ts`.
 */

/** The note itself. Posting again under the same name replaces it where it stands. */
export const NOTE_ID = 'jot.pinned';
/** On an iPhone the morning's note is scheduled under a name of its own (see `morningId`). */
export const MORNING_ID = 'jot.pinned.morning';
/** The category that gives the note its line to type in. (The library asks for a name without ":" or "-".) */
export const CATEGORY = 'jotnote';
/** Android puts the note in a channel of its own, so it can be silent while reminders are not. */
export const CHANNEL = 'jot';
export const TYPE_ACTION = 'jot.type';
/** A chip's button: this, then the chip's place among the note's chips. */
export const CHIP_ACTION = 'jot.chip.';
/** The name of the task Android runs when the note is answered while the app is closed. */
export const TASK = 'homeport.jot.pinned';
/** When the note comes back every morning. */
export const MORNING = { hour: 7, minute: 0 };
/** What the notifications library calls a plain tap on a notification. */
const TAPPED = 'expo.modules.notifications.actions.DEFAULT';
/** How many of today's lines the note lists. */
const LINES = 5;

export type Os = 'ios' | 'android';
/** What this phone remembers while the note is on: the circle it adds to. */
export type Pinned = { circleId: string; circleName: string };

/**
 * The note's buttons: a line to type in first, then the things this circle adds most, one tap each.
 * Android shows three buttons at most, an iPhone four. None of them opens the app.
 */
export function noteCategory(os: Os, chips: readonly string[]): { identifier: string; actions: NotificationAction[] } {
  const quiet = { opensAppToForeground: false } as const;
  const type: NotificationAction = {
    identifier: TYPE_ACTION,
    buttonTitle: words.jot.pinned.note.type,
    textInput: { submitButtonTitle: words.jot.pinned.note.submit, placeholder: words.jot.pinned.note.placeholder },
    options: quiet,
  };
  const taps = chips.slice(0, os === 'android' ? 2 : 3).map((chip, index): NotificationAction => ({ identifier: `${CHIP_ACTION}${index}`, buttonTitle: words.jot.pinned.note.chip(chip), options: quiet }));
  return { identifier: CATEGORY, actions: [type, ...taps] };
}

/** Today's jots as the note lists them: the last few lines, the oldest first, each with where it went and when. */
export function noteLines(jots: readonly JotResponse[], now: Date = new Date()): string[] {
  const day = toISODate(now);
  const today = jots.filter((jot) => toISODate(new Date(jot.createdAt)) === day);
  return batches(today)
    .slice(-LINES)
    .map((row) => words.jot.pinned.note.line(row.titles, row.where, formatTime(row.at)));
}

/** What the note says right after an answer: what was added, or that a code is waiting for a decision. */
export function saidAfter(made: readonly JotResponse[]): string {
  const held = made.find((jot) => jot.became === 'code');
  const filed = made.filter((jot) => jot.became !== 'code').map((jot) => jot.title);
  if (filed.length === 0 && held) return words.jot.pinned.note.held(held.title);
  return words.common.join([words.jot.pinned.note.added(filed), held ? words.jot.pinned.note.held(held.title) : null]);
}

type Said = {
  os: Os;
  pinned: Pinned;
  /** Today's lines (`noteLines`). */
  lines: readonly string[];
  /** The chips its buttons add, in the order of the buttons. */
  chips: readonly string[];
  addedToday: number;
  /** The first thing it says after an answer: "Added: Milk". */
  said?: string | null;
};

/**
 * What the note says.
 *
 * On Android it stays (`sticky`: it is ongoing, and a tap doesn't clear it): the circle beside the app's
 * name, today's lines, and the line to type in always showing. On an iPhone nothing may stay, so it is a
 * quiet notification that says to press and hold, and how many were added today.
 *
 * Its `data` carries what an answer needs when the app is closed: the circle, and the chips its buttons
 * stand for. `url` is where a plain tap opens the app: the jot bar.
 */
export function noteContent({ os, pinned, lines, chips, addedToday, said }: Said): NotificationContentInput {
  const data = { url: '/jot', jot: 'pinned', circleId: pinned.circleId, circleName: pinned.circleName, chips: [...chips] };
  if (os === 'android') {
    return {
      title: said || words.jot.pinned.note.title,
      subtitle: words.jot.pinned.head(pinned.circleName),
      body: lines.length ? lines.join('\n') : words.jot.pinned.note.tap,
      data,
      categoryIdentifier: CATEGORY,
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: 'low',
    };
  }
  return {
    title: words.jot.pinned.note.title,
    body: [said, words.jot.pinned.note.hold(addedToday)].filter(Boolean).join(' '),
    data,
    categoryIdentifier: CATEGORY,
    sound: false,
    interruptionLevel: 'passive',
  };
}

/** One thing to post: now, or every morning. */
export type Post = { identifier: string; content: NotificationContentInput; when: 'now' | { hour: number; minute: number } };

/**
 * On Android the morning's note takes the place of the one that is there (the same name), so there is never
 * a second one. An iPhone replaces a waiting notification when another is posted under its name, which
 * would cancel the morning each time something is added: there the morning has a name of its own.
 */
export const morningId = (os: Os): string => (os === 'android' ? NOTE_ID : MORNING_ID);

/**
 * What is posted when the note goes up: the note itself, now, and the same note every morning, without the
 * "Added: …" of the moment (that line is news once).
 */
export function notePosts(note: Said): Post[] {
  return [
    { identifier: NOTE_ID, content: noteContent(note), when: 'now' },
    { identifier: morningId(note.os), content: noteContent({ ...note, said: null }), when: MORNING },
  ];
}

/**
 * Whether the note is posted now.
 *  - It was just switched on, or something was just added through it: yes, on both phones.
 *  - The app came to the front: only on Android, and only when the note isn't there (Android lets a pinned
 *    notification be swiped away; this is how it comes back). An iPhone's note returns after each add and
 *    in the morning, never because the app was opened.
 */
export function postsNow(os: Os, why: 'switched-on' | 'added' | 'front', presented: readonly string[]): boolean {
  if (why !== 'front') return true;
  return os === 'android' && !presented.includes(NOTE_ID);
}

/** An answer to a notification, as much of it as matters here. */
export type Answer = { actionIdentifier: string; userText?: string; notification: { date?: number; request: { identifier?: string; content: { data?: Record<string, unknown> | null } } } };

/**
 * How an answer becomes a jot. Typed words are jotted as they are; a chip's button jots the chip; a plain
 * tap opens the jot bar. An answer to any other notification is not Jot's, and so is one with nothing typed.
 */
export function jotOf(answer: Answer): { kind: 'jot'; circleId: string; text: string } | { kind: 'open' } | null {
  const data = answer.notification.request.content.data;
  if (!data || data.jot !== 'pinned' || typeof data.circleId !== 'string') return null;
  const circleId = data.circleId;
  if (answer.actionIdentifier === TYPE_ACTION) {
    const text = (answer.userText ?? '').trim();
    return text ? { kind: 'jot', circleId, text } : null;
  }
  if (answer.actionIdentifier.startsWith(CHIP_ACTION)) {
    const chips: unknown = data.chips;
    const chip: unknown = Array.isArray(chips) ? chips[Number(answer.actionIdentifier.slice(CHIP_ACTION.length))] : undefined;
    return typeof chip === 'string' && chip.trim() ? { kind: 'jot', circleId, text: chip.trim() } : null;
  }
  return answer.actionIdentifier === TAPPED ? { kind: 'open' } : null;
}

/**
 * What tells one answer from the next. Android hands the same answer to the listener and to the background
 * task while the app is alive but unseen; each answer is jotted once.
 */
export function answerKey(answer: Answer): string {
  return [answer.notification.request.identifier ?? '', answer.notification.date ?? '', answer.actionIdentifier, answer.userText ?? ''].join('|');
}
