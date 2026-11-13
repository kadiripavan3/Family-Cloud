import type {
  AwardsAwardResponse,
  AwardsNomineeResponse,
  AwardsViewResponse,
  BoardResponse,
  DictionaryViewResponse,
  DictionaryWordResponse,
  FindDateDayResponse,
  FindDateViewResponse,
  PersonBrief,
  PredictionsItemResponse,
  PredictionsViewResponse,
  PredictionsWriterResponse,
  SecretSantaViewResponse,
  WalkTogetherViewResponse,
  WhereNextIdeaResponse,
  WhereNextViewResponse,
} from '@/api/generated/homeport';

import { everyone } from './spine';
import { board, picture } from './templates';

/**
 * Made-up answers for the tests of friends: whole objects, the way the API sends them. Import them from
 * '@/test/samples/crew'; the people and circles every test shares are in '@/test/samples'.
 */

// The five of Lisbon crew, as a board names them. Nora is the one reading (`crewCircle` in the shared samples).
export const leaBrief: PersonBrief = { memberId: 'm-crew-0', name: 'Lea', avatarUrl: null };
export const noraCrewBrief: PersonBrief = { memberId: 'm-crew-1', name: 'Nora', avatarUrl: null };
export const kaiBrief: PersonBrief = { memberId: 'm-crew-2', name: 'Kai', avatarUrl: null };
export const lenaBrief: PersonBrief = { memberId: 'm-crew-3', name: 'Lena', avatarUrl: null };
export const anaBrief: PersonBrief = { memberId: 'm-crew-4', name: 'Ana', avatarUrl: null };

/** A board of the crew's: Lea started it, everyone sees it and may change it. */
function crewBoard(over: Partial<BoardResponse>): BoardResponse {
  return board({ circleId: 'c-crew', mine: false, canEdit: true, chip: everyone, ...over });
}

// ---------- 19.3 when can everyone? ----------

/** Who can do which day of the three weeks from Monday 16 November 2026, as the drawing has it. */
const FREE: Record<string, PersonBrief[]> = {
  '2026-11-18': [leaBrief],
  '2026-11-20': [leaBrief, noraCrewBrief, lenaBrief],
  '2026-11-21': [leaBrief, noraCrewBrief, anaBrief],
  '2026-11-22': [lenaBrief, anaBrief],
  '2026-11-25': [noraCrewBrief],
  '2026-11-26': [leaBrief, lenaBrief],
  '2026-11-27': [leaBrief, lenaBrief, anaBrief],
  '2026-11-28': [leaBrief, noraCrewBrief, lenaBrief, anaBrief],
  '2026-11-29': [noraCrewBrief, lenaBrief, anaBrief],
  '2026-12-02': [anaBrief],
  '2026-12-04': [leaBrief, noraCrewBrief, lenaBrief],
  '2026-12-05': [leaBrief, noraCrewBrief, anaBrief],
  '2026-12-06': [noraCrewBrief, lenaBrief],
};

function offered(): FindDateDayResponse[] {
  return Array.from({ length: 21 }, (_, index) => {
    const date = new Date(2026, 10, 16 + index);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const who = FREE[day] ?? [];
    return { day, free: who.length, you: who.includes(noraCrewBrief), best: day === '2026-11-28', past: false, who, byLink: [] };
  });
}

/** The reunion dinner as Nora sees it: four have answered, Sat 28 Nov works for all of them, Kai has only looked. */
export function datesView(over: Partial<FindDateViewResponse> = {}): FindDateViewResponse {
  return {
    from: '2026-11-16',
    to: '2026-12-06',
    days: offered(),
    asked: 5,
    answered: 4,
    best: { day: '2026-11-28', free: 4, allWhoAnswered: true, everyone: false, names: ['Lea', 'Lena', 'Ana', 'you'] },
    waitingFor: [{ person: kaiBrief, you: false, opened: true, nudgedAt: null }],
    byLink: [],
    youAnswered: true,
    youCant: false,
    link: 'https://homeport.test/when/ejbsa-dzym2-4yg8b-gpd4n',
    askedAt: '2026-11-09T09:00:00Z',
    setFor: null,
    eventId: null,
    ...over,
  };
}

