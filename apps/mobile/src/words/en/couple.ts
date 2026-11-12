/**
 * 17 For couples: a circle of two's own keepsakes and rituals. Our story (17.3), Tucked notes (17.4), The
 * anniversary questions (17.5), Mystery date (17.6), Both said yes (17.7) and The fair share (17.8). What
 * every board shares (its bar, its menu) is in `templates.ts`; a couple's Today is in `today.ts`.
 */
import { APP } from './names';
import { formatList, plural, spelled } from './plural';

/** "Mia's", "Thomas'": whose something is. */
const of = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const number = (count: number) => count.toLocaleString('en-US');
/** The others, by their first names, or a plain word when they aren't known: "Alex", "Lea and Kai", "the other one". */
const them = (names: readonly string[]) => (names.length ? formatList(names) : 'the other one');

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** "twelve", "thirty-one": a number of years, written out the way an anniversary is said. Beyond 99, the figure. */
export function inWords(count: number): string {
  if (!Number.isInteger(count) || count < 0 || count > 99) return String(count);
  if (count < 20) return SMALL[count]!;
  return TENS[Math.floor(count / 10)]! + (count % 10 === 0 ? '' : `-${SMALL[count % 10]!}`);
}
const yearName = (year: number) => `Year ${inWords(year)}`;

