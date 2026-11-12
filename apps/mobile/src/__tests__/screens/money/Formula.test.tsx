import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addSheetColumn, addSheetTile, askFormula, changeSheetColumn, changeSheetTile, type FormulaRequest, readFormula, removeSheetTile, useGetSheet } from '@/api/generated/homeport';
import Formula from '@/app/(app)/money/formula';
import { inApp } from '@/test/phone';
import { linds, loaded, me, pending } from '@/test/samples';
import { cell, column, columns, formulaAnswer, onThe12th, pickers, sheet, SHEET_ID, stillToPay } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { sheetChanged: jest.fn(() => Promise.resolve()) };
let mockParams: { sheet: string; tab?: string; tile?: string; column?: string; as?: string; name?: string } = { sheet: SHEET_ID };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetSheet: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  readFormula: jest.fn(),
  askFormula: jest.fn(),
  addSheetTile: jest.fn(),
  changeSheetTile: jest.fn(),
  removeSheetTile: jest.fn(),
  addSheetColumn: jest.fn(),
  changeSheetColumn: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockLinds = linds;
const mockMe = loaded(me());
const DAY = { day: '2026-11-12' };
const part = (kind: 'function' | 'column' | 'sign', text: string) => ({ kind, text, columnId: null });

/** What the API says of each formula the tests build: the answer comes from there, never from the app. */
const KNOWN: Record<string, ReturnType<typeof formulaAnswer>> = {
  '': pickers,
  'SUM([Cost]) - SUMIF([Paid], [Cost])': formulaAnswer(),
  'SUM([Cost])': formulaAnswer({ formula: 'SUM([Cost])', parts: [part('function', 'SUM'), part('column', 'Cost')], says: 'Everything in Cost.', answer: cell.money(764000) }),
  'SUM()': formulaAnswer({ understood: false, formula: null, parts: [], says: null, answer: null, problem: 'SUM needs one thing to add up, like SUM([Cost]).' }),
  '[Cost]': formulaAnswer({ formula: '[Cost]', oneAnswer: false, parts: [part('column', 'Cost')], says: 'Cost.', answer: cell.money(148000) }),
  '[Cost] /': formulaAnswer({ understood: false, formula: null, parts: [], says: null, answer: null, problem: 'The formula stops too early: something is missing after "÷".' }),
  '[Cost] / [Item]': formulaAnswer({ formula: '[Cost] / [Item]', oneAnswer: false, parts: [part('column', 'Cost'), part('sign', '÷'), part('column', 'Item')], says: 'Cost divided by Item.', answer: cell.problem('Item holds words, not a number') }),
  '[Cost] * 2': formulaAnswer({ formula: '[Cost] * 2', oneAnswer: false, parts: [part('column', 'Cost'), part('sign', '×'), { kind: 'number', text: '2', columnId: null }], says: 'Cost times 2.', answer: cell.money(296000) }),
};
const says = (request: FormulaRequest) => Promise.resolve(KNOWN[request.formula] ?? formulaAnswer({ understood: false, formula: null, parts: [], says: null, answer: null, problem: `Not a formula the test knows: ${request.formula}` }));

