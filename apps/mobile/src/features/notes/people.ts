import { useMemo } from 'react';

import type { CircleResponse, PersonBrief } from '@/api/generated/homeport';
import { useCircleIfAny, useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { firstName } from '@/lib/names';

import type { People } from './changes/apply';

/** The people of a circle as a change can name them: the person using the phone, and anyone by their id, each as the API would send them back. */
export function peopleOf(circle: CircleResponse | undefined): People {
  const brief = new Map<string, PersonBrief>((circle ? membersOf(circle) : []).map((member) => [member.id, { memberId: member.id, name: firstName(member.name), avatarUrl: member.avatarUrl }]));
  return { me: (circle && brief.get(circle.myMemberId)) ?? null, of: (memberId) => (memberId && brief.get(memberId)) || null };
}

/** The circle a thing is in: usually the current one, but a link can open a thing of another. */
export function useCircleOf(circleId: string | undefined): CircleResponse | undefined {
  const circles = useCircles();
  const current = useCircleIfAny();
  return circles.find((one) => one.id === circleId) ?? current;
}

/** The people of the circle a thing is in, for laying waiting changes over it. */
export function usePeople(circleId: string | undefined): People {
  const circle = useCircleOf(circleId);
  return useMemo(() => peopleOf(circle), [circle]);
}