export function datesBoard(view: FindDateViewResponse = datesView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({ template: 'find_date', title: 'Reunion dinner', emoji: '📅', settings: { from: view.from, to: view.to, setFor: view.setFor, eventId: view.eventId }, view, ...over });
}

// ---------- 19.4 Secret Santa ----------

/** Secret Santa as Nora sees it after the draw: she has Lena, and nothing says who has her. */
export function santaView(over: Partial<SecretSantaViewResponse> = {}): SecretSantaViewResponse {
  return {
    drawn: true,
    drawnOn: '2026-11-01',
    names: [leaBrief, noraCrewBrief, kaiBrief, lenaBrief, anaBrief].map((person) => ({ id: `name-${person.name?.toLowerCase()}`, person, you: person === noraCrewBrief })),
    inTheHat: true,
    apart: [{ id: 'apart-1', a: leaBrief, b: kaiBrief, why: "They're a couple" }],
    budgetCents: 2500,
    currency: 'EUR',
    swapOn: '2026-11-28',
    swapAt: 'the reunion dinner',
    swapThing: { id: '44444444-4444-4444-8444-444444444444', kind: 'board', title: 'Reunion dinner' },
    yours: { person: lenaBrief, wishes: ['A plant that is hard to kill', 'Anything from the ceramics stall'], gotIt: false },
    myWishes: [
      { id: 'wish-socks', text: 'Good walking socks' },
      { id: 'wish-film', text: 'A roll of 35 mm film' },
    ],
    ...over,
  };
}

/** The same board before the names are drawn: nobody has a name, and the hat can still change. */
export const santaBeforeTheDraw: SecretSantaViewResponse = santaView({ drawn: false, drawnOn: null, yours: null });

export function santaBoard(view: SecretSantaViewResponse = santaView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({
    template: 'secret_santa',
    title: 'Secret Santa',
    emoji: '🎁',
    settings: { budgetCents: view.budgetCents, currency: view.currency, swapOn: view.swapOn, swapAt: view.swapAt, swapThingId: view.swapThing?.id ?? null, drawnOn: view.drawnOn },
    view,
    ...over,
  });
}

// ---------- 19.5 where next? ----------

export function idea(over: Partial<WhereNextIdeaResponse> = {}): WhereNextIdeaResponse {
  return { id: 'idea-porto', name: 'Porto', days: 4, costCents: 31000, currency: 'EUR', note: null, photo: picture('sea-cave'), addedBy: noraCrewBrief, mine: true, yours: true, votes: 3, percent: 60, voters: [noraCrewBrief, leaBrief, anaBrief], winner: true, ...over };
}

/** The vote as the drawing has it: all five voted, so it is closed and everyone sees who voted for what. Porto won. */
export function voteView(over: Partial<WhereNextViewResponse> = {}): WhereNextViewResponse {
  return {
    when: 'Spring 2027',
    closesOn: null,
    closed: true,
    asked: 5,
    voted: 5,
    waitingFor: [],
    youVoted: true,
    ideas: [
      idea(),
      idea({ id: 'idea-soca', name: 'The Soča valley, by bike', days: 3, costCents: 18000, photo: picture('terraces'), addedBy: kaiBrief, mine: false, yours: false, votes: 1, percent: 20, voters: [kaiBrief], winner: false }),
      idea({ id: 'idea-sicily', name: 'Sicily', days: 6, costCents: 52000, photo: picture('el-nido'), addedBy: lenaBrief, mine: false, yours: false, votes: 1, percent: 20, voters: [lenaBrief], winner: false }),
    ],
    winnerId: 'idea-porto',
    tied: false,
    tripFolderId: null,
    ...over,
  };
}

