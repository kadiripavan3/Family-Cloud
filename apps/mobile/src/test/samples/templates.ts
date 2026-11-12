import type {
  BoardCard,
  BoardMedia,
  BoardResponse,
  ChoreWheelJob,
  ChoreWheelView,
  MealPlanMeal,
  MealPlanView,
  PersonBrief,
  StartedResponse,
  TemplateCard,
  TemplateGalleryResponse,
  TimeCapsuleItem,
  TimeCapsuleView,
} from '@/api/generated/homeport';

import { everyone, onlyMe, thing } from './spine';

/**
 * Made-up answers for the tests of Templates: whole objects, the way the API sends them. Import them from
 * '@/test/samples/templates'; the people and circles every test shares are in '@/test/samples'.
 */

/** One card of the gallery: a plain template unless said otherwise. */
export function card(over: Partial<TemplateCard> = {}): TemplateCard {
  return { template: 'house_manual', name: 'House manual', emoji: '🏠', line: 'Wi‑Fi, bins, boiler, who to call', group: 'templates', topic: 'home', live: false, yours: true, ready: true, note: null, makes: ['Page · House manual', 'Checklist · When we go away'], ...over };
}

export const mealPlanCard = card({ template: 'meal_plan', name: 'Weekly meal plan', emoji: '🍽️', line: 'Plan dinners, get the shopping list', topic: 'food', live: true, makes: [] });
export const choreWheelCard = card({ template: 'chore_wheel', name: 'Chore wheel', emoji: '🧹', line: 'Jobs change hands every week', live: true, makes: [] });
export const packingCard = card({ template: 'packing_list', name: 'Packing list', emoji: '🧳', line: 'Per person, per trip, reusable', topic: 'trips', makes: ['Checklist · Packing list'] });
export const houseManualCard = card();
export const capsuleCard = card({ template: 'time_capsule', name: 'Time capsule', emoji: '⏳', line: 'Letters that open on a date', group: 'keepsakes', topic: 'memories', live: true, makes: [] });
export const saidCard = card({ template: 'said', name: 'Things they said', emoji: '💬', line: 'With the age, worked out for you', group: 'keepsakes', topic: 'kids', live: true, makes: [] });
export const whoseTurnCard = card({ template: 'whose_turn', name: 'Whose turn?', emoji: '🎬', line: 'Remembers who chose last', group: 'fair_and_fun', topic: 'together', live: true, ready: false, note: 'Coming with the next update', makes: [] });
export const dateIdeasCard = card({ template: 'date_ideas', name: 'Date ideas', emoji: '🥂', line: 'Shake for one that fits tonight', topic: 'together', live: true, yours: false, ready: false, note: 'Coming with the next update', makes: [] });
export const weddingCard = card({ template: 'wedding', name: 'The wedding', emoji: '💍', line: 'Guests, budget and the seating plan', topic: 'together', yours: false, makes: ['Page · The wedding', 'Checklist · Wedding to-dos'] });

/** The gallery as a family gets it: its own cards first, then a couple's. Eight of the 67, with the real counts. */
export function gallery(over: Partial<TemplateGalleryResponse> = {}): TemplateGalleryResponse {
  return {
    kind: 'family',
    total: 53,
    yours: 20,
    groups: [
      { group: 'templates', count: 36, yours: 12 },
      { group: 'keepsakes', count: 17, yours: 8 },
      { group: 'fair_and_fun', count: 14, yours: 7 },
    ],
    topics: ['home', 'kids', 'food'],
    templates: [mealPlanCard, choreWheelCard, packingCard, houseManualCard, capsuleCard, saidCard, whoseTurnCard, dateIdeasCard, weddingCard],
    ...over,
  };
}

/** The same cards as a couple gets them: theirs first. */
export const coupleGallery = gallery({
  kind: 'couple',
  yours: 16,
  topics: ['home', 'money', 'trips'],
  templates: [{ ...dateIdeasCard, yours: true }, { ...weddingCard, yours: true }, { ...mealPlanCard, yours: false }, { ...houseManualCard, yours: false }, { ...whoseTurnCard, yours: false }],
});

/**
 * A board as the API sends it, whatever its template. `view` and `settings` are that template's own; a
 * template's tests hand over theirs: `board({ template: 'chore_wheel', view: wheel() })`.
 */
export function board(over: Partial<BoardResponse> = {}): BoardResponse {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    circleId: 'c-linds',
    template: 'good_jar',
    title: 'The good things jar',
    emoji: '✨',
    updatedAt: '2026-11-11T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    day: '2026-11-11',
    settings: {},
    view: { year: 2026, count: 0, opensOn: '2026-12-31', open: false, daysToGo: 50, latest: [], years: [] },
    ...over,
  };
}

