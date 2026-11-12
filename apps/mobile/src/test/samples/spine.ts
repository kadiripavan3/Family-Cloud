import type { AudienceChip, AudiencePerson, AudienceResponse, ChecklistResponse, CircleResponse, ItemResponse, MemberResponse, PageResponse, ThingBrief, TodayResponse } from '@/api/generated/homeport';

/** Made-up circles, people and things, as the API sends them: The Linds (a family), Nora and Alex (a couple), Lisbon crew (friends). */

export function member(over: Partial<MemberResponse> = {}): MemberResponse {
  return {
    id: 'm-nora',
    circleId: 'c-linds',
    name: 'Nora Lind',
    kind: 'person',
    role: 'owner',
    status: 'joined',
    avatarUrl: null,
    birthday: null,
    about: '',
    facts: [],
    tint: 1,
    you: false,
    seesLibrary: true,
    seesPlan: true,
    seesPages: true,
    ...over,
  };
}

export const noraInLinds = member({ you: true });
export const alex = member({ id: 'm-alex', name: 'Alex Strand', role: 'adult', tint: 2 });
export const mia = member({ id: 'm-mia', name: 'Mia', kind: 'child', role: 'child', status: 'no_phone', birthday: '2016-12-04', facts: ['Shoes 33', 'Class 4B'], tint: 3 });
export const leo = member({ id: 'm-leo', name: 'Leo', kind: 'child', role: 'child', status: 'no_phone', birthday: '2020-03-14', tint: 4 });
export const biscuit = member({ id: 'm-biscuit', name: 'Biscuit', kind: 'pet', role: 'child', status: 'no_phone', about: 'Dog', tint: 5 });

export function circle(over: Partial<CircleResponse> = {}): CircleResponse {
  return {
    id: 'c-linds',
    kind: 'family',
    name: 'The Linds',
    coverUrl: null,
    startsAs: 'me',
    hasRoles: true,
    myMemberId: 'm-nora',
    myRole: 'owner',
    iRunIt: true,
    createdAt: '2024-03-02T00:00:00Z',
    joinUrl: 'https://homeport.app/join/the-linds',
    members: [noraInLinds, alex, mia, leo, biscuit],
    shared: { page: 4 },
    ...over,
  };
}

/** The family, seen by Nora, who owns it. */
export const linds = circle();
export const coupleCircle = circle({
  id: 'c-couple',
  kind: 'couple',
  name: 'Nora and Alex',
  startsAs: 'circle',
  hasRoles: false,
  myMemberId: 'm-nora-2',
  members: [member({ id: 'm-nora-2', circleId: 'c-couple', you: true }), member({ id: 'm-alex-2', circleId: 'c-couple', name: 'Alex Strand', role: 'adult' })],
  shared: {},
});
export const crewCircle = circle({
  id: 'c-crew',
  kind: 'crew',
  name: 'Lisbon crew',
  startsAs: 'circle',
  hasRoles: false,
  myMemberId: 'm-nora-3',
  myRole: 'adult',
  joinUrl: null,
  members: ['Lea', 'Nora Lind', 'Kai', 'Lena', 'Ana'].map((name, index) => member({ id: `m-crew-${index}`, circleId: 'c-crew', name, role: index === 0 ? 'owner' : 'adult', you: name === 'Nora Lind' })),
  shared: { page: 1 },
});
export const soloCircle = circle({ id: 'c-solo', kind: 'solo', name: 'Just me', hasRoles: false, myMemberId: 'm-solo', members: [member({ id: 'm-solo', circleId: 'c-solo', you: true })], shared: {} });

/** Who sees a thing, as the small chip gets it. */
export const onlyMe: AudienceChip = { audience: 'me', people: [], hiddenFrom: [] };
export const everyone: AudienceChip = { audience: 'circle', people: [], hiddenFrom: [] };
export const withAlex: AudienceChip = { audience: 'some', people: [{ memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }], hiddenFrom: [] };
export const notMia: AudienceChip = { audience: 'circle', people: [], hiddenFrom: ['Mia'] };

/** A thing in a list of mixed kinds. */
export function thing(over: Partial<ThingBrief> = {}): ThingBrief {
  return { id: '11111111-1111-4111-8111-111111111111', circleId: 'c-linds', kind: 'page', place: 'notes', title: 'Wi‑Fi and smart home', updatedAt: '2026-11-11T09:00:00Z', mine: true, canEdit: true, chip: onlyMe, glance: null, ...over };
}

export function page(over: Partial<PageResponse> = {}): PageResponse {
  return { id: '11111111-1111-4111-8111-111111111111', circleId: 'c-linds', title: 'Wi‑Fi and smart home', body: 'Network: Lind-Home', updatedAt: '2026-11-11T09:00:00Z', mine: true, canEdit: true, chip: onlyMe, ...over };
}

export function item(over: Partial<ItemResponse> = {}): ItemResponse {
  return { id: 'i-1', text: 'Milk, 2 litres', note: '', section: '', amountCents: null, done: false, doneAt: null, doneBy: null, assignedTo: null, addedBy: null, ...over };
}

export function checklist(over: Partial<ChecklistResponse> = {}): ChecklistResponse {
  const items = over.items ?? [item(), item({ id: 'i-2', text: 'Butter', done: true })];
  return {
    id: '22222222-2222-4222-8222-222222222222',
    circleId: 'c-linds',
    title: 'Groceries',
    updatedAt: '2026-11-11T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    left: items.filter((one) => !one.done).length,
    done: items.filter((one) => one.done).length,
    ...over,
    items,
  };
}

function audiencePerson(from: MemberResponse, over: Partial<AudiencePerson> = {}): AudiencePerson {
  return { memberId: from.id, name: from.name, avatarUrl: null, kind: from.kind, role: from.role, access: 'none', hidden: false, hiddenThrough: null, ...over };
}

/** What the audience sheet gets for Nora's page: only she sees it, and Alex, Mia and Leo could. */
export function audience(over: Partial<AudienceResponse> = {}): AudienceResponse {
  return {
    thingId: '11111111-1111-4111-8111-111111111111',
    title: 'Wi‑Fi and smart home',
    kind: 'page',
    place: 'notes',
    circleId: 'c-linds',
    circleName: 'The Linds',
    circleKind: 'family',
    audience: 'me',
    everyoneEdits: true,
    mine: true,
    people: [audiencePerson(alex), audiencePerson(mia), audiencePerson(leo)],
    ...over,
  };
}

/** The same page shared with some: Alex may change it, Mia may look, Leo can't see it. */
export const sharedWithSome = audience({ audience: 'some', people: [audiencePerson(alex, { access: 'edit' }), audiencePerson(mia, { access: 'view' }), audiencePerson(leo)] });

/** A page for everyone in the family, hidden from Mia until her birthday. */
export const hiddenFromMia = audience({
  title: "Mia's 10th birthday",
  audience: 'circle',
  people: [audiencePerson(alex, { access: 'edit' }), audiencePerson(mia, { hidden: true, hiddenThrough: '2026-12-04' }), audiencePerson(leo, { access: 'edit' })],
});

export function todayAnswer(over: Partial<TodayResponse> = {}): TodayResponse {
  return { day: '2026-11-11', left: 0, done: 0, items: [], fresh: [], onlyYou: 0, ...over };
}
