/** 5 Notes: spaces and folders, a page built from blocks, a shared list, and 13.2 working offline. */
import { mark, type Rich } from '../rich';
import { APP } from './names';
import { formatList, plural } from './plural';

const dot = (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** The kinds of text a block of a page can be. */
const TEXT_KINDS = { paragraph: 'Text', heading: 'Heading', bullet: 'Bullet' } as const;

export const notes = {
  // 5.1 Notes, on Home
  home: {
    pinned: 'Pinned',
    spaces: 'Spaces',
    lately: 'Lately',
    /** Under a space's name: "6 folders · 48 pages". */
    inside: (folders: number, pages: number) => dot([folders > 0 && plural(folders, 'folder'), plural(pages, 'page')]),
    /** Someone who is in a list right now, on its pinned card: "Alex is adding". */
    hand: (name: string, did: string | undefined) => (did === 'added' ? `${name} is adding` : `${name} is ticking`),
    /** A pinned list: "7 left · Alex is adding". */
    listLine: (left: number, done: number, hand: string | null) => dot([left === 0 ? (done === 0 ? 'Nothing on it yet' : 'All done') : `${left} left`, hand]),
    notFiled: 'Not filed',
    notFiledRest: (count: number) => `${plural(count, 'page or list', 'pages and lists')} in no folder yet`,
    newSpace: 'New space',
    empty: { title: 'No spaces yet', body: 'A space is a shelf for one part of life: the house, the kids, a trip. Make the first one.' },
    /** The sheet behind "Spaces": every space, and a way to make one. */
    allSpaces: 'Spaces',
  },

  // 5.2 A space, and a folder opened by itself
  space: {
    pages: (count: number) => plural(count, 'page'),
    /** The bar at the bottom: "New in Home". */
    newIn: (name: string) => `New in ${name}`,
    newWhat: 'Page, checklist, sheet or folder',
    templates: 'Templates',
    new: 'New',
    empty: 'Nothing in here yet. Start a page, a list or a folder below.',
    emptyReadOnly: 'Nothing in here that you can see.',
    /** The list of what isn't filed anywhere, opened from Notes. */
    notFiled: { title: 'Not filed', body: 'Pages and lists that are in no folder yet. Hold one to move it.', empty: 'Everything is filed.' },
    /** What a new thing in a folder can be. */
    kinds: { page: 'Page', checklist: 'Checklist', sheet: 'Sheet', folder: 'Folder' },
    kindNotes: { page: 'Words, photos, lists and live blocks', checklist: 'Lines to tick, alone or together', sheet: 'Rows, sums and formulas', folder: 'A shelf inside this one' },

    // A row
    left: (left: number) => `${left} left`,
    allDone: 'All done',
    /** A folder's twisty, for a screen reader. */
    unfold: (name: string) => `Show what is in ${name}`,
    fold: (name: string) => `Hide what is in ${name}`,
    emptyFolder: 'Nothing in it yet',
    /** How long ago, as short as it gets: "5m", "2h", "3d". */
    agoMinutes: (minutes: number) => `${Math.max(minutes, 1)}m`,
    agoHours: (hours: number) => `${hours}h`,
    agoDays: (days: number) => `${days}d`,
    /** For a screen reader: who changed it last, and how long ago. */
    editedBy: (name: string, ago: string) => `${name}, ${ago}`,
    hint: 'Hold for more',

    // The menus
    menu: {
      open: 'Open this folder',
      pin: 'Pin to the top of Notes',
      unpin: 'Take the pin away',
      rename: 'Rename',
      nameAndEmoji: 'Name and emoji',
      move: 'Move to another folder',
      up: 'Move up',
      down: 'Move down',
      shareInside: 'Share everything in it the same way',
      delete: 'Delete',
    },
    /** After "share everything in it the same way". */
    shared: (changed: number, notYours: number) =>
      notYours > 0
        ? `${plural(changed, 'thing')} in it now ${changed === 1 ? 'has' : 'have'} this audience. ${plural(notYours, 'thing')} from someone else stayed as ${notYours === 1 ? 'it was' : 'they were'}.`
        : `${plural(changed, 'thing')} in it now ${changed === 1 ? 'has' : 'have'} this audience.`,
    deleteAsk: {
      title: (name: string) => `Delete “${name}”?`,
      folder: 'The folder goes. What is in it stays, and moves up one level.',
      thing: "It is gone for everyone it was shared with. This can't be undone.",
      confirm: 'Delete',
    },
  },

  // Naming a new folder or space, and renaming anything
  name: {
    newSpace: 'New space',
    newFolder: (inside: string) => `New folder in ${inside}`,
    rename: 'Rename',
    label: 'Name',
    spacePlaceholder: 'Home, Kids, Trips',
    folderPlaceholder: 'House manual',
    emoji: 'Emoji',
    noEmoji: 'No emoji',
    create: 'Create',
    save: 'Save',
  },

  // Moving something to another folder
  move: {
    title: (name: string) => `Move “${name}”`,
    out: 'Out of every folder',
    asSpace: 'To the top, as a space',
    into: (name: string) => `Move into ${name}`,
  },

  // 5.3 A page
  page: {
    editedBy: (name: string, ago: string) => `Edited by ${name} · ${ago}`,
    /** The way to it from its space: "Home / House manual". */
    crumbs: (names: readonly string[]) => names.join(' / '),
    openFolder: (crumbs: string) => `${crumbs}. Open this folder`,
    empty: 'Nothing on this page yet. Tap here to write, or add something with the + below.',
    emptyReadOnly: 'Nothing on this page yet.',

    // The bar at the bottom
    bar: { text: 'Add text', checklist: 'Add a checklist', photo: 'Add a photo', sheet: 'Add a sheet', mention: 'Mention someone', add: 'Add to this page', done: 'Done' },

    // Words
    text: TEXT_KINDS,
    /** A text block as a button that starts typing in it, for a screen reader. */
    edit: (kind: keyof typeof TEXT_KINDS, text: string) => `${TEXT_KINDS[kind]}: ${text}. Change`,
    marksHint: '*bold*   _slanted_   ~struck~   @name',
    becomes: { paragraph: 'Make it plain text', heading: 'Make it a heading', bullet: 'Make it a bullet' },

    // A block's own menu
    block: {
      up: 'Move up',
      down: 'Move down',
      remove: 'Remove from the page',
      caption: 'Change the words under it',
      openList: 'Open the list',
      where: 'Change where it is',
    },
    photo: 'Photo',
    captionSheet: { title: 'Words under it', label: 'Caption', save: 'Save' },
    sending: { photo: 'Sending the photo', file: 'Sending the file' },

    // A file
    file: 'File',
    openFile: (name: string) => `Open ${name}`,
    size: (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(Math.round(bytes / 1024), 1)} KB` : `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`),
    fileNeedsPhone: 'Choosing a file on a phone arrives with the Library. In the browser it works today.',

    // A place
    place: { title: 'Where is it?', label: 'Place', placeholder: 'The pool on Kodeljevo', add: 'Add the place', save: 'Save', opens: 'Opens in Maps', open: (name: string) => `${name}. Open in Maps` },

    // A list drawn in the page
    listSheet: { title: 'A list in this page', name: 'Name of the list', lines: 'Lines to start with', linesNote: 'One line each. You can add more later.', add: 'Add the list', existing: 'Use a list you already have' },
    listWaiting: 'A new list. Its lines show here once it has been sent.',
    addLine: 'Add a line',

    // Live blocks
    unseen: { title: "Something you can't see", body: 'It is shared with other people, not with you.' },
    copy: 'Copy',

    // Mentions
    mention: { title: 'Mention someone', note: 'Their name goes into the text you are typing, or into a new line.' },

    // The menu
    menu: { pin: 'Pin to the top of Notes', unpin: 'Take the pin away', emoji: 'Change the emoji', move: 'Move to another folder', shareLists: 'Share the lists in it the same way', delete: 'Delete page' },
    listsShared: (changed: number, notYours: number) =>
      changed === 0 && notYours === 0
        ? 'There are no lists in this page.'
        : notYours > 0
          ? `${plural(changed, 'list')} now ${changed === 1 ? 'has' : 'have'} the page's audience. ${plural(notYours, 'list')} from someone else stayed as ${notYours === 1 ? 'it was' : 'they were'}.`
          : `${plural(changed, 'list')} now ${changed === 1 ? 'has' : 'have'} the page's audience.`,
    emojiSheet: 'Choose an emoji',
    needsConnection: "That needs a connection. Try again when you're back online.",
    offline: "You're offline. What you change is saved here and will reach everyone when you're back.",
    resting: `Can't reach ${APP} right now. What you change is saved here and goes up as soon as it answers.`,
  },

  // 5.4 Add to a page
  blocks: {
    title: 'Add to this page',
    kinds: {
      text: 'Text',
      checklist: 'Checklist',
      photo: 'Photo',
      file: 'File',
      place: 'Place',
      sheet: 'Sheet',
      bill: 'Bill',
      event: 'Event',
      password: 'Password',
      goal: 'Goal',
      person: 'Person',
      countdown: 'Countdown',
      recipe: 'Recipe',
      poll: 'Poll',
      sum: 'Sum',
    },
    live: "Sheets, bills, events, passwords and goals stay live. Change them here or where they live: it's the same thing.",
    /** A kind of block that isn't built yet. */
    later: (name: string) => `${name} blocks aren't built yet. They are on their way.`,

    // Choosing the thing a live block shows
    pick: {
      title: (aKind: string) => `Choose ${aKind}`,
      search: 'Search',
      none: 'There is nothing of this kind in this circle yet that you can see.',
      nothingFor: (typed: string) => `Nothing found for “${typed}”`,
    },
  },

  // 5.5 A shared list
  list: {
    /** "Alex is here now, ticking things off", with the names in bold. */
    here: (names: readonly string[], did: string | undefined): Rich => [
      mark('name', formatList(names)),
      names.length > 1 ? ' are here now' : did === 'added' ? ' is here now, adding things' : ' is here now, ticking things off',
    ],
    addedBy: (name: string, ago: string) => `Added by ${name} ${ago}`,
    repeats: { weekly: 'Every week', monthly: 'Every month' },
    hiddenFrom: (names: readonly string[]) => `${formatList(names)} can't see this one`,
    add: 'Add an item',
    addButton: 'Add',
    mic: 'Say it',
    micLater: 'Saying a line out loud needs the app on a phone. Type it here for now.',
    again: (text: string) => `Add ${text} again`,
    /** Under the lines, when some have an amount: "€163 in all · €45 ticked". */
    sum: (all: string, done: string | null) => dot([`${all} in all`, done && `${done} ticked`]),
    hidden: (count: number) => `${plural(count, 'ticked line')} hidden`,
    showThem: 'Show',

    menu: {
      hideTicked: 'Hide ticked lines',
      showTicked: 'Show ticked lines',
      rename: 'Rename',
      aislesOn: 'Sort new lines by aisle',
      aislesOff: 'Stop sorting by aisle',
      pin: 'Pin to the top of Notes',
      unpin: 'Take the pin away',
      move: 'Move to another folder',
    },
    renameSheet: { title: 'Rename', label: 'Name of the list', save: 'Save' },

    // One line's own sheet
    line: {
      text: 'Line',
      note: 'Small print',
      notePlaceholder: 'Alex bought them',
      amount: 'Amount',
      amountPlaceholder: '45',
      amountWrong: 'Write the amount as a number, like 45 or 4.50.',
      heading: 'Heading',
      headingPlaceholder: 'Fruit and veg',
      comesBack: 'Comes back after it is ticked',
      never: 'Never',
      whose: 'Whose job',
      keepFrom: 'Keep it from',
      keepFromNote: "They don't get this line at all: for the candles on a birthday list.",
      up: 'Move up',
      down: 'Move down',
      save: 'Save',
    },
    newShopping: { label: 'A shopping list', note: 'New lines find their aisle, and the aisles keep the order of a shop' },

    // 13.2 Offline
    offline: "You're offline. Your ticks are saved here and will reach everyone when you're back.",
    resting: `Can't reach ${APP} right now. Your ticks are saved here and go up as soon as it answers.`,
    waiting: 'waiting',
    /** A line that waits, for a screen reader. */
    waitingSpoken: 'Waiting to be sent',
  },

  // What waits on the phone, and what came back
  waiting: {
    /** The API's answer to a change came without a sentence. */
    gone: 'Something you changed here was removed while you were away, so there was nothing left to change.',
    /** A queue that was tried again and again without getting through. */
    stuck: "These changes can't get through. Try again, or let them go.",
    stuckTitle: (count: number) => `${plural(count, 'change')} couldn't be sent`,
    tryAgain: 'Try again',
    letGo: 'Let them go',
    noticeTitle: 'Not everything went in',
    ok: 'OK',
  },

  // Making a page or a list in a folder
  new: {
    goesInto: (folder: string) => `Goes into ${folder}`,
  },
} as const;
