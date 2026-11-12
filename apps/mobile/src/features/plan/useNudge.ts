import { useMutation } from '@tanstack/react-query';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { nudgeReminder, type ReminderResponse } from '@/api/generated/homeport';
import { words } from '@/words';

/**
 * A gentle push to whoever has a reminder the person made, once an hour at most. `say` gets the sentence
 * that answers the press: that it is on its way, or the API's own words on why not (they were nudged a
 * moment ago, their phone couldn't be reached).
 */
export function useNudge(say: (text: string) => void) {
  const cache = useCache();
  const nudge = useMutation({
    mutationFn: (reminder: ReminderResponse) => nudgeReminder(reminder.id),
    onSuccess: (_nothing, reminder) => {
      say(words.plan.reminders.nudgeSent(words.common.join(reminder.givenTo.map((person) => person.name ?? ''))));
      void cache.reminderNudged(reminder);
    },
    onError: (error) => say(messageFor(error)),
  });
  return { nudge: (reminder: ReminderResponse) => nudge.mutate(reminder), nudgingId: nudge.isPending ? nudge.variables?.id : undefined };
}
