/**
 * 16 Fair and fun: Whose turn? (16.1), the piggy bank (16.2), secret missions (16.3), the Saturday jar
 * (16.4), Sleeps until… (16.5), Where is it? (16.6) and habit charts (16.7). What every board shares (its
 * bar, its menu) is in `templates.ts`.
 */
import { mark, type Rich } from '../rich';
import { plural, spelled } from './plural';

/** "Mia's", "Thomas'": whose something is. */
const of = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How long something takes, the way a family says it: "30 minutes", "1½ hours", "half a day", "a whole day". */
const howLong = (minutes: number) => {
  if (minutes < 60) return plural(minutes, 'minute');
  if (minutes >= 360) return 'a whole day';
  if (minutes >= 210) return 'half a day';
  const halves = Math.round(minutes / 30);
  const whole = Math.floor(halves / 2);
  return halves % 2 ? `${whole}½ hours` : plural(whole, 'hour');
};

/**
 * True when what was put away reads as more than one thing, so the sentence about it says "them": a name
 * in the plural ("The passports", "Christmas lights"), or a note that lists several ("Tent, pegs and both mats.").
 */
const several = (thing: { name: string; note: string | null }) => {
  const last = thing.name.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
  const pluralName = last.length > 3 && last.endsWith('s') && !/(ss|us|is)$/.test(last);
  return pluralName || (!!thing.note && /,| and /i.test(thing.note));
};