/**
 * The same vote while it is open, as the API sends it then: three of five have voted (Nora for Porto), and
 * no idea carries a count, a part or a voter. That is all a phone is given before the vote closes.
 */
export const voteOpen: WhereNextViewResponse = voteView({
  closed: false,
  voted: 3,
  waitingFor: [kaiBrief, lenaBrief],
  ideas: voteView().ideas.map((one) => ({ ...one, votes: null, percent: null, voters: [], winner: false })),
  winnerId: null,
});

export function voteBoard(view: WhereNextViewResponse = voteView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({ template: 'where_next', title: 'Where next?', emoji: '🌍', mine: true, settings: { when: view.when, closesOn: view.closesOn, closedAt: view.closed ? '2026-11-10T18:00:00Z' : null, tripFolderId: view.tripFolderId }, view, ...over });
}

// ---------- 19.6 the dictionary ----------

export function word(over: Partial<DictionaryWordResponse> = {}): DictionaryWordResponse {
  return {
    id: 'word-kai',
    word: 'doing a Kai',
    part: 'verb',
    meaning: 'Reaching the gate as it closes, with a pastry.',
    coinedBy: leaBrief,
    coinedByName: null,
    you: false,
    origin: 'Lisbon airport',
    firstRecorded: '2026-10-04',
    seeAlso: null,
    photo: picture('cappadocia'),
    addedAt: '2026-11-09T19:20:00Z',
    mine: false,
    ...over,
  };
}

export const wordRamiro = word({ id: 'word-ramiro', word: 'the Ramiro incident', part: 'noun', meaning: "We don't talk about the bill.", coinedBy: anaBrief, origin: null, firstRecorded: null, seeAlso: 'just one more plate', photo: null, addedAt: '2026-11-02T19:20:00Z' });
export const wordBreakfast = word({ id: 'word-breakfast', word: 'second breakfast', part: 'noun', meaning: 'Not optional. Scheduled.', coinedBy: noraCrewBrief, you: true, origin: 'every trip since 2019', firstRecorded: null, photo: null, addedAt: '2026-10-26T19:20:00Z', mine: true });
export const wordPlate = word({ id: 'word-plate', word: 'just one more plate', part: 'noun', meaning: 'The plate after the last plate. See: the Ramiro incident.', coinedBy: kaiBrief, origin: null, firstRecorded: null, photo: null, addedAt: '2026-10-12T19:20:00Z' });

/** The dictionary: 31 words, of which the board carries the newest. */
export function wordsView(over: Partial<DictionaryViewResponse> = {}): DictionaryViewResponse {
  return { total: 31, words: [word(), wordRamiro, wordBreakfast], ...over };
}

export function wordsBoard(view: DictionaryViewResponse = wordsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({ template: 'dictionary', title: 'The dictionary', emoji: '📄', settings: {}, view, ...over });
}

// ---------- 19.7 predictions ----------

function writer(person: PersonBrief, written: number, over: Partial<PredictionsWriterResponse> = {}): PredictionsWriterResponse {
  return { person, you: false, written, of: 4, drafts: 0, stillAbout: [], ...over };
}

/** One prediction as the API hands it over while it is sealed: who wrote it and about whom, and no words. */
export function sealedPrediction(by: PersonBrief, about: PersonBrief, over: Partial<PredictionsItemResponse> = {}): PredictionsItemResponse {
  return { id: `p-${by.name}-${about.name}`.toLowerCase(), by, about, mine: by === noraCrewBrief, draft: false, sealed: true, sealedAt: '2026-11-10T19:50:00Z', text: null, right: 0, wrong: 0, verdict: null, yourMark: null, ...over };
}

/**
 * Predictions for 2031 as Nora sees them, sealed: Lea and Lena have written all four, Ana two, Kai none, and
 * Nora three (the one about Kai is missing). Not one of the items carries its words, her own included.
 */
