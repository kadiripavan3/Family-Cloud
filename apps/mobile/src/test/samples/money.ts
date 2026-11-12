/**
 * Made-up answers for the tests of Money: whole objects, the way the API sends them. Import them from
 * '@/test/samples/money'; the people and circles every test shares are in '@/test/samples'.
 */
import type {
  BillReadingResponse,
  BillResponse,
  BillRowResponse,
  CellResponse,
  ColumnResponse,
  ExpenseResponse,
  FormulaResponse,
  FunctionResponse,
  LoanPlanResponse,
  MoneyResponse,
  PartResponse,
  PersonBrief,
  RowCardResponse,
  RowChangedResponse,
  RowResponse,
  ShareResponse,
  SheetBriefResponse,
  SheetResponse,
  SplitBriefResponse,
  SplitResponse,
  TemplateResponse,
  TileResponse,
} from '@/api/generated/homeport';

import { everyone, withAlex } from './spine';

/**
 * Makes "today" Thursday 12 November 2026 for a test, the day the sample answers are written for, and
 * leaves every timer real: only the clock is set. (With the timers faked as well, a screen that is still
 * animating when the test ends is never taken down.) Undo it with `jest.useRealTimers()`.
 */
export function onThe12th() {
  jest.useFakeTimers({
    now: new Date(2026, 10, 12, 9, 0),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
  });
}

export const BILL_ID = '33333333-3333-4333-8333-333333333333';
export const SHEET_ID = '44444444-4444-4444-8444-444444444444';
export const SPLIT_ID = '55555555-5555-4555-8555-555555555555';
export const ROW_ID = '66666666-6666-4666-8666-666666666663';

export const noraBrief: PersonBrief = { memberId: 'm-nora', name: 'Nora', avatarUrl: null };
export const alexBrief: PersonBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: null };

// ---------- bills ----------

