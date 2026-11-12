/** Circles: which one you are in, the sheet that changes it, a circle's own settings and (2.6) what each kind gets. */
import { plural, spelled } from './plural';

/** "Biscuit", "Biscuit and Momo", "3 pets". */
const petsLine = (pets: readonly string[]) => (pets.length > 2 ? `${pets.length} pets` : pets.join(' and '));

/** "the five", "both": everyone in a circle, counted. */
const theLot = (people: number) => (people === 2 ? 'both' : `the ${spelled(people)}`);

export const circles = {
  /** The round button in Home's search pill. */
  switchLabel: (circle: string) => `${circle}. Change circle`,

  /** How many are in it: "4 people and Biscuit", "2 people", "Just you". Pets are named, not counted. */
  people: (people: number, pets: readonly string[] = []) => {
    const counted = people <= 1 && pets.length === 0 ? 'Just you' : plural(people, 'person', 'people');
    return pets.length ? `${counted} and ${petsLine(pets)}` : counted;
  },

  // 3.2 Your circles
  yours: {
    title: 'Your circles',
    justMe: 'Just me',
    onlyYou: (count: number) => (count === 1 ? '1 thing only you can see' : `${count} things only you can see`),
    newCircle: { label: 'New circle', note: 'Family, friends, housemates, a club' },
    /** A row, for a screen reader. */
    row: (name: string, line: string, current: boolean) => (current ? `${name}. ${line}. You are here` : `${name}. ${line}`),
    /** On the page that lists them (You): what a row opens. */
    open: (name: string, line: string) => `${name}. ${line}. Open its settings`,
  },

  // A circle's own settings
  settings: {
    title: 'Circle settings',
    name: 'Name of the circle',
    save: 'Save',
    saved: 'Saved',
    kind: 'Kind of circle',
    people: 'People',
    passes: { label: 'Guest passes', note: 'For someone who is not in the circle, for a while' },
    link: 'The link to join',
    linkNote: 'Anyone with this link can join. A new link makes the old one stop working.',
    newLink: 'Make a new link',
    newLinkAsk: { title: 'Make a new link?', body: 'The old link stops working at once. People who joined already stay.', confirm: 'Make a new link' },
    notYours: 'Only the people who run this circle can change it.',
  },

  // 2.6 What each kind gets
  kinds: {
    title: 'Kind of circle',
    /** "Lisbon crew is set up for friends" */
    setUpFor: (circle: string, forWhom: string) => `${circle} is set up for ${forWhom}`,
    forWhom: { family: 'a family', couple: 'a couple', flat: 'housemates', crew: 'friends', solo: 'just you' },
    labels: { called: "You're called", begin: 'To begin with', spaces: 'Spaces', templates: 'Templates', keepsakes: 'Keepsakes', fair: 'Fair and fun' },
    /** The six rows, by kind. `people` is how many are in the circle. */
    rows: {
      family: {
        begin: () => 'Roles for adults and children, and everything starts as only you',
        spaces: 'Home · Kids · Trips',
        templates: '53, from the meal plan to babysitter notes',
        keepsakes: 'Time capsule · Things they said · The doorframe',
        fair: 'Whose turn? · The piggy bank · Habit charts',
      },
      couple: {
        begin: () => 'Equals, and everything shared with both',
        spaces: 'Our place · Money · Trips · Someday',
        templates: '16, from date ideas to who pays what',
        keepsakes: 'Our story · Tucked notes · The anniversary questions',
        fair: 'Mystery date · Both said yes · The fair share',
      },
      flat: {
        begin: (people: number) => (people > 1 ? `Everyone equal, everything shared with ${theLot(people)}` : 'Everyone equal, everything shared with the flat'),
        spaces: 'The flat · Bills · Landlord',
        templates: '15, from the cleaning rota to bills by nights',
        keepsakes: "Heard in the kitchen · The guest book · Everyone who's lived here",
        fair: 'The kitty · A fairer split · Heads-up',
      },
      crew: {
        begin: (people: number) => (people > 1 ? `Everyone equal, everything shared with ${theLot(people)}` : 'Everyone equal, everything shared with the crew'),
        spaces: 'Trips · Plans · The dictionary',
        templates: '17, from Secret Santa to splitting costs',
        keepsakes: 'The dictionary · Predictions · The awards',
        fair: 'Find a date · Where next? · Draw names',
      },
      solo: {
        begin: () => 'Everything is yours alone',
        spaces: 'Yours to make',
        templates: 'All of them, under All',
        keepsakes: 'Yours to choose',
        fair: 'More fun with someone else',
      },
    },
    note: { title: 'Changing the kind deletes nothing', body: 'It changes what is suggested from now on. Any template can still be found under All.' },
  },
} as const;
