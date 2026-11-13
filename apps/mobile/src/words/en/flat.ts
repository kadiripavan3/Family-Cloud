/**
 * 18 For housemates: "Running low" on a flat's Today (18.1), the kitty (18.3), a fairer split (18.4),
 * Heads-up (18.5), Heard in the kitchen (18.6), the guest book (18.7) and everyone who's lived here (18.8).
 * What every board shares (its bar, its menu) is in `templates.ts`.
 */
import { APP } from './names';
import { formatList, plural, spelled } from './plural';

/** "Lea's", "Thomas'": whose something is. */
const of = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
/** "the kitty" for "The kitty": a name as it stands in the middle of a sentence. "TV licence" stays as it is. */
const lowerFirst = (text: string) => (text.length > 1 && text.charAt(1) === text.charAt(1).toUpperCase() && /[A-Z]/.test(text.charAt(1)) ? text : text.charAt(0).toLowerCase() + text.slice(1));
/** "1st", "2nd", "3rd", "11th", "22nd": a day of the month. */
const ordinal = (day: number) => {
  const tens = day % 100;
  const ending = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${day}${ending}`;
};
/** "you and Lena": people in the middle of a sentence, the reader first. */
const withYou = (others: readonly string[], you: boolean) => formatList(you ? ['you', ...others] : others);

export const flat = {
  /** Whoever is looking, where a name would stand. */
  you: 'You',
  /** "You and Lea", "Lea, Lena and Kai". */
  list: (names: readonly string[]) => formatList(names),
  /** "House rules, Bin days, Who to call". */
  commas: (parts: readonly string[]) => parts.filter(Boolean).join(', '),
  money: {
    /** Money that went out, with a real minus sign. */
    out: (amount: string) => `−${amount}`,
    in: (amount: string) => `+${amount}`,
  },
  /** A day that isn't long ago, inside a line: "Lea · yesterday". */
  days: { today: 'today', yesterday: 'yesterday' },
  /** How long ago something was written. */
  ago: {
    now: 'just now',
    minutes: (minutes: number) => (minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`),
    hours: (hours: number) => (hours === 1 ? 'an hour ago' : `${hours} hours ago`),
    days: (days: number) => (days === 1 ? 'yesterday' : `${days} days ago`),
  },

  // 18.1 "Running low" on a flat's Today, and the same chips on the kitty
  low: {
    title: 'Running low',
    open: 'Running low. Open the kitty',
    hint: 'Tap when it is running low',
    hintLow: 'Running low. Tap once it is bought',
  },

  // 18.3 The kitty
  kitty: {
    /** What a screen reader says for the big amount. */
    holds: (amount: string) => `The kitty holds ${amount}`,
    short: (amount: string) => `The kitty is ${amount} short`,
    /** Under the amount, when everyone pays in: who hasn't yet. The names are in the order to say them, "You" first. */
    waiting: (names: readonly string[]) => (names.length === 0 ? 'Everyone has paid in' : `${formatList(names)} ${names.length === 1 && names[0] !== 'You' ? "hasn't" : "haven't"} paid in yet`),
    noPayingIn: 'Nobody pays in by the month',
    payIn: (amount: string, month: string) => `Pay in ${amount} for ${month}`,
    takeBack: (month: string) => `Take back my paying in for ${month}`,
    takeMineBack: 'Take mine back',
    low: { label: 'Running low? Tap it', none: 'No usual things yet. Add the first under More.' },
    turn: {
      yours: "It's your turn to shop",
      theirs: (name: string) => `It's ${of(name)} turn to shop`,
      /** The button beside "It's your turn to shop". */
      done: "I've shopped",
      yourList: 'You get the list: whatever is ticked above.',
      theirList: (name: string) => `${name} gets the list: whatever is ticked above.`,
    },
    inAndOut: 'In and out',
    nothingYet: (month: string) => `Nothing in or out yet in ${month}.`,
    leftOver: (month: string) => `Left over from ${month}`,
    receiptKept: 'receipt kept',
    receipt: 'The receipt',
    remove: 'Take it out',
    bought: {
      open: 'Add what was bought',
      title: 'What was bought?',
      lead: 'It comes out of the kitty, and the next turn to shop moves on.',
      what: 'What',
      whatPlaceholder: 'Loo roll, bin bags',
      cost: 'What it cost',
      costPlaceholder: '8.90',
      badCost: 'Write an amount, like 8.90.',
      receipt: 'Add a photo of the receipt',
      changeReceipt: 'Change the photo',
      receiptChosen: 'The photo of the receipt',
      covers: "It bought these, so they aren't running low any more:",
      save: 'Take it out of the kitty',
    },
    usual: {
      open: 'The usual things',
      title: 'The usual things',
      lead: 'What the flat keeps buying. Each is a chip to tap when it runs low.',
      add: 'One more',
      placeholder: 'Coffee',
      save: 'Add it',
      remove: (name: string) => `Take ${name} off`,
    },
    each: {
      /** Under the amount: "€10 each on the 1st". */
      line: (amount: string, day: number) => `${amount} each on the ${ordinal(day)}`,
      open: 'What each pays in',
      title: 'What each pays in',
      lead: 'The same for everyone, once a month.',
      amount: 'Each pays in, every month',
      day: 'On which day of the month (1 to 28)',
      badDay: 'Write a day from 1 to 28.',
      save: 'Save',
    },
    all: { open: 'Everything in and out', title: 'In and out, all of it', none: 'Nothing has gone in or out yet.' },
  },

  // 18.4 A fairer split
  split: {
    tabsLabel: 'What is split',
    tabs: { rent: 'Rent', bills: 'Bills', kitty: 'Kitty', other: 'Other' },
    /** How a split was worked out, after its name: "October's electricity, by nights at home". */
    by: { equal: 'split equally', room: 'by room size', nights: 'by nights at home', use: 'by use', own: 'as agreed' },
    /** What a share goes by. */
    measure: (way: 'equal' | 'room' | 'nights' | 'use' | 'own', amount: number) => (way === 'room' ? `${amount} m²` : way === 'nights' ? plural(amount, 'night') : way === 'use' ? plural(amount, 'unit') : String(amount)),
    /** "Agreed by all three on 1 September". */
    agreed: (people: number, day: string) => (people <= 1 ? `Agreed on ${day}` : people === 2 ? `Agreed by both on ${day}` : `Agreed by all ${spelled(people)} on ${day}`),
    /** Under "Agreed by…", where the sliders can be dragged. */
    howTo: 'Drag a slider and the others move to keep the total. It counts once everyone says yes.',
    counts: 'It counts because everyone said yes. A change is a new proposal, and everyone is asked again.',
    countsBill: 'Everyone ticks their own share once it is paid. Whoever paid the bill can tick for the others.',
    settled: 'Every share is paid. This one is settled.',
    /** What a slider is, for a screen reader. `who` is null for the reader's own. */
    sliderOf: (name: string, who: string | null) => `${who ? of(who) : 'Your'} share of ${lowerFirst(name)}`,
    /** Beside the total under the sliders. */
    total: (name: string) => (name === 'Rent' ? 'The rent' : name),
    draft: {
      title: 'Not proposed yet',
      body: 'These numbers are only on your phone. Propose them and everyone is asked: they count once everyone says yes.',
      propose: 'Propose this split',
      back: 'Put it back',
    },
    pending: {
      yours: 'You proposed this',
      theirs: (name: string) => `${name} proposed this`,
      waiting: (others: readonly string[], you: boolean) => (others.length || you ? `Waiting for a yes from ${withYou(others, you)}.` : 'Everyone has said yes.'),
      /** What counts in the meantime. `shares` is `pending.shares(…)`. */
      until: (day: string, shares: string) => `Until everyone says yes, the split agreed on ${day} counts: ${shares}.`,
      shares: (shares: readonly { name: string; amount: string }[]) => shares.map((share) => `${share.name} ${share.amount}`).join(', '),
      first: 'It counts once everyone says yes.',
      line: (waiting: string, counts: string) => `${waiting} ${counts}`,
      yes: 'Say yes',
      takeBack: 'Take it back',
      /** Under a bill's bars while a proposal waits. */
      short: 'Proposed, and waiting for a yes. Tap to see.',
    },
    nothing: 'Nothing is proposed for this any more. Whoever added it can take it away.',
    remove: 'Take it away',
    billHeading: (title: string, by: string) => `${title}, ${by}`,
    shareSpoken: (name: string, amount: string) => `${name} ${amount}`,
    paidBy: (name: string) => `${name} paid it`,
    /** The tick beside a share. `who` is null for the reader's own. */
    paidTick: (who: string | null) => (who ? `${who} has paid` : 'You have paid'),
    paid: 'Paid',
    notPaid: 'Not yet',
    payMine: (amount: string) => `I've paid my ${amount}`,
    empty: { rent: "The rent isn't split here yet.", bills: 'No bill is split here yet.', kitty: "The kitty isn't split here yet.", other: 'Nothing else is split here yet.' },
    add: {
      open: 'Split something new',
      title: 'Split something new',
      lead: 'Adding it is a proposal: everyone is asked, and it counts once they have all said yes.',
      name: 'What is it?',
      namePlaceholder: { rent: 'Rent', bills: 'Electricity', kitty: 'The kitty', other: 'Internet' },
      total: 'How much is there to split?',
      badTotal: 'Write an amount, like 950.',
      under: 'Where it stands',
      ways: { equal: 'Equally', room: 'By room size', nights: 'By nights at home', use: 'By use' },
      room: (name: string | null) => (name ? `${of(name)} room, in m²` : 'Your room, in m²'),
      used: (name: string | null) => (name ? `What ${name} used` : 'What you used'),
      shared: 'The shared space, in m²',
      from: 'The first day',
      to: 'The last day',
      nightsNote: 'The nights each of you was away come from Heads-up: whoever gave notice of time away pays less.',
      equalNote: 'Everyone pays the same. A slider changes that afterwards.',
      payer: 'Who paid it? They are paid back.',
      save: 'Propose it',
    },
  },

  // 18.5 Heads-up
  headsUp: {
    /** The box at the end of the page. */
    add: 'Tell the flat something',
    mic: 'Say it out loud',
    micNote: 'Saying it out loud arrives with the phone app. Until then, type the line.',
    /** Under a notice of time away. */
    nightsOff: (nights: number, mine: boolean) => `${plural(nights, 'night')} off ${mine ? 'your' : 'their'} bills`,
    nights: (nights: number) => plural(nights, 'night'),
    needsYou: 'Waits for your answer',
    /** Everyone who said fine without another word. The names are in the order to say them, "You" first. */
    fine: (names: readonly string[], you: boolean) => (names.length === 1 && !you ? `${names[0]}'s fine` : `${formatList(names)} said fine`),
    /** A few words that came with a yes: "Lea will water the plants". */
    withWords: (name: string, text: string) => `${name} ${text}`,
    /** `name` is null for the reader. */
    wantsToTalk: (name: string | null, text: string | null) => `${name ? `${name} wants` : 'You want'} to talk${text ? `: ${text}` : ''}`,
    talk: "Let's talk",
    fineByMe: 'Fine by me',
    change: 'Change your answer',
    answer: {
      label: 'Your answer',
      words: 'A few words with it, if you like',
      finePlaceholder: "I'll water the plants",
      talkPlaceholder: 'Can we keep it to ten people?',
      send: 'Send my answer',
      takeBack: 'Take my answer back',
    },
    written: (ago: string) => `written ${ago}`,
    saidFine: "It's fine",
    saidTalk: "Let's talk first",
    waitingFor: (others: readonly string[], you: boolean) => `Waiting for an answer from ${withYou(others, you)}.`,
    remove: 'Take it down',
    empty: { title: 'Nothing to tell just now', body: "Guests on Saturday, a week away, a parcel on its way: one line here, and everyone can say it's fine." },
    write: {
      open: 'Write a notice',
      title: 'Tell the flat',
      lead: 'One line. Everyone else answers with a tap.',
      text: 'What do you want to tell the flat?',
      textPlaceholder: { note: 'The plumber comes on Thursday', guests: 'Six people over on Saturday', away: "I'm away for a week" },
      detail: 'A few words more, if you like',
      detailPlaceholder: 'on the sofa',
      what: 'What it is about',
      whats: { note: 'A note', guests: 'Guests', away: "I'm away" },
      from: 'From',
      until: 'Until',
      leave: 'The day you leave',
      back: "The day you're back",
      noDay: 'No day',
      awayNote: 'The nights you are away come off your share when a bill is split by nights at home.',
      save: 'Tell the flat',
    },
    earlier: { open: 'Earlier notices', count: (count: number) => plural(count, 'notice'), title: 'Earlier notices', none: 'Nothing earlier yet.' },
    standing: {
      open: 'The line that always stands',
      title: 'The line that always stands',
      lead: 'It stays under the notices, whatever else is going on. Empty it and it goes.',
      line: 'The line',
      linePlaceholder: 'Quiet after 23:00 on weeknights',
      note: 'A line under it',
      notePlaceholder: 'From the House rules, agreed by all three.',
      save: 'Save',
    },
  },

  // 18.6 Heard in the kitchen
  heard: {
    all: 'All',
    search: 'Search what was said',
    closeSearch: 'Close search',
    add: 'Who said what?',
    mic: 'Say it out loud',
    micNote: 'Saying it out loud arrives with the phone app. Until then, type what was said.',
    quoted: (text: string) => `“${text}”`,
    /** "Sunday, 11:40". */
    dayAndTime: (day: string, time: string) => `${day}, ${time}`,
    empty: { title: 'Nothing written down yet', body: 'The lines that deserve to outlive the tenancy go here, with who said them.' },
    none: { title: 'Nothing found', search: (typed: string) => `Nobody said anything with “${typed}” in it.`, person: 'Nothing of theirs is written down yet.' },
    /** Under a line that was pressed. `by` is who wrote it down, null when that isn't known. */
    written: (who: string, day: string, by: string | null, mine: boolean) => `${who}, on ${day}.${mine ? ' Written down by you.' : by ? ` Written down by ${by}.` : ''}`,
    about: { label: 'When, or what about', placeholder: 'the first cold night', save: 'Save' },
    remove: 'Take it out',
    who: { title: 'Who said it?', other: "Someone who doesn't live here", otherPlaceholder: 'Their name', add: 'Write it down for them' },
  },

  // 18.7 The guest book
  guestBook: {
    quoted: (text: string) => `“${text}”`,
    /**
     * Under a line: "Tom, from Leeds · 3 nights in October", "Maja, Lena's sister · 2 nights",
     * "Ana · who used to live here". `month` is given while the stay is still recent.
     */
    guest: (name: string, about: string | null, nights: number | null, month: string | null) => {
      if (nights === null) return about ? `${name} · ${about}` : name;
      const stayed = month ? `${plural(nights, 'night')} in ${month}` : plural(nights, 'night');
      return `${about ? `${name}, ${about}` : name} · ${stayed}`;
    },
    /** In the box at the top: "23 guests and 61 nights on the sofa since 2024." */
    count: (guests: number, nights: number, since: number | null) => {
      if (guests === 0) return 'Nobody has written in it yet.';
      const who = nights > 0 ? `${plural(guests, 'guest')} and ${plural(nights, 'night')} on the sofa` : plural(guests, 'guest');
      return since ? `${who} since ${since}.` : `${who}.`;
    },
    code: {
      title: 'The code by the door',
      print: 'Print',
      lead: 'Guests scan it and leave a line and a photo: no app, no account. What they write waits here until one of you lets it in.',
      spoken: 'The QR code that opens the guest book',
      under: (title: string) => `Scan to write in ${lowerFirst(title)}`,
      copy: 'Copy',
      printIt: 'Print this page',
      cantPrint: 'Printing arrives with the phone app. Until then, copy the link and open it in a browser, where this page prints, or take a screenshot of the code.',
      renew: 'Make a new code',
      renewAsk: 'Make a new code?',
      renewBody: 'The code by the door stops working at once, and so does every copy of its link. Print the new one and put it up.',
      renewYes: 'Make a new code',
    },
    share: {
      button: 'Share the link',
      message: (title: string, link: string) => `Write a line in ${lowerFirst(title)}: ${link}`,
      copiedTitle: 'Link copied',
      copied: "The link behind the code is copied. Whoever has it can leave a line, which waits until one of you lets it in.",
      failed: "The link couldn't be shared or copied here. Open the code with Print and copy it there.",
      notYours: 'The code and its link are for the people who live here.',
    },
    waiting: {
      label: 'Waiting at the door',
      yes: 'Let in',
      no: 'Turn away',
      yesSpoken: (name: string) => `Let ${of(name)} line in`,
      noSpoken: (name: string) => `Turn ${of(name)} line away`,
      ask: 'Turn this line away?',
      askBody: "It is removed, with its photo. This can't be undone.",
    },
    photoOf: (name: string) => `${of(name)} photo`,
    letInBy: (name: string) => `Let in by ${name === 'You' ? 'you' : name}`,
    writtenBy: (name: string) => `Written in by ${name === 'You' ? 'you' : name}`,
    remove: 'Take it out of the book',
    empty: {
      title: 'Nobody has written in it yet',
      body: 'Print the code and put it by the door. The first guest to scan it leaves the first line.',
      bodyGuest: 'When a guest leaves a line, it shows up here.',
    },
    write: {
      open: 'Write a line in for a guest',
      title: 'Write a line in',
      lead: 'For a guest who said it at the door or left it on paper. It is in the book at once.',
      name: "The guest's name",
      about: 'Who they are, in a few words',
      aboutPlaceholder: 'from Leeds',
      text: 'The line they left',
      nights: 'Nights they stayed',
      badNights: 'Write a number, like 2.',
      photo: 'Add a photo',
      changePhoto: 'Change the photo',
      photoChosen: 'The photo for this line',
      save: 'Put it in the book',
    },
  },

  // 18.8 Everyone who's lived here
  livedHere: {
    hereNow: 'Here now',
    beforeLabel: 'Before',
    /** In front of a name: "2026 –" for someone who lives here, "2023 – 25" for someone who left. */
    years: (from: number, until: number | null) => (until === null ? `${from} –` : `${from} – ${Math.floor(from / 100) === Math.floor(until / 100) ? String(until).slice(-2) : until}`),
    yearsSpoken: (from: number, until: number | null) => (until === null ? `Since ${from}` : `From ${from} to ${until}`),
    movesOut: {
      title: 'When someone moves out',
      line: 'Memories stay theirs. Codes and logins stop.',
      body: [
        'They stay on this roll, under Before, and they are still named under what they said and in the photos they are in.',
        `What they kept for themselves in ${APP} stays theirs. What was shared with the flat stops for them the moment they are removed: the pages, the bills, and every code and password.`,
        'Change the Wi‑Fi password and the door codes yourselves: the app stops showing them, but it cannot make anyone forget them.',
        'Someone is removed on their own page under People, by anyone in the flat.',
      ],
      people: 'Open People',
    },
    handedOn: {
      title: 'Handed on to the next person',
      none: 'Nothing chosen yet',
      lead: 'What whoever moves in next should find: the house manual, the bin days.',
      empty: 'Nothing is handed on yet.',
      remove: (title: string) => `Take ${title} off the list`,
      find: 'Add something of the flat',
      findPlaceholder: 'Search by its name',
      add: (title: string) => `Hand on ${title}`,
      nothingFound: (typed: string) => `Nothing of the flat has “${typed}” in it.`,
    },
    settling: {
      title: 'A last settling-up',
      line: 'Bills to the day, the kitty, the deposit',
      body: [
        'Before someone goes: split the bills up to their last day, settle what the kitty holds, and write down who gets what of the deposit.',
        'A bill split by nights at home counts their nights up to the day they left. Their share of the kitty is what it holds, divided by the people who paid in.',
      ],
      templates: 'Open the templates',
    },
    edit: {
      you: 'You',
      title: (name: string) => name,
      lead: 'The flat writes the years itself: people move in long before they start using an app.',
      from: 'Moved in (year)',
      until: 'Moved out (year)',
      note: 'A line about them',
      notePlaceholder: 'The small room, facing the street',
      outOfOrder: "The year they left can't be before the year they came.",
      save: 'Save',
    },
    before: {
      open: 'Add people from before',
      title: 'People from before',
      lead: 'Whoever lived here before the flat used the app: one row for one person, or for several.',
      name: 'Who',
      namePlaceholder: 'Two people before you',
      count: 'How many people',
      remove: 'Take them off the roll',
    },
  },
} as const;