/** A board in a list of them: what the gallery's sheet shows under "In The Linds already". */
export function boardCard(over: Partial<BoardCard> = {}): BoardCard {
  return { id: '33333333-3333-4333-8333-333333333333', circleId: 'c-linds', template: 'meal_plan', title: 'Weekly meal plan', emoji: '🍽️', glance: '5 dinners this week', updatedAt: '2026-11-11T09:00:00Z', mine: true, canEdit: true, chip: everyone, ...over };
}

/** What starting a plain template answers: the page and the list it made. */
export const startedPlain: StartedResponse = {
  template: 'house_manual',
  made: [thing({ id: '44444444-4444-4444-8444-444444444444', kind: 'page', title: 'House manual', chip: onlyMe }), thing({ id: '55555555-5555-4555-8555-555555555555', kind: 'checklist', title: 'When we go away', chip: onlyMe })],
  board: null,
};

/** What starting one that does work answers: its board. */
export const startedLive: StartedResponse = {
  template: 'good_jar',
  made: [thing({ id: '33333333-3333-4333-8333-333333333333', kind: 'board', title: 'The good things jar', chip: onlyMe })],
  board: board({ chip: onlyMe }),
};

/** People as a board names them: by first name, with their member id. */
export const noraBrief: PersonBrief = { memberId: 'm-nora', name: 'Nora', avatarUrl: null };
export const alexBrief: PersonBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: null };
export const miaBrief: PersonBrief = { memberId: 'm-mia', name: 'Mia', avatarUrl: null };
export const leoBrief: PersonBrief = { memberId: 'm-leo', name: 'Leo', avatarUrl: null };

// ---------- 5.7 the weekly meal plan ----------

export function meal(over: Partial<MealPlanMeal> = {}): MealPlanMeal {
  return { id: 'meal-pasta', name: 'Tomato pasta', emoji: '🍝', minutes: 25, note: null, cook: alexBrief, tonight: false, fromCalendar: false, ingredients: [], ...over };
}

/** The week of 9 November 2026 as the drawing has it: today is Wednesday, Thursday is empty, three recipes wait as chips. */
export function mealPlanView(over: Partial<MealPlanView> = {}): MealPlanView {
  const day = (date: string, meals: MealPlanMeal[] = []) => ({ day: date, today: date === '2026-11-11', meals });
  return {
    weekStart: '2026-11-09',
    weekEnd: '2026-11-15',
    days: [
      day('2026-11-09', [
        meal({
          ingredients: [
            { id: 'ing-spaghetti', name: 'Spaghetti', atHome: false, onList: true },
            { id: 'ing-garlic', name: 'Garlic', atHome: true, onList: false },
          ],
        }),
      ]),
      day('2026-11-10', [meal({ id: 'meal-soup', name: 'Lentil soup', emoji: '🍲', minutes: 40, note: 'Makes two dinners', cook: noraBrief })]),
      day('2026-11-11', [meal({ id: 'meal-tacos', name: 'Tacos', emoji: '🌮', minutes: 30, tonight: true })]),
      day('2026-11-12'),
      day('2026-11-13', [meal({ id: 'meal-pizza', name: 'Pizza night', emoji: '🍕', minutes: null, note: 'Mia and Leo choose', cook: miaBrief })]),
      day('2026-11-14', [meal({ id: null, name: "Dinner at Grandma Astrid's", emoji: null, minutes: null, cook: null, fromCalendar: true })]),
      day('2026-11-15'),
    ],
    recipes: [
      { id: 'recipe-salmon', name: 'Baked salmon', emoji: '🐟', minutes: 35, note: null, ingredients: ['Salmon fillets', 'Lemon'] },
      { id: 'recipe-curry', name: 'Chicken curry', emoji: '🍛', minutes: 45, note: null, ingredients: ['Chicken thighs', 'Rice'] },
    ],
    groceries: { listId: '22222222-2222-4222-8222-222222222222', on: true, going: 23, atHome: 6 },
    cookingFor: 4,
    ...over,
  };
}

export function mealPlanBoard(view: MealPlanView = mealPlanView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'meal_plan', title: 'Weekly meal plan', emoji: '🍽️', settings: { cookingFor: view.cookingFor, toGroceries: view.groceries.on, groceriesListId: view.groceries.listId }, view, ...over });
}

/** A recording, and a photo, as a board hands them over. */
export function recording(seconds: number, id = `rec-${seconds}`): BoardMedia {
  return { id, kind: 'audio', url: `https://media.test/${id}.m4a`, thumbUrl: null, seconds };
}
export function picture(id = 'pic-1'): BoardMedia {
  return { id, kind: 'photo', url: `https://media.test/${id}.jpg`, thumbUrl: `https://media.test/${id}.small.jpg`, seconds: null };
}

