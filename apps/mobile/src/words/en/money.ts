/** 8 Money: bills and subscriptions, sheets and their formulas, the loan planner, and who owes who. */
import { APP } from './names';
import { formatList, plural, spelled } from './plural';

/** "12th", "1st", "22nd": the day of the month a bill comes round on. */
function ordinal(day: number): string {
  const tens = day % 100;
  const ending = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${day}${ending}`;
}

/** "2 years 11 months", "3 years", "5 months": a stretch of months, the way people say it. */
function stretch(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? plural(years, 'year') : '', rest ? plural(rest, 'month') : ''].filter(Boolean).join(' ');
}

/** What the people who share costs in a circle are called, by its kind: "5 friends". */
const SHARERS: Record<string, (count: number) => string> = {
  family: (count) => plural(count, 'person', 'people'),
  couple: () => 'the two of you',
  flat: (count) => plural(count, 'housemate'),
  crew: (count) => plural(count, 'friend'),
  solo: () => 'just you',
};

export const money = {
  // 8.1 Money, the place under Home's row of six
  home: {
    /** The small line over the month's card: "November bills". */
    month: (name: string) => `${name} bills`,
    paidOf: (total: string) => `of ${total} paid`,
    monthSpoken: (month: string, paid: string, total: string) => `${month} bills: ${paid} of ${total} paid`,
    dueThisWeek: 'due this week',
    subscriptions: 'in subscriptions',
    /** Under the third number: the largest amount someone owes the person reading, or that they owe someone, from the circle's splits. */
    owesYou: (name: string) => `${name} owes you`,
    youOwe: (name: string) => `you owe ${name}`,
    nobodyOwes: 'owed to anyone',
    dueSoon: 'Due soon',
    nothingDue: 'Nothing is due. Add a bill with the + button.',
    sheets: 'Sheets',
    /** The card that stands where the sheets would be, in a circle that has none. */
    firstSheet: { tag: 'New', title: 'Start a sheet' },
    /** The small line over a sheet's name when it started blank. */
    sheetTag: 'Sheet',
    shared: 'Shared costs',
    otherCurrencies: (codes: readonly string[]) => `Bills in ${formatList(codes)} are in the lists, not in these sums.`,
  },

  // A bill as a row: on Money, and in the lists of bills
  row: {
    /** A bill that should have been paid by now. `day` is "Mon 9 Nov". */
    late: (day: string) => `Was due ${day}`,
    splitWith: (names: readonly string[]) => `split with ${formatList(names)}`,
    /** For someone who sees a bill they pay no part of: who does. */
    splitBetween: (names: readonly string[]) => `split between ${formatList(names)}`,
    paidBy: (name: string) => `${name} pays it`,
    login: 'login in the Vault',
    standingOrder: 'standing order',
    directDebit: 'direct debit',
    subscription: 'subscription',
    paid: (day: string) => `Paid ${day}`,
    aYear: (amount: string) => `${amount} a year`,
  },

  // The lists of bills: to pay, paid, subscriptions
  bills: {
    title: 'Bills',
    add: 'Add a bill',
    tabs: { due: 'To pay', paid: 'Paid', subscriptions: 'Subscriptions' },
    subscriptionsSum: (month: string, year: string) => `${month} a month · ${year} a year`,
    empty: {
      due: { title: 'Nothing to pay', body: 'A bill you add stays here until it is paid.' },
      paid: { title: 'Nothing paid yet', body: 'Bills show up here once they are marked as paid.' },
      subscriptions: { title: 'No subscriptions', body: 'Add a bill and say it is a subscription. They are counted together here.' },
    },
  },

  // 8.2 A bill
  bill: {
    /** Under the amount. `inDays` counts from today; `day` is "Thu 12 Nov". */
    due: (inDays: number, day: string) => {
      if (inDays === 0) return `Due today, ${day}`;
      if (inDays === 1) return `Due tomorrow, ${day}`;
      if (inDays === -1) return `Was due yesterday, ${day}`;
      return inDays < 0 ? `Was due ${day}` : `Due ${day}`;
    },
    paidOn: (day: string) => `Paid on ${day}`,
    /** The small pill under the day. `half` is true when two people pay the same. */
    pill: {
      mineOpen: (half: boolean) => (half ? "Your half isn't paid yet" : "Your share isn't paid yet"),
      minePaid: (half: boolean) => (half ? 'Your half is paid' : 'Your share is paid'),
      open: 'Not paid yet',
      paid: 'Paid',
    },
    /** Over the bars: "The last six". */
    last: (count: number) => `The last ${spelled(count)}`,
    usually: (amount: string) => `usually about ${amount}`,
    moreThanUsual: 'More than usual this time',
    bar: (month: string, amount: string) => `${month}: ${amount}`,

    // Who pays
    split: {
      /** `ratio` is "50/50" for two people, null when it doesn't say much. */
      title: (ratio: string | null, names: readonly string[]) => (ratio ? `Split ${ratio} with ${formatList(names)}` : `Split with ${formatList(names)}`),
      /** For someone who pays no part of it. */
      between: (names: readonly string[]) => `Split between ${formatList(names)}`,
      allYours: 'You pay all of it',
      allTheirs: (name: string) => `${name} pays all of it`,
      each: (amount: string) => `${amount} each`,
      yours: (amount: string) => `Your part is ${amount}`,
      hasPaid: (name: string) => `${name} has paid`,
      hasNotPaid: (name: string) => `${name} hasn't paid yet`,
      paidCount: (paid: number, all: number) => `${paid} of ${all} have paid`,
      nothingPaid: 'Nothing is paid yet',
      allPaid: 'All of it is paid',
    },
    whoPays: {
      title: 'Who pays what',
      you: 'You',
      paid: 'Paid',
      open: 'Not paid yet',
      mark: (name: string) => `Mark ${name}'s part as paid`,
      unmark: (name: string) => `${name}'s part isn't paid after all`,
      markMine: 'Mark my part as paid',
      unmarkMine: "Mine isn't paid after all",
      all: 'Mark all of it as paid',
    },

    // How it comes round
    repeat: {
      once: 'Comes once',
      monthly: (day: number) => `Every month, around the ${ordinal(day)}`,
      months: (every: number, day: number) => `Every ${every} months, around the ${ordinal(day)}`,
      /** `day` is "12 Nov". */
      yearly: (day: string) => `Every year, around ${day}`,
      reminds: (days: number) => (days === 0 ? 'Reminds you on the day' : days === 1 ? 'Reminds you the day before' : `Reminds you ${days} days before`),
      noReminder: 'No reminder',
      byStandingOrder: 'Paid by standing order',
      byDirectDebit: 'Paid by direct debit',
    },

    // Its login and its invoice
    login: {
      title: (payee: string) => `Log in to ${payee}`,
      note: 'From the Vault · opens signed in',
      none: 'No login kept with it',
      noneNote: 'Nothing from the Vault is linked yet',
      noneSheet: { title: 'No login yet', body: 'Nothing in the Vault is linked to this bill. Linking a password to a bill arrives with the Vault.' },
    },
    invoice: {
      note: 'Scanned from the letter · in Files',
      none: 'No invoice kept with it',
      noneNote: 'Scan the letter to keep it with the bill',
    },

    // The button at the bottom
    markMine: (half: boolean) => (half ? 'Mark my half as paid' : 'Mark my share as paid'),
    mark: 'Mark as paid',
    notPaidAfterAll: 'Not paid after all',
    /** After the last share of a bill that comes round again. `day` is "Sun 13 Dec". */
    dueAgain: (day: string) => `Paid. It is due again on ${day}.`,
    takeBack: 'Take it back',
    viewOnly: "You can see this bill, but not change it.",

    menu: {
      change: 'Change the bill',
      markAll: 'Mark all of it as paid',
      whoSees: 'Who can see it',
      copyIban: 'Copy the IBAN',
      copyReference: 'Copy the reference',
      openPayee: "Open the payee's page",
      delete: 'Delete the bill',
    },
    deleteAsk: { title: 'Delete this bill?', body: 'Its history goes with it, for everyone it was shared with. This can’t be undone.', confirm: 'Delete the bill' },
  },

  /** The button on a bill's line on Today. */
  pay: {
    label: 'Pay',
    spoken: (title: string) => `Pay ${title}`,
    paid: 'Paid',
  },

  // Adding a bill by hand, and changing one
  form: {
    new: 'New bill',
    change: 'Change the bill',
    add: 'Add bill',
    save: 'Save',
    scanInstead: 'Scan a letter instead',
    name: 'What is it',
    namePlaceholder: 'Electricity',
    payee: 'Who to pay',
    amount: 'Amount',
    amountWrong: 'Write the amount as a number, like 84.20.',
    due: 'Due',
    dueTitle: 'When is it due?',
    repeat: 'How often it comes',
    repeats: { once: 'Once', monthly: 'Every month', months: 'Every few months', yearly: 'Every year' },
    everyMonths: 'Every how many months',
    subscription: { label: 'A subscription', note: 'Counted with the other subscriptions' },
    pays: 'How it is paid',
    paysHow: { by_hand: 'By hand', standing_order: 'Standing order', direct_debit: 'Direct debit' },
    remind: 'Remind me',
    reminders: { none: 'No reminder', one: 'The day before', two: '2 days before', week: 'A week before' },
    whoPays: 'Who pays',
    onlyMe: 'I pay all of it',
    splitWith: (name: string) => `Split with ${name}`,
    splitNote: 'Split evenly between whoever is ticked',
    more: 'For paying it',
    iban: 'IBAN',
    reference: 'Reference',
    payUrl: "The payee's page for paying",
    note: 'Note',
  },

  // 8.3 Scan a bill
  scan: {
    /** The pill at the top, for each step. */
    counter: { pick: 'Pick a picture', lines: 'Type what it says', check: 'Check what was read' },
    pickPicture: 'Pick a picture of the paper',
    lines: {
      title: 'What does it say?',
      label: 'The lines on the paper',
      placeholder: 'Type or paste them, one line each',
      note: "On a phone the camera reads the words off the paper. That part isn't built yet, so type or paste the lines here.",
      read: 'Read it',
    },
    check: {
      title: 'Is this right?',
      payee: 'Who to pay',
      amount: 'Amount',
      due: 'Due',
      reference: 'Reference',
      iban: 'IBAN',
      /** Under a box: the line of the paper its value was read from. */
      from: (line: string) => `Read from “${line}”`,
      notFound: 'Not found on the paper. Type it in.',
      read: 'Read off the paper',
      again: 'Change the lines',
    },
    /** The two choices under the boxes. */
    monthly: 'Comes every month',
    splitWith: (names: readonly string[]) => (names.length > 2 ? `Split ${names.length + 1} ways` : `Split with ${formatList(names)}`),
    add: 'Add bill',
    /** The scan of a letter, kept in the Library and linked to its bill: "Invoice, November". */
    invoiceTitle: (month: string) => `Invoice, ${month}`,
    /** A picture of the letter for a bill that is there already: only the picture is kept. */
    letter: {
      title: (bill: string) => `The letter for ${bill}`,
      note: 'Pick a picture of it with the button at the top. It is kept in the Library, linked to this bill.',
      picked: 'Picked. It is kept in the Library, linked to this bill.',
      keep: 'Keep with the bill',
    },
    // A receipt scanned into a split
    receipt: { what: 'What was it', day: 'When', add: 'Add expense' },
  },

  // 8.4 Sheets
  sheets: {
    title: 'Sheets',
    new: 'New sheet',
    yours: 'Yours',
    none: 'No sheets here yet. Start one from a template below.',
    templates: 'Start from a template',
    tabs: (count: number) => plural(count, 'tab'),
    oneAMonth: 'one a month',
    /** "Alex edited it today". `name` is null for the person reading; `when` is "today", "yesterday" or "on 3 Nov". */
    edited: (name: string | null, when: string) => (name ? `${name} edited it ${when}` : `you edited it ${when}`),
    when: (daysAgo: number, day: string) => (daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `on ${day}`),
    live: 'LIVE',
    template: (title: string, says: string, live: boolean) => (live ? `${title}. ${says}. Has sliders to try first` : `${title}. ${says}`),
    // Starting one by hand
    name: 'Name of the sheet',
    namePlaceholder: 'Holiday budget',
    startBlank: 'Start blank',
    orTemplate: 'Or start from a template',
  },

  // 8.5 A sheet
  sheet: {
    /** Under the title, while someone else has it open. */
    here: (names: readonly string[]) => `${formatList(names)} ${names.length === 1 ? 'is' : 'are'} here too`,
    untitled: 'Untitled sheet',
    viewOnly: 'You can read this sheet, but not change it.',
    tile: (name: string, value: string) => `${name}: ${value}. Change this tile`,
    tileQuiet: (name: string, value: string) => `${name}: ${value}`,
    addTile: 'Add a tile',
    /** What a column holds: its kind, and a few words on it for the sheet that adds one. */
    kinds: {
      text: { name: 'Text', note: 'Words' },
      number: { name: 'Number', note: 'To count with' },
      money: { name: 'Money', note: 'An amount' },
      date: { name: 'Date', note: 'A day' },
      tick: { name: 'Tick', note: 'Done or not' },
      choice: { name: 'Choice', note: 'One of a few' },
      person: { name: 'Person', note: 'Someone here' },
      formula: { name: 'Formula', note: 'Worked out' },
    },
    column: (name: string, kind: string) => `${name}, ${kind}. Change this column`,
    columnQuiet: (name: string, kind: string) => `${name}, ${kind}`,
    addColumn: 'Add a column',
    rowNumber: (number: number) => `Row ${number}. More`,
    row: (number: number, first: string) => (first ? `Row ${number}: ${first}. Open as a card` : `Row ${number}. Open as a card`),
    tick: (column: string, number: number) => `${column}, row ${number}`,
    addRow: 'Add a row',
    moreRows: 'Show more rows',
    noRows: 'No rows yet.',
    total: 'Total',
    totalOf: (column: string, value: string) => `Total of ${column}: ${value}`,
    /** A count of ticks in the row of totals: "2 of 6". */
    of: (count: string, all: number) => `${count} of ${all}`,
    /** The bar itself, for a screen reader: what the chosen total does, and what it comes to. */
    bar: (says: string, value: string) => `${says.replace(/[.!?]$/, '')}: ${value}`,
    /** The line under the bar: what the chosen total does, what it left out, and how to open a row. */
    say: (says: string, leftOut: string | null) =>
      [says, leftOut, 'Tap a row to open it as a card.']
        .flatMap((part) => (part ? [/[.!?]$/.test(part) ? part : `${part}.`] : []))
        .join(' '),
    noTotals: 'Give a column a total and it shows here. Tap a row to open it as a card.',
    cantWorkOut: "Can't be worked out",
    /** A cell's people in a row: "Nora and Alex". */
    names: (names: readonly string[]) => formatList(names),
    sideways: 'The other columns. Scroll sideways for more.',
    menuAddTile: 'Add a tile on top',
    more: (count: number) => `+${count}`,

    // The tabs along the bottom
    tab: (name: string) => name,
    addTab: 'Add a tab',
    tabName: 'Name of the tab',
    tabNamePlaceholder: 'December',
    sameColumns: { label: 'Same columns as this tab', note: 'With its tiles, without its rows' },
    add: 'Add',
    save: 'Save',
    renameTab: 'Rename this tab',
    removeTab: 'Remove this tab',
    removeTabAsk: { title: 'Remove this tab?', body: 'Its rows, columns and tiles go with it. This can’t be undone.', confirm: 'Remove the tab' },

    // The sheet for one column
    columnSheet: {
      new: 'New column',
      name: 'Name of the column',
      namePlaceholder: 'Deposit',
      kind: 'What it holds',
      options: 'What can be chosen',
      optionsNote: 'One on each line',
      optionsPlaceholder: 'Booked\nTo book\nMaybe',
      total: 'Under it, in the row of totals',
      totals: { none: 'Nothing', sum: 'Total', avg: 'Average', count: 'How many', min: 'Smallest', max: 'Largest', ticked: 'How many ticked' },
      formula: 'Change its formula',
      formulaNext: 'Next: build its formula',
      remove: 'Remove this column',
      removeAsk: { title: 'Remove this column?', body: 'What it holds in every row goes with it. This can’t be undone.', confirm: 'Remove the column' },
    },

    // A row's own small menu
    rowMenu: {
      open: 'Open as a card',
      remove: 'Remove this row',
      removeAsk: { title: 'Remove this row?', body: 'Its note and its papers go with it. This can’t be undone.', confirm: 'Remove the row' },
    },

    menu: {
      rename: 'Rename the sheet',
      whoSees: 'Who can see it',
      delete: 'Delete the sheet',
    },
    renameTitle: 'Name of the sheet',
    deleteAsk: { title: 'Delete this sheet?', body: 'Every tab of it is gone, for everyone it was shared with. This can’t be undone.', confirm: 'Delete the sheet' },
  },

  // 8.6 A row, as a card
  rowCard: {
    title: (number: number, of: number) => `Row ${number} of ${of}`,
    note: 'Note',
    notePlaceholder: 'Anything worth remembering about it',
    ticked: 'Yes',
    notTicked: 'Not yet',
    empty: 'Nothing yet',
    nobody: 'Nobody yet',
    notADay: 'No date yet',
    /** The sheet that picks who, for a column of people. */
    people: (column: string) => column,
    choose: (column: string) => column,
    clear: 'Clear it',
    numberWrong: 'That takes a number.',
    amountWrong: 'Write the amount as a number, like 84.20.',
    /** Under a cell its formula works out. */
    workedOut: 'Worked out by its formula',
    papers: 'Receipts and papers',
    scan: 'Scan',
    addPaper: 'Add a receipt or a paper',
    paper: (number: number) => `Paper ${number}`,
    removePaper: (number: number) => `Remove paper ${number}`,
    removePaperAsk: { title: 'Remove this paper?', body: 'Its file is removed with it. This can’t be undone.', confirm: 'Remove it' },
    previous: (label: string) => `Previous row: ${label}`,
    next: (label: string) => `Next row: ${label}`,
    unnamed: (number: number) => `Row ${number}`,
    viewOnly: 'You can read this row, but not change it.',
  },

  // 8.7 A formula you can read
  formula: {
    newTile: 'New tile',
    newColumn: 'New column',
    tileName: 'Name of the tile',
    columnName: 'Name of the column',
    namePlaceholder: 'Still to pay',
    start: 'Tap a column or a function to start. The formula shows here as a sentence, with its answer.',
    box: 'The formula',
    changes: 'changes as rows change',
    firstRow: 'in the first row',
    columns: 'Columns',
    maths: 'Maths',
    more: 'More',
    fewer: 'Fewer',
    /** What a sign's chip says to a screen reader. */
    signs: { '+': 'Plus', '−': 'Minus', '×': 'Times', '÷': 'Divided by', '(': 'Open a bracket', ')': 'Close the bracket' },
    number: 'A number',
    numberPlaceholder: '100',
    numberAdd: 'Put it in',
    takeBack: 'Take the last one away',
    startAgain: 'Start again',
    /** The box to ask in words. `name` is someone else in the circle, when there is one. */
    ask: (name: string | null) => (name ? `Or ask: “How much has ${name} paid?”` : 'Or ask: “How much is left to pay?”'),
    askLabel: 'Ask in words',
    askSend: 'Ask',
    examples: 'Questions this tab can answer',
    use: 'Use this formula',
    as: 'Keep it as',
    asTile: 'A tile on top',
    asColumn: 'A column',
    needName: 'Give it a name first.',
    removeTile: 'Remove this tile',
    removeTileAsk: { title: 'Remove this tile?', body: 'Only the tile goes. The rows stay as they are.', confirm: 'Remove the tile' },
  },

  // 8.8 Template: the loan planner
  loan: {
    title: 'Loan planner',
    each: "You'd pay each month",
    interest: (amount: string, years: number) => `${amount} of interest over ${plural(years, 'year')}`,
    borrowed: 'Borrowed',
    rate: 'Interest a year',
    over: 'Over',
    years: (count: number) => plural(count, 'year'),
    percent: (rate: string) => `${rate}%`,
    slider: (label: string, value: string) => `${label}: ${value}`,
    chart: {
      now: 'Now',
      years: (count: number) => plural(count, 'year'),
      owe: 'What you still owe',
      spoken: (years: number, sooner: number | null) => (sooner === null ? `What you still owe, falling to nothing over ${plural(years, 'year')}` : `What you still owe, falling to nothing over ${plural(years, 'year')}, or in ${sooner} with the extra`),
    },
    extra: {
      title: (amount: string) => `Pay ${amount} more a month`,
      body: (months: number, saved: string) => (months > 0 ? `Done ${stretch(months)} sooner, with about ${saved} less interest.` : `It ends in the same month, with about ${saved} less interest.`),
      toggle: 'Count the extra in',
    },
    keep: 'Keep as a sheet',
    menu: { reset: 'Back to the numbers it opened with' },
    sheetTitle: 'Loan plan',
  },

  // 8.9 Splitting with friends
  split: {
    /** Under the title: the circle, and how many share its costs. */
    sub: (circle: string, kind: string, sharers: number) => `${circle} · ${(SHARERS[kind] ?? SHARERS.family!)(sharers)}`,
    after: (expenses: number, total: string) => (expenses === 0 ? 'Nothing added yet' : `After ${plural(expenses, 'expense')}, ${total} in all`),
    owed: (amount: string) => `You're owed ${amount}`,
    owe: (amount: string) => `You owe ${amount}`,
    even: "You're even",
    standings: 'Where everyone stands',
    standingsSpoken: (line: string) => `${line}. Where everyone stands`,
    paidAndShare: (paid: string, share: string) => `Paid ${paid} · share ${share}`,
    plus: (amount: string) => `+${amount}`,
    fewest: 'The fewest payments to settle up',
    settled: 'Everyone is even. Nothing to pay.',
    paysYou: (name: string) => `${name} pays you`,
    youPay: (name: string) => `You pay ${name}`,
    pays: (from: string, to: string) => `${from} pays ${to}`,
    remind: 'Remind',
    reminded: 'Reminded',
    remindSpoken: (name: string) => `Remind ${name}`,
    latest: 'Latest',
    youPaid: 'You paid',
    paid: (name: string) => `${name} paid`,
    ways: (count: number) => `split ${count} ways`,
    with: (names: readonly string[]) => `split with ${formatList(names)}`,
    between: (names: readonly string[]) => `split between ${formatList(names)}`,
    for: (name: string) => `for ${name}`,
    forYou: 'for you alone',
    moreExpenses: 'Show more',
    paidBack: 'Paid back',
    paidLine: (from: string, to: string) => `${from} paid ${to}`,
    you: 'you',
    You: 'You',
    cta: { title: 'Add what you paid', note: 'Or scan the receipt', scan: 'Scan', add: 'Add' },
    viewOnly: 'You can see this, but not add to it.',

    // Marking a payment as made
    payment: {
      title: (from: string, to: string, amount: string) => `Did ${from} pay ${to} ${amount}?`,
      titleToYou: (from: string, amount: string) => `Did ${from} pay you ${amount}?`,
      titleFromYou: (to: string, amount: string) => `Did you pay ${to} ${amount}?`,
      body: `${APP} only keeps count. It moves no money itself.`,
      confirm: 'Mark as paid',
      takeBackAsk: { title: 'Take this payment back?', body: 'It counts as not paid again.', confirm: 'Take it back' },
    },

    // Adding an expense, and changing one
    expense: {
      new: 'Add what you paid',
      change: 'Change this expense',
      what: 'What was it',
      whatPlaceholder: 'Dinner',
      amount: 'Amount',
      amountWrong: 'Write the amount as a number, like 84.20.',
      paidBy: 'Who paid',
      how: 'How to split it',
      modes: { equal: 'Equally', shares: 'By shares', exact: 'Exact amounts' },
      who: 'Who shares it',
      sharesOf: (name: string) => `${name}: how many shares`,
      amountOf: (name: string) => `${name}: how much`,
      /** Under the exact amounts: how far they are from what it cost. */
      left: (amount: string) => `${amount} still to share out`,
      tooMuch: (amount: string) => `${amount} more than it cost`,
      addsUp: 'That adds up',
      add: 'Add expense',
      save: 'Save',
      remove: 'Remove this expense',
      removeAsk: { title: 'Remove this expense?', body: 'Where everyone stands is worked out again without it.', confirm: 'Remove it' },
      spoken: (title: string, line: string, amount: string) => `${title}. ${line}. ${amount}. Change`,
    },

    menu: { rename: 'Rename', whoSees: 'Who can see it', delete: 'Delete' },
    renameTitle: 'What it is called',
    deleteAsk: { title: 'Delete this?', body: 'Every expense and payment in it is gone, for everyone. This can’t be undone.', confirm: 'Delete it' },
  },

  // The list of a circle's splits
  splits: {
    title: 'Shared costs',
    new: 'Start keeping count',
    name: 'What is it for',
    namePlaceholder: 'Lisbon weekend',
    start: 'Start',
    empty: { title: 'Nothing to split yet', body: `Add what each of you paid, and ${APP} works out the fewest payments that settle it.` },
  },
} as const;
