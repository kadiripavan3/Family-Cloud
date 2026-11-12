/** 6 Library: photos, videos and documents, the ways of looking at them, and adding to them. Also 12.2 Storage and backup. */
import { APP, JOURNEY } from './names';
import { formatList, plural, spelled } from './plural';

/** 3180 becomes "3,180". */
const n = (count: number) => count.toLocaleString('en-US');
const photos = (count: number) => `${n(count)} ${count === 1 ? 'photo' : 'photos'}`;
const videos = (count: number) => `${n(count)} ${count === 1 ? 'video' : 'videos'}`;
/** "48 photos and 3 videos", "9 photos", "1 video". */
const counts = (photoCount: number, videoCount: number) => {
  if (videoCount === 0) return photos(photoCount);
  if (photoCount === 0) return videos(videoCount);
  return `${photos(photoCount)} and ${videos(videoCount)}`;
};
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** After what was done, how many were left as they were: " 2 were left as they are." Nothing when none were. */
const left = (skipped: number, why: string) => (skipped > 0 ? ` ${skipped === 1 ? '1 was' : `${n(skipped)} were`} left as ${skipped === 1 ? 'it is' : 'they are'}: ${why}.` : '');

/** What each kind of document is called on its chip. */
const CATEGORIES: Record<string, string> = {
  id: 'IDs',
  insurance: 'Insurance',
  school: 'School',
  receipt: 'Receipts',
  recipe: 'Recipes',
  manual: 'Manuals',
  tax: 'Tax',
  health: 'Health',
  home: 'Home',
  other: 'Other',
};

/**
 * The day that matters about a document, in a few words. `day` is the day written out ("2 Aug 2027"),
 * `month` its month ("Nov 2028"), `daysLeft` how far off it is, and `soon` whether it is time to act.
 */
const keyDate = (label: string | undefined, day: string, month: string, daysLeft: number, soon: boolean) => {
  if (daysLeft < 0) {
    if (label === 'renews') return `Was to renew on ${day}`;
    if (label === 'due') return `Was due ${day}`;
    if (label === 'warranty') return `Warranty ended ${month}`;
    return `Ran out on ${day}`;
  }
  if (soon && daysLeft <= 60) {
    const when = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
    if (label === 'renews') return `Renews ${when}`;
    if (label === 'due') return `Due ${when}`;
    if (label === 'warranty') return `Warranty ends ${when}`;
    return `Runs out ${when}`;
  }
  if (label === 'renews') return `Renews ${day}`;
  if (label === 'due') return `Due ${day}`;
  if (label === 'warranty') return `Warranty to ${month}`;
  if (label === 'valid_until') return `Valid until ${day}`;
  return `Expires ${day}`;
};

