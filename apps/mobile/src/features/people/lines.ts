import type { CircleResponse, MemberResponse } from '@/api/generated/homeport';
import { ageOn, nextBirthday, today } from '@/lib/dates';
import { words } from '@/words';

/** How close a birthday has to be for a list to mention it. */
const BIRTHDAY_SOON_DAYS = 30;

/**
 * The line under a person's name in a list of a circle's people, worked out from who they are: "Owner",
 * "Adult · invited", "Child, 9 · birthday in 23 days", "Dog · vet, food and walks on their page".
 */
export function memberLine(member: MemberResponse, circle: CircleResponse, day: string = today()): string {
  if (member.kind === 'pet') return words.people.line.pet(member.about);
  const said = words.people.line;
  const age = member.birthday ? ageOn(member.birthday, day) : null;
  const birthday = member.birthday ? nextBirthday(member.birthday, day).inDays : null;
  // In a family people have roles, and a child's age stands beside theirs. Among equals there is only who started it.
  const first = circle.hasRoles ? said.role(words.people.roles[member.role], member.kind === 'child' || member.role === 'child' || member.role === 'teen' ? age : null) : member.role === 'owner' ? said.started : member.status === 'invited' ? said.invitedOnly : said.joined;
  const second =
    birthday !== null && birthday <= BIRTHDAY_SOON_DAYS ? said.birthdayIn(birthday) : member.status === 'invited' && circle.hasRoles ? said.invited : member.status === 'no_phone' && !member.you ? said.noPhone : null;
  return words.common.join([first, second]);
}