// ---------- 5.8 the chore wheel ----------

export function job(over: Partial<ChoreWheelJob> = {}): ChoreWheelJob {
  return { id: 'job-bins', name: 'Bins and recycling', emoji: '🗑️', when: 'Tuesday and Friday evening', timesAWeek: 2, who: noraBrief, next: alexBrief, doneThisWeek: 0, doneOn: [], doneToday: false, complete: false, lastDoneAt: null, ...over };
}

/** Week 46 as the drawing has it: Nora's bins not done, Alex's laundry done, Mia part of the way, Leo done this morning. */
export function wheelView(over: Partial<ChoreWheelView> = {}): ChoreWheelView {
  const stars = { stars: 10, cents: 200, currency: 'EUR', into: "Mia's skates fund" };
  return {
    week: 46,
    weekStart: '2026-11-09',
    weekEnd: '2026-11-15',
    people: [
      { person: noraBrief, kind: 'person', stars: 0 },
      { person: alexBrief, kind: 'person', stars: 2 },
      { person: miaBrief, kind: 'child', stars: 34 },
      { person: leoBrief, kind: 'child', stars: 21 },
    ],
    jobs: [
      job(),
      job({ id: 'job-laundry', name: 'Laundry', emoji: '🧺', when: 'Two loads', who: alexBrief, next: miaBrief, doneThisWeek: 2, doneOn: ['2026-11-09', '2026-11-10'], complete: true, lastDoneAt: '2026-11-10T19:10:00' }),
      job({ id: 'job-table', name: 'Set the table', emoji: '🍽️', when: 'Every day', timesAWeek: 7, who: miaBrief, next: leoBrief, doneThisWeek: 5, doneOn: ['2026-11-09', '2026-11-10'] }),
      job({ id: 'job-biscuit', name: 'Feed Biscuit', emoji: '🐶', when: 'Every morning', timesAWeek: 7, who: leoBrief, next: noraBrief, doneThisWeek: 3, doneOn: ['2026-11-09', '2026-11-10', '2026-11-11'], doneToday: true, lastDoneAt: '2026-11-11T07:10:00' }),
    ],
    done: 1,
    stars,
    ...over,
  };
}

export function wheelBoard(view: ChoreWheelView = wheelView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'chore_wheel', title: 'Chore wheel', emoji: '🧹', settings: { people: ['m-nora', 'm-alex', 'm-mia', 'm-leo'], startsOn: '2026-09-14', stars: view.stars }, view, ...over });
}

// ---------- 5.9 the time capsule ----------

export function capsuleItem(over: Partial<TimeCapsuleItem> = {}): TimeCapsuleItem {
  return { id: 'item-letter', kind: 'letter', title: 'A letter from Nora', note: null, from: noraBrief, fromName: null, mine: true, draft: false, sealed: true, sealedAt: '2026-11-03T21:05:00', pages: 2, seconds: null, photos: null, text: null, media: null, pictures: [], ...over };
}

/** The capsule for Mia's 18th as the drawing has it: four things sealed inside, 55% of the wait over. */
export function capsuleView(over: Partial<TimeCapsuleView> = {}): TimeCapsuleView {
  return {
    opensOn: '2034-12-04',
    open: false,
    openForYou: false,
    daysToGo: 2945,
    progress: 55,
    forPeople: [miaBrief],
    sealedInside: 4,
    items: [
      capsuleItem(),
      capsuleItem({ id: 'item-voice', kind: 'voice', title: 'A voice message from Alex', from: alexBrief, mine: false, pages: null, seconds: 134, sealedAt: '2026-11-05T10:00:00' }),
      capsuleItem({ id: 'item-recipe', kind: 'photo', title: "Grandma Astrid's cookie recipe", note: 'In her handwriting, with a photo', from: null, fromName: 'Astrid Lind', pages: null }),
      capsuleItem({ id: 'item-photos', kind: 'photos', title: '12 photos from this year', note: 'One a month, picked by the family', pages: null, photos: 12 }),
    ],
    ...over,
  };
}

export function capsuleBoard(view: TimeCapsuleView = capsuleView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'time_capsule', title: 'For Mia, on her 18th birthday', emoji: '⏳', chip: { audience: 'circle', people: [], hiddenFrom: ['Mia'] }, settings: { opensOn: view.opensOn, countFrom: '2016-12-04', forMemberIds: ['m-mia'], hideFromThem: true }, view, ...over });
}
