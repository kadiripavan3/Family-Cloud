/** 2 Set up a circle: the steps after the profile is made, and again from "New circle". Also joining one by a link. */
import { APP, JOURNEY } from './names';
import { formatList, spelled } from './plural';

/** How many templates each kind of circle starts with. Fixed numbers from the designs. */
const TEMPLATES = { family: 53, couple: 16, flat: 15, crew: 17 } as const;

export const setup = {
  title: 'Set up a circle',

  // 2.1 Who is it for?
  kind: {
    title: 'Who are you sharing with?',
    lead: 'A circle is the people you share with. Start with one; you can have several.',
    /** The four cards, by kind of circle. */
    cards: {
      family: 'Adults, children and grandparents, each with their own view',
      couple: 'Two people. Shared by default, private when you say so',
      flat: 'Bills, chores and the Wi‑Fi password',
      crew: 'A trip, a club, or a group that splits costs',
    },
    /** A circle of one, to share from later. */
    justMe: 'Just me for now',
    justMeRest: 'share later',
    /** The name a new circle starts with, until the person types their own. `last` is their family name, when they have one. */
    suggested: {
      family: (last: string) => (last ? `The ${last}s` : 'My family'),
      couple: (first: string) => (first ? `${first} and …` : 'The two of us'),
      flat: 'Our flat',
      crew: 'The crew',
    },
  },

  // 2.5 Made for your kind of circle: what choosing a kind gave you
  made: {
    because: (kind: string) => `Because you chose ${kind}, you start with this.`,
    fine: "You can change the kind later. Nothing you've kept is lost.",
    couple: {
      title: 'Made for two',
      rows: [
        { icon: 'type', label: 'Its own words', note: '“The two of you”, “ours”. Never “members”.' },
        { icon: 'users', label: 'Shared unless you say otherwise', note: "And no roles: you're equals" },
        { icon: 'folder', label: 'Four spaces to begin with', note: 'Our place · Money · Trips · Someday' },
        { icon: 'file', label: `${TEMPLATES.couple} templates for couples`, note: 'Date ideas, who pays what, moving in' },
        { icon: 'gift', label: 'Keepsakes and small rituals', note: 'Our story, tucked notes, mystery dates' },
      ],
    },
    flat: {
      title: 'Made for a shared home',
      rows: [
        { icon: 'type', label: 'Its own words', note: '“The flat”, “housemates”. Never “members”.' },
        { icon: 'users', label: 'Shared with the flat unless you say otherwise', note: 'And no roles: decisions are made by everyone' },
        { icon: 'folder', label: 'Three spaces to begin with', note: 'The flat · Bills · Landlord' },
        { icon: 'file', label: `${TEMPLATES.flat} templates for housemates`, note: 'Cleaning rota, bills by nights, the repair log' },
        { icon: 'gift', label: 'Fairness and a few keepsakes', note: 'The kitty, a fairer split, the guest book' },
      ],
    },
    crew: {
      title: 'Made for friends',
      rows: [
        { icon: 'type', label: 'Its own words', note: '“The crew”, “all of you”. Never “members”.' },
        { icon: 'users', label: 'Shared with the crew unless you say otherwise', note: "And no roles: you're equals" },
        { icon: 'folder', label: 'Three spaces to begin with', note: 'Trips · Plans · The dictionary' },
        { icon: 'file', label: `${TEMPLATES.crew} templates for friends`, note: 'Secret Santa, where next?, who brings what' },
        { icon: 'gift', label: 'Keepsakes and ways to decide', note: 'The dictionary, predictions, find a date' },
      ],
    },
  },

  // 2.2 Name it and invite people
  people: {
    title: "Who's in it?",
    name: 'Name of the circle',
    /** Under each person's name. */
    owner: 'Owner',
    started: 'Started this circle',
    invited: 'Invited by email',
    noPhone: 'No phone needed',
    noPhoneChild: 'No phone needed · you look after their things',
    add: { label: 'Add someone', note: 'A person, a child or a pet', person: 'Add someone', notePerson: 'By email. They get an invitation' },
    linkNote: 'Anyone with this link can join. You can make a new one in the circle’s settings.',
    role: (name: string, role: string) => `${name}: ${role}. Change role`,
    roles: { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', guest: 'Guest' },
    roleTitle: (name: string) => `${name}'s role`,
    roleNotes: {
      adult: 'Sees what is shared with the family, Money and the Vault too',
      teen: 'Like an adult, without Money and the Vault',
      child: 'The fun parts: photos, the calendar, their own lists',
    },
  },

  // Adding someone: a person by email, a child or a pet without a phone
  add: {
    title: 'Add someone',
    kind: 'Who is it?',
    kinds: { person: 'A person', child: 'A child', pet: 'A pet' },
    name: 'Name',
    email: 'Their email',
    emailNote: 'They get an invitation to join.',
    childNote: "A child needs no phone. You look after their things until they're older.",
    about: 'What kind of pet',
    aboutPlaceholder: 'Dog',
    birthday: 'Birthday',
    noBirthday: 'Add it',
    birthdayTitle: 'Their birthday',
    confirm: 'Add',
    invite: 'Send the invitation',
  },

  // 2.3 Bring your things in
  bringIn: {
    title: 'Bring your things in',
    lead: 'Pick what to start with. You can add the rest any time.',
    photos: { label: 'Photos on this phone', note: 'On Wi‑Fi · starts with the Library, on your phone' },
    journey: { label: JOURNEY, note: 'What you posted there · starts with the link' },
    calendars: { label: 'Calendars', note: 'Apple and Google · starts with Plan, on your phone' },
    notes: { label: 'Notes', note: 'Apple Notes, Notion or Evernote', later: 'Bringing notes in arrives with Notes: you pick the files those apps export.' },
    passwords: { label: 'Passwords', note: 'iCloud Keychain, 1Password or a file', later: 'Bringing passwords in arrives with the Vault: you pick the file your password app exports.' },
    /** Under the rows, once a switch was pressed: what switching it on does today. */
    laterNote: `Your choices are remembered. Each one starts by itself when its part of ${APP} is built; photos and calendars also need ${APP} on your phone.`,
    startsAs: { title: 'It all starts as “Only you”', body: 'Nothing you bring in is shared until you share it.' },
    go: 'Bring them in',
    /** With nothing switched on. */
    goNone: 'Continue',
  },

  // 2.4 All set
  ready: {
    title: (circle: string) => `${circle} is ready`,
    /** Under the title: who was invited, and what was asked to come in. */
    lead: (invited: readonly string[], bringing: boolean) => {
      const invitations = invited.length === 0 ? null : invited.length === 1 ? `${invited[0]} has an invitation.` : `${formatList(invited)} have their invitations.`;
      const coming = bringing ? `What you asked to bring in comes in as each part of ${APP} is built.` : null;
      return [invitations, coming].filter(Boolean).join(' ') || "It's yours alone until you share something.";
    },
    /** Three first things to do, by kind of circle. `rest` follows the bold part after a dot. */
    week: {
      family: { label: 'Add this week', rest: 'school, bins, dentist' },
      couple: { label: 'Add this week', rest: 'date night, the dentist, the bins' },
      flat: { label: 'Add this week', rest: 'bins, the cleaning, rent day' },
      crew: { label: 'Add the next plan', rest: 'a dinner, a trip, a match' },
      solo: { label: 'Add this week', rest: 'appointments, bins, a birthday' },
    },
    template: {
      label: 'Start from a template',
      rest: { family: `${TEMPLATES.family} ready to use`, couple: `${TEMPLATES.couple} ready to use`, flat: `${TEMPLATES.flat} ready to use`, crew: `${TEMPLATES.crew} ready to use`, solo: 'ready to use' },
    },
    password: { label: 'Keep your first password', rest: 'the Wi‑Fi?' },
  },

  // Joining a circle by a link
  join: {
    title: (circle: string) => `Join ${circle}?`,
    /** `line` is "Family · 5 people". */
    lead: (line: string) => `${line}. You'll see what they share with everyone, and what you add starts as the circle's kind says.`,
    join: 'Join',
    already: (circle: string) => `You're already in ${circle}`,
    alreadyBody: 'This link is for a circle you are in.',
    open: (circle: string) => `Open ${circle}`,
    people: (count: number) => `${spelled(count)} ${count === 1 ? 'person' : 'people'}`,
  },
} as const;