export function predictionsView(over: Partial<PredictionsViewResponse> = {}): PredictionsViewResponse {
  return {
    opensOn: '2031-10-04',
    occasion: 'the reunion',
    open: false,
    daysToGo: 1788,
    // In the circle's own order, as the API sends them: the screen puts the reader last.
    writers: [writer(leaBrief, 4), writer(noraCrewBrief, 3, { you: true, stillAbout: [kaiBrief] }), writer(kaiBrief, 0), writer(lenaBrief, 4), writer(anaBrief, 2)],
    items: [
      sealedPrediction(leaBrief, noraCrewBrief),
      sealedPrediction(leaBrief, kaiBrief),
      sealedPrediction(lenaBrief, noraCrewBrief),
      sealedPrediction(anaBrief, leaBrief),
      sealedPrediction(noraCrewBrief, leaBrief),
      sealedPrediction(noraCrewBrief, lenaBrief),
      sealedPrediction(noraCrewBrief, anaBrief),
    ],
    ...over,
  };
}

/** A draft of Nora's own, about Kai: the one thing of hers the API still sends in full. */
export const draftAboutKai: PredictionsItemResponse = sealedPrediction(noraCrewBrief, kaiBrief, { id: 'p-draft', draft: true, sealed: false, sealedAt: null, text: 'Still late. Still forgiven.' });

/** The day has come: everyone reads all of them, and marks the ones that aren't their own. */
export const predictionsOpened: PredictionsViewResponse = predictionsView({
  open: true,
  daysToGo: 0,
  writers: predictionsView().writers.map((one) => ({ ...one, stillAbout: [] })),
  items: [
    sealedPrediction(leaBrief, kaiBrief, { sealed: false, text: 'Still late. Now with a child who is also late.', right: 2, wrong: 1, verdict: 'right', yourMark: true }),
    sealedPrediction(lenaBrief, kaiBrief, { sealed: false, text: 'Owns exactly one suit and has worn it to all our weddings.' }),
    sealedPrediction(noraCrewBrief, leaBrief, { sealed: false, text: 'Organises the reunion, and has a laminated plan for it.', right: 3, wrong: 0, verdict: 'right' }),
  ],
});

export function predictionsBoard(view: PredictionsViewResponse = predictionsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({ template: 'predictions', title: 'Predictions for 2031', emoji: '🔮', settings: { opensOn: view.opensOn, occasion: view.occasion }, view, ...over });
}

// ---------- 19.8 the awards ----------

export function nominee(person: PersonBrief, over: Partial<AwardsNomineeResponse> = {}): AwardsNomineeResponse {
  return { id: `nominee-${person.name}`.toLowerCase(), person, what: null, photo: null, namedBy: leaBrief, mine: false, votes: null, winner: false, ownVoteIncluded: false, ...over };
}

export function award(over: Partial<AwardsAwardResponse> = {}): AwardsAwardResponse {
  return {
    id: 'award-flight',
    name: 'Most likely to miss the flight',
    emoji: '🏆',
    decided: true,
    voted: 5,
    asked: 5,
    youVoted: true,
    yourNomineeId: 'nominee-kai',
    totalVotes: 5,
    nominees: [nominee(kaiBrief, { votes: 4, winner: true, ownVoteIncluded: true }), nominee(leaBrief, { what: 'the Porto bus', votes: 1 })],
    mine: false,
    ...over,
  };
}

/** An award that is still open, as the API sends it: how many have voted, and no nominee carries a count. */
export const awardOpen = award({
  id: 'award-idea',
  name: 'Worst idea that worked',
  decided: false,
  voted: 3,
  youVoted: false,
  yourNomineeId: null,
  totalVotes: null,
  nominees: [nominee(kaiBrief, { id: 'nominee-flight', what: 'booking the 6 a.m. flight' }), nominee(leaBrief, { id: 'nominee-shortcut', what: 'the shortcut through the cemetery' })],
});

