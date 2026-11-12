import type {
  BirthdayInterviewView,
  BoardResponse,
  DoorframeView,
  GoodJarSlip,
  GoodJarView,
  OpenWhenLetter,
  OpenWhenView,
  SaidQuote,
  SaidView,
  SameSpotView,
  StoriesQuestion,
  StoriesView,
} from '@/api/generated/homeport';

import { withAlex } from './spine';
import { alexBrief, board, leoBrief, miaBrief, noraBrief, picture, recording } from './templates';

/**
 * Made-up answers for the tests of Keepsakes: whole objects, the way the API sends them. Import them from
 * '@/test/samples/keepsakes'; the people and circles every test shares are in '@/test/samples'.
 */

// ---------- 15.1 Open when… ----------

export function letter(over: Partial<OpenWhenLetter> = {}): OpenWhenLetter {
  return { id: 'letter-sleep', when: "you can't sleep", emoji: '🌙', from: noraBrief, mine: true, opened: false, openedAt: null, openedBy: null, hasVoice: false, forwardOn: null, canOpen: true, text: 'Count the stars on your ceiling.', voice: null, ...over };
}

/** The letters for Mia as Nora, who wrote them, sees them: one opened, one with a voice, one that comes forward. */
export function lettersView(over: Partial<OpenWhenView> = {}): OpenWhenView {
  return {
    forPerson: miaBrief,
    youAreTheReader: false,
    youOpenForThem: true,
    sealed: 3,
    opened: 1,
    letters: [
      letter(),
      letter({ id: 'letter-bad-day', when: "you've had a bad day", emoji: '🌧️', opened: true, openedAt: '2026-11-02T21:40:00', openedBy: noraBrief, canOpen: false, text: 'First: it is allowed.' }),
      letter({ id: 'letter-school', when: "it's your first day at big school", emoji: '🎒', hasVoice: true, voice: recording(48) }),
      letter({ id: 'letter-away', when: "I'm away and you miss me", emoji: '✈️', forwardOn: 'journey' }),
    ],
    ...over,
  };
}

/** The same envelopes as the person they are for sees them: nothing inside until one is opened. */
export const lettersForReader: OpenWhenView = lettersView({
  forPerson: alexBrief,
  youAreTheReader: true,
  youOpenForThem: false,
  letters: [letter({ mine: false, text: null }), letter({ id: 'letter-bad-day', when: "you've had a bad day", emoji: '🌧️', mine: false, opened: true, openedAt: '2026-11-02T21:40:00', openedBy: alexBrief, canOpen: false, text: 'First: it is allowed.' })],
});

export function lettersBoard(view: OpenWhenView = lettersView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'open_when', title: 'Open when…', emoji: '💌', chip: { audience: 'some', people: [miaBrief], hiddenFrom: [] }, settings: { forMemberId: view.forPerson?.memberId ?? 'm-mia' }, view, ...over });
}

// ---------- 15.2 the birthday interview ----------

export function interviewView(over: Partial<BirthdayInterviewView> = {}): BirthdayInterviewView {
  return {
    person: miaBrief,
    birthday: '2016-12-04',
    ages: [7, 8, 9],
    next: { age: 10, on: '2026-12-04', inDays: 23, line: "Mia's 10th is in 23 days" },
    questions: [
      {
        id: 'q-be',
        text: 'What do you want to be?',
        answers: [
          { id: 'a-be-7', age: 7, text: 'A vet', voice: null, latest: false },
          { id: 'a-be-8', age: 8, text: 'A vet with a horse', voice: recording(13), latest: false },
          { id: 'a-be-9', age: 9, text: 'A marine biologist. With a horse.', voice: recording(14), latest: true },
        ],
      },
      { id: 'q-food', text: "What's the best food in the world?", answers: [{ id: 'a-food-9', age: 9, text: 'Sushi. And pancakes.', voice: null, latest: true }] },
      { id: 'q-laugh', text: 'What makes you laugh the most?', answers: [] },
    ],
    ...over,
  };
}

export function interviewBoard(view: BirthdayInterviewView = interviewView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'birthday_interview', title: "Mia's birthday interview", emoji: '🎂', chip: withAlex, settings: { forMemberId: 'm-mia' }, view, ...over });
}

// ---------- 15.3 Things they said ----------

export function quote(over: Partial<SaidQuote> = {}): SaidQuote {
  return { id: 'quote-heavy', text: "I'm not tired. My eyes are just heavy.", who: leoBrief, whoName: null, day: '2026-11-10', ageYears: 6, ageMonths: 7, age: '6 years and 7 months', voice: recording(6), writtenBy: noraBrief, mine: true, ...over };
}

export const quoteBoss = quote({ id: 'quote-boss', text: "When I'm grown up I'll still live here, but I'll be the boss.", who: miaBrief, day: '2024-01-12', ageYears: 7, ageMonths: 1, age: '7 years and 1 month', voice: recording(9), writtenBy: alexBrief, mine: false });
export const quoteMoon = quote({ id: 'quote-moon', text: 'The moon is following our car.', day: '2024-12-20', ageYears: 4, ageMonths: 9, age: '4 years and 9 months', voice: null });

export function saidView(over: Partial<SaidView> = {}): SaidView {
  return {
    total: 86,
    withVoice: 2,
    people: [
      { person: leoBrief, count: 44 },
      { person: miaBrief, count: 42 },
    ],
    latest: [quote(), quoteBoss, quoteMoon],
    ...over,
  };
}