describe('8.7 A formula you can read', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', tile: 'tile-left' };
    jest.mocked(useGetSheet).mockReturnValue(loaded(sheet()) as never);
    jest.mocked(readFormula).mockImplementation((_tab, request) => says(request));
  });
  afterEach(() => jest.useRealTimers());

  it("opens on a tile's formula: its chips, the same as a sentence, and its answer", async () => {
    await render(inApp(<Formula />));
    expect(await screen.findByText('Everything in Cost, minus the Cost of rows where Paid is ticked.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Name of the tile').props.value).toBe('Still to pay');
    expect(readFormula).toHaveBeenCalledWith('tab-budget', { formula: stillToPay.formula, columnId: undefined, day: '2026-11-12' });
    // The chips are the API's: the words between them come with them.
    expect(screen.getByText('is ticked')).toBeOnTheScreen();
    expect(screen.getByText('€5,140.00')).toBeOnTheScreen();
    expect(screen.getByText('changes as rows change')).toBeOnTheScreen();
    // The sheet it belongs to shows behind it, dimmed: something to look at, not to use.
    expect(screen.getByRole('header', { name: 'Norway budget', hidden: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Planned: €7,640', { hidden: true })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Norway budget' })).toBeNull();
  });

  it('offers the columns by name, the functions (six, then the rest behind More), the signs and a number', async () => {
    await render(inApp(<Formula />));
    await screen.findByText('Columns');
    for (const name of ['Item', 'Who', 'Cost', 'Paid', 'Due']) expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'SUM IF. Adds up the rows that fit' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'PAYMENT. The monthly payment on a loan' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'MIN. The smallest' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'MIN. The smallest' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeOnTheScreen();
    for (const sign of ['Plus', 'Minus', 'Times', 'Divided by', 'Open a bracket', 'Close the bracket']) expect(screen.getByRole('button', { name: sign })).toBeOnTheScreen();
    expect(screen.getByLabelText('A number')).toBeOnTheScreen();
  });

  it('builds a formula chip by chip: each tap is read by the API, and the sentence and the answer follow', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'tile' };
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    expect(await screen.findByText(/^Tap a column or a function to start\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use this formula' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'SUM. Adds a column up' }));
    // Half built, it says what is missing, in the API's words.
    expect(await screen.findByText('SUM needs one thing to add up, like SUM([Cost]).')).toBeOnTheScreen();
    expect(readFormula).toHaveBeenLastCalledWith('tab-budget', { formula: 'SUM()', columnId: undefined, day: '2026-11-12' });
    await user.press(screen.getByRole('button', { name: 'Cost' }));
    expect(await screen.findByText('Everything in Cost.')).toBeOnTheScreen();
    expect(screen.getByText('€7,640.00')).toBeOnTheScreen();
    // The last chip comes off again, and the sentence goes with it.
    await user.press(screen.getByRole('button', { name: 'Take the last one away' }));
    expect(await screen.findByText('SUM needs one thing to add up, like SUM([Cost]).')).toBeOnTheScreen();
  });

  it('says why a cell cannot be worked out, in plain words', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'column', name: 'Each' };
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Columns');
    await user.press(screen.getByRole('button', { name: 'Cost' }));
    expect(await screen.findByText('in the first row')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Divided by' }));
    expect(await screen.findByText('The formula stops too early: something is missing after "÷".')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Item' }));
    expect(await screen.findByText('Cost divided by Item.')).toBeOnTheScreen();
    expect(screen.getByText('Item holds words, not a number')).toBeOnTheScreen();
  });

  it('takes a number between the chips', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'column', name: 'Double' };
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Columns');
    await user.press(screen.getByRole('button', { name: 'Cost' }));
    await user.press(screen.getByRole('button', { name: 'Times' }));
    await fireEvent.changeText(screen.getByLabelText('A number'), '2');
    await user.press(screen.getByRole('button', { name: 'Put it in' }));
    expect(await screen.findByText('Cost times 2.')).toBeOnTheScreen();
    expect(screen.getByText('€2,960.00')).toBeOnTheScreen();
  });

  it('answers a question asked in words with a formula: its chips, its sentence, its answer', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'tile' };
    jest.mocked(askFormula).mockResolvedValue(KNOWN['SUM([Cost])']!);
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Columns');
    // The example names someone else in the circle.
    expect(screen.getByPlaceholderText('Or ask: “How much has Alex paid?”')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Ask in words'), 'Total cost');
    await user.press(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(askFormula).toHaveBeenCalledWith('tab-budget', { question: 'Total cost', ...DAY }));
    expect(await screen.findByText('Everything in Cost.')).toBeOnTheScreen();
    expect(screen.getByText('€7,640.00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ask in words').props.value).toBe('');
  });

  it('says it did not understand, how to write it instead, and which questions this tab can answer', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'tile' };
    jest.mocked(askFormula).mockResolvedValueOnce(formulaAnswer({ understood: false, formula: null, parts: [], says: null, answer: null, problem: "I didn't understand that; here is how to write it: put column names in square brackets and use the functions below, like SUM([Cost]). Or ask one of these.", examples: ['Total Cost', 'How many rows?'] }));
    jest.mocked(askFormula).mockResolvedValueOnce(KNOWN['SUM([Cost])']!);
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Columns');
    await fireEvent.changeText(screen.getByLabelText('Ask in words'), 'Will it rain?');
    await user.press(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/^I didn't understand that; here is how to write it/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'How many rows?' })).toBeOnTheScreen();
    // One of the examples is asked with a tap.
    await user.press(screen.getByRole('button', { name: 'Total Cost' }));
    await waitFor(() => expect(askFormula).toHaveBeenLastCalledWith('tab-budget', { question: 'Total Cost', ...DAY }));
    expect(await screen.findByText('Everything in Cost.')).toBeOnTheScreen();
  });

  it('keeps one number for the tab as a tile, under a name', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'tile' };
    jest.mocked(addSheetTile).mockResolvedValue(stillToPay);
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Columns');
    await user.press(screen.getByRole('button', { name: 'SUM. Adds a column up' }));
    await user.press(screen.getByRole('button', { name: 'Cost' }));
    await screen.findByText('Everything in Cost.');
    expect(screen.getByRole('radio', { name: 'A tile on top', checked: true })).toBeOnTheScreen();
    // It has no name yet.
    expect(screen.getByText('Give it a name first.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use this formula' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Name of the tile'), 'All in');
    await user.press(screen.getByRole('button', { name: 'Use this formula' }));
    await waitFor(() => expect(addSheetTile).toHaveBeenCalledWith('tab-budget', { clientId: 'client-1', name: 'All in', formula: 'SUM([Cost])' }, DAY));
    await waitFor(() => expect(mockCache.sheetChanged).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('keeps one that is worked out for each row as a column', async () => {
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', as: 'column', name: 'Double' };
    jest.mocked(addSheetColumn).mockResolvedValue(column({ id: 'col-double', name: 'Double', kind: 'formula' }));
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Columns');
    expect(screen.getByLabelText('Name of the column').props.value).toBe('Double');
    await user.press(screen.getByRole('button', { name: 'Cost' }));
    await screen.findByText('Cost.');
    expect(screen.getByRole('radio', { name: 'A column', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Use this formula' }));
    await waitFor(() => expect(addSheetColumn).toHaveBeenCalledWith('tab-budget', { clientId: 'client-1', name: 'Double', kind: 'formula', formula: '[Cost]' }, DAY));
  });

  it("changes a tile's formula and its name, or removes the tile after asking", async () => {
    jest.mocked(changeSheetTile).mockResolvedValue(stillToPay);
    jest.mocked(removeSheetTile).mockResolvedValue(undefined);
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('€5,140.00');
    await fireEvent.changeText(screen.getByLabelText('Name of the tile'), 'Left to pay');
    await user.press(screen.getByRole('button', { name: 'Use this formula' }));
    await waitFor(() => expect(changeSheetTile).toHaveBeenCalledWith('tile-left', { formula: stillToPay.formula, name: 'Left to pay' }, DAY));
    await user.press(screen.getByRole('button', { name: 'Remove this tile' }));
    expect(screen.getByRole('header', { name: 'Remove this tile?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove the tile' }));
    await waitFor(() => expect(removeSheetTile).toHaveBeenCalledWith('tile-left'));
  });

  it("changes a formula column's formula, and doesn't offer the column to itself", async () => {
    const each = column({ id: 'col-each', name: 'Each', kind: 'formula', formula: '[Cost]', says: 'Cost.' });
    mockParams = { sheet: SHEET_ID, tab: 'tab-budget', column: 'col-each' };
    jest.mocked(useGetSheet).mockReturnValue(loaded(sheet({ tab: { ...sheet().tab, columns: [...columns, each] } })) as never);
    jest.mocked(readFormula).mockImplementation((_tab, request) => says(request).then((answer) => ({ ...answer, columns: [...answer.columns, { id: 'col-each', name: 'Each', kind: 'formula' as const }] })));
    jest.mocked(changeSheetColumn).mockResolvedValue(each);
    await render(inApp(<Formula />));
    const user = userEvent.setup();
    await screen.findByText('Cost.');
    expect(readFormula).toHaveBeenCalledWith('tab-budget', { formula: '[Cost]', columnId: 'col-each', day: '2026-11-12' });
    expect(screen.queryByRole('button', { name: 'Each' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'A tile on top' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Times' }));
    await fireEvent.changeText(screen.getByLabelText('A number'), '2');
    await user.press(screen.getByRole('button', { name: 'Put it in' }));
    await screen.findByText('Cost times 2.');
    await user.press(screen.getByRole('button', { name: 'Use this formula' }));
    await waitFor(() => expect(changeSheetColumn).toHaveBeenCalledWith('col-each', { formula: '[Cost] * 2', name: undefined }, DAY));
  });

  it('closes when the sheet behind it is pressed, and keeps a way back while it loads', async () => {
    const view = await render(inApp(<Formula />));
    await screen.findByText('€5,140.00');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
    jest.mocked(useGetSheet).mockReturnValue(pending() as never);
    await view.rerender(inApp(<Formula />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });
});
