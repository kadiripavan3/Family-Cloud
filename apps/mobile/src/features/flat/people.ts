import type { PersonBrief } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { words } from '@/words';

/** The circle a board is in, as this phone has it, and the viewer's own member id there (null until the circles have loaded). */
export function useFlat(circleId: string) {
  const circle = useCircles().find((one) => one.id === circleId) ?? null;
  return { circle, me: circle?.myMemberId ?? null };
}

/** A person as a sentence names them: "You" for whoever is looking, their first name for anyone else. */
export function called(person: PersonBrief | null | undefined, me: string | null): string {
  if (!person) return '';
  return person.memberId === me ? words.flat.you : (person.name ?? '');
}

/** True when this person is whoever is looking. */
export const isMe = (person: PersonBrief | null | undefined, me: string | null) => !!person && person.memberId === me;

/** People in a row, the viewer first: "You and Lea". */
export function calledAll(people: readonly (PersonBrief | null)[], me: string | null): string[] {
  const there = people.filter((person): person is PersonBrief => !!person);
  return [...there.filter((person) => person.memberId === me), ...there.filter((person) => person.memberId !== me)].map((person) => called(person, me));
}