/** The 2026 awards as the drawing has them: three decided, two still voting, three earlier years on the shelf. */
export function awardsView(over: Partial<AwardsViewResponse> = {}): AwardsViewResponse {
  return {
    year: 2026,
    opensOn: '2026-12-31',
    open: false,
    daysToGo: 50,
    awards: [
      award(),
      award({ id: 'award-find', name: 'Find of the year', yourNomineeId: 'nominee-lena', nominees: [nominee(lenaBrief, { what: 'the tiled bar in Alfama', votes: 3, winner: true }), nominee(anaBrief, { what: 'the bakery with no sign', votes: 2 })] }),
      award({ id: 'award-photo', name: 'Photo of the year', emoji: '📷', yourNomineeId: 'nominee-ana', nominees: [nominee(anaBrief, { what: 'the market at six in the morning', photo: picture('market'), votes: 4, winner: true }), nominee(noraCrewBrief, { what: 'the tram in the rain', votes: 1 })] }),
      awardOpen,
      award({ ...awardOpen, id: 'award-cooked', name: 'Best thing anyone cooked', voted: 2, nominees: [nominee(anaBrief, { id: 'nominee-clams', what: 'the clams' }), nominee(lenaBrief, { id: 'nominee-breakfast', what: 'second breakfast, obviously' })] }),
    ],
    years: [2025, 2024, 2023],
    ...over,
  };
}

/** An earlier year, read with `show`: everything on it is decided. */
export const awards2025: AwardsViewResponse = awardsView({
  year: 2025,
  opensOn: '2025-12-31',
  open: true,
  daysToGo: 0,
  awards: [award({ id: 'award-turn', name: 'Best wrong turn', voted: 4, totalVotes: 4, yourNomineeId: 'nominee-lena', nominees: [nominee(lenaBrief, { votes: 4, winner: true, ownVoteIncluded: true })] })],
  years: [2026, 2024, 2023],
});

export function awardsBoard(view: AwardsViewResponse = awardsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({ template: 'awards', title: 'The 2026 awards', emoji: '⭐', settings: {}, view, ...over });
}

// ---------- 19.9 a goal you walk together ----------

/** The walk to Lisbon: 1,240 of 2,100 km, and 152 km this week between the five. Every amount is in metres. */
export function walkView(over: Partial<WalkTogetherViewResponse> = {}): WalkTogetherViewResponse {
  return {
    from: 'Ljubljana',
    to: 'Lisbon',
    unit: 'km',
    goal: 2_100_000,
    total: 1_240_000,
    percent: 59,
    reached: false,
    weekStart: '2026-11-09',
    thisWeek: 152_000,
    people: [
      { person: leaBrief, you: false, thisWeek: 44_000, total: 324_000 },
      { person: lenaBrief, you: false, thisWeek: 38_000, total: 288_000 },
      { person: noraCrewBrief, you: true, thisWeek: 31_000, total: 261_000 },
      { person: anaBrief, you: false, thisWeek: 27_000, total: 227_000 },
      { person: kaiBrief, you: false, thisWeek: 12_000, total: 140_000 },
    ],
    stops: [
      { id: 'stop-milan', name: 'Milan', at: 490_000, reached: true },
      { id: 'stop-lyon', name: 'Lyon', at: 950_000, reached: true },
      { id: 'stop-madrid', name: 'Madrid', at: 1_580_000, reached: false },
    ],
    yours: [
      { id: 'walk-monday', day: '2026-11-09', amount: 31_000 },
      { id: 'walk-saturday', day: '2026-11-07', amount: 28_750 },
    ],
    ...over,
  };
}

export function walkBoard(view: WalkTogetherViewResponse = walkView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return crewBoard({ template: 'walk_together', title: 'Walk to Lisbon', emoji: '🏃', settings: { from: view.from, to: view.to, goal: view.goal, unit: view.unit }, view, ...over });
}
