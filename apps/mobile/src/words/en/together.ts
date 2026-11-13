/**
 * 10 With Journey: the switch between the two apps, keeping a journey, the book it becomes, telling one,
 * "Before it leaves home", a trip start to finish, Journey on Today, and a goodnight from far away.
 * This is the one file where the sister app's own words (a journey, an entry, following) belong.
 */
import { places } from '@/theme/tokens';

import { mark, type Rich } from '../rich';
import { APP, JOURNEY } from './names';
import { formatList, plural } from './plural';

/** 3180 becomes "3,180". */
const n = (count: number) => count.toLocaleString('en-US');
const photos = (count: number) => `${n(count)} ${count === 1 ? 'photo' : 'photos'}`;
const clips = (count: number) => `${n(count)} ${count === 1 ? 'clip' : 'clips'}`;
/** "214 photos, 9 clips", "9 photos", "1 clip". */
const shots = (photoCount: number, clipCount: number) => (clipCount === 0 ? photos(photoCount) : photoCount === 0 ? clips(clipCount) : `${photos(photoCount)}, ${clips(clipCount)}`);

/** What Journey calls who can read a journey. */
const VISIBILITY: Record<string, string> = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };

/** Why something stays home, in a word or two. */
const WHY: Record<string, string> = { child: 'A child', home: 'At home', dropped: 'You left it out', not_a_photo: 'Not a photo', too_long: 'Too long' };

/** "Mia loved it", "You and Mia loved it"; nothing when nobody did. */
const lovedBy = (names: readonly string[], you: boolean) => {
  const all = you ? ['You', ...names] : [...names];
  return all.length ? `${formatList(all)} loved it` : null;
};
/** The same on a button with little room: "Leo loved it", "You loved it", "3 loved it". */
const lovedByShort = (names: readonly string[], you: boolean) => {
  const count = names.length + (you ? 1 : 0);
  return count === 0 ? null : count === 1 ? `${you ? 'You' : names[0]} loved it` : `${count} loved it`;
};

