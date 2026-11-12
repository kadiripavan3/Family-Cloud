import { type Audience, changeEvent, createEvent, createReminder, jot, type JotResponse, type MemberResponse, type ReadingResponse } from '@/api/generated/homeport';
import { phoneTimeZone, today } from '@/lib/dates';

import { eventOf, type Read, reminderOf } from './reading';

type Filing = {
  circleId: string;
  /** The line as it was typed. */
  text: string;
  reading: ReadingResponse;
  /** Each part of the line with the person's corrections, in the reading's order. */
  reads: readonly Read[];
  members: readonly MemberResponse[];
  audience?: Audience;
  /** An id for the whole line and one for each of its parts, the same on a second try. */
  idOf: (part: number | 'line') => string;
};

/** Where the last one like it was isn't part of what a line files: an event that was read with a place gets it afterwards. */
async function place(made: readonly JotResponse[], read: Read): Promise<void> {
  const event = made.find((one) => one.became === 'event' && one.thingId);
  if (read.as === 'event' && read.place && event?.thingId) await changeEvent(event.thingId, { place: read.place });
}

/**
 * Adds what a typed line holds. A line nothing was corrected in is filed by the API as it read it (`jot`):
 * an event, a reminder, a line on a list, a page; that also keeps it in the list of what was jotted. A part
 * the person corrected is made from the corrected fields instead, and the parts around it are filed by
 * their own words. Something that looks like a code is never sent from here.
 */
export async function fileLine({ circleId, text, reading, reads, members, audience, idOf }: Filing): Promise<void> {
  const day = today();
  const from = { day, timeZone: phoneTimeZone(), source: 'app' as const, audience };
  const corrected = reads.some((read) => read.fixed.length > 0);
  const secret = reads.some((read) => read.as === 'code');
  if (!corrected && !secret) {
    const made = await jot(circleId, { clientId: idOf('line'), text: text.trim(), ...from });
    // The answers come in the order of the parts they were made from.
    for (const [index, read] of reads.entries()) if (made[index]) await place([made[index]], read);
    return;
  }
  for (const [index, read] of reads.entries()) {
    const making = { clientId: idOf(index), circleId, audience, today: day, members };
    if (read.as === 'code') continue;
    if (read.fixed.length > 0 && read.as === 'event') await createEvent(eventOf(read, making));
    else if (read.fixed.length > 0 && read.as === 'reminder') await createReminder(reminderOf(read, making));
    else await place(await jot(circleId, { clientId: idOf(index), text: reading.items[index]!.words, ...from }), read);
  }
}