export const library = {
  /** "48 GB": how much room something takes. */
  size: (value: number, unit: string) => `${value} ${unit}`,
  counts,
  /** A photo or a video as a tile, for a screen reader: what it is, who added it, and its caption. */
  tile: (video: boolean, caption: string | null, by: string | null, length: string | null) => {
    const what = video ? (length ? `Video, ${length},` : 'Video') : 'Photo';
    const whose = by ? `${what} added by ${by}` : what.replace(/,$/, '');
    return caption ? `${caption}. ${whose}` : whose;
  },
  more: 'More',

  // Things that are drawn and can't work yet, said plainly when pressed
  notYet: {
    story: `Turning this into a story arrives when ${APP} and ${JOURNEY} are linked.`,
    send: `Sending these to ${JOURNEY} arrives when ${APP} and ${JOURNEY} are linked.`,
    map: "The map isn't built yet. For now your places are a list.",
    play: "That video couldn't be opened. Try its download button.",
  },

  // 6.1 The wall
  wall: {
    lens: { wall: 'Wall', albums: 'Albums', people: 'People', places: 'Places', files: 'Files' },
    /** After the day and the place of a moment several people photographed: "51 from 3 people". */
    from: (total: number, people: number) => `${n(total)} from ${people} people`,
    /** A day's line, for a screen reader. */
    openMoment: (title: string, line: string) => `${title}. ${line}. Open this moment`,
    strip: 'Years',
    jumpTo: (year: number) => `Jump to ${year}`,
    /** The bubble beside the strip. */
    monthSpoken: (month: string) => `${month}. Jump to a month`,
    months: {
      title: (year: number) => `Jump to a month of ${year}`,
      seeYear: (year: number) => `See all of ${year}`,
    },
    people: {
      title: 'People in your photos',
      note: 'From who was tagged by hand. Nothing here looks at faces.',
      none: 'Nobody is tagged yet. Open a photo, press the three dots and say who is in it.',
      count: (count: number) => counts(count, 0),
    },
    none: {
      title: 'Your photos live here',
      body: 'Add photos and videos from this device. They are only yours until you share them.',
      add: 'Add photos',
    },
    noneOf: {
      title: (name: string) => `No photos of ${name} yet`,
      body: 'Open a photo, press the three dots and say who is in it.',
    },
  },

  // 6.2 Pinch out to a year
  years: {
    /** Under the year: "3,180 photos · 212 videos". */
    counts: (photoCount: number, videoCount: number) => (videoCount > 0 ? `${photos(photoCount)} · ${videos(videoCount)}` : photos(photoCount)),
    /** The year in the bar, for a screen reader: pressing it offers the other years. */
    choose: (year: number) => `${year}. Choose another year`,
    title: 'Years',
    everyone: 'Everyone',
    by: (name: string) => `By ${name}`,
    byYou: 'By you',
    videos: 'Videos',
    loved: 'Loved',
    /** A month's line, for a screen reader: pressing it shows that month on the wall. */
    month: (month: string, count: number) => `${month}, ${n(count)}. Show it on the wall`,
    count: (count: number) => n(count),
    tile: (video: boolean, month: string) => (video ? `Video from ${month}` : `Photo from ${month}`),
    /** The hint at the bottom. On a phone, pinching steps between them. */
    pinch: 'Pinch: days, months, years',
    none: { title: 'Nothing here', body: 'Nothing in this year fits that. Try Everyone.' },
    search: 'Search the library',
  },

  // 6.3 A moment
  moment: {
    /** "Three of you were here" when the person reading is one of them, "Three people were here" otherwise. */
    together: (people: number, withYou: boolean) => `${upperFirst(spelled(people))} ${withYou ? 'of you' : 'people'} were here`,
    /** "48 photos and 3 videos from Nora, Alex and Mia, put together by time and place." */
    gathered: (photoCount: number, videoCount: number, names: readonly string[]) => `${counts(photoCount, videoCount)} from ${formatList(names)}, put together by time and place.`,
    all: (total: number) => `All ${n(total)}`,
    you: 'You',
    turnInto: { title: 'Turn it into', note: 'An album or a story', album: 'Album', journey: JOURNEY },
    menu: { select: 'Select photos', album: 'Make it an album' },
    /** On its chip, when some of it is shared and some is not. */
    partly: 'Partly shared',
  },

  // 6.4 A photo
  viewer: {
    /** "12 of 51": where it stands in its moment or its album. */
    position: (position: number, total: number) => `${n(position)} of ${n(total)}`,
    photo: 'Photo',
    video: 'Video',
    addedBy: (name: string) => `Added by ${name}`,
    addedByYou: 'Added by you',
    /** Who can see it, after who added it: "everyone in The Linds can see it". */
    who: {
      me: 'only you can see it',
      circle: (everyone: string) => `${lowerFirst(everyone)} can see it`,
      some: (people: string) => `${people} can see it`,
      withYou: 'shared with you',
      not: (base: string, names: readonly string[]) => `${base}, but not ${formatList(names, 'or')}`,
    },
    /** That line, for a screen reader: pressing it opens who can see the photo. */
    whoSpoken: (line: string) => `${line}. Who can see this`,
    loves: (count: number) => plural(count, 'love'),
    comments: (count: number) => plural(count, 'comment'),
    openComments: (line: string) => `${line}. Open the comments`,
    love: 'Give it a heart',
    /** (Not "take it back": a button named Back is the way out of every screen.) */
    unlove: 'Remove your heart',
    share: 'Who can see this',
    download: 'Download',
    play: 'Play the video',
    /** A neighbour in the strip at the bottom. */
    newer: (steps: number) => (steps === 1 ? 'The one after it' : `${steps} after it`),
    older: (steps: number) => (steps === 1 ? 'The one before it' : `${steps} before it`),
    saved: 'Saved to your downloads.',
    opened: 'Opened the file. Save it from there.',
    notSaved: "That couldn't be saved. Try again.",

    menu: {
      who: 'Who is in it',
      nobody: 'Nobody tagged yet',
      album: 'Add to an album',
      details: 'Where and when',
      caption: 'Change the caption',
      addCaption: 'Add a caption',
      takeOut: 'Take it out of this album',
      delete: 'Delete',
    },
    tag: {
      title: 'Who is in it?',
      note: 'Tick the people in it. It then shows on their page and in the album that fills itself for them.',
      save: 'Save',
      viewOnly: 'You can look at this one, but not say who is in it.',
    },
    details: {
      title: 'Where and when',
      taken: 'Taken',
      /** "Sat 7 Nov, 11:42". */
      at: (day: string, time: string | null) => (time ? `${day}, ${time}` : day),
      place: 'Place',
      noPlace: 'Not known',
      /** "Lake Bled, Slovenia". */
      placeIn: (place: string, country: string | null) => (country ? `${place}, ${country}` : place),
      added: 'Added',
      addedBy: (name: string | null, ago: string) => (name ? `${ago}, by ${name}` : ago),
      file: 'File',
      albums: 'Albums',
      noAlbums: 'In no album',
    },
    caption: { title: 'Caption', field: 'Caption', save: 'Save' },
    addedTo: (album: string, already: boolean) => (already ? `It was in ${album} already.` : `Added to ${album}.`),
    deleteAsk: {
      title: (video: boolean) => (video ? 'Delete this video?' : 'Delete this photo?'),
      body: "It is deleted for everyone who can see it, and can't be brought back.",
      confirm: (video: boolean) => (video ? 'Delete video' : 'Delete photo'),
    },
    talk: {
      title: (count: number) => (count === 0 ? 'Comments' : plural(count, 'comment')),
      none: 'No comments yet. Say something nice.',
      add: 'Add a comment',
      send: 'Send',
      remove: 'Remove',
      removeBy: (name: string) => `Remove the comment by ${name}`,
      removeAsk: { title: 'Remove this comment?', body: 'It is removed for everyone.', confirm: 'Remove comment' },
      showMore: 'Show more comments',
      someone: 'Someone who left',
      close: 'Close the comments',
    },
  },

  // 6.5 Albums
  albums: {
    title: 'Albums',
    add: 'New album',
    tabs: { shared: 'Shared', mine: 'Only you', journey: `From ${JOURNEY}` },
    fresh: (count: number) => `${n(count)} new`,
    fills: 'Fills itself',
    journey: JOURNEY,
    /** Under an album's name: how many, and a few words on what it is. */
    line: (count: number, rest: string | null) => (rest ? `${n(count)} · ${rest}` : n(count)),
    everyoneAdds: 'everyone adds to it',
    ofPerson: (name: string) => `every photo ${name} is in`,
    originals: (count: number) => `${n(count)} ${count === 1 ? 'original' : 'originals'}`,
    card: (title: string, line: string) => `${title}. ${line}`,
    none: {
      shared: { title: 'No shared albums yet', body: 'An album shared with the circle shows here: yours, and the ones others share with you.' },
      mine: { title: 'No albums of your own yet', body: 'An album only you can see shows here.' },
      journey: { title: `Nothing from ${JOURNEY} yet`, body: `When ${APP} and ${JOURNEY} are linked, what you keep from ${JOURNEY} lands here as an album of its originals.` },
    },
    make: {
      title: 'New album',
      name: 'Name',
      how: 'How it fills',
      byHand: 'By hand',
      fills: 'Fills itself',
      byHandNote: 'You choose what goes in.',
      fillsNote: 'Every photo and video one person is in, from who is tagged by hand.',
      whose: 'Whose photos?',
      create: 'Create album',
      needName: 'Give it a name.',
      needPerson: 'Choose whose photos it gathers.',
    },
  },

  // An album's own page
  album: {
    /** Under its name: "8 photos and videos · everyone adds to it". */
    things: (count: number) => (count === 1 ? '1 photo or video' : `${n(count)} photos and videos`),
    files: (count: number) => plural(count, 'file'),
    menu: { add: 'Add photos', select: 'Select photos', rename: 'Rename', delete: 'Delete album', deleteFolder: 'Delete folder' },
    fillsNote: (name: string) => `It fills itself with every photo and video ${name} is in. Say who is in a photo, and it shows up here.`,
    none: { title: 'Nothing in it yet', body: 'Add photos and videos from the wall.', add: 'Add photos' },
    noneFills: (name: string) => ({ title: `No photos of ${name} yet`, body: 'Open a photo, press the three dots and say who is in it.' }),
    noneFolder: { title: 'Nothing in this folder yet', body: 'Files you put into it show here.' },
    rename: { title: 'Rename', field: 'Name', save: 'Save' },
    deleteAsk: { title: 'Delete this album?', folder: 'Delete this folder?', body: 'What is in it stays in the Library.', confirm: 'Delete album', confirmFolder: 'Delete folder' },
  },

  // 6.6 Places
  places: {
    title: 'Places',
    /** "38 places · 6 countries". */
    counts: (places: number, countries: number) => `${plural(places, 'place')} · ${plural(countries, 'country', 'countries')}`,
    layers: 'Map layers',
    backToWall: 'Back to the wall',
    /** "3 visits · last on 7 Nov", or "1 visit · 24 Sep 2019". */
    visits: (visits: number, lastDay: string) => (visits === 1 ? `1 visit · ${lastDay}` : `${n(visits)} visits · last on ${lastDay}`),
    /** "51 photos and 3 videos, from Alex, Mia and you". `names` already says "you" for the person reading. */
    from: (photoCount: number, videoCount: number, names: readonly string[]) => (names.length ? `${counts(photoCount, videoCount)}, from ${formatList(names)}` : counts(photoCount, videoCount)),
    you: 'you',
    place: (name: string, count: number, open: boolean) => `${name}, ${n(count)}. ${open ? 'Its photos are showing' : 'Show its photos'}`,
    none: { title: 'No places yet', body: 'Photos that know where they were taken gather here, place by place.' },
  },

  // 6.7 Files
  files: {
    title: 'Files',
    scan: 'Scan a document',
    search: 'Search inside scans and PDFs',
    clear: 'Clear the search',
    all: (total: number) => `All ${n(total)}`,
    category: (category: string | undefined) => CATEGORIES[category ?? ''] ?? CATEGORIES.other!,
    keyDate,
    /** The same after an amount, in the middle of a line: "€349 · warranty to Nov 2028". */
    keyDateAfter: (label: string | undefined, day: string, month: string, daysLeft: number, soon: boolean) => lowerFirst(keyDate(label, day, month, daysLeft, soon)),
    reminderSet: 'reminder set',
    pages: (pages: number) => plural(pages, 'page'),
    onPage: (name: string) => `on ${name}'s page`,
    linkedFrom: (title: string) => `Linked from ${title}`,
    added: (ago: string) => `Added ${ago}`,
    inFolder: (count: number) => plural(count, 'file'),
    inVault: 'Kept in the Vault',
    row: (title: string, badge: string | undefined, line: string) => [title, badge, line].filter(Boolean).join('. '),
    folder: (title: string, line: string) => `${title}. Folder. ${line}`,
    none: { title: 'No files yet', body: 'Scans and documents live here, beside the photos. Scan one, or pick a PDF.', add: 'Add a document' },
    noneOfKind: 'None of that kind yet.',
    noneFound: (query: string) => ({ title: `Nothing found for “${query}”`, body: 'Names are searched, and the words inside scans and PDFs.' }),
  },

  // 6.8 A document
  document: {
    /** What a file without a picture shows on its sheet of paper. */
    paper: (badge: string, pages: number | null) => (pages ? `${badge} · ${plural(pages, 'page')}` : badge),
    /** A travel document and the trip it is linked to. */
    clash: (months: number, trip: string) => (months > 0 ? `Runs out ${plural(months, 'month')} after ${trip}` : `Runs out before ${trip} ends`),
    /** Under the note's bold line: whether a trip needs it to last longer, and where its reminder stands. */
    note: (clash: boolean, reminder: string | null) => [clash ? 'Many countries want 6 months left.' : null, reminder].filter(Boolean).join(' '),
    reminderSet: 'A reminder is set.',
    reminderSetFor: (day: string) => `A reminder is set for ${day}.`,
    /** Before a reminder is set: the day the API suggests. */
    remindOn: (day: string) => `A good day to see to it: ${day}.`,
    remind: 'Remind me',
    reminded: (day: string) => `Reminder set for ${day}. It is in Plan.`,
    /** What the reminder is called: "Mia's passport: runs out 2 Aug 2027". */
    reminderTitle: (title: string, what: string) => `${title}: ${lowerFirst(what)}`,
    read: 'Read from the scan',
    /** A fact that is kept out of sight until asked for, such as a passport's number. */
    show: (label: string) => `Show the ${label.toLowerCase()}`,
    hide: (label: string) => `Hide the ${label.toLowerCase()}`,
    noWords: "The words inside this one haven't been read. A phone reads them while it scans; here you can type or paste them, and its dates are found.",
    nothingRead: 'Nothing we know how to read was found in its words.',
    addWords: 'Add the words',
    words: { title: 'The words inside it', field: 'Words', placeholder: 'Paste or type what it says: names, numbers, dates', save: 'Save' },
    /** A linked thing in the Vault, and who may open it. */
    inVault: 'Kept in the Vault',
    canOpen: { me: 'Only you can open it', some: (people: string) => `Only ${people} can open it`, circle: (everyone: string) => `${everyone} can open it` },
    neededFor: (title: string) => `Needed for ${title}`,
    menu: { open: 'Open the file', who: 'Who can see it', rename: 'Rename', words: 'The words inside it', delete: 'Delete' },
    rename: { title: 'Rename', field: 'Name', save: 'Save' },
    deleteAsk: { title: 'Delete this document?', body: "The file is deleted for everyone who can see it, and can't be brought back.", confirm: 'Delete document' },
  },

  // 6.9 Select and share
  select: {
    title: (count: number) => (count === 0 ? 'Select' : `${n(count)} selected`),
    all: 'Select all',
    clear: 'Clear',
    bar: { share: 'Share', album: 'Album', journey: JOURNEY, hide: 'Hide', save: 'Save', delete: 'Delete' },
    pickFirst: 'Pick at least one first.',
    selected: (order: number) => `Selected, number ${order}`,
    notSelected: 'Not selected',
    share: {
      title: (count: number) => (count === 1 ? 'Who can see this one?' : `Who can see these ${n(count)}?`),
      note: 'It changes the ones that are yours. The rest are left as they are.',
      some: 'Some people',
      someNote: 'Pick who. They can look, not change.',
      withThem: 'Share with them',
    },
    /** What sharing did. `who` is "only you", "everyone in The Linds" or "Alex and Mia". */
    shared: (applied: number, skipped: number, who: string) => (applied === 0 ? 'None of these are yours to share.' : `${n(applied)} now seen by ${who}.${left(skipped, 'not yours to share')}`),
    onlyYou: 'only you',
    /** The whole circle, in the middle of that sentence: "everyone in The Linds". */
    everyone: (everyone: string) => lowerFirst(everyone),
    names: (names: readonly string[]) => formatList(names),
    hide: {
      title: (count: number) => (count === 1 ? 'Hide this one from…' : `Hide these ${n(count)} from…`),
      note: 'Everyone else it is shared with still sees them. It stays hidden until you change it on the photo.',
    },
    hidden: (applied: number, skipped: number, name: string) => (applied === 0 ? `Nothing was hidden from ${name}: none of these are yours and shared.` : `Hidden ${n(applied)} from ${name}.${left(skipped, 'not yours, or not shared')}`),
    album: { title: 'Add to an album', fresh: 'New album', name: 'Name', create: 'Create and add', none: 'No albums you can add to yet. Make one below.' },
    added: (applied: number, skipped: number, album: string) => (applied === 0 ? `Nothing new went into ${album}.` : `Added ${n(applied)} to ${album}.${left(skipped, 'in it already, or not yours to add')}`),
    saved: (count: number) => `Saved ${n(count)} to your downloads.`,
    opened: 'Opened the first one. Saving many at once needs the phone app.',
    notSaved: "They couldn't be saved. Try again.",
    deleteAsk: {
      title: (count: number) => (count === 1 ? 'Delete this one for good?' : `Delete these ${n(count)} for good?`),
      body: "Only the ones that are yours are deleted. They can't be brought back.",
      confirm: (count: number) => `Delete ${n(count)}`,
    },
    deleted: (applied: number, skipped: number) => (applied === 0 ? 'None of these are yours to delete.' : `Deleted ${n(applied)}.${left(skipped, 'not yours to delete')}`),
    /** Choosing what goes into an album, from the album's own page. */
    into: { title: (album: string) => `Add to ${album}`, add: (count: number) => (count === 0 ? 'Choose what to add' : `Add ${n(count)}`) },
    none: { title: 'Nothing to select', body: 'There are no photos here yet.' },
  },

  // Adding photos and videos (the + button's Photos)
  adding: {
    title: 'Add photos',
    lead: (circle: string) => `Choose photos or a video from this device. They go into ${circle}, at full size.`,
    types: 'Photos as JPEG or PNG, and videos.',
    choose: 'Choose photos or a video',
    more: 'Choose more',
    state: {
      waiting: 'Waiting',
      checking: 'Checking it',
      uploading: (percent: number) => `Uploading · ${percent}%`,
      adding: 'Adding it',
      added: 'Added',
      already: 'Already in your Library',
      wrongType: "That kind of file can't be added.",
    },
    /** When everything picked has been dealt with. */
    summary: (added: number, already: number, failed: number) => {
      const parts = [added > 0 ? `${n(added)} added.` : null, already > 0 ? `${already === 1 ? '1 was' : `${n(already)} were`} already in your Library.` : null, failed > 0 ? `${n(failed)} didn't go up.` : null];
      return parts.filter(Boolean).join(' ');
    },
    progress: (done: number, all: number) => `${n(done)} of ${n(all)} done`,
    seeWall: 'See them on the wall',
    retry: 'Try those again',
    openShort: 'Open',
    open: (name: string) => `Open ${name}`,
    stopAsk: { title: 'Stop adding?', body: 'What has gone up stays. The rest is not added.', confirm: 'Stop', cancel: 'Keep going' },
  },

  // Scanning a document (the + button's Scan)
  scan: {
    title: 'Scan a document',
    lead: 'Choose a picture or a PDF of the document. A phone scans with its camera and reads the words by itself. Here you type or paste them, so its dates are found and it can be searched.',
    choose: 'Choose a picture or a PDF',
    change: 'Change',
    name: 'Name',
    words: 'The words inside it',
    wordsPlaceholder: 'Paste or type what it says: names, numbers, dates',
    pages: 'Pages',
    save: 'Add document',
    wrongType: 'A document is a JPEG or PNG picture, or a PDF.',
    already: 'That file is already in your Library.',
    openIt: 'Open it',
    notAdded: "That couldn't be added. Try again.",
  },

  // 12.2 Storage and backup
  storage: {
    title: 'Storage and backup',
    /** Under the big number: "of 200 GB · shared by The Linds". */
    of: (quota: string, circle: string | null) => (circle ? `of ${quota} · shared by ${circle}` : `of ${quota}`),
    kinds: { photos: 'Photos', videos: 'Videos', files: 'Files', other: 'Other' },
    /** "Photos 31 GB". */
    kind: (name: string, size: string) => `${name} ${size}`,
    byPerson: 'By person',
    you: 'You',
    whoLeft: 'People who left',
    person: (name: string, size: string) => `${name}: ${size}`,
    thisPhone: 'This phone',
    backup: {
      title: 'Backing up, on Wi‑Fi only',
      note: 'Needs the app on a phone. Here, add photos with the + button.',
      why: 'Backing up a camera roll by itself needs the app on a phone. In a browser, add photos with the + button.',
    },
    journey: {
      title: `Kept from ${JOURNEY}`,
      none: `Nothing yet. It fills when ${APP} and ${JOURNEY} are linked.`,
      some: (count: number) => `${n(count)} ${count === 1 ? 'album' : 'albums'} of originals`,
    },
    freeUp: {
      title: 'Free up space on this phone',
      note: 'Removes copies that are safely backed up. Needs the app on a phone.',
      button: 'Free up',
      why: 'Freeing up space needs the app on a phone: a browser keeps no copies to remove.',
    },
  },
} as const;