export const couple = {
  // 17.3 Our story
  ourStory: {
    /** Under the title: the days since it began. */
    days: (days: number) => `${plural(days, 'day').replace(String(days), number(days))} so far`,
    /** A moment, for a screen reader: its date, the word beside it, its name, and whether it carries a star. */
    spoken: (when: string, label: string | null, title: string, star: boolean) => [when, label, title, star ? 'A milestone' : null].filter(Boolean).join('. '),
    empty: {
      title: 'The firsts, in order',
      body: 'The day you met, the first trip, the first flat. Add the ones no camera caught, and the days are counted for you.',
      button: 'Add the first moment',
    },
    add: { button: 'Add a moment', title: 'A moment', save: 'Add it to the story' },
    change: { title: 'Change this moment', save: 'Save', remove: 'Take it out of the story' },
    form: {
      title: 'What happened',
      titlePlaceholder: 'We met',
      when: 'When',
      precision: 'How much of the date is known',
      day: 'The day',
      month: 'The month',
      year: 'The year',
      label: 'A word beside the date',
      labelPlaceholder: 'Piran, First flat',
      text: 'A few words',
      textPlaceholder: 'One mattress, no curtains, a borrowed kettle.',
      star: 'A milestone',
      starNote: 'Marked with a star on the line',
      addPhoto: 'Add a photo',
      anotherPhoto: 'Add another photo',
      changePhoto: 'Choose another photo',
      photoChosen: 'The photo you chose',
    },
    /** The day the count starts from, and what it began with. */
    began: {
      menu: 'When it began',
      since: (began: string) => `Since ${began}`,
      title: 'When it began',
      lead: 'The days are counted from here.',
      day: 'The day it began',
      words: 'What it began with',
      wordsPlaceholder: 'a wedding in Piran',
      wordsNote: 'Said after “Since”, on Today.',
      save: 'Save',
    },
  },

  // 17.4 Tucked notes
  tucked: {
    quoted: (text: string) => `“${text}”`,
    you: 'You',
    /** A note of this person's that hasn't turned up yet. */
    tucked: {
      eyebrow: (name: string) => (name ? `Tucked away for ${name}` : 'Tucked away'),
      before: (weekday: string) => `It will turn up some time before ${weekday}. Neither of you knows when.`,
      someTime: 'It will turn up some time this week. Neither of you knows when.',
      at: (day: string, time: string) => `It turns up on ${day} at ${time}.`,
      /** One that waits for a sign nothing sends yet, with the API's own words on what that is. */
      waiting: (waitsFor: string | null) => (waitsFor ? `It is kept, and it waits. ${waitsFor}` : 'It is kept, and it waits.'),
      another: 'Tuck another',
      more: (count: number) => `${count} more`,
    },
    /** A note for this person that has turned up and wasn't read yet. */
    turnedUp: {
      eyebrow: (name: string) => (name ? `From ${name} · it just turned up` : 'It just turned up'),
      line: 'It was tucked away for you. Now it is yours.',
      keep: 'Found it',
    },
    /** Nothing tucked away, nothing turned up. */
    none: {
      eyebrow: 'Nothing tucked away',
      title: 'A note that hides and waits',
      line: (reader: string | null) => `You write it now. It turns up for ${reader ?? 'them'} at a moment neither of you knows, or one you pick.`,
      button: 'Tuck a note away',
    },
    turnsUp: 'It turns up',
    /** The ways a note can turn up. `reader` is who it is for, when that is one person. */
    ways: {
      this_week: () => 'Some time this week',
      at: () => 'At a time I pick',
      lands: (reader: string | null) => (reader ? `When ${reader} lands` : 'When they land'),
      rains: () => 'Next time it rains',
    },
    /** Under the chips, for a way nothing sends the signal for yet. The API says what it is waiting for. */
    waits: (waitsFor: string | null) => (waitsFor ? `It can be tucked away, and it waits. ${waitsFor}` : 'It can be tucked away, and it waits.'),
    found: {
      label: (count: number) => `Found so far · ${number(count)}`,
      none: 'None found yet. The first one is still hiding.',
      all: (count: number) => `Show all ${number(count)}`,
      today: 'today',
      yesterday: 'yesterday',
      on: (day: string) => `on ${day}`,
      /** Who found it and when: "you found it on Tuesday at 22:14", "Alex found it on 31 Oct at 16:40". */
      when: (finder: string | null, day: string, time: string) => `${finder ? `${finder} found it` : 'you found it'} ${day} at ${time}`,
    },
    write: {
      button: 'Tuck a note away',
      title: 'Tuck a note away',
      lead: 'Write it now. It hides until its moment.',
      note: 'Your note',
      placeholder: 'Your coffee this morning was the best part of my day.',
      /** What its reader knows meanwhile, said as it is. */
      hidden: (reader: string | null) => `Until it turns up, ${reader ?? 'its reader'} only sees on Today that a note is waiting, and who it is from. Never the words.`,
      save: 'Tuck it away',
    },
    /** A time for a note that turns up at a moment its writer picks. */
    at: {
      title: 'When it turns up',
      lead: 'Pick the moment. Tomorrow at half past seven?',
      day: 'The day',
      time: 'The time',
      timePlaceholder: '19:30',
      notATime: 'Write the time like 19:30.',
      reads: (time: string) => `It turns up at ${time}.`,
      save: 'Set the time',
    },
    /** The notes this person tucked away that haven't turned up. */
    still: {
      menu: 'Still tucked away',
      count: (count: number) => plural(count, 'note'),
      title: 'Still tucked away',
      lead: 'You can take a note back until it has turned up. After that it is theirs.',
      forName: (name: string) => (name ? `For ${name}` : ''),
      takeBack: 'Take it back',
      takeBackSpoken: (text: string) => `Take it back: ${text}`,
    },
  },

  // 17.5 The anniversary questions
  anniversary: {
    /** "Year twelve": which anniversary a set of answers is for. */
    year: yearName,
    /** One answer of an opened year, for a screen reader. `name` is null for this person's own. */
    answerSpoken: (name: string | null, text: string) => `${name ?? 'You'}: ${text}`,
    /** A word every answer shares: "You both said Bled". */
    same: (word: string, both: boolean) => `You ${both ? 'both' : 'all'} said ${word}`,
    empty: {
      title: 'Nothing has opened yet',
      body: (day: string) => `You each answer the same questions, apart. They open side by side on ${day}, once everyone has answered.`,
    },
    /** The bar at the end: the year that is being written. */
    next: {
      opens: (year: number, day: string) => `${yearName(year)} opens on ${day}`,
      waits: (year: number, both: boolean) => `${yearName(year)} opens when you have ${both ? 'both' : 'all'} answered`,
      sealed: 'Yours are sealed.',
      some: (answered: number, questions: number) => `You've answered ${answered} of ${questions}.`,
      none: "Yours aren't written yet.",
      /** The others have all finished: "So are Alex's." after "Yours are sealed.", "Alex's are sealed." otherwise. */
      othersSealed: (names: readonly string[], afterYours: boolean) => {
        const whose = names.length === 1 ? of(names[0]!) : "everyone else's";
        return afterYours ? `So are ${whose}.` : `${whose.charAt(0).toUpperCase()}${whose.slice(1)} are sealed.`;
      },
      othersWriting: (names: readonly string[]) => `${formatList(names)} ${names.length === 1 ? "hasn't" : "haven't"} finished.`,
    },
    write: {
      button: 'Write mine',
      change: 'Change mine',
      title: (year: number) => `${yearName(year)}, yours`,
      lead: 'Answer for yourself. Nobody reads these before the day.',
      placeholder: 'Your answer',
      /** What happens to the answers, said as it is. `others` are the other people who answer. */
      sealed: (others: readonly string[]) => `${them(others).charAt(0).toUpperCase()}${them(others).slice(1)} can't read yours until the year opens, and you can't read theirs. Until then you can change yours; once it has opened, every answer stays as it is.`,
      save: 'Seal my answers',
    },
    ask: {
      menu: 'Add a question',
      note: (year: number) => `Asked from ${yearName(year).toLowerCase()} on`,
      title: 'Add a question',
      lead: (year: number) => `Everyone answers it from ${yearName(year).toLowerCase()} on. The years that have opened stay as they are.`,
      label: 'The question',
      placeholder: 'What surprised you this year?',
      save: 'Add the question',
    },
    setup: {
      since: 'The day it all began',
      choose: 'Choose a day',
      note: 'The questions open on this day of every year.',
    },
  },

  // 17.6 Mystery date
  mysteryDate: {
    quoted: (text: string) => `“${text}”`,
    card: {
      /** "Fri 13 Nov · your turn to plan", "Fri 13 Nov · Nora is planning". */
      eyebrow: (day: string, yours: boolean, planner: string) => `${day} · ${yours ? 'your turn to plan' : planner ? `${planner} is planning` : 'being planned'}`,
      allTheySee: (others: readonly string[], known: string) => `All ${them(others)} can see: “${known}”`,
      onlyTheDay: (others: readonly string[]) => `All ${them(others)} can see is the day.`,
      hiddenFrom: (others: readonly string[]) => `The rest is hidden from ${them(others)} until the date begins.`,
      allYouGet: "That is all you get until you're there.",
      noHint: 'A date, and nothing more.',
      revealed: 'It is out: the whole plan shows for everyone now.',
      change: 'Change the hint',
      shake: 'Shake the jar',
    },
    /** No date is being planned. */
    none: {
      eyebrow: (yourTurn: boolean, name: string) => (yourTurn ? 'Your turn to plan' : name ? `${of(name)} turn to plan` : 'Nothing planned'),
      title: (yourTurn: boolean) => (yourTurn ? 'Plan the next one, and keep it a surprise.' : 'The next date is still a blank page.'),
      line: 'Whoever plans sees the plan. The other one gets a time and a hint.',
    },
    plan: {
      button: 'Plan a date',
      title: 'Plan a date',
      change: 'The date',
      lead: 'Only the day, the time and the hint are shown to the other one.',
      yours: 'Your plan',
      theirs: 'The plan',
      /** On the plan's first line: who it is hidden from. */
      notFor: (others: readonly string[]) => `Not ${them(others)}`,
      day: 'The day',
      time: 'The time',
      timePlaceholder: '20:00',
      notATime: 'Write the time like 20:00.',
      hint: 'The hint',
      hintPlaceholder: 'Wear something warm.',
      hintNote: 'All they get besides the time.',
      what: 'What it is',
      whatPlaceholder: 'Night sledging on Krvavec',
      whatNote: 'Only you see this until the date begins.',
      start: 'Start planning',
      save: 'Save',
      callOff: 'Call this date off',
    },
    line: {
      title: 'A line of the plan',
      note: 'A note',
      notePlaceholder: 'Two tickets booked',
      icon: 'What it is about',
      icons: { pin: 'A place', euro: 'Money', users: 'People' },
      sorted: 'Sorted',
      sortedNote: 'A tick at the end of the line',
      save: 'Save',
      remove: 'Take it off the plan',
    },
    clues: {
      label: 'Clues',
      title: 'A clue',
      open: 'Open',
      opens: (day: string, time: string) => `Opens ${day}, ${time}`,
      toCome: (count: number) => `${count === 1 ? 'One more clue' : `${spelled(count).charAt(0).toUpperCase()}${spelled(count).slice(1)} more clues`} to come`,
      toComeLine: 'Each opens at its own moment.',
      opensOn: 'It opens',
      atOnce: 'At once',
      opensAt: 'At what time',
      save: 'Save',
      remove: 'Take the clue out',
    },
    /** What the + adds on a date this person plans. */
    add: {
      button: 'Add to the date',
      title: 'Add to the date',
      what: 'What to add',
      kinds: { line: 'The plan', clue: 'A clue', idea: 'The jar' },
      labels: { line: 'What it is', clue: 'The clue', idea: 'An idea for a date' },
      placeholders: { line: 'Ines has the children until 23:30', clue: 'Bring the thick gloves.', idea: 'A cooking class' },
      notes: { line: 'Only you see the plan until the date begins.', clue: 'They get it when its moment comes.', idea: 'You both see the jar.' },
      save: { line: 'Add it to the plan', clue: 'Add the clue', idea: 'Put it in the jar' },
    },
    jar: {
      add: 'Add an idea to the jar',
      lead: 'For whoever plans next. You both see the jar.',
      empty: 'The jar is empty',
      count: (ideas: number) => (ideas === 0 ? 'Put an idea in first.' : `One of the ${plural(ideas, 'idea')} in the jar.`),
      use: 'Make it the plan',
      again: 'Shake again',
    },
    reveal: {
      menu: 'Reveal it now',
      note: (others: readonly string[]) => `Shows ${them(others)} the whole plan`,
      title: 'Reveal the date now?',
      body: (others: readonly string[]) => `${them(others).charAt(0).toUpperCase()}${them(others).slice(1)} sees what it is and the whole plan at once. It can't be hidden again.`,
      confirm: 'Yes, reveal it',
    },
    turns: {
      label: (thisYear: number) => `Turns · ${plural(thisYear, 'date')} this year`,
      none: 'No dates yet. The first one is the hardest to plan.',
      untitled: 'A date',
      /** "Alex planned · October", "You planned · September". `name` is null for this person. */
      planned: (name: string | null, month: string) => `${name ?? 'You'} planned · ${month}`,
    },
  },

  // 17.7 Both said yes
  bothYes: {
    decks: 'What to decide',
    also: 'Also deciding',
    empty: {
      title: 'Nothing to decide yet',
      body: 'Start a deck for one decision: dinner, a film, a holiday. You each answer in private, and only what you both want shows.',
      button: 'Start a deck',
    },
    card: {
      /** "6 of 8": which idea of the deck this is. */
      count: (which: number, all: number) => `${which} of ${all}`,
      private: (others: readonly string[]) => `${them(others)} can't see your answers`,
      no: (idea: string) => `No to ${idea}`,
      yes: (idea: string) => `Yes to ${idea}`,
    },
    /** A deck with nothing in it yet. */
    noIdeas: {
      title: (deck: string) => `Nothing in ${deck} yet`,
      line: 'Add the first idea with the plus.',
    },
    /** This person has answered every idea of the open deck. */
    through: {
      title: (deck: string) => `You're through ${deck}`,
      line: (ideas: number) => `All ${plural(ideas, 'idea')} answered. Only the matches show.`,
    },
    /** Someone who may see the board and isn't one of those who answer. */
    watching: {
      title: (names: readonly string[]) => `${formatList(names)} answer here`,
      line: 'Only what they all say yes to shows.',
    },
    /** A deck the app keeps behind the phone's lock, where there is no lock to open it with. */
    locked: {
      title: (deck: string) => `${deck} is kept behind the phone's lock`,
      line: `Opening it with your face or your fingerprint arrives with the phone app of ${APP}. Until then it stays shut here.`,
    },
    match: {
      /** "You both said yes to Thai", "You both said yes to Thai and tacos". */
      title: (ideas: readonly string[], both: boolean) => `You ${both ? 'both' : 'all'} said yes to ${formatList(ideas)}`,
      line: (both: boolean) => (both ? 'What only one of you wanted stays secret.' : 'What not all of you wanted stays secret.'),
    },
    deck: {
      progress: (seen: number, ideas: number) => `You've done ${seen} of ${ideas}`,
      theyFinished: (names: readonly string[]) => `${formatList(names)} ${names.length === 1 ? 'has' : 'have'} finished. You haven't.`,
      youFinished: (names: readonly string[]) => `You've finished. ${formatList(names)} ${names.length === 1 ? "hasn't" : "haven't"}.`,
      allFinished: (matches: number) => `Everyone has finished · ${plural(matches, 'match', 'matches')}`,
      locked: (seen: number, matches: number, both: boolean) => `${number(seen)} seen · ${number(matches)} you ${both ? 'both' : 'all'} like`,
    },
    add: {
      button: 'Add an idea or a deck',
      title: 'Add',
      what: 'What to add',
      idea: (deck: string) => `To ${deck}`,
      deck: 'A new deck',
      ideaLabel: 'The idea',
      ideaPlaceholder: 'Tacos from the place on Trubarjeva',
      deckLabel: 'What you are deciding',
      deckPlaceholder: "Friday's film",
      tab: 'A short word for its tab',
      tabPlaceholder: 'Film',
      tabNote: 'Left empty, its name is used.',
      emoji: 'An emoji',
      emojiPlaceholder: 'One emoji, if you like',
      day: 'The day it is for',
      noDay: 'No day',
      locked: "Keep it behind the phone's lock",
      lockedNote: 'For the ones nobody else should glance at: names.',
      saveIdea: 'Add the idea',
      saveDeck: 'Start the deck',
    },
  },

  // 17.8 The fair share
  fairShare: {
    you: 'You',
    hours: (hours: number) => `${number(hours)} h`,
    /** Under the bar: "You · 31 hours", "Alex · 22 hours". `name` is null for this person. */
    legend: (name: string | null, hours: number) => `${name ?? 'You'} · ${plural(hours, 'hour').replace(String(hours), number(hours))}`,
    /** The bar, for a screen reader: "You 58 percent, Alex 42 percent". */
    barSpoken: (people: readonly { name: string | null; percent: number }[]) => people.map((one) => `${one.name ?? 'You'} ${one.percent} percent`).join(', '),
    columnSpoken: (name: string, hours: number) => `${name}. ${plural(hours, 'hour')}. Change what you ticked`,
    nothingTicked: 'Nothing ticked',
    /** A month on the More sheet: "Show November". */
    show: (month: string) => `Show ${month}`,
    fine: (justTheTwo: boolean) => `Hours are your own guesses for each job. ${justTheTwo ? 'Only the two of you ever see this.' : 'Only the people it is shared with ever see this.'}`,
    empty: {
      title: (month: string) => `Nothing ticked for ${month} yet`,
      body: 'Tick the jobs that were yours and guess the hours. It is a mirror, not a score.',
    },
    swap: {
      title: 'One swap would bring it close',
      suggest: 'Suggest',
      /** The other one suggested it. */
      theirs: (name: string) => (name ? `${name} suggests a swap` : 'A swap was suggested'),
      yes: 'Yes',
      yesSpoken: 'Yes to the swap',
      no: 'No',
      noSpoken: 'No to the swap',
      waiting: (others: readonly string[]) => `You suggested it. It waits for ${them(others)}.`,
      agreed: 'The swap is agreed',
      theyDeclined: (others: readonly string[]) => `${them(others).charAt(0).toUpperCase()}${them(others).slice(1)} said no to the swap`,
      youDeclined: 'You said no to the swap',
    },
    close: {
      title: "It's close",
      line: (both: boolean) => (both ? 'Near enough to even between the two of you. Nothing to swap.' : 'Near enough to even. Nothing to swap.'),
    },
    uneven: {
      title: 'No single swap would bring it close',
      line: 'It is uneven this month, and no one job changing hands would even it out.',
    },
    tick: {
      menu: 'Tick my jobs',
      menuNote: (month: string) => `What was yours in ${month}`,
      title: (month: string) => `Your jobs in ${month}`,
      lead: 'Tick what was yours and guess the hours. You only ever tick for yourself.',
      /** The tick of one job, for a screen reader. */
      mine: (job: string) => `${job} was mine`,
      less: (job: string) => `One hour less for ${job}`,
      more: (job: string) => `One hour more for ${job}`,
    },
    job: {
      label: 'Another job',
      placeholder: 'Notices the milk',
      add: 'Add',
      addSpoken: 'Add the job',
    },
  },
} as const;
