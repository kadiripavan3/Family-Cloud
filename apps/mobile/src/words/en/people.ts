/** 4 People: the people in a circle, a person's page, a guest pass, a child's view. */
import { mark, type Rich } from '../rich';
import { formatList, plural } from './plural';

/** What is shared in a circle, counted by what people call it: pages and lists are "notes". */
const COUNTED: Record<string, [one: string, many: string]> = {
  photo: ['photo', 'photos'],
  video: ['photo', 'photos'],
  page: ['note', 'notes'],
  checklist: ['note', 'notes'],
  event: ['event', 'events'],
  reminder: ['reminder', 'reminders'],
  bill: ['bill', 'bills'],
  sheet: ['sheet', 'sheets'],
  vault_item: ['password', 'passwords'],
  password: ['password', 'passwords'],
};

const number = (count: number) => count.toLocaleString('en-US');

export const people = {
  title: 'People',
  invite: 'Invite someone',
  inviteNote: 'Grandparents, a sitter for one evening, a friend',
  inThisCircle: 'In this circle',
  you: 'You',

  /**
   * The sentence under the circle chips: "Family · since March 2024 · 3,180 photos, 214 notes and 31
   * passwords shared here." The numbers are marked "bold". `shared` is how many things of each kind are
   * shared with the reader in the circle.
   */
  summary: (kind: string, since: string, shared: Record<string, number>): Rich => {
    const totals = new Map<string, { one: string; many: string; count: number }>();
    for (const [what, count] of Object.entries(shared)) {
      if (count <= 0) continue;
      const [one, many] = COUNTED[what] ?? ['other thing', 'other things'];
      const total = totals.get(many) ?? { one, many, count: 0 };
      total.count += count;
      totals.set(many, total);
    }
    const start = `${kind} · since ${since}`;
    const counts = [...totals.values()];
    if (counts.length === 0) return [`${start} · nothing shared here yet.`];
    const parts: (string | ReturnType<typeof mark>)[] = [`${start} · `];
    counts.forEach((total, index) => {
      if (index > 0) parts.push(index === counts.length - 1 ? ' and ' : ', ');
      parts.push(mark('bold', number(total.count)), ` ${total.count === 1 ? total.one : total.many}`);
    });
    parts.push(' shared here.');
    return parts;
  },

  /** What each role is called. */
  roles: { owner: 'Owner', adult: 'Adult', teen: 'Teen', child: 'Child', guest: 'Guest' },

  /** The line under a person's name in the list, worked out from who they are. */
  line: {
    /** Someone with a role, in a family. `age` when their birthday is known. */
    role: (role: string, age: number | null) => (age === null ? role : `${role}, ${age}`),
    /** Among equals. */
    started: 'Started this circle',
    joined: 'In this circle',
    invited: 'invited',
    invitedOnly: 'Invited',
    birthdayIn: (days: number) => (days === 0 ? 'birthday today' : days === 1 ? 'birthday tomorrow' : `birthday in ${days} days`),
    noPhone: 'no phone, you look after their things',
    /** A pet: what it is, and where its things are. */
    pet: (about: string) => `${about || 'Pet'} · vet, food and walks on their page`,
    open: (name: string, line: string) => `${name}. ${line}. Open their page`,
  },

  // 4.2 A person's page
  person: {
    more: 'More',
    /** Under the name: "9 years old · Child in The Linds". */
    years: (age: number) => (age === 1 ? '1 year old' : `${age} years old`),
    roleIn: (role: string, circle: string) => `${role} in ${circle}`,
    in: (circle: string) => `In ${circle}`,
    petIn: (about: string, circle: string) => `${about || 'Pet'} in ${circle}`,
    birthday: {
      in: (days: number) => (days === 0 ? 'Birthday today' : days === 1 ? 'Birthday tomorrow' : `Birthday in ${days} days`),
      /** "Fri 4 Dec · turns 10 · something is hidden from Mia until then" */
      turns: (age: number) => `turns ${age}`,
      hidden: (name: string) => `a plan is hidden from ${name}`,
    },
    facts: { edit: 'Edit', add: 'Add a fact', title: (name: string) => `About ${name}`, hint: 'Short facts worth having to hand: a shoe size, a class, an allergy.', field: 'A fact', placeholder: 'Shoes 33', addButton: 'Add', remove: (fact: string) => `Remove ${fact}`, save: 'Save' },
    comingUp: 'Coming up',
    kept: (name: string) => `Kept for ${name}`,
    keptYou: 'Kept for you',
    keptEmpty: (name: string) => `Nothing yet. Whatever is kept about ${name} and shared with you shows here.`,

    // The more menu
    menu: {
      title: (name: string) => name,
      picture: 'Change picture',
      birthday: 'Birthday',
      birthdayNone: 'Not set',
      birthdayTitle: (name: string) => `${name}'s birthday`,
      removeBirthday: 'Remove the birthday',
      role: 'Role and what they can see',
      remove: (circle: string) => `Remove from ${circle}`,
    },
    removeAsk: {
      title: (name: string, circle: string) => `Remove ${name} from ${circle}?`,
      body: (name: string) => `${name} stops seeing what is shared here. What they kept themselves stays theirs.`,
      confirm: (name: string) => `Remove ${name}`,
    },
  },

  // 4.6 A child's view
  access: {
    role: 'Role',
    can: (name: string) => `${name} can`,
    library: { label: "See the family's photos", note: 'And add their own, and their drawings' },
    plan: { label: 'See the calendar and their jobs', note: 'Tick them off, earn stars' },
    pages: { label: 'Open pages you share with them', note: (count: number) => (count === 0 ? 'None so far' : `${plural(count, 'page')} so far`) },
    money: 'Money',
    vault: 'Vault',
    offFor: { child: 'Off for children', teen: 'Off for teens' },
    adult: (circle: string) => `An adult sees everything that is shared with ${circle}, Money and the Vault too.`,
    leaving: 'Leaving the circle',
    outside: { label: 'Sharing with someone outside', note: (adults: readonly string[]) => (adults.length ? `${formatList(['You', ...adults], 'or')} get asked first` : 'You get asked first'), value: 'Ask first' },
    becomes: { label: 'Becomes a Teen', note: "You're reminded to look at this again", value: 'At 13' },
    becomesAdult: { label: 'Becomes an Adult', note: "You're reminded to look at this again", value: 'At 18' },
    notYours: 'Only the adults who run this circle can change this.',
  },

  // 4.5 Guest pass
  pass: {
    title: 'Guest pass',
    list: 'Guest passes',
    listLead: 'For someone who is not in the circle and shouldn’t be: a few things, for a while, on one phone, with no account.',
    none: 'No passes yet.',
    new: { label: 'New guest pass', note: 'A sitter for one evening, a neighbour for a week' },
    // Making one
    who: 'Who is it for?',
    whoPlaceholder: 'Ines, the sitter',
    day: 'Day',
    dayTitle: 'Which day?',
    from: 'From',
    until: 'Until',
    timeHint: 'Times as 18:00. A pass can run for up to a week.',
    timeWrong: 'Write the times like 18:00.',
    untilWrong: 'The pass has to end after it starts.',
    canOpen: (name: string) => (name ? `${name} can open` : 'They can open'),
    pickEmpty: 'Nothing to put on a pass yet. Write a page or a list first.',
    onPass: 'On the pass',
    notOnPass: 'Not on the pass',
    pick: (title: string, on: boolean) => `${title}. ${on ? 'On the pass' : 'Not on the pass'}`,
    give: 'Give the pass',
    // The pass itself
    how: (name: string) => `How ${name} gets it`,
    /** "No account needed. The link works on one phone, asks for the code 4821, and stops at 23:30." The code is marked "bold". */
    note: (code: string, ends: string): Rich => ['No account needed. The link works on one phone, asks for the code ', mark('bold', code), `, and stops at ${ends}.`],
    send: (name: string) => `Send to ${name}`,
    /** What goes into the phone's share sheet. */
    message: (name: string, circle: string, url: string) => `${name}, here is your guest pass from ${circle}: ${url}`,
    sent: 'Link copied. Send it any way you like.',
    end: 'End it now',
    endAsk: { title: 'End this pass now?', body: (name: string) => `The link stops working for ${name} at once.`, confirm: 'End the pass' },
    status: { running: 'Running', ended: 'Ended', later: 'Not started yet', opened: 'Opened on a phone', notOpened: 'Not opened yet' },
    ended: 'This pass has ended. The link no longer opens anything.',
    row: (name: string, when: string, status: string) => `${name}. ${when}. ${status}`,
  },
} as const;
