import type { CircleResponse, MemberResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { words } from '@/words';

/** The people of a circle who are in it now: everyone but those who left. */
export function membersOf(circle: CircleResponse): MemberResponse[] {
  return circle.members.filter((member) => member.status !== 'left');
}

/** How many people a circle has (pets are named, not counted), and what its pets are called. */
export function headcount(circle: CircleResponse): { people: number; pets: string[] } {
  const members = membersOf(circle);
  return { people: members.filter((member) => member.kind !== 'pet').length, pets: members.filter((member) => member.kind === 'pet').map((member) => firstName(member.name)) };
}

/** "Family · 4 people and Biscuit": a circle in one line, as on the sheet that changes circles. */
export function circleLine(circle: CircleResponse): string {
  const { people, pets } = headcount(circle);
  return words.common.join([words.kinds[circle.kind].name, words.circles.people(people, pets)]);
}

/** True for a teen or a child in a family: Money and the Vault are shut for them, as the API's own rule says. */
export function isYoung(circle: CircleResponse): boolean {
  return circle.myRole === 'teen' || circle.myRole === 'child';
}