export function saidBoard(view: SaidView = saidView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'said', title: 'Things they said', emoji: '💬', settings: {}, view, ...over });
}

// ---------- 15.4 Same spot, every year ----------

export function spotView(over: Partial<SameSpotView> = {}): SameSpotView {
  const shot = (year: number) => ({ id: `shot-${year}`, year, day: `${year}-09-01`, photo: picture(`spot-${year}`), note: null });
  return { thisYear: 2026, takenThisYear: false, last: shot(2025), years: [shot(2023), shot(2024), shot(2025)], around: '09-01', ...over };
}

export function spotBoard(view: SameSpotView = spotView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'same_spot', title: 'First day of school', emoji: '📷', settings: { around: view.around }, view, ...over });
}

// ---------- 15.5 Grandma's stories ----------

export function story(over: Partial<StoriesQuestion> = {}): StoriesQuestion {
  return { id: 'story-job', text: 'What was your very first job?', askedBy: noraBrief, goesOut: '2026-11-08', out: true, answered: true, answeredAt: '2026-11-10T16:20:00', recording: recording(192), transcript: '', photos: [], link: null, ...over };
}

export function storiesView(over: Partial<StoriesView> = {}): StoriesView {
  return {
    tellerName: 'Astrid Lind',
    initials: 'AL',
    sendsOn: 'sunday',
    told: 14,
    thisWeek: story(),
    toldBefore: [
      story({ id: 'story-grandpa', text: 'How did you meet Grandpa?', goesOut: '2026-11-01', answeredAt: '2026-11-03T11:30:00', recording: recording(280), transcript: 'At a dance in Kiruna.', photos: [picture('g1'), picture('g2'), picture('g3')] }),
      story({ id: 'story-kitchen', text: 'What did your kitchen smell like?', goesOut: '2026-10-25', answeredAt: '2026-10-28T11:30:00', recording: recording(125) }),
    ],
    waiting: [story({ id: 'story-trouble', text: 'Were you ever in trouble at school?', askedBy: miaBrief, goesOut: '2026-11-15', out: false, answered: false, answeredAt: null, recording: null })],
    unanswered: [],
    ...over,
  };
}

/** This week's question while it waits for its answer: it has the link to send. */
export const storyWaiting = story({ id: 'story-winter', text: 'What did winter look like when you were a child?', answered: false, answeredAt: null, recording: null, link: 'https://homeport.app/s/abc123' });

export function storiesBoard(view: StoriesView = storiesView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'stories', title: "Astrid's stories", emoji: '📓', settings: { tellerName: view.tellerName, sendsOn: view.sendsOn }, view, ...over });
}

// ---------- 15.6 the good things jar ----------

export function slip(over: Partial<GoodJarSlip> = {}): GoodJarSlip {
  return { id: 'slip-drawing', who: leoBrief, what: 'drawing', day: '2026-11-11', place: null, fromJourney: false, mine: true, sealed: false, text: 'Leo drew all five of us on the tricycle.', picture: picture('drawing'), ...over };
}

export function jarView(over: Partial<GoodJarView> = {}): GoodJarView {
  return {
    year: 2026,
    count: 143,
    opensOn: '2026-12-31',
    open: false,
    daysToGo: 50,
    latest: [slip(), slip({ id: 'slip-reine', who: alexBrief, what: 'note', day: '2026-11-10', place: 'Reine', fromJourney: true, mine: false, sealed: true, text: null, picture: null })],
    years: [],
    ...over,
  };
}

export function jarBoard(view: GoodJarView = jarView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'good_jar', title: 'The good things jar', emoji: '✨', settings: {}, view, ...over });
}

// ---------- 15.7 the doorframe ----------

export function doorView(over: Partial<DoorframeView> = {}): DoorframeView {
  const mark = (id: string, person: typeof miaBrief, heightMm: number, day: string, latest = false) => ({ id, person, heightMm, day, note: null, photo: null, grewMm: null, latest });
  return {
    marks: [
      mark('mark-mia-26', miaBrief, 1380, '2026-11-02', true),
      mark('mark-mia-25', miaBrief, 1320, '2025-12-06'),
      mark('mark-mia-24', miaBrief, 1260, '2024-12-06'),
      mark('mark-leo-26', leoBrief, 1190, '2026-11-02', true),
      mark('mark-leo-25', leoBrief, 1120, '2025-09-15'),
      mark('mark-leo-24', leoBrief, 1050, '2024-09-15'),
    ],
    children: [
      { person: miaBrief, heightMm: 1380, measuredOn: '2026-11-02', sinceLastMm: 60, lastMarkOn: '2025-12-06', sinceBirthdayMm: 60, thisYearMm: 60, mostYet: false, landmark: "Up to Grandma Astrid's shoulder", lines: ['6 cm since the last birthday', "Up to Grandma Astrid's shoulder"] },
      { person: leoBrief, heightMm: 1190, measuredOn: '2026-11-02', sinceLastMm: 70, lastMarkOn: '2025-09-15', sinceBirthdayMm: null, thisYearMm: 70, mostYet: true, landmark: 'Tall enough for the big slide', lines: ['7 cm this year, the most yet', 'Tall enough for the big slide'] },
    ],
    comparisons: ["Mia was Leo's height in the spring of 2023."],
    landmarks: [{ id: 'landmark-shoulder', text: "Up to Grandma Astrid's shoulder", heightMm: 1370 }],
    ...over,
  };
}

export function doorBoard(view: DoorframeView = doorView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'doorframe', title: 'The doorframe', emoji: '🚪', settings: {}, view, ...over });
}
