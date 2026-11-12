/**
 * What depends on the kind of circle: what its people are called, what "everyone" means there, and its
 * emoji. A screen asks `words.kinds[circle.kind]` and never picks one of these words itself.
 */

type Kind = {
  /** Drawn with `Emoji`: on the round button of Home's search pill, on a circle's chip, beside "Everyone in…". */
  emoji: string;
  /** The kind's own name: on its card at setup, and in "Family · 4 people". */
  name: string;
  /** The same on the control that changes a circle's kind, where there is little room. */
  short: string;
  /** What its people are called, in the middle of a sentence: "shared with the flat". */
  called: string;
  /** The same at the start of one. */
  calledFirst: string;
  /** Everyone in the circle, as who a thing is shared with: "Everyone in The Linds". */
  everyone: (circle: string) => string;
  /** The same on the small audience chip, where the circle's emoji stands before it. */
  chip: (circle: string) => string;
  /** What a new thing starts as in a circle of this kind. */
  startsAs: string;
};

const family: Kind = {
  emoji: '👪',
  name: 'Family',
  short: 'Family',
  called: 'the family',
  calledFirst: 'The family',
  everyone: (circle) => `Everyone in ${circle}`,
  chip: (circle) => circle,
  startsAs: 'Only you, until shared',
};

const couple: Kind = {
  emoji: '❤️',
  name: 'Couple',
  short: 'Couple',
  called: 'the two of you',
  calledFirst: 'The two of you',
  everyone: () => 'The two of you',
  chip: () => 'The two of you',
  startsAs: 'Shared with both',
};

const flat: Kind = {
  emoji: '🏠',
  name: 'Housemates',
  short: 'Flat',
  called: 'the flat',
  calledFirst: 'The flat',
  everyone: () => 'Everyone in the flat',
  chip: () => 'The flat',
  startsAs: 'Shared with the flat',
};

const crew: Kind = {
  emoji: '🤝',
  name: 'Friends',
  short: 'Friends',
  called: 'the crew',
  calledFirst: 'The crew',
  everyone: (circle) => `Everyone in ${circle}`,
  chip: (circle) => circle,
  startsAs: 'Shared with the crew',
};

/** A circle of one: "Just me for now". */
const solo: Kind = {
  emoji: '🔒',
  name: 'Just me',
  short: 'Just me',
  called: 'you',
  calledFirst: 'You',
  everyone: () => 'Only you',
  chip: () => 'Only you',
  startsAs: 'Only you',
};

export const kinds = { family, couple, flat, crew, solo } as const;