export const together = {
  /** Public, Unlisted, Private: Journey's own three words, and what each means for a journey that starts here. */
  visibility: {
    name: (visibility: string | null | undefined) => VISIBILITY[visibility ?? ''] ?? VISIBILITY.private!,
    label: `In ${JOURNEY} it starts as`,
    options: [
      { id: 'private', label: 'Private' },
      { id: 'unlisted', label: 'Unlisted' },
      { id: 'public', label: 'Public' },
    ],
    note: {
      private: `Only you can read it there, until you change that in ${JOURNEY}.`,
      unlisted: 'Anyone who has its link can read it. It is not listed anywhere.',
      public: `Anyone can find it and read it in ${JOURNEY}.`,
    },
  },

  /** Opening the other app, wherever a screen offers it. */
  open: {
    button: 'Open',
    inJourney: `Open in ${JOURNEY}`,
    /** In a browser there is no other app to hop to. */
    browser: `${JOURNEY} opens from here when both apps are on your phone. A browser has no app to hop to.`,
    /** On a phone that doesn't have the other app. */
    missing: `${JOURNEY} isn't on this phone. Once it is, this opens it, already signed in.`,
  },

  /** A job that takes a while: keeping a journey, sending one. */
  job: {
    progress: (done: number, total: number) => `${n(done)} of ${n(total)}`,
    waiting: 'Starting',
    failed: "That didn't work",
    tryAgain: 'Try again',
  },

  // 10.1 One account, two apps
  apps: {
    title: 'Your apps',
    signedIn: (name: string) => `Signed in as ${name} in both.`,
    here: { line: (circle: string) => `What you keep · ${circle}`, spoken: (line: string) => `${APP}. ${line}. You are here` },
    journey: {
      name: JOURNEY,
      line: (following: number) => `What you tell · ${n(following)} following`,
      noProfile: 'What you tell · no profile yet',
      spoken: (line: string) => `${JOURNEY}. ${line}. Open`,
    },
    facts: {
      originals: { title: `${JOURNEY} photos keep their originals`, note: `Full size here; ${JOURNEY} shows a lighter copy` },
      people: { title: 'Your people carry over', note: (name: string | null) => (name ? `Invite ${name} to a journey in one tap` : 'Invite them to a journey in one tap') },
      summary: { title: 'One Sunday summary', note: 'Both apps in one email, or none' },
    },
    /** What Journey can't do from here yet: the API's own sentences follow. */
    notYet: `What ${JOURNEY} can't do from here yet`,
    /** When this copy of the app runs without the other one. */
    off: `This ${APP} runs without ${JOURNEY}. The two are linked when both are switched on.`,
    /** On You: the line under "One account with Journey". */
    counts: (journeys: number, following: number) => `${plural(journeys, 'journey')} · ${n(following)} following`,
    noProfileYet: `No ${JOURNEY} profile yet. The account is ready for it.`,
    rowSpoken: (line: string) => `One account with ${JOURNEY}. ${line}`,
  },

  // 10.2 and 10.3 Keep a journey
  keep: {
    /** The list of your own journeys, to choose one from. */
    list: {
      title: 'Keep a journey',
      lead: `Your journeys in ${JOURNEY}. Choose one to bring home.`,
      line: (days: number, entries: number) => `${plural(days, 'day')} · ${plural(entries, 'entry', 'entries')}`,
      status: (status: string | undefined) => (status === 'completed' ? 'Finished' : status === 'paused' ? 'Paused' : 'Still going'),
      kept: 'Kept',
      none: { title: 'No journeys yet', body: `A journey you tell in ${JOURNEY} shows here, ready to be kept.` },
      sample: `These are sample journeys: this ${APP} runs with a stand-in for ${JOURNEY}.`,
      every: { title: 'Keep every journey I finish', note: 'Not built yet. For now, keep them one by one.' },
    },
    title: 'Keep this journey',
    /** Under the journey's name: "14 days · 62 entries · with Alex". */
    about: (days: number, entries: number, others: readonly string[]) =>
      [plural(days, 'day'), plural(entries, 'entry', 'entries'), others.length ? `with ${formatList(others)}` : null].filter(Boolean).join(' · '),
    book: { title: 'The story, as a book', note: `One page in ${places.notes}, every day in order` },
    originals: {
      title: 'The originals',
      /** "214 photos, 9 clips · 201 already in your Library". `inLibrary` is null when that can't be told. */
      note: (photoCount: number, clipCount: number, inLibrary: number | null) => (inLibrary === null ? shots(photoCount, clipCount) : `${shots(photoCount, clipCount)} · ${n(inLibrary)} already in your Library`),
    },
    route: { title: 'The route', note: 'Drawn on your Places map' },
    words: { title: 'Comments and likes', note: 'The kind words, kept with each day' },
    keepIn: 'Keep it in',
    noFolder: 'No folder',
    folderSheet: { title: 'Keep it in', none: 'No folder', noneNote: `It stands in ${places.notes} by itself` },
    whoSees: 'Who can see it',
    button: 'Keep journey',
    /** For a journey that was kept here before. */
    again: { button: 'Bring home what is new', note: 'You kept this journey before. Keeping it again brings home what was added since.' },
    keeping: 'Bringing it home',
    /** While it runs. */
    stay: 'You can leave this page. It goes on by itself.',
    done: {
      title: "It's home",
      /** "21 were in your Library already. 3 came from Journey, at the size Journey has." */
      body: (matched: number, brought: number, left: number) =>
        [
          matched > 0 ? `${n(matched)} ${matched === 1 ? 'was' : 'were'} in your Library already.` : null,
          brought > 0 ? `${n(brought)} came from ${JOURNEY}, at the size ${JOURNEY} has.` : null,
          left > 0 ? `${n(left)} stayed in ${JOURNEY}: it couldn't hand ${left === 1 ? 'it' : 'them'} over.` : null,
        ]
          .filter(Boolean)
          .join(' ') || 'The story is kept.',
      book: 'Open the book',
      album: 'See the album',
      close: 'Done',
    },
  },

  // The journeys kept in a circle
  kept: {
    title: `Kept from ${JOURNEY}`,
    by: (byline: string) => `A journey by ${byline}`,
    line: (photoCount: number, keptOn: string) => `${photos(photoCount)} · kept ${keptOn}`,
    none: { title: 'Nothing kept yet', body: 'Keep a finished journey and it lands here: its story as a book, its photos as an album.' },
    add: 'Keep a journey',
    atHome: `${JOURNEY} at home`,
  },

  // 10.4 A journey, kept as a book
  book: {
    pill: `Kept from ${JOURNEY}`,
    eyebrow: (byline: string) => `A journey by ${byline}`,
    stats: { days: 'days', entries: 'entries', photos: 'photos' },
    /** "+4" on the third photo of a day, and what it says aloud. */
    more: (count: number) => `+${n(count)}`,
    moreSpoken: (count: number) => `${n(count)} more in the album`,
    photo: (label: string) => `A photo of ${label}`,
    live: {
      title: `Still live in ${JOURNEY}`,
      /** "Public · 58 people followed it". */
      line: (visibility: string, followers: number) => `${visibility} · ${followers === 1 ? '1 person' : `${n(followers)} people`} followed it`,
    },
    share: 'Who can see it',
    menu: {
      asPage: `Open as a page in ${places.notes}`,
      asPageNote: 'To write in it, add to it or move it',
      album: 'See the album',
      bring: 'Bring home what is new',
      stop: 'Stop keeping it',
    },
    stopAsk: { title: 'Stop keeping this journey?', body: `Its page, its album and its photos stay here. They stop following the journey in ${JOURNEY}.`, confirm: 'Stop keeping it' },
    empty: 'This book has no days yet.',
  },

  // 10.5 Tell it as a journey
  tell: {
    title: 'Tell it as a journey',
    /** While the draft is being made. */
    sorting: 'Sorting it into days',
    /** "From Saturday at the lake and 2 days around it". The source's name is drawn in bold. */
    from: (title: string, kind: string | undefined, daysAround: number): Rich =>
      kind === 'album' ? ['From the album ', mark('bold', title)] : daysAround > 0 ? ['From ', mark('bold', title), ` and ${plural(daysAround, 'day')} around it`] : ['From ', mark('bold', title)],
    titleLabel: 'Title',
    sorted: { title: (days: number) => `Sorted into ${plural(days, 'day')}`, body: 'Move anything between days, or drop it. This is still a draft.' },
    day: (number: number) => `Day ${number}`,
    counts: shots,
    more: (count: number) => `+${n(count)}`,
    daySpoken: (day: string, line: string) => `${day}. ${line}. Change`,
    next: "Next: check what's shown",
    /** When every photo was dropped. */
    nothing: 'Everything is left out. Put a photo back to go on.',
    /** After a selection: some of what was picked is from other days or other albums. */
    notAll: (count: number) => `${count === 1 ? '1 of the things you picked is' : `${n(count)} of the things you picked are`} from another day. A journey is drafted from one moment or one album.`,
    sheet: {
      line: 'What the day was',
      linePlaceholder: 'A few words',
      hint: 'Tap a photo to move it to another day or to leave it out.',
      photo: (dropped: boolean, clip: boolean) => `${clip ? 'Clip' : 'Photo'}${dropped ? ', left out' : ''}`,
      moveTo: (day: string) => `Move to ${day}`,
      drop: 'Leave it out',
      restore: 'Put it back',
      one: 'This one',
    },
    leave: { title: 'Throw this draft away?', body: 'Nothing was sent. The photos stay where they are in your Library.', confirm: 'Throw it away', cancel: 'Keep writing' },
    posted: { title: `It's in ${JOURNEY} already`, body: `This draft became a journey. Carry on writing it in ${JOURNEY}.` },
  },

  // 10.6 Before it leaves home
  check: {
    heading: 'Before it leaves home',
    lead: 'These were private. Here is what a journey would show.',
    children: {
      title: (names: readonly string[]) => (names.length ? `Leave out ${formatList(names)}` : 'Leave out the children'),
      /** The drawing says "show a child's face"; what the app knows is who was tagged. */
      note: (count: number, of: number) => `${n(count)} of ${n(of)} are tagged with a child`,
    },
    town: { title: 'Show the town, not the spot', note: (shows: string | null | undefined) => (shows ? `“${shows}”, not the exact spot you stood on` : 'A day carries the name of its place, not the exact spot') },
    home: { title: 'Skip photos taken at home', note: (count: number) => photos(count), unknown: 'Nobody has said where home is yet, so none can be told apart' },
    never: { title: 'Files, bills and the Vault', note: `Never go to ${JOURNEY}` },
    /** Under the switches: what the app can't know. */
    tagged: 'The app goes by who is tagged. A photo of a child that nobody tagged is not left out, so look through what goes.',
    going: { title: (photoCount: number, clipCount: number) => `${shots(photoCount, clipCount)} would go`, note: (staying: number) => (staying > 0 ? `${n(staying)} stay home · look through them one by one` : 'Look through them one by one') },
    flags: {
      title: 'Worth a second look',
      line: (flag: string | undefined, count: number) =>
        flag === 'only_you'
          ? `${n(count)} ${count === 1 ? 'is' : 'are'} only yours to see here`
          : flag === 'hidden'
            ? `${n(count)} ${count === 1 ? 'is' : 'are'} hidden from someone today`
            : `${n(count)} ${count === 1 ? 'was' : 'were'} added by someone else`,
    },
    tooLong: (count: number) => `${count === 1 ? '1 clip is' : `${n(count)} clips are`} longer than 60 seconds and ${count === 1 ? 'stays' : 'stay'} home: ${JOURNEY} takes shorter ones.`,
    clipsAsTheyAre: "A clip goes as it is: what a video file carries inside can't be taken out. A photo goes as a fresh copy, with nothing inside about where it was taken.",
    sheet: {
      title: 'What goes, one by one',
      hint: 'Tap one that a switch left out to send it after all. Tap it again to leave it to the switches.',
      why: (reason: string | undefined) => WHY[reason ?? ''] ?? 'Stays home',
      backOn: 'Sent after all',
      spoken: (goes: boolean, why: string | null) => (goes ? 'Goes' : `Stays home${why ? `: ${why}` : ''}`),
    },
    /** "Create the journey · 35 photos". With clips among them the button counts them together; the row above says how many of each. */
    create: (photoCount: number, clipCount: number) => (clipCount === 0 ? `Create the journey · ${photos(photoCount)}` : `Create the journey · ${n(photoCount + clipCount)} in all`),
    fine: `Nothing has left ${APP} yet.`,
    nothing: 'Nothing would go. Switch a photo back on to create the journey.',
    sending: `Sending it to ${JOURNEY}`,
    sent: {
      title: `It's in ${JOURNEY}`,
      body: (visibility: string) => `It starts as ${visibility}. Carry on writing it there.`,
      close: 'Done',
    },
  },

  // 10.7 A trip, start to finish
  trip: {
    /** Under the trip's name in the bar. */
    sub: (space: string | null | undefined) => (space ? `A trip in ${space}` : 'A trip'),
    stages: { plan: 'Plan', go: 'Go', keep: 'Keep' },
    /** "3 to 17 Apr", "28 Mar to 3 Apr": the days of a trip. The months are already written out, short. */
    range: (fromDay: number, fromMonth: string, toDay: number, toMonth: string) => (fromMonth === toMonth ? `${fromDay} to ${toDay} ${toMonth}` : `${fromDay} ${fromMonth} to ${toDay} ${toMonth}`),
    now: 'now',
    after: 'after',
    done: 'done',
    stageSpoken: (stage: string, when: string) => `${stage}: ${when}`,
    filed: { plan: 'Getting ready', go: 'For the road', keep: 'What you planned' },
    empty: 'Nothing is filed in this trip yet. Open it as a folder to add a page, a list or a sheet.',
    becomes: {
      title: (day: string) => `On ${day} this becomes a journey`,
      today: 'Today this can become a journey',
      late: 'This can still become a journey',
      /** "Title, dates, route and Alex as co-author are set up for you. Post from the road; the originals come back here." */
      body: (coAuthors: readonly string[]) =>
        `Title, dates, route${coAuthors.length ? ` and ${formatList(coAuthors)} as ${coAuthors.length === 1 ? 'co-author' : 'co-authors'}` : ''} are set up for you. Post from the road; the originals come back here.`,
      see: 'See the draft',
    },
    told: {
      title: `Being told in ${JOURNEY}`,
      over: `Told in ${JOURNEY}`,
      line: (title: string | undefined, progress: string | null | undefined) => [title, progress].filter(Boolean).join(' · '),
    },
    bringHome: { title: "It's over. Bring it home", body: 'Keep the journey as the trip book: the story, the photos and the route.', button: 'Keep the journey' },
    book: { later: { title: 'Afterwards: the trip book', body: 'The journey, the map and what it really cost, on one page.' }, title: 'The trip book' },
    cost: { title: 'What it cost', line: (paid: string, planned: string) => `${paid} paid · ${planned} planned`, paidOnly: (paid: string) => `${paid} paid` },
    draft: {
      title: 'The draft',
      lead: `What ${JOURNEY} is told when this starts. Everything else in the trip stays here.`,
      name: 'Title',
      dates: 'Dates',
      route: 'Route',
      routeNote: `Stays here: ${JOURNEY} is told the title and the dates`,
      coAuthors: 'Co-authors',
      start: 'Start the journey',
      startEarly: 'Start it now',
      /** Before day one. */
      early: (day: string) => `The trip starts on ${day}. Start the journey that day, or now if you're on your way already. A trip becomes a journey once.`,
      once: 'A trip becomes a journey once.',
    },
    menu: { dates: 'Change the dates', asFolder: 'Open as a folder', asFolderNote: 'To add, move and rename what is in it', stop: 'Stop being a trip', make: 'Make it a trip' },
    stopAsk: { title: (name: string) => `Stop “${name}” being a trip?`, body: 'The folder and everything in it stay. Only its dates and its three stages go.', confirm: 'Stop being a trip' },
    dates: {
      title: 'When is the trip?',
      lead: `A folder with dates is a trip: planned here, told in ${JOURNEY}, and kept as a book afterwards.`,
      first: 'First day',
      last: 'Last day',
      make: 'Make it a trip',
      save: 'Save the dates',
    },
  },

  // 10.8 Journey, at home
  atHome: {
    newCount: (count: number) => `${n(count)} new`,
    lovedBy,
    love: 'Love it',
    loveSpoken: (title: string) => `Love “${title}”`,
    lovedSpoken: (line: string) => `${line}. Change`,
    onThisDay: 'On this day',
    ago: (years: number) => (years === 1 ? 'Last year' : `${years} years ago`),
    keptDay: (label: string | undefined) => [label, 'kept journey'].filter(Boolean).join(' · '),
    /** The sheet that asks whose heart it is, in a home with children. */
    hearts: { title: 'A heart from', you: 'You', note: `It stays at home: ${JOURNEY} is not told.`, on: 'Loved it', off: 'No heart yet' },
    page: {
      title: `${JOURNEY} at home`,
      away: 'Away now',
      nobody: 'Nobody in this circle is away on a journey you can see.',
      awayLine: (title: string | undefined, progress: string | undefined) => [title, progress].filter(Boolean).join(' · '),
      home: 'Home',
      where: { title: 'Where home is', note: 'Photos taken there stay home when a journey is told', set: 'Set', notSet: 'Not said yet' },
      bedtime: { title: 'Bedtime', note: 'A goodnight waits on Today until then' },
      clock: { title: 'The clock home keeps', note: 'So someone far away knows when bedtime is', notSet: 'Not said yet' },
      onlyRunners: 'The people who run the circle can change these.',
      goodnights: 'Goodnights',
      goodnightLine: (from: string | undefined, day: string) => [from, day].filter(Boolean).join(' · '),
      kept: 'From your journeys',
      off: `This ${APP} runs without ${JOURNEY}, so nothing of it shows at home.`,
    },
    whereSheet: {
      title: 'Where is home?',
      lead: (metres: number) => `Choose one of the places your photos were taken. A photo taken within ${n(metres)} metres of it counts as taken at home.`,
      placeLine: (country: string | null | undefined, count: number) => [country, photos(count)].filter(Boolean).join(' · '),
      none: 'No photo here says where it was taken yet, so there is no place to choose from.',
      forget: 'Forget where home is',
    },
    bedtimeSheet: { title: 'When is bedtime?', lead: 'A goodnight sent from far away waits on Today until then.' },
    clockSheet: { title: 'The clock home keeps', lead: 'Bedtime is told to someone far away on this clock.', use: (zone: string) => `Use this phone's clock: ${zone}` },
  },

  // 10.9 Goodnight from far away
  goodnight: {
    untitled: 'Goodnight',
    play: 'Play the goodnight',
    /** "0:48 · tap to play". */
    hint: (length: string | null) => (length ? `${length} · tap to play` : 'Tap to play'),
    only: (circle: string) => `Only for ${circle}`,
    /** "Recorded at 19:10 in Reine, for bedtime at home. It isn't part of the journey other people see." */
    about: (time: string | null, place: string | null | undefined, reply: boolean) =>
      `${['Recorded', time ? `at ${time}` : null, place ? `in ${place}` : null].filter(Boolean).join(' ')}${reply ? ', in answer.' : ', for bedtime at home.'} It isn't part of the journey other people see.`,
    sendBack: 'Send one back',
    love: 'Love it',
    lovedBy,
    lovedByShort,
    cantPlay: "The clip couldn't be opened here.",
    replies: (count: number) => (count === 1 ? '1 sent back' : `${n(count)} sent back`),
    answers: 'It answers another goodnight',
    back: {
      title: 'Send one back',
      lead: (circle: string) => `A short clip for bedtime where they are. It goes to ${circle} only, never to ${JOURNEY}.`,
      record: 'Record one now',
      recordNote: 'With the camera of this phone',
      choose: 'Choose a video',
      chooseNote: 'From this device',
      needsPhone: 'Recording needs the camera of a phone. In a browser, choose a video file instead.',
      notVideo: "That isn't a video the app can keep. Choose an MP4, a MOV or a WebM.",
      /** While the clip goes up: "Sending it · 40%". */
      sendingAt: (percent: number | null) => (percent === null ? 'Sending it' : `Sending it · ${percent}%`),
      sent: 'Sent. It waits for them at home.',
      titleOf: (name: string) => `Goodnight, ${name}`,
    },
    menu: { title: 'This goodnight', delete: 'Delete this goodnight' },
    deleteAsk: { title: 'Delete this goodnight?', body: 'The clip goes for everyone in the circle.', confirm: 'Delete it' },
  },
} as const;