/** A bill as a row in a list: the electricity, due tomorrow (seen on 12 Nov), split with Alex. */
export function billRow(over: Partial<BillRowResponse> = {}): BillRowResponse {
  return {
    id: BILL_ID,
    circleId: 'c-linds',
    title: 'Electricity',
    payee: 'Elektro Ljubljana',
    emoji: '⚡',
    currency: 'EUR',
    amountCents: 8420,
    dueOn: '2026-11-13',
    paid: false,
    paidAt: null,
    repeat: 'monthly',
    subscription: false,
    yearCents: 101040,
    pays: 'by_hand',
    splitWith: [alexBrief],
    myShareCents: 4210,
    mySharePaid: false,
    hasLogin: false,
    hasInvoice: false,
    updatedAt: '2026-11-12T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

export const rent = billRow({ id: '33333333-3333-4333-8333-333333333334', title: 'Rent', payee: 'Mr Novak', emoji: '🏠', amountCents: 98000, dueOn: '2026-11-16', pays: 'standing_order', splitWith: [], myShareCents: 98000, yearCents: 1176000 });
export const netflix = billRow({ id: '33333333-3333-4333-8333-333333333335', title: 'Netflix', payee: 'Netflix', emoji: '📺', amountCents: 1399, dueOn: '2026-11-20', pays: 'direct_debit', subscription: true, splitWith: [], myShareCents: 1399, yearCents: 16788 });

/** One person's share of a bill: Nora's half, not paid yet. */
export function share(over: Partial<ShareResponse> = {}): ShareResponse {
  return { person: noraBrief, parts: 1, cents: 4210, paid: false, paidAt: null, paidBy: null, you: true, ...over };
}

/** The electricity bill, opened: half each with Alex, who has paid; six months of history. */
export function bill(over: Partial<BillResponse> = {}): BillResponse {
  const shares = over.shares ?? [share(), share({ person: alexBrief, paid: true, paidAt: '2026-11-12T08:00:00Z', paidBy: alexBrief, you: false })];
  return {
    id: BILL_ID,
    circleId: 'c-linds',
    title: 'Electricity',
    payee: 'Elektro Ljubljana',
    emoji: '⚡',
    currency: 'EUR',
    amountCents: 8420,
    dueOn: '2026-11-13',
    paid: false,
    paidAt: null,
    paidBy: null,
    repeat: 'monthly',
    everyMonths: 1,
    dueDay: 13,
    subscription: false,
    yearCents: 101040,
    pays: 'by_hand',
    remindDays: 2,
    note: '',
    payUrl: null,
    iban: 'SI56 2633 0001 2039 086',
    reference: 'SI12 3456 7890 1184',
    myShare: shares.find((one) => one.you) ?? null,
    history: [
      { dueOn: '2026-06-13', amountCents: 5230, paid: true, current: false },
      { dueOn: '2026-07-13', amountCents: 4890, paid: true, current: false },
      { dueOn: '2026-08-13', amountCents: 5510, paid: true, current: false },
      { dueOn: '2026-09-13', amountCents: 6080, paid: true, current: false },
      { dueOn: '2026-10-13', amountCents: 7800, paid: true, current: false },
      { dueOn: '2026-11-13', amountCents: 8420, paid: false, current: true },
    ],
    usualCents: 6322,
    changeCents: 620,
    links: [],
    login: null,
    invoice: null,
    updatedAt: '2026-11-12T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
    shares,
  };
}

/** What the API reads off the lines of a utility bill. */
export function reading(over: Partial<BillReadingResponse> = {}): BillReadingResponse {
  return {
    payee: { value: 'Elektro Ljubljana', line: 'Elektro Ljubljana d.d.', lineNumber: 0 },
    amountCents: { value: 8420, line: 'Za plačilo: 84,20 EUR', lineNumber: 2 },
    currency: 'EUR',
    dueOn: { value: '2026-11-13', line: 'Rok plačila: 13.11.2026', lineNumber: 3 },
    iban: { value: 'SI56 2633 0001 2039 086', line: 'IBAN: SI56 2633 0001 2039 086', lineNumber: 4 },
    reference: { value: 'SI12 3456 7890 1184', line: 'Sklic: SI12 3456 7890 1184', lineNumber: 5 },
    repeat: { value: 'monthly', line: 'Elektro Ljubljana d.d.', lineNumber: 0 },
    title: 'Electricity',
    emoji: '⚡',
    ...over,
  };
}

// ---------- sheets ----------

export const cell = {
  empty: (): CellResponse => ({ kind: 'empty', text: null, number: null, cents: null, date: null, ticked: null, people: null, problem: null }),
  text: (text: string): CellResponse => ({ ...cell.empty(), kind: 'text', text }),
  number: (number: number): CellResponse => ({ ...cell.empty(), kind: 'number', number }),
  money: (cents: number): CellResponse => ({ ...cell.empty(), kind: 'money', cents }),
  date: (date: string): CellResponse => ({ ...cell.empty(), kind: 'date', date }),
  tick: (ticked: boolean): CellResponse => ({ ...cell.empty(), kind: 'tick', ticked }),
  people: (...people: PersonBrief[]): CellResponse => ({ ...cell.empty(), kind: 'person', people }),
  problem: (problem: string): CellResponse => ({ ...cell.empty(), kind: 'problem', problem }),
};

const part = (kind: PartResponse['kind'], text: string): PartResponse => ({ kind, text, columnId: null });

export function column(over: Partial<ColumnResponse> = {}): ColumnResponse {
  return { id: 'col-item', name: 'Item', kind: 'text', options: [], formula: null, parts: [], says: null, problem: null, summary: 'none', total: null, ...over };
}

/** The Norway budget's five columns: Item, Who, Cost (added up), Paid (ticks counted), Due. */
export const columns: ColumnResponse[] = [
  column(),
  column({ id: 'col-who', name: 'Who', kind: 'person' }),
  column({ id: 'col-cost', name: 'Cost', kind: 'money', summary: 'sum', total: { cell: cell.money(764000), of: null, parts: [part('function', 'SUM'), part('column', 'Cost')], says: 'Adds up every row in Cost.', leftOut: 0, leftOutSays: null } }),
  column({ id: 'col-paid', name: 'Paid', kind: 'tick', summary: 'ticked', total: { cell: cell.number(2), of: 6, parts: [part('function', 'COUNT IF'), part('column', 'Paid'), part('words', 'is ticked')], says: 'Counts the rows where Paid is ticked.', leftOut: 0, leftOutSays: null } }),
  column({ id: 'col-due', name: 'Due', kind: 'date' }),
];

export function sheetRow(number: number, item: string, who: PersonBrief[], cents: number, paid: boolean, over: Partial<RowResponse> = {}): RowResponse {
  return {
    id: `66666666-6666-4666-8666-66666666666${number}`,
    number,
    cells: { 'col-item': cell.text(item), 'col-who': cell.people(...who), 'col-cost': cell.money(cents), 'col-paid': cell.tick(paid), 'col-due': cell.empty() },
    note: '',
    papers: 0,
    ...over,
  };
}

export const rows: RowResponse[] = [
  sheetRow(1, 'Flights', [alexBrief], 148000, true),
  sheetRow(2, 'Rail passes', [noraBrief], 102000, true),
  sheetRow(3, 'Cabins, 9 nights', [alexBrief], 235000, false, { note: '€470 deposit paid on 2 Nov. The rest is due six weeks before we go.', papers: 1 }),
  sheetRow(4, 'Ferries', [noraBrief], 64000, false),
  sheetRow(5, 'Food', [noraBrief, alexBrief], 140000, false),
  sheetRow(6, 'Fun money', [{ memberId: 'm-mia', name: 'Mia', avatarUrl: null }, { memberId: 'm-leo', name: 'Leo', avatarUrl: null }], 75000, false),
];
rows[2]!.cells['col-due'] = cell.date('2027-01-15');

export function tile(over: Partial<TileResponse> = {}): TileResponse {
  return { id: 'tile-planned', name: 'Planned', formula: 'SUM([Cost])', parts: [part('function', 'SUM'), part('column', 'Cost')], says: 'Everything in Cost.', cell: cell.money(764000), leftOut: 0, leftOutSays: null, ofTileId: null, ofName: null, ofCell: null, ...over };
}

export const stillToPay = tile({
  id: 'tile-left',
  name: 'Still to pay',
  formula: 'SUM([Cost]) - SUMIF([Paid], [Cost])',
  parts: [part('function', 'SUM'), part('column', 'Cost'), part('sign', '−'), part('function', 'SUM IF'), part('column', 'Paid'), part('words', 'is ticked'), part('column', 'Cost')],
  says: 'Everything in Cost, minus the Cost of rows where Paid is ticked.',
  cell: cell.money(514000),
});

export const tiles: TileResponse[] = [tile(), tile({ id: 'tile-paid', name: 'Paid', formula: 'SUMIF([Paid], [Cost])', cell: cell.money(250000), says: 'The Cost of rows where Paid is ticked.' }), stillToPay];

/** The Norway budget, opened on its first tab. */
export function sheet(over: Partial<SheetResponse> = {}): SheetResponse {
  return {
    id: SHEET_ID,
    circleId: 'c-linds',
    title: 'Norway budget',
    currency: 'EUR',
    template: 'trip_budget',
    tag: 'Trip',
    updatedAt: '2026-11-12T09:00:00Z',
    editedBy: alexBrief,
    here: [],
    tabs: [
      { id: 'tab-budget', name: 'Budget', rows: 6 },
      { id: 'tab-days', name: 'Day by day', rows: 5 },
      { id: 'tab-savings', name: 'Savings', rows: 8 },
    ],
    tab: { id: 'tab-budget', name: 'Budget', columns, tiles, rowCount: 6, rows, nextRows: null },
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

export function sheetBrief(over: Partial<SheetBriefResponse> = {}): SheetBriefResponse {
  return { id: SHEET_ID, circleId: 'c-linds', title: 'Norway budget', currency: 'EUR', template: 'trip_budget', tag: 'Trip', tabs: 3, updatedAt: '2026-11-12T09:00:00Z', editedBy: alexBrief, headlineName: 'Planned', headline: cell.money(764000), mine: true, canEdit: true, chip: everyone, ...over };
}

export const budget2026 = sheetBrief({ id: '44444444-4444-4444-8444-444444444445', title: 'Budget 2026', template: 'monthly_budget', tag: 'Monthly', tabs: 12, updatedAt: '2026-11-11T09:00:00Z', editedBy: noraBrief, headlineName: 'Money in', headline: cell.money(240000), chip: withAlex });

export const templates: TemplateResponse[] = [
  { code: 'monthly_budget', title: 'Monthly budget', emoji: '💰', says: "Money in, bills out, what's left", live: false },
  { code: 'trip_budget', title: 'Trip budget', emoji: '🧳', says: 'Costs, who paid, who owes', live: false },
  { code: 'loan', title: 'Loan planner', emoji: '🏦', says: 'Slide the rate, watch the payment', live: true },
  { code: 'savings', title: 'Savings plan', emoji: '📈', says: 'How long until the goal', live: true },
  { code: 'tax_checklist', title: 'Tax checklist', emoji: '🧾', says: 'Papers to find, with totals', live: false },
  { code: 'car_costs', title: 'Car costs', emoji: '🚗', says: 'Fuel, service, cost per km', live: false },
];

/** Row 3 of the Norway budget, as a card. */
export function rowCard(over: Partial<RowCardResponse> = {}): RowCardResponse {
  return {
    sheetId: SHEET_ID,
    sheetTitle: 'Norway budget',
    currency: 'EUR',
    tabId: 'tab-budget',
    tabName: 'Budget',
    columns,
    row: rows[2]!,
    papers: [{ id: 'media-1', kind: 'photo', url: 'https://example.com/receipt.jpg', thumbUrl: 'https://example.com/receipt-small.jpg', fileUrl: null, fileName: null, contentType: 'image/jpeg', width: 800, height: 1000, durationSeconds: null, bytes: 120000 }],
    of: 6,
    previous: { id: rows[1]!.id, label: 'Rail passes' },
    next: { id: rows[3]!.id, label: 'Ferries' },
    canEdit: true,
    ...over,
  };
}

/** What comes back after a cell changed: the row, and the tiles and totals worked out again. */
export function rowChanged(row: RowResponse, over: Partial<RowChangedResponse> = {}): RowChangedResponse {
  return { row, rowCount: 6, tiles, totals: { 'col-cost': columns[2]!.total!, 'col-paid': columns[3]!.total! }, ...over };
}

export const functions: FunctionResponse[] = [
  { name: 'SUM', label: 'SUM', says: 'Adds a column up', example: 'SUM([Cost])' },
  { name: 'SUMIF', label: 'SUM IF', says: 'Adds up the rows that fit', example: 'SUMIF([Paid], [Cost])' },
  { name: 'AVG', label: 'AVERAGE', says: 'The average of a column', example: 'AVERAGE([Cost])' },
  { name: 'COUNT', label: 'COUNT', says: 'How many rows have something', example: 'COUNT([Item])' },
  { name: 'IF', label: 'IF', says: 'One thing or another, by a question', example: 'IF([Paid], 0, [Cost])' },
  { name: 'PAYMENT', label: 'PAYMENT', says: 'The monthly payment on a loan', example: 'PAYMENT(€240000, 3.4, 25)' },
  { name: 'COUNTIF', label: 'COUNT IF', says: 'How many rows fit', example: 'COUNTIF([Paid])' },
  { name: 'MIN', label: 'MIN', says: 'The smallest', example: 'MIN([Cost])' },
];

/** What the API says of a formula: by default the drawn one, "Still to pay", understood. */
export function formulaAnswer(over: Partial<FormulaResponse> = {}): FormulaResponse {
  return {
    understood: true,
    formula: stillToPay.formula,
    oneAnswer: true,
    parts: stillToPay.parts,
    says: stillToPay.says,
    answer: cell.money(514000),
    leftOut: 0,
    leftOutSays: null,
    problem: null,
    examples: [],
    columns: columns.map(({ id, name, kind }) => ({ id, name, kind })),
    functions,
    ...over,
  };
}

/** The answer to an empty formula: only the pickers. */
export const pickers = formulaAnswer({ understood: false, formula: null, parts: [], says: null, answer: null, problem: 'Write a formula first, like [Price] * [Qty].' });

// ---------- the loan planner ----------

/** €240,000 at 3.4% over 25 years, with €100 more a month. */
export function loanPlan(over: Partial<LoanPlanResponse> = {}): LoanPlanResponse {
  return {
    principalCents: 24000000,
    ratePercent: 3.4,
    years: 25,
    extraCents: 10000,
    plan: { paymentCents: 118866, payments: 300, lastPaymentCents: 119029, interestCents: 11659963, totalCents: 35659963 },
    withExtra: { paymentCents: 128866, payments: 266, lastPaymentCents: 14906, interestCents: 10164396, totalCents: 34164396 },
    monthsSooner: 35,
    interestSavedCents: 1495567,
    chart: Array.from({ length: 26 }, (_, year) => ({ year, owedCents: Math.round(24000000 * (1 - year / 25)), owedWithExtraCents: Math.max(0, Math.round(24000000 * (1 - year / 22.2))) })),
    schedule: [],
    ...over,
  };
}

// ---------- splitting costs ----------

const crew = (name: string, index: number): PersonBrief => ({ memberId: `m-crew-${index}`, name, avatarUrl: null });
export const lea = crew('Lea', 0);
export const noraInCrew = crew('Nora', 1);
export const kai = crew('Kai', 2);
export const lena = crew('Lena', 3);
export const ana = crew('Ana', 4);
const five = [lea, noraInCrew, kai, lena, ana];

/** Dinner at Ramiro: Kai paid €186, split five ways. */
export function expense(over: Partial<ExpenseResponse> = {}): ExpenseResponse {
  return {
    id: 'exp-dinner',
    splitId: SPLIT_ID,
    title: 'Dinner at Ramiro',
    emoji: '🍽️',
    amountCents: 18600,
    paidBy: kai,
    paidByYou: false,
    mode: 'equal',
    spentOn: '2026-11-01',
    shares: five.map((person) => ({ person, weight: 1, cents: 3720, you: person === noraInCrew })),
    addedBy: kai,
    createdAt: '2026-11-01T20:00:00Z',
    ...over,
  };
}

export const taxi = expense({ id: 'exp-taxi', title: 'Airport taxi', emoji: '🚕', amountCents: 2400, paidBy: noraInCrew, paidByYou: true, shares: [lea, noraInCrew].map((person) => ({ person, weight: 1, cents: 1200, you: person === noraInCrew })) });
export const flat = expense({ id: 'exp-flat', title: 'Flat, 3 nights', emoji: '🏠', amountCents: 72000, paidBy: lena, shares: five.map((person) => ({ person, weight: 1, cents: 14400, you: person === noraInCrew })) });

/** Lisbon weekend: 14 expenses, Nora is owed €64. */
export function split(over: Partial<SplitResponse> = {}): SplitResponse {
  return {
    id: SPLIT_ID,
    circleId: 'c-crew',
    title: 'Lisbon weekend',
    currency: 'EUR',
    expenses: 14,
    totalCents: 123600,
    myBalanceCents: 6400,
    people: [
      { person: lea, paidCents: 5210, shareCents: 24610, balanceCents: -4400, you: false },
      { person: noraInCrew, paidCents: 7510, shareCents: 26110, balanceCents: 6400, you: true },
      { person: kai, paidCents: 21410, shareCents: 23410, balanceCents: -2000, you: false },
      { person: lena, paidCents: 74460, shareCents: 24560, balanceCents: -3100, you: false },
      { person: ana, paidCents: 15010, shareCents: 24910, balanceCents: 3100, you: false },
    ],
    settle: [
      { from: lea, to: noraInCrew, cents: 4400, youPay: false, paysYou: true, remindedAt: null },
      { from: kai, to: noraInCrew, cents: 2000, youPay: false, paysYou: true, remindedAt: null },
      { from: lena, to: ana, cents: 3100, youPay: false, paysYou: false, remindedAt: null },
    ],
    latest: [expense(), taxi, flat],
    paid: [{ id: 'pay-1', from: ana, to: lena, amountCents: 13000, paidOn: '2026-11-05', createdAt: '2026-11-05T10:00:00Z' }],
    updatedAt: '2026-11-08T09:00:00Z',
    mine: false,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

export function splitBrief(over: Partial<SplitBriefResponse> = {}): SplitBriefResponse {
  return { id: SPLIT_ID, circleId: 'c-crew', title: 'Lisbon weekend', currency: 'EUR', myBalanceCents: 6400, updatedAt: '2026-11-08T09:00:00Z', mine: false, canEdit: true, chip: everyone, ...over };
}

// ---------- Money's first page ----------

/** November in The Linds, seen on the 12th: €1,240 of €2,318.19 paid, three bills due soon, two sheets. */
export function moneyAnswer(over: Partial<MoneyResponse> = {}): MoneyResponse {
  return {
    day: '2026-11-12',
    currency: 'EUR',
    otherCurrencies: [],
    monthStart: '2026-11-01',
    monthTotalCents: 231819,
    monthPaidCents: 124000,
    dueThisWeekCents: 8420,
    subscriptionsMonthCents: 8596,
    subscriptionsYearCents: 103152,
    subscriptions: 5,
    owing: [{ person: alexBrief, cents: 4200, currency: 'EUR' }],
    dueSoon: [billRow(), rent, netflix],
    sheets: [sheetBrief(), budget2026],
    ...over,
  };
}
