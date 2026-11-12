/**
 * 15 Keepsakes: what a family would otherwise lose. Open when… (15.1), the birthday interview (15.2), Things
 * they said (15.3), Same spot, every year (15.4), Grandma's stories (15.5), the good things jar (15.6) and
 * the doorframe (15.7). What every board shares (its bar, its menu, sound) is in `templates.ts`.
 */
import { APP, JOURNEY } from './names';
import { plural, spelled } from './plural';

/** "Mia's", "Thomas'": whose something is. */
const of = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const keepsakes = {
  // 15.1 Open when…
  openWhen: {
    /** The chip in the bar, in place of the usual one: who the letters are for. */
    forName: (name: string) => `For ${name}`,
    forYou: 'For you',
    /** Under the title. `allYours` when every letter is the writer's own. */
    lead: (name: string, allYours: boolean) => (allYours ? `Letters for ${name}, from you` : `Letters for ${name}`),
    leadReader: 'Letters for you',
    /** What an envelope says: "…you can't sleep". */
    envelope: (when: string) => `…${when}`,
    /**
     * The line under a sealed envelope. `reader` is null for the reader themselves. A letter can come forward
     * when the reader is away on a journey.
     */
    sealedLine: (letter: { voice: boolean; forward: boolean }, reader: string | null) =>
      ['Sealed', letter.voice ? 'with a voice message' : null, letter.forward ? (reader ? `comes forward when ${reader} is on a journey` : "comes forward when you're on a journey") : null].filter(Boolean).join(' · '),
    /** The line under an opened one. `reader` is null for the reader themselves: "You opened it on 2 Nov, at 21:40". */
    opened: (reader: string | null, day: string | null, time: string | null) => {
      const who = reader ? `${reader} opened it` : 'You opened it';
      return day ? (time ? `${who} on ${day}, at ${time}` : `${who} on ${day}`) : who;
    },
    yours: (name: string) => `Your letter for ${name}. You can read it; nobody else can until it is opened.`,
    fromName: (name: string) => (name ? `From ${name}` : 'A letter for you'),
    sealedForYou: "It's sealed. Open it when the moment has come: it can only be opened once.",
    /** What a sealed envelope says to someone it isn't for and who didn't write it. */
    notYours: (name: string) => `Only ${name} can open this one, and only the person who wrote it can read it before that.`,
    playVoice: 'Play the voice message',
    open: {
      button: 'Open it',
      buttonWith: (name: string) => `Open it with ${name}`,
      ask: "Open it now? It can only be opened once, and whoever wrote it is told that you did.",
      askWith: (name: string) => `Open it with ${name} now? It can only be opened once.`,
      yes: 'Yes, open it',
      no: 'Not yet',
    },
    takeBack: 'Take the letter back',
    another: 'Write another',
    first: 'Write the first letter',
    /** The small print at the end of the page, for the writer. */
    fine: (name: string) => `${name} sees the envelopes, not what's inside. Once opened, a letter is ${of(name)} to keep.`,
    fineReader: "You see the envelopes, not what's inside. Once opened, a letter is yours to keep.",
    empty: {
      title: 'No letters yet',
      body: (name: string) => `Write one for a moment that will come: a bad day, a sleepless night. ${name} chooses when to open it.`,
      bodyReader: 'When someone writes you one, its envelope shows up here.',
    },
    write: {
      title: 'Open when…',
      lead: (name: string) => `A letter for ${name}, for a moment that will come.`,
      when: 'Open when…',
      whenPlaceholder: "you can't sleep",
      picture: 'The picture on the envelope',
      /** What each picture is, in the order they are offered. */
      pictures: ['Moon', 'Rain', 'School bag', 'Trophy', 'Plane', 'Love letter', 'Birthday cake', 'Seedling'],
      text: 'The letter',
      textPlaceholder: 'Dear…',
      addVoice: 'Add a voice message',
      changeVoice: 'Choose another recording',
      forward: (name: string) => `Bring it forward when ${name} is away on a journey`,
      save: 'Seal the envelope',
    },
    setup: { forWhom: 'Who are the letters for?' },
  },

  // 15.2 The birthday interview
  interview: {
    /** Under the title: "Ten questions, every 4 December". */
    lead: (questions: number, day: string | null) => {
      const count = `${capital(spelled(questions))} ${questions === 1 ? 'question' : 'questions'}`;
      return day ? `${count}, every ${day}` : count;
    },
    notAsked: 'Not asked yet',
    questionSpoken: (question: string, answers: number) => `${question}. ${answers === 0 ? 'Not asked yet' : plural(answers, 'answer')}. Answer it`,
    playAnswer: (name: string, age: number) => `Play ${of(name)} answer at ${age}`,
    /** Under the API's own "Mia's 10th is in 23 days", on the bar at the end of the page. */
    ready: (questions: number) => (questions === 0 ? 'No questions yet' : 'The questions are ready'),
    getReady: 'Get ready',
    answersSoFar: (answers: number) => (answers === 0 ? 'Not asked yet' : `Answered ${answers === 1 ? 'once' : `${spelled(answers)} times`}`),
    questions: { title: 'The questions', lead: 'The same ones every year. Tap one to write this year’s answer.', add: 'Add a question' },
    answer: {
      lead: (name: string) => `In ${of(name)} own words. It is kept under the age of this birthday.`,
      label: (name: string) => `What ${name} says`,
      addVoice: (name: string) => `Add ${of(name)} voice`,
      changeVoice: 'Choose another recording',
      save: 'Keep the answer',
      viewOnly: 'You can read the answers. Only the people it is shared with for editing can add one.',
    },
    setup: {
      forWhom: 'Whose interview is it?',
      name: (name: string) => `${of(name)} birthday interview`,
      noBirthday: (name: string) => `Add ${of(name)} birthday on their page first. The ages come from it.`,
    },
  },

  // 15.3 Things they said
  said: {
    search: 'Search what they said',
    closeSearch: 'Close search',
    everyone: 'Everyone',
    withVoice: 'With a voice',
    /** The words themselves, in quotation marks. */
    quoted: (text: string) => `“${text}”`,
    /** After the name of who said it: ", 6 years and 2 months · yesterday". */
    afterName: (rest: string) => `, ${rest}`,
    /** How long ago, for the first week. */
    since: (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`),
    quoteSpoken: (text: string, who: string, age: string | null) => [`“${text}”`, age ? `${who}, ${age}` : who].join('. '),
    playVoice: (who: string) => (who ? `Play ${of(who)} voice` : 'Play the recording'),
    /** Under an opened quote: who said it and when (`since` for the first week: "yesterday"), and who wrote it down. */
    written: (who: string, since: string | null, day: string, by: string | null) => {
      const said = [who, since ?? `on ${day}`].filter(Boolean).join(', ');
      return by ? `${said}. Written down by ${by}.` : `${said}.`;
    },
    remove: 'Take it out',
    add: 'What did they just say?',
    empty: { title: 'Nothing written down yet', body: "The sentence you swear you'll remember and never do. Type it here, and the age is worked out from the birthday." },
    none: { title: 'Nothing found', search: (typed: string) => `Nobody said anything with “${typed}” in it.`, filter: 'Nothing here yet.' },
  },

  // 15.4 Same spot, every year
  sameSpot: {
    /** The pill at the top: "First day of school · 2026". */
    counter: (title: string, year: number) => `${title} · ${year}`,
    lineUp: 'Last year, faintly. Line it up.',
    firstOne: 'The first one. Next year lines up with this.',
    taken: (year: number) => `${year} is taken. The button takes it again.`,
    yearOf: (year: number) => String(year),
    browser: "On a phone the camera opens here, with last year's photo laid faintly over it. In a browser, pick this year's photo instead.",
    photoOf: (year: number) => `The photo from ${year}`,
    picked: 'The photo you picked for this year',
    ghost: (year: number) => `The photo from ${year}, faintly`,
    flip: 'Turn the camera round',
    cameraNote: `The camera arrives with the phone app. Until then, pick this year's photo: last year's is laid over it the same way.`,
    choose: 'Pick a photo',
    take: "Pick this year's photo",
    retake: "Pick this year's photo again",
    keep: (year: number) => `Keep it as the photo for ${year}`,
    play: 'Play the years as a strip',
    stop: 'Stop',
    playNote: 'After a second year the photos play as a strip: the spot stays still and everyone grows.',
    showYear: (year: number) => `Show ${year}`,
    thisYear: (year: number) => `${year}, this year`,
  },

  // 15.5 Grandma's stories
  stories: {
    /** Under the title: "One question a week · 14 told so far". */
    lead: (told: number) => `One question a week · ${told} told so far`,
    thisWeek: "This week's question",
    play: (question: string) => `Play the answer to: ${question}`,
    /** Under an answered question. `ago` is "yesterday", "2h ago". */
    answered: (name: string, ago: string | null) => (ago ? `${name} answered ${ago}, by talking.` : `${name} answered by talking.`),
    waitingFor: (name: string) => `Waiting for ${of(name)} answer.`,
    send: (name: string) => `Send it to ${name}`,
    copyLink: 'Copy the link',
    linkNote: (name: string) => `The link is ${of(name)} alone. Tapping it opens a page to talk to: no app, nothing to type.`,
    cantShare: 'This browser has no share sheet. Copy the link and send it yourself.',
    /** What goes into the message the share sheet sends. */
    shareMessage: (name: string, question: string, link: string) => `${name}, a question for you: ${question} Tap to answer by talking: ${link}`,
    none: { title: 'No question is out yet', body: (name: string) => `Ask one, and ${name} gets it as a link.` },
    told: 'Already told',
    coming: 'Still to come',
    /** Under a story: "4 min 40 s · typed out, with 3 photos". */
    storyLine: (seconds: number | null, typed: boolean, photos: number) => {
      const length = seconds === null ? null : seconds < 60 ? `${seconds} s` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
      const kept = [typed ? 'typed out' : null, photos ? `with ${plural(photos, 'photo')}` : null].filter(Boolean).join(', ');
      // An answer whose length nobody measured, with nothing added to it yet, is still a story that was told.
      return [length, kept].filter(Boolean).join(' · ') || 'Told by talking';
    },
    /** Under a question that hasn't gone out: "Mia's question · goes out on Sunday". */
    waitingLine: (asker: string | null, weekday: string) => [asker ? `${of(asker)} question` : null, `goes out on ${weekday}`].filter(Boolean).join(' · '),
    unansweredLine: (day: string) => `Sent on ${day} · no answer yet`,
    sendNow: 'Send it now',
    takeBack: 'Take the question back',
    story: {
      open: 'Open the story',
      told: (name: string, ago: string | null) => (ago ? `Told by ${name}, ${ago}` : `Told by ${name}`),
      noTranscript: (name: string) => `Typing out ${of(name)} words needs a speech service, which isn't connected yet. The recording is kept as it is.`,
      photo: 'A photo for this story',
      addPhoto: 'Add a photo to the story',
    },
    ask: {
      title: 'Ask a question',
      lead: (name: string) => `It joins the queue, and ${name} gets one a week.`,
      question: 'The question',
      placeholder: 'What was your very first job?',
      by: 'Whose question is it?',
      save: 'Add it to the queue',
    },
    // The bar at the end of the page
    book: {
      title: 'Make it a book',
      line: (told: number, name: string) => `${plural(told, 'story', 'stories')}, in ${of(name)} words`,
      book: 'Book',
      bookNote: `Turning the stories into a book arrives with a later update of ${APP}. Every story is kept until then.`,
      journey: JOURNEY,
      journeyNote: (name: string) => `Telling ${of(name)} stories as a journey in parts arrives when ${APP} and ${JOURNEY} are linked.`,
    },
    setup: {
      teller: 'Whose stories are they?',
      tellerPlaceholder: 'Astrid Lind',
      note: 'Someone outside the circle. They get a link a week and need no app.',
      name: (name: string) => `${of(name)} stories`,
    },
  },

  // 15.6 The good things jar
  goodJar: {
    count: (count: number) => plural(count, 'good thing'),
    /** Under the count. The jar opens on the last day of the year, which has a name of its own. */
    lead: (day: string, newYearsEve: boolean) => `The jar opens on ${newYearsEve ? "New Year's Eve" : day}. Until then nobody can read it, only add to it.`,
    leadOpen: 'The jar is open. Read the year back, one slip at a time.',
    leadPast: (year: number) => `The jar of ${year}, open for good.`,
    /** A slip, by what it is: "Leo put in a drawing", "Alex added one from Reine". */
    slipTitle: (name: string, what: string, place: string | null) => {
      const who = name || 'Someone';
      if (what === 'drawing') return `${who} put in a drawing`;
      if (what === 'photo') return `${who} put in a photo`;
      return place ? `${who} added one from ${place}` : `${who} put in a good thing`;
    },
    /** Under it: the day, where it came from, and whether this person can read it. */
    slipLine: (day: string, fromJourney: boolean, yours: boolean) => [day, fromJourney ? 'from a journey' : null, yours ? 'you can read this one' : null].filter(Boolean).join(' · '),
    sealedWord: 'Folded',
    sealedUntil: (day: string) => `It stays folded until the jar opens on ${day}. Only the person who wrote it down can read it before then.`,
    empty: 'The jar is empty. Drop in the first good thing.',
    add: 'Something good from this week',
    addPhoto: 'Add a photo or a drawing',
    changePhoto: 'Choose another picture',
    photoChosen: 'The picture you chose',
    picture: 'The picture on the slip',
    mic: 'Say it out loud',
    micNote: 'Saying it out loud arrives with the phone app. For now, type it: it goes into the jar the same way.',
    read: { button: 'Read the year back', title: (year: number) => `The good things of ${year}` },
    earlier: 'Earlier jars',
    yearTitle: (year: number) => `The jar of ${year}`,
    thisYear: (year: number) => `Back to ${year}`,
  },

  // 15.7 The doorframe
  doorframe: {
    ruler: 'The marks on the doorframe',
    /** Beside the bold height on the ruler: "Mia · Nov 26". */
    markLine: (name: string, when: string) => `${name} · ${when}`,
    markSpoken: (name: string, cm: string, day: string) => `${name}, ${cm} cm, ${day}`,
    cm: (height: string) => `${height} cm`,
    empty: { title: 'No marks yet', body: 'Stand someone against the door, make the pencil mark, and add it here. Each mark keeps its date.' },
    add: {
      button: 'Add a mark',
      title: 'Add a mark',
      who: 'Whose mark is it?',
      height: 'Height in cm',
      heightPlaceholder: '138',
      heightNote: 'A height between 30 and 250 cm.',
      day: 'Measured on',
      save: 'Mark it',
    },
    landmark: {
      title: 'Add a line to measure against',
      note: 'Up to Grandma’s shoulder, tall enough for the big slide',
      lead: 'A height of your own. A child who reaches it is told so on their card.',
      text: 'What it is',
      textPlaceholder: "Up to Grandma's shoulder",
      save: 'Add the line',
    },
  },
} as const;
