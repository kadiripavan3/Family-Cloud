/**
 * 19 For friends: When can everyone? (19.3), Secret Santa (19.4), Where next? (19.5), the dictionary (19.6),
 * Predictions (19.7), the awards (19.8) and a goal you walk together (19.9). What every board shares (its
 * bar, its menu) is in `templates.ts`.
 */
import { formatList, plural, spelled } from './plural';

/** "Mia's", "Thomas'": whose something is. */
const of = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** All of a few, as people say it: "the one", "both", "all four". */
const allOf = (count: number) => (count === 1 ? 'the one' : count === 2 ? 'both' : `all ${spelled(count)}`);
/** A wish as it reads in the middle of a sentence: "A plant that is hard to kill" becomes "a plant that is hard to kill". A word in capitals stays as it is. */
const midSentence = (text: string) => (/^[A-Z][a-z' ]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text).replace(/[.!]+$/, '');
/** Things to choose between: "a", "a, or b", "a, b, or c". */
const either = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`);

export const crew = {
  // 19.3 When can everyone?
  findDate: {
    /** Under the board's name, in the bar. */
    lead: 'Tap the days you can do',
    setLead: (day: string) => `Set for ${day}`,
    /** This person, in a row of names the API wrote ("Lea, Lena, Ana and you"), and at the start of their own row. */
    you: 'you',
    youName: 'You',
    /** A day of the calendar, for a screen reader: "Saturday 28 November. 4 people can. The best day so far". */
    day: (weekday: string, day: string, free: number, best: boolean) => `${weekday} ${day}. ${free === 0 ? 'Nobody yet' : free === 1 ? '1 person can' : `${free} people can`}${best ? '. The best day so far' : ''}`,
    /** What the two colours under the calendar stand for. */
    key: {
      some: (from: number, to: number) => (from === to ? `${from} of you` : to === from + 1 ? `${from} or ${to} of you` : `${from} to ${to} of you`),
      most: (count: number) => `${count} of you`,
    },
    /** The bold line of the box under the calendar: "Sat 28 Nov works for all four who answered". */
    best: (day: string, free: number, best: { allWhoAnswered: boolean; everyone: boolean }) => (best.everyone ? `${day} works for everyone` : best.allWhoAnswered ? `${day} works for ${allOf(free)} who answered` : `${day} works for ${spelled(free)} of you`),
    /** Under it: who can, and who hasn't answered. `names` come from the API, with "you" last. "Lea, Lena, Ana and you. Kai hasn't tapped anything yet." */
    who: (names: readonly string[], waiting: readonly string[]) => {
      const can = `${capital(formatList(names))}.`;
      if (waiting.length === 0) return can;
      return `${can} ${capital(formatList(waiting))} ${waiting.length === 1 && waiting[0] !== 'you' ? "hasn't" : "haven't"} tapped anything yet.`;
    },
    noDay: { title: 'No day yet', body: 'Tap the days you can do. The darker a day, the more of you can make it.' },
    stillToAnswer: 'Still to answer',
    /** When it was sent round: a weekday for the first week ("Monday"), a date after that, null for today. */
    sent: (when: string | null) => (when === null ? 'Sent today' : `Sent on ${when}`),
    opened: 'opened, not answered',
    notOpened: 'not opened yet',
    nudged: (ago: string) => `nudged ${ago}`,
    /** This person's own row, while they haven't answered. */
    yourTurn: 'Tap the days you can do',
    nudge: 'Nudge',
    nudgeSpoken: (name: string) => `Nudge ${name}`,
    byLink: {
      title: 'Answered by link',
      days: (count: number) => (count === 0 ? "Can't do any of the days" : `Can do ${plural(count, 'day')}`),
      remove: 'Remove',
      removeSpoken: (name: string) => `Remove ${of(name)} answer`,
    },
    setFor: (day: string) => `Set it for ${day}`,
    /** The small print under the button: whose calendars it goes on, and that nobody is tied down. `waiting` are the others who haven't answered. */
    fine: (calendars: number, waiting: readonly string[]) =>
      `${calendars <= 1 ? 'It goes on your calendar.' : `It goes on ${allOf(calendars)} calendars.`} ${waiting.length ? `${formatList(waiting)} can still say no.` : "Anyone can still say they can't."}`,
    fineViewer: 'Someone who can change this board sets the day.',
    fineNoDay: "When a day works, one tap puts it on everyone's calendar.",
    set: {
      title: (day: string) => `It's set for ${day}`,
      body: "It is in the calendar with everyone on it. Each of you can still say you can't, in Plan.",
      fine: (calendars: number) => (calendars <= 1 ? 'It is on your calendar.' : `It is on ${allOf(calendars)} calendars.`),
      open: 'Open it in the calendar',
    },
    cant: {
      label: 'None of these days work for me',
      note: 'The others see that you have answered',
      undo: 'I can do some of these days after all',
      said: 'You said none of these days work for you. Tap a day if that changes.',
    },
    link: {
      button: 'Ask someone without the app',
      title: 'Ask someone without the app',
      lead: 'Anyone with this link writes their name and ticks their days on a web page. They see what it is for and who is asking, and nothing else.',
      copy: 'Copy link',
      share: 'Share the link',
      /** What goes out with the link. */
      message: (title: string, link: string) => `When can you? ${title}: ${link}`,
      copied: 'The link is copied.',
      cantShare: "The link couldn't be shared or copied from here. Select it above and copy it by hand.",
      new: 'Make a new link',
      newAsk: 'Make a new link? The old one stops working at once. The answers that came in stay.',
      newYes: 'Yes, make a new link',
      replaced: 'This is the new link. The old one no longer works.',
      notYours: 'Only people who can change this board see its link.',
    },
    setup: { name: 'What is it for?', namePlaceholder: 'Reunion dinner', from: 'First day', to: 'Last day' },
  },

  // 19.4 Secret Santa
  secretSanta: {
    you: 'You',
    draw: 'The draw',
    /** "Five names in the hat". */
    names: (count: number) => `${capital(spelled(count))} ${count === 1 ? 'name' : 'names'} in the hat`,
    drawnOn: (day: string | null) => (day ? `Drawn on ${day}. Nobody can see the whole list.` : 'The names are drawn. Nobody can see the whole list.'),
    notDrawn: 'Not drawn yet',
    /** The card at the top, once the names are drawn. */
    yours: {
      eyebrow: 'Only you can see this',
      title: (name: string) => `You're buying for ${name}.`,
      /** "Up to €25. Lena would like a plant that is hard to kill, or anything from the ceramics stall." */
      line: (budget: string | null, name: string, wishes: readonly string[]) =>
        [budget ? `Up to ${budget}.` : null, wishes.length ? `${name} would like ${either(wishes.map(midSentence))}.` : `${name} hasn't written a wish list yet.`].filter(Boolean).join(' '),
      gotIt: "I've got it",
      got: 'Got it',
      gotSpoken: "You've got it. Take that back",
    },
    /** The same card for someone who isn't in the hat. */
    out: { eyebrow: 'The names are drawn', title: "You're not in the hat this time.", line: 'Everyone in the hat knows who they are buying for. Nobody sees the whole list.' },
    /** The same card before the draw. */
    before: {
      eyebrow: 'Not drawn yet',
      title: (count: number) => `${capital(spelled(count))} ${count === 1 ? 'name' : 'names'} in the hat.`,
      line: (budget: string | null) => `${budget ? `Up to ${budget}. ` : ''}When everyone is in, draw the names. Each person sees one name, and nobody sees the list.`,
      draw: 'Draw the names',
    },
    apart: {
      pair: (one: string, other: string) => `${one} and ${other} can't draw each other`,
      add: "Two who can't draw each other",
      lead: 'A couple, say, or two who had each other last year. It has to be set before the names are drawn.',
      one: 'One of them',
      other: 'And the other',
      why: 'Why (if you like)',
      whyPlaceholder: "They're a couple",
      save: 'Keep them apart',
      remove: 'Take this rule away',
    },
    swap: {
      /** "Swapped at the reunion dinner". */
      title: (at: string | null) => (at ? `Swapped at ${at}` : 'The day of the swap'),
      none: 'No swap day yet',
      choose: 'Choose when the presents change hands',
    },
    wishes: {
      title: 'Your own wish list',
      empty: 'Nothing on it yet. Whoever draws you will be glad of a hint.',
      seenBy: 'Whoever has you can see this',
      add: "Something you'd like",
      spoken: (text: string) => `${text}. Change it`,
      change: { title: 'Change a wish', label: 'Your wish', save: 'Save', remove: 'Take it off the list' },
    },
    hat: {
      title: 'Who is in the hat',
      spoken: 'See who is in it',
      lead: 'Everyone here draws one name and is drawn by one person.',
      closed: 'The names are drawn, so the hat is closed. Who gives to whom is shown to nobody.',
      remove: (name: string) => `Take ${name} out of the hat`,
      add: 'Put someone in',
      tooFew: 'A draw needs three names. With two, each would know who has them.',
    },
    rules: {
      title: 'Budget and swap day',
      lead: 'What a present may cost, and when the presents change hands.',
      budget: 'The most a present should cost',
      budgetPlaceholder: 'No limit',
      budgetProblem: 'Write an amount, like 25. Leave it empty for no limit.',
      swapOn: 'Swap day',
      choose: 'Choose a day',
      swapAt: 'Where or when, in your words',
      swapAtPlaceholder: 'the reunion dinner',
      save: 'Save',
    },
    undo: {
      label: 'Undo the draw',
      title: 'Undo the draw?',
      body: 'The names go back into the hat, to be drawn again. It only works while nobody has their present yet.',
      confirm: 'Undo the draw',
    },
  },

  // 19.5 Where next?
  whereNext: {
    /** In the bar, after when the trip would be: "Spring 2027 · 5 of 5 voted". */
    voted: (voted: number, asked: number) => `${voted} of ${asked} voted`,
    days: (count: number) => plural(count, 'day'),
    each: (money: string) => `about ${money} each`,
    /** Beside the faces, once the vote is closed: "3 votes, yours too". */
    votes: (count: number, yours: boolean) => `${plural(count, 'vote')}${yours ? ', yours too' : ''}`,
    yourVote: 'Your vote',
    winnerWord: 'The winner',
    photoOf: (name: string) => `A photo of ${name}`,
    empty: { title: 'No ideas yet', body: 'Add the places you could go, with roughly what each costs. Then everyone votes.' },
    /** The box under the ideas while the vote is open. Nothing in it says who voted for what: the API doesn't either. */
    open: {
      title: (voted: number, asked: number) => `${voted} of ${asked} have voted`,
      body: (youVoted: boolean, waiting: readonly string[], lastDay: string | null) =>
        [youVoted ? null : 'Tap a place to vote.', 'Nobody sees who voted for what until it closes.', youVoted && waiting.length ? `Waiting for ${formatList(waiting)}.` : null, lastDay ? `The last day to vote is ${lastDay}.` : null].filter(Boolean).join(' '),
    },
    /** The same box once there is a winner. */
    winner: {
      title: (name: string) => `${name} it is`,
      body: (tied: boolean) => `${tied ? 'It tied, and won by being added first. ' : ''}Make it a trip: a space to plan in now, a shared journey when you leave.`,
      make: 'Make it',
      makeSpoken: (name: string) => `Make ${name} a trip`,
      made: 'It has a space of its own under Trips, with a page of the facts to plan from.',
      open: 'Open it',
    },
    noWinner: { title: 'Closed without a vote', body: 'Nobody voted before the last day. Start a new one for the next round.' },
    closedNote: 'The vote is closed. Start a new one for the next round.',
    viewOnly: 'You can look and vote. Only people who can change this board add ideas.',
    /** An idea, pressed. */
    sheet: {
      vote: (name: string) => `Vote for ${name}`,
      unvote: 'Take my vote back',
      moves: 'Your vote moves here from the place you chose before.',
      private: 'Your one vote. Nobody sees it until the vote closes, and it closes when everyone has voted.',
      remove: 'Take this idea out',
      addedBy: (name: string | null, mine: boolean) => (mine ? 'You added this' : name ? `Added by ${name}` : ''),
      voters: (names: readonly string[]) => (names.length ? `Voted for by ${formatList(names)}` : 'Nobody voted for this one'),
    },
    add: {
      button: 'Add an idea',
      title: 'Where to?',
      lead: 'With the facts beside it, so the vote is a fair one.',
      name: 'Where to',
      namePlaceholder: 'Porto',
      days: 'Days',
      daysProblem: 'A number of days, 1 to 365',
      cost: 'Roughly, each',
      costProblem: 'An amount, like 310',
      note: 'A line about it (if you like)',
      notePlaceholder: 'Trains all the way',
      choosePhoto: 'Add a photo',
      changePhoto: 'Choose another photo',
      photoChosen: 'The photo you chose',
      save: 'Add it to the vote',
    },
    close: {
      label: 'Close the vote now',
      note: 'Before everyone has voted',
      title: 'Close the vote now?',
      body: "The votes there are decide it, and it can't be opened again. Then everyone sees who voted for what.",
      confirm: 'Close the vote',
    },
    when: {
      title: 'When, and how long to vote',
      lead: 'When the trip would be, in your own words, and a last day to vote if you want one.',
      label: 'When would it be?',
      placeholder: 'Spring 2027',
      closesOn: 'Last day to vote',
      untilEveryone: 'Until everyone has voted',
      noLastDay: 'No last day',
      save: 'Save',
    },
    setup: { name: 'What is the vote called?', namePlaceholder: 'Where next?', when: 'When would it be? (if you know)', whenPlaceholder: 'Spring 2027' },
  },

  // 19.6 The dictionary
  dictionary: {
    /** Under the title: "31 words". */
    count: (count: number) => (count === 0 ? 'No words yet' : plural(count, 'word')),
    /** Whoever is reading, at the start of the line under a word they coined, and inside one ("by you"). */
    you: 'You',
    byYou: 'you',
    /** "First recorded at Lisbon airport, 4 Oct 2026, by Lea". */
    firstRecorded: (origin: string | null, day: string, by: string | null) => [`First recorded${origin ? ` at ${origin}` : ''}`, day, by ? `by ${by}` : null].filter(Boolean).join(', '),
    seeAlso: (word: string) => `see also: “${word}”`,
    /** What kind of word it is, after the word and in slanted letters: " verb". */
    afterWord: (part: string) => `  ${part}`,
    wordSpoken: (word: string, part: string) => `${word}, ${part}`,
    add: 'A new word, and what it means',
    mic: 'Say it out loud',
    micNote: "Saying it out loud is the phone's own dictation: tap the microphone on the keyboard. Here, the words are typed.",
    search: 'Search the words',
    closeSearch: 'Close search',
    none: { title: 'Not in the dictionary', body: (typed: string) => `No word or meaning has “${typed}” in it.` },
    empty: { title: 'No words yet', body: 'Every crew has words nobody else understands. Write the first one down, with what it means.' },
    photoOf: (word: string) => `The photo kept with “${word}”`,
    added: (ago: string) => `written down ${ago}`,
    change: 'Change it',
    remove: 'Take it out',
    /** The kinds of word that are offered. What an older word carries stays, whatever it is. */
    parts: ['noun', 'verb', 'adjective', 'saying'],
    form: {
      title: 'A new word',
      changeTitle: 'Change the word',
      lead: 'The word, what it means, and where it came from.',
      word: 'The word',
      wordPlaceholder: 'doing a Kai',
      meaning: 'What it means',
      meaningPlaceholder: 'Reaching the gate as it closes, with a pastry.',
      part: 'What kind of word',
      coinedBy: 'Who coined it',
      origin: 'Where it came from (if you know)',
      originPlaceholder: 'Lisbon airport',
      firstRecorded: 'First recorded',
      noDay: 'No day',
      seeAlso: 'See also (another word)',
      seeAlsoPlaceholder: 'just one more plate',
      choosePhoto: 'Add a photo',
      changePhoto: 'Choose another photo',
      photoChosen: 'The photo you chose',
      save: 'Put it in the dictionary',
      saveChange: 'Save',
    },
  },

  // 19.7 Predictions
  predictions: {
    /** Under the title: "Sealed until the reunion on 4 October 2031". */
    sealedUntil: (occasion: string | null, day: string) => (occasion ? `Sealed until ${occasion} on ${day}` : `Sealed until ${day}`),
    /** One of the others: "Lea has written all four", "Ana has written two", "Kai hasn't started". */
    wrote: (name: string, written: number, all: number) => (written === 0 ? `${name} hasn't started` : written >= all ? `${name} has written ${allOf(all)}` : `${name} has written ${spelled(written)}`),
    youWrote: (written: number, all: number) => (written === 0 ? "You haven't started" : written >= all ? `You've written ${allOf(all)}` : `You've written ${spelled(written)}`),
    oneEach: 'One about each of you',
    /** "One to go: about Kai". */
    toGo: (count: number, names: readonly string[]) => `${capital(spelled(count))} to go: about ${formatList(names)}`,
    drafts: (count: number) => (count === 1 ? 'One is still a draft' : `${capital(spelled(count))} are still drafts`),
    sealedWord: 'Sealed',
    fine: 'Nobody can read any of them before the day. Not even their own, once sealed.',
    sealDrafts: (count: number) => (count === 1 ? 'Seal your draft' : 'Seal your drafts'),
    about: (name: string) => `About ${name}`,
    /** Someone else's row, pressed. */
    theirs: {
      title: (name: string) => `${of(name)} predictions`,
      sealed: (name: string, day: string) => `Sealed until ${day}. Nobody can read them before then, ${name} included.`,
      none: (name: string) => `${name} hasn't written any yet.`,
    },
    write: {
      button: (written: number, toGo: number) => (toGo === 1 ? (written === 0 ? 'Write it' : 'Write the last one') : written === 0 ? 'Write the first one' : 'Write the next one'),
      title: 'A prediction',
      lead: (day: string) => `What will be true of them on ${day}? One about each of the others.`,
      about: 'Who is it about?',
      label: (name: string | null) => (name ? `Your prediction about ${name}` : 'Your prediction'),
      placeholder: 'Still late. Now with a child who is also late.',
      sealNote: 'Once it is sealed, nobody reads it before the day. Not you either. A draft stays yours to change, and only you can see it.',
      seal: 'Seal it',
      draft: 'Keep it as a draft',
    },
    /** This person's own. */
    yours: {
      open: 'See your own',
      title: 'Your predictions',
      lead: 'A sealed one shows who it is about and nothing more. A draft is still yours to change.',
      none: "You haven't written any yet.",
      draft: 'Draft · only you can see it',
      sealed: (day: string | null) => (day ? `Sealed on ${day}` : 'Sealed'),
      draftNote: 'A draft. Only you can see it until you seal it.',
      sealedNote: (day: string | null, opens: string) => `${day ? `Sealed on ${day}. ` : ''}It opens on ${opens}, and nobody can read it before then. You can still take it out, unread.`,
      saveDraft: 'Save the draft',
      removeDraft: 'Delete the draft',
      remove: 'Take it out, unread',
      back: 'Back to the list',
      write: (names: readonly string[]) => `Write one about ${formatList(names, 'or')}`,
    },
    /** From the day they open. */
    opened: {
      line: (occasion: string | null, day: string) => (occasion ? `Opened at ${occasion}, ${day}` : `Opened on ${day}`),
      fine: 'They are open. Say which ones came true: the others decide about yours.',
      none: 'Nobody sealed a prediction in time.',
      by: (name: string) => `${name} wrote this`,
      byYou: 'You wrote this',
      marks: (right: number, wrong: number) => (right + wrong === 0 ? 'nobody has said yet' : `${right} said it came true, ${wrong} said it didn't`),
      right: 'Came true',
      wrong: "Didn't",
      sayRight: 'Came true',
      sayRightSpoken: (name: string) => `${of(name)} prediction came true`,
      sayWrong: "Didn't",
      sayWrongSpoken: (name: string) => `${of(name)} prediction didn't come true`,
    },
    setup: {
      name: 'What it is called',
      titleFor: (year: number) => `Predictions for ${year}`,
      opensOn: 'The day they open',
      occasion: 'What day is that? (if you like)',
      occasionPlaceholder: 'the reunion',
    },
  },

  // 19.8 The awards
  awards: {
    you: 'You',
    titleOf: (year: number) => `The ${year} awards`,
    decided: 'Decided',
    voting: 'Voting',
    haveVoted: (voted: number, asked: number) => `${voted} of ${asked} have voted`,
    vote: 'Vote',
    voted: 'Voted',
    /** After the winner's name, when the nomination says nothing about what for: "4 of 5 votes, their own included". */
    votesOf: (votes: number, total: number, ownIncluded: boolean, you: boolean) => `${votes} of ${total} ${total === 1 ? 'vote' : 'votes'}${ownIncluded ? (you ? ', your own included' : ', their own included') : ''}`,
    tied: (names: readonly string[], votes: number) => `${formatList(names)} · tied on ${plural(votes, 'vote')} each`,
    nobodyVoted: 'Nobody voted',
    viewOnly: 'You can look and vote. Only people who can change this board add an award.',
    /** The bar that floats over the end of the page. */
    bar: {
      opens: "Opens on New Year's Eve",
      decided: "Decided on New Year's Eve",
      /** "With 2025, 2024 and 2023 beside it". */
      beside: (years: readonly number[]) => `With ${formatList(years.map(String))} beside it`,
      first: 'Whatever is still open is decided then',
    },
    past: {
      button: 'Past years',
      title: 'Past years',
      lead: 'Every year stays on the shelf.',
      line: 'Decided, and on the shelf',
      back: (year: number) => `Back to ${year}`,
      none: 'This is the first year on the shelf. Next year it stands here.',
    },
    empty: { title: 'No awards yet', body: 'Invent a category: most likely to miss the flight, find of the year. Then say who is up for it, and vote.' },
    /** An award, pressed. */
    sheet: {
      decided: (total: number) => (total === 0 ? 'Decided without a vote' : `Decided · ${plural(total, 'vote')}`),
      voting: (voted: number, asked: number) => `Voting · ${voted} of ${asked} have voted`,
      noNominees: 'Nobody is nominated yet.',
      private: 'Your one vote for this award. Nobody sees who voted for whom, and the result shows when everyone has voted.',
      voteFor: (name: string, you: boolean) => (you ? 'Vote for yourself' : `Vote for ${name}`),
      votes: (count: number) => plural(count, 'vote'),
      won: 'Won',
      remove: 'Remove this award',
    },
    nominate: {
      button: 'Nominate someone',
      who: 'Who is up for it?',
      what: 'What for? (if you like)',
      whatPlaceholder: 'the tiled bar in Alfama',
      choosePhoto: 'Add a photo',
      changePhoto: 'Choose another photo',
      photoChosen: 'The photo you chose',
      save: 'Nominate',
    },
    decide: { button: 'Decide it now', ask: "Decide it now, with the votes there are? It can't be opened again.", yes: 'Yes, decide it' },
    add: {
      button: 'Add an award',
      title: 'A new award',
      lead: 'A category of your own, for this year.',
      name: 'What is it for?',
      namePlaceholder: 'Most likely to miss the flight',
      picture: 'Its picture',
      /** What each picture is, in the order they are offered. */
      pictures: ['Trophy', 'Camera', 'Star', 'Party popper', 'Speech bubble', 'Suitcase'],
      save: 'Add the award',
    },
  },

  // 19.9 A goal you walk together
  walk: {
    you: 'You',
    /** An amount with what it is counted in. The number is already written out: "1,240". */
    km: (number: string) => `${number} km`,
    steps: (number: string) => `${number} steps`,
    /** In the bar, after the circle's name: "2,100 km together". */
    together: (goal: string) => `${goal} together`,
    thisWeek: (amount: string) => `This week: ${amount}`,
    start: 'Start',
    end: 'The end',
    reached: 'You made it',
    personSpoken: (name: string, week: string, total: string) => `${name}: ${week} this week, ${total} in all`,
    mapSpoken: (from: string | null, to: string | null, total: string, goal: string, percent: number) => `The walk${from && to ? ` from ${from} to ${to}` : ''}: ${total} of ${goal}, ${percent}% of the way`,
    add: {
      button: 'Add what you walked',
      title: 'Add what you walked',
      lead: 'Only a number. Nothing is read from the phone, and no route is kept.',
      km: 'Kilometres',
      steps: 'Steps',
      kmProblem: 'Write the kilometres as a number, like 4.5. One walk can be up to 500.',
      stepsProblem: 'Write the steps as a number, like 8,400.',
      day: 'Which day',
      save: 'Add it',
    },
    yours: { title: 'Your walks of the last month', remove: (amount: string, day: string) => `Take out ${amount} on ${day}` },
    stops: {
      title: 'Places along the way',
      lead: 'A name and how far along it lies. Each one is marked on the line.',
      at: (amount: string, reached: boolean) => (reached ? `${amount} · reached` : amount),
      name: 'The place',
      namePlaceholder: 'Milan',
      atKm: 'How many kilometres from the start',
      atSteps: 'How many steps from the start',
      atProblem: 'Write how far along it lies, as a number.',
      tooFar: (goal: string) => `That is past the end. The whole way is ${goal}.`,
      add: 'Add the place',
      remove: (name: string) => `Take ${name} off the way`,
    },
    setup: {
      from: 'From',
      fromPlaceholder: 'Ljubljana',
      to: 'To',
      toPlaceholder: 'Lisbon',
      unit: 'What is counted',
      km: 'Kilometres',
      steps: 'Steps',
      farKm: 'How far is it, in kilometres?',
      farSteps: 'How far is it, in steps?',
      note: 'Only numbers are kept. No map is loaded and nothing is read from the phone.',
      titleFor: (to: string) => `Walk to ${to}`,
    },
  },
} as const;
