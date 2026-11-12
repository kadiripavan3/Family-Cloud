import type { Access, Audience, AudienceChange, AudiencePerson, AudienceResponse } from '@/api/generated/homeport';

/**
 * What the audience sheet holds while the person is choosing: who sees the thing, and what each person may
 * do. It starts as what the API says and is sent back whole when they press Done.
 */
export type Draft = {
  audience: Audience;
  /** With everyone: whether they may all change it, or only look. */
  everyoneEdits: boolean;
  /** What each person may do, by member id, when it is shared with some people (or with a few by name on top of everyone). */
  access: Record<string, Access>;
  /** Who it is hidden from, by member id: the last day it is hidden, or null for "until you change it". */
  hidden: Record<string, string | null>;
};

/**
 * True for someone "everyone in the circle" doesn't reach: a guest of the circle, and a teen or a child for
 * a thing in Money or the Vault. They see it only when they are named, so their row keeps its own choice
 * even when the thing is shared with everyone.
 */
export function needsName(person: AudiencePerson, place: AudienceResponse['place']): boolean {
  if (person.role === 'guest') return true;
  return (person.role === 'teen' || person.role === 'child') && (place === 'money' || place === 'vault');
}

export function draftOf(audience: AudienceResponse): Draft {
  const access: Record<string, Access> = {};
  const hidden: Record<string, string | null> = {};
  for (const person of audience.people) {
    if (!person.memberId) continue;
    // While something is hidden from someone the API says they can't see it. What they may do once the
    // hiding ends isn't said, so they get to look.
    access[person.memberId] = person.hidden ? (audience.audience === 'me' ? 'none' : 'view') : (person.access ?? 'none');
    if (person.hidden) hidden[person.memberId] = person.hiddenThrough ?? null;
  }
  return { audience: audience.audience, everyoneEdits: audience.everyoneEdits, access, hidden };
}

/** What one person's row says: what they may do under this draft. */
export function accessOf(draft: Draft, person: AudiencePerson, place: AudienceResponse['place']): Access {
  const own = draft.access[person.memberId ?? ''] ?? 'none';
  if (draft.audience === 'me') return 'none';
  if (draft.audience === 'circle' && !needsName(person, place)) return draft.everyoneEdits ? 'edit' : 'view';
  return own;
}

/** What to send the API for a draft. */
export function changeOf(draft: Draft, audience: AudienceResponse): AudienceChange {
  const named = audience.people.filter((person) => {
    if (!person.memberId || (draft.access[person.memberId] ?? 'none') === 'none') return false;
    return draft.audience === 'some' || (draft.audience === 'circle' && needsName(person, audience.place));
  });
  return {
    audience: draft.audience,
    everyoneEdits: draft.everyoneEdits,
    people: named.map((person) => ({ memberId: person.memberId, access: draft.access[person.memberId!] })),
    hiddenFrom: draft.audience === 'me' ? [] : Object.entries(draft.hidden).map(([memberId, through]) => (through ? { memberId, through } : { memberId })),
  };
}

/** True when two drafts would send the same thing: nothing to save. */
export function sameDraft(a: Draft, b: Draft, audience: AudienceResponse): boolean {
  return JSON.stringify(changeOf(a, audience)) === JSON.stringify(changeOf(b, audience));
}