export const perks = {
  /** What each picture a thing can be given is, for a screen reader. */
  pictures: {
    film: 'Film',
    car: 'Car',
    pizza: 'Pizza',
    bath: 'Bath',
    dog: 'Dog',
    trophy: 'Trophy',
    target: 'Target',
    basket: 'Picnic basket',
    tent: 'Tent',
    swim: 'Swimming',
    pancakes: 'Pancakes',
    run: 'Running',
    cake: 'Birthday cake',
    tree: 'Christmas tree',
    plane: 'Plane',
    present: 'Present',
    party: 'Party',
    moon: 'Moon',
    box: 'Box',
    key: 'Key',
    bag: 'Bag',
    card: 'Card',
    suitcase: 'Suitcase',
    tools: 'Tools',
    tick: 'Tick',
    books: 'Books',
    phone: 'Phone',
    screen: 'Screen',
    salad: 'Salad',
  },

  // 16.1 Whose turn?
  whoseTurn: {
    /** The small line over what is on tonight: "Tonight is Film night". */
    tonight: (name: string) => `Tonight is ${name}`,
    /** "Leo chooses the film", or "Leo's turn" when the list doesn't say what they do. */
    turn: (name: string, does: string | null) => (does ? `${name} ${does}` : `${of(name)} turn`),
    done: 'Done, pass it on',
    also: 'Also keeping count',
    keeping: 'Keeping count',
    /** What a screen reader says for the name at the end of a row. */
    whose: (name: string) => `${of(name)} turn`,
    grownUps: 'Only the grown-ups can change what happened.',
    proof: {
      title: 'Proof, for arguments',
      /** "61 turns kept since March, each with its date." `since` is a month, with its year once that is another. */
      body: (turns: number, since: string) => `${plural(turns, 'turn')} kept since ${since}, each with its date.`,
      lead: 'Every turn that was taken, with its date.',
      earlier: 'A month back',
      later: 'A month on',
      none: 'No turns were kept in this month.',
      /** One line of the proof: "Leo · The front seat". */
      turn: (who: string, thing: string) => (who ? `${who} · ${thing}` : thing),
    },
    empty: {
      title: 'Nothing to take turns at yet',
      body: 'Add what gets argued about: who chooses the film, who has the front seat. The list remembers who had the last turn.',
      bodyLooking: 'When a grown-up adds something to take turns at, whose turn it is shows up here.',
    },
    add: {
      button: 'Add something to take turns at',
      title: 'Take turns at…',
      lead: 'The list remembers who had it last, and moves on when a turn is taken.',
      name: 'What you take turns at',
      namePlaceholder: 'The front seat',
      does: 'What the one whose turn it is does',
      doesPlaceholder: 'chooses the film',
      doesNote: "So the list can say “Leo chooses the film”. Leave it empty for “Leo's turn”.",
      picture: 'A picture for it',
      who: 'Who takes turns',
      everyone: 'Everyone',
      tonight: "It's on tonight",
      save: 'Start keeping count',
      twoAtLeast: 'Taking turns needs two people. Choose one more, or everyone.',
    },
    thing: {
      whoTook: 'Who took the turn?',
      note: 'A few words, if you like',
      notePlaceholder: 'Frozen, again',
      /** "Take back Leo's turn of Thu 12 Nov". */
      takeBack: (who: string, day: string) => (who ? `Take back ${of(who)} turn of ${day}` : `Take back the turn of ${day}`),
      onTonight: "It's on tonight",
      notTonight: 'Not tonight after all',
      remove: 'Stop keeping count of it',
      removeAsk: (name: string) => `Stop keeping count of “${name}”?`,
      removeBody: 'It leaves the list, and the turns that were kept for it go with it.',
    },
  },

  // 16.2 The piggy bank
  piggyBank: {
    notABank: 'Kept count of here. Not a bank account.',
    jars: { spend: 'Spend', save: 'Save', give: 'Give' },
    /** What a screen reader says for a jar: "Save: €12.00, 68% full". */
    jarSpoken: (jar: string, money: string, fill: number | null) => (fill === null ? `${jar}: ${money}` : `${jar}: ${money}, ${fill}% full`),
    jarButton: (jar: string) => `${jar}. Pay in, take out or move`,
    interest: {
      title: (percent: number) => `The Bank of Mum and Dad pays ${percent}% a month`,
      /** "On what is in Save. €0.60 arrived on 1 November." */
      arrived: (money: string, day: string) => `On what is in Save. ${money} arrived on ${day}.`,
      first: (day: string | null) => (day ? `On what is in Save. The first interest arrives on ${day}.` : 'On what is in Save, on the first of every month.'),
    },
    lately: 'Lately',
    nothingYet: 'Nothing has happened here yet. Pay in the first pocket money and the count starts.',
    nothingYetLooking: 'Nothing has happened here yet.',
    /** The line under money that came in, went out, or moved, when nobody wrote anything else: "Sunday · into Save". */
    into: (jar: string) => `into ${jar}`,
    outOf: (jar: string) => `out of ${jar}`,
    noteOutOf: (note: string, jar: string) => `${note}, out of ${jar}`,
    fromTo: (from: string, to: string) => `from ${from} to ${to}`,
    fund: {
      /** "Skates fund: 68%". */
      title: (name: string, percent: number) => `${name}: ${percent}%`,
      toGo: (stars: number) => (stars === 0 ? 'Every star is in' : `${plural(stars, 'star')} to go`),
    },
    noFund: { title: (name: string) => (name ? `${of(name)} pocket money` : 'Pocket money'), line: 'Into Spend, Save or Give' },
    payIn: 'Pay in',
    entry: {
      /** "Written down by Nora, Sunday", or what the bank paid by itself. */
      written: (when: string, by: string | null) => (by ? `Written down by ${by}, ${when}.` : `Paid by the bank, ${when}.`),
      takeBack: 'Take it back',
    },
    money: {
      title: 'Money in, out or between jars',
      lead: (name: string) => (name ? `Only the grown-ups do this. ${name} sees every line.` : 'Only the grown-ups do this.'),
      kind: 'What happens',
      kinds: { in: 'Pay in', out: 'Take out', move: 'Move' },
      intoJar: 'Into which jar',
      outOfJar: 'Out of which jar',
      toJar: 'And into which',
      amount: 'How much',
      amountPlaceholder: '2.50',
      amountNote: 'Write an amount, like 2 or 2.50.',
      stars: 'Stars it stands for',
      /** `money` is what one star is worth: "€0.20". */
      starsNote: (money: string) => `A star is worth ${money}. Leave the amount empty and the stars set it.`,
      from: 'Where it came from',
      fromPlaceholder: 'Pocket money',
      what: 'What it was for',
      whatPlaceholder: 'Stickers',
      note: 'A few words, if you like',
      notePlaceholder: 'For a good school report',
      save: { in: 'Pay it in', out: 'Take it out', move: 'Move it' },
    },
    rules: {
      title: "The bank's rules",
      lead: 'What the bank pays on Save, what a star is worth, and what Save is for.',
      interest: 'Interest on Save, in percent a month',
      interestNote: 'From 0 to 100. It arrives on the first of every month.',
      star: 'What one star is worth',
      starPlaceholder: '0.20',
      fund: 'What Save is for',
      fundPlaceholder: 'Skates fund',
      fundStars: 'How many stars it takes',
      save: 'Keep the rules',
    },
    all: { title: 'Everything that happened' },
    // Before it starts
    setup: {
      forWhom: 'Whose piggy bank is it?',
      /** What the piggy bank is called: "Mia's piggy bank". */
      title: (name: string) => `${of(name)} piggy bank`,
    },
  },

  // 16.3 Secret missions
  secretMissions: {
    /** The person looking, as the one who did a mission, and as the one it was for. */
    you: 'You',
    youTarget: 'you',
    /** The small line over this week's mission. */
    eyebrow: (week: number) => `Week ${week} · only you can see this`,
    /** Over a child's mission, on the phone of the parent who reads it to them. */
    eyebrowFor: (week: number, name: string) => `Week ${week} · ${of(name)}, for you to read out`,
    yours: (target: string) => `Everyone has one this week. Yours is for ${target}.`,
    theirs: (doer: string, target: string) => `${of(doer)} is for ${target}. Tick it here when it is done.`,
    /** `day` is the day the week is revealed: "Sunday". */
    doneLine: (day: string) => `Done. Everyone reads about it on ${day}.`,
    done: 'Done',
    another: 'A different one',
    notDone: 'Not done after all',
    none: { title: 'No mission for you this week', body: 'A new one comes on Monday, one for everyone.' },
    menu: { before: 'The week before', latest: 'Back to the last week revealed' },
    revealed: {
      last: 'Last week, revealed on Sunday',
      thisWeek: 'This week, revealed today',
      /** `range` is "2 to 8 November". */
      week: (range: string) => `${range}, revealed`,
      none: 'What gets done this week shows up here on Sunday, for everyone to read.',
      noneThen: 'Nothing was revealed that week.',
    },
    /** One revealed mission: "Alex for you: made your coffee three mornings running". The names are drawn in bold. */
    row: (doer: string, target: string, did: string): Rich => [mark('bold', doer), ' for ', mark('bold', target), `: ${did}`],
    /** The same when they didn't say what they did. */
    rowPlain: (doer: string, target: string): Rich => [mark('bold', doer), ' for ', mark('bold', target)],
    photoOf: (name: string) => (name ? `${of(name)} photo of it` : 'A photo of it'),
    heart: 'A heart for this',
    hearted: (name: string) => (name ? `${name} gave it a heart` : 'It got a heart'),
    tell: {
      title: 'What did you do?',
      lead: (day: string) => `In your own words, if you like. Everyone reads it on ${day}, and nobody before.`,
      did: 'What you did',
      didPlaceholder: 'made her coffee three mornings running',
      addPhoto: 'Add a photo',
      changePhoto: 'Choose another photo',
      photoChosen: 'The photo you chose',
    },
    sheet: {
      /** "Alex for you". */
      title: (doer: string, target: string) => `${doer} for ${target}`,
      was: (text: string) => `The mission was: ${text}`,
      /** "Alex made your coffee three mornings running." */
      did: (doer: string, did: string) => `${doer} ${did}${/[.!?]$/.test(did) ? '' : '.'}`,
      like: 'Give it a heart',
      likeFor: (name: string) => `Give it a heart for ${name}`,
      unlike: 'Take the heart back',
      reply: 'A line under it',
      replyPlaceholder: 'You guessed by Wednesday',
      keep: 'Keep the line',
    },
  },

  // 16.4 The Saturday jar
  saturdayJar: {
    ask: 'A free day. What shall we do?',
    someone: 'Someone',
    /** "Mia put this one in, back in June". */
    putIn: (name: string, month: string) => `${name} put this one in, back in ${month}`,
    putInThisMonth: (name: string) => `${name} put this one in this month`,
    /** In the line under an idea: "at home", "half a day", "free", "about €60". */
    place: { home: 'at home' },
    time: (minutes: number) => howLong(minutes),
    free: 'free',
    about: (money: string) => `about ${money}`,
    /** The same on the slip that was pulled, each on a tag of its own. */
    placeTag: { home: 'At home', indoors: 'Indoors', outdoors: 'Outdoors' },
    timeTag: (minutes: number) => capital(howLong(minutes)),
    freeTag: 'Free',
    aboutTag: (money: string) => `About ${money}`,
    /** "All four free": nobody has anything on today, by the calendar. */
    allFree: (people: number) => `All ${spelled(people)} free`,
    shake: 'Shake the jar',
    shakeAgain: 'Shake again',
    letsDoIt: "Let's do it",
    seeEvent: 'See it in the calendar',
    notShaken: { title: 'Not shaken today', body: 'Shake the jar and it pulls one idea that fits the time you have, what it may cost, and indoors or outdoors.' },
    comingUp: 'You said yes to',
    /** Under an idea someone said yes to. `day` is "Today", "Tomorrow" or "Sat 14 Nov". */
    onCalendar: (day: string | null) => (day ? `${day} · on the calendar, with an album for the photos` : 'On the calendar, with an album for the photos'),
    /** "In the jar · 31 ideas". */
    inTheJar: (count: number) => `In the jar · ${plural(count, 'idea')}`,
    filters: { fits: 'Fits today', rainy: 'Rainy day', home: 'At home', free: 'Free' },
    noneFit: 'Nothing in the jar fits that.',
    noneLeft: 'Nothing is left in the jar. Drop a new idea in.',
    empty: { title: 'The jar is empty', body: 'Drop ideas in all year: a picnic, a den in the living room, the big slides. On a free day, shake.' },
    menu: { ask: 'Ask for something else' },
    askSheet: {
      title: 'What fits today?',
      lead: 'The jar pulls one idea that fits. It has no weather report, so it asks.',
      time: 'How much time is there?',
      any: 'Any',
      hour: '1 hour',
      twoHours: '2 hours',
      halfDay: 'Half a day',
      cost: 'What may it cost?',
      free: 'Free',
      upTo: (money: string) => `Up to ${money}`,
      where: 'Indoors or outdoors?',
      either: 'Either',
      indoors: 'Indoors',
      outdoors: 'Outdoors',
      shake: 'Shake the jar',
    },
    idea: { doIt: "Let's do this one", takeOut: 'Take it out of the jar', putBack: 'Put it back in the jar' },
    add: {
      button: 'Drop an idea in',
      title: 'An idea for the jar',
      lead: 'For a free day, some day. Everyone can drop one in.',
      text: 'The idea',
      textPlaceholder: 'A picnic by the pond',
      picture: 'A picture for it',
      where: 'Where it happens',
      anywhere: 'Anywhere',
      home: 'At home',
      indoors: 'Indoors',
      outdoors: 'Outdoors',
      time: 'How long it takes',
      times: { any: 'Any time', '30': '30 minutes', '60': '1 hour', '120': '2 hours', '240': 'Half a day', '480': 'A whole day' },
      cost: 'About what it costs',
      costPlaceholder: 'Leave it empty when it is free',
      costNote: 'Write an amount, like 20 or 12.50.',
      by: 'Whose idea is it?',
      save: 'Drop it in',
    },
  },

  // 16.5 Sleeps until…
  sleeps: {
    /** Under the big number: "sleeps until Grandma Astrid comes". */
    until: (sleeps: number, title: string) => `${sleeps === 1 ? 'sleep' : 'sleeps'} until ${title}`,
    /** The same in one piece, for a screen reader and a sheet's title: "12 sleeps until Grandma Astrid comes". */
    spoken: (sleeps: number, title: string) => `${plural(sleeps, 'sleep')} until ${title}`,
    today: (title: string) => `Today: ${title}`,
    sleeps: (sleeps: number) => plural(sleeps, 'sleep'),
    /** The colours of the links, the accent first: "Tonight's is the yellow one." */
    colours: ['yellow', 'orange', 'blue', 'green', 'purple', 'pink'],
    tonight: (name: string | null, colour: string) => `${name ? `${name} tears one off at bedtime.` : 'One link comes off at bedtime.'} Tonight's is the ${colour} one.`,
    torn: "Tonight's link is off. Sleep well.",
    dayCame: 'No links left. The day has come.',
    tear: "Tear off tonight's link",
    putBack: "Put tonight's link back",
    also: 'Also counting',
    counting: 'Counting',
    passed: 'The day has been',
    everyYear: 'every year',
    tearer: (name: string) => `${name} tears the links off`,
    remove: 'Stop counting down to it',
    widget: {
      title: 'On the Home Screen too',
      body: 'A widget with the chain, and a link to tear off.',
      notice: "The widget comes with the phone app's Home Screen widgets, which aren't in this build yet. Until then the chain is here, and one tap tears tonight's link off.",
    },
    empty: { title: 'Nothing to count down to yet', body: 'Add a day worth waiting for: a birthday, a visit, a trip. Its paper chain loses a link every night.' },
    add: {
      button: 'Count down to something',
      title: 'Sleeps until…',
      lead: 'A paper chain, one link for every sleep. One comes off each night.',
      what: 'Sleeps until…',
      whatPlaceholder: 'Grandma comes',
      day: 'The day',
      choose: 'Choose a day',
      picture: 'A picture for it',
      yearly: 'It comes round every year',
      tearer: 'Who tears the links off?',
      save: 'Start the chain',
    },
  },

  // 16.6 Where is it?
  whereIsIt: {
    /** The box to ask in. */
    ask: "Where's the…?",
    clear: 'Clear the question',
    cancel: 'Cancel',
    found: 'Found',
    foundSpoken: (name: string, place: string) => `${name}. Found: ${place}`,
    photoOf: (name: string) => `A photo of where ${name} is`,
    /** When something was put where it is, inside the sentence below. */
    today: 'today',
    yesterday: 'yesterday',
    onDay: (day: string) => `on ${day}`,
    /** "Alex put them there on 14 September." It says "them" for a thing that reads as several. */
    put: (name: string | null, when: string | null, thing: { name: string; note: string | null }) => {
      const what = several(thing) ? 'them' : 'it';
      const who = name ? `${name} put ${what} there` : 'Put there';
      return when ? `${who} ${when}.` : `${who}.`;
    },
    /** What else to know, then who put it there: "Tent, pegs and both mats. Alex put them there on 14 September." */
    about: (note: string | null, put: string) => (note ? `${note}${/[.!?]$/.test(note) ? '' : '.'} ${put}` : put),
    /** "Last seen on the hall hook · Mia, 7:50". */
    lastSeen: (place: string, by: string | null, when: string | null) => {
      const who = by && when ? `${by}, ${when}` : (by ?? when);
      return who ? `Last seen ${place} · ${who}` : `Last seen ${place}`;
    },
    others: 'Other things put away',
    all: 'Things put away',
    notFound: { title: (question: string) => `Nothing put away answers “${question}”`, body: "Try the name of the thing itself. If it isn't on the list yet, add where it is." },
    add: { title: 'Putting something away?', line: 'A photo and a place', button: 'Add' },
    empty: { title: 'Nothing is put away yet', body: "When something goes into the attic, the cellar or a neighbour's care, add a photo and the place. Then anyone can ask where it is." },
    item: {
      seenWhere: 'Seen it somewhere else? Say where',
      seenPlaceholder: 'on the hall hook',
      saySeen: 'Say where you saw it',
      newPlace: 'It lives somewhere new',
      move: 'Give it its new place',
      remove: 'Take it off the list',
    },
    form: {
      title: 'Put something away',
      lead: 'What it is and where it went, so the next person can find it.',
      name: 'What it is',
      namePlaceholder: 'Tent',
      place: 'Where it is',
      placePlaceholder: 'Attic, blue crate 3',
      note: 'What else to know',
      notePlaceholder: 'Tent, pegs and both mats.',
      picture: 'A picture for it',
      addPhoto: 'Add a photo of the place',
      changePhoto: 'Choose another photo',
      photoChosen: 'The photo you chose',
      only: 'Who is it for?',
      everyone: 'Everyone who sees the list',
      save: 'Put it on the list',
    },
  },

  // 16.7 Habit charts
  habitCharts: {
    stars: (stars: number) => plural(stars, 'star'),
    /** What a screen reader says for one day of one row: "Bed made, Thursday". */
    cell: (what: string, day: string) => `${what}, ${day}`,
    /** The round tick at the end of a grown-up's chart. */
    today: (title: string) => `${title}, today`,
    grownUps: 'The grown-ups',
    gap: { title: 'A missed day is a gap, not a failure', body: 'Nothing resets. The chart just carries on.' },
    lastWeek: 'Last week',
    thisWeek: 'Back to this week',
    /** Under the title while another week is shown. `range` is "2 to 8 November". */
    weekOf: (range: string) => range,
    empty: { title: 'No charts yet', body: "A chart is a tick a day: bed made, bag packed, twenty minutes of reading. On a child's chart every tick is a star." },
    chart: { takeDown: 'Take the chart down', takeDownNote: 'The stars earned on it stay earned.' },
    add: {
      button: 'Add a chart',
      title: 'A new chart',
      lead: 'A tick a day. A missed day is a gap, nothing more.',
      name: 'What it is called',
      namePlaceholder: 'Reading, 20 minutes',
      picture: 'A picture for it',
      who: 'Who is it for?',
      everyone: 'Everyone',
      often: 'How often',
      once: 'Once a day',
      twice: 'Morning and evening',
      morning: 'Morning',
      evening: 'Evening',
      days: 'On which days',
      starsNote: "On one child's chart every tick is a star. Everyone else's charts are just for keeping it up.",
      save: 'Start the chart',
    },
  },
} as const;
