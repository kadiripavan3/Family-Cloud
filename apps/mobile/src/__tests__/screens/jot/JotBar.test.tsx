import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { jot, moveJot, undoJot } from '@/api/generated/homeport';
import JotBar from '@/app/(app)/jot/index';
import { takeHeldCode } from '@/features/jot/heldCode';
import { inApp } from '@/test/phone';
import { linds } from '@/test/samples';
import { carRead, codeJot, codeRead, eggsJot, eggsRead, jotMade, reading, ways } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockCache = { jotFiled: jest.fn(), jotUndone: jest.fn(), jotMoved: jest.fn() };
let mockWays = ways();
let mockIds = 0;
let mockRead = reading([eggsRead, carRead]);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/ui/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds(), useCircles: () => [mockLinds()], useCircleIfAny: () => mockLinds() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `client-${(mockIds += 1)}` }));
// How a line is read, and when, is tried on its own (features/jot/__tests__/useReading.test.tsx): here every line reads at once.
jest.mock('@/features/jot/useReading', () => ({ useReading: (_circleId: string, text: string) => ({ reading: text.trim() ? mockRead : undefined, isReading: false, error: null }) }));
jest.mock('@/api/generated/homeport', () => ({ jot: jest.fn(), undoJot: jest.fn(), moveJot: jest.fn(), useGetJotWays: () => ({ data: mockWays }), useGetMe: () => ({ data: undefined }) }));
const mockLinds = () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds;

const box = () => screen.getByLabelText('Jot something down');
const type = (text: string) => fireEvent.changeText(box(), text);
const enter = () => fireEvent(box(), 'submitEditing');

describe('14.2 The jot bar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWays = ways();
    mockRead = reading([eggsRead, carRead]);
    jest.mocked(jot).mockResolvedValue([jotMade(), eggsJot]);
    jest.mocked(undoJot).mockResolvedValue(undefined);
  });

  it('is one line and nothing else of the app, with the ways on to what was filed, the ways in and voice', async () => {
    await render(inApp(<JotBar />));
    expect(box().props.placeholder).toBe('Milk, a reminder, a thought…');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    // In a family, what a jot makes starts as the person's own, until changed here.
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'What was filed today' }));
    await user.press(screen.getByRole('button', { name: 'Ways in' }));
    await user.press(screen.getByRole('button', { name: 'Say it all at once' }));
    expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/jot/filed', '/jot/ways', '/jot/voice']);
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows how the line is read under it: each thing with where or when', async () => {
    await render(inApp(<JotBar />));
    expect(screen.queryByLabelText('How this is read')).toBeNull();
    await type('Eggs, and remind Alex about the car at 6');
    expect(screen.getByText('Eggs · Groceries')).toBeOnTheScreen();
    expect(screen.getByText('Alex · today 18:00')).toBeOnTheScreen();
    // Nothing is saved by reading.
    expect(jot).not.toHaveBeenCalled();
    mockRead = reading([codeRead]);
    await type('the gate code is 4471');
    expect(screen.getByText('Gate code 4471 · looks like a code')).toBeOnTheScreen();
  });

  it('files the line on Enter, stays for the next one, and says where each thing went', async () => {
    await render(inApp(<JotBar />));
    await type('milk and eggs');
    await enter();
    expect(await screen.findByLabelText('Milk, Groceries')).toBeOnTheScreen();
    expect(screen.getByLabelText('Eggs, Groceries')).toBeOnTheScreen();
    expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'milk and eggs', source: 'app', clientId: expect.any(String), day: expect.any(String) }));
    // The circle's own way of starting things is left to the API.
    expect(jest.mocked(jot).mock.calls[0]![1].audience).toBeUndefined();
    expect(mockCache.jotFiled).toHaveBeenCalledWith('c-linds', [jotMade(), eggsJot].map((one) => expect.objectContaining({ id: one.id })));
    expect(box().props.value).toBe('');

    // The next line is a new one: it is sent under another id.
    await type('bread');
    await enter();
    await waitFor(() => expect(jot).toHaveBeenCalledTimes(2));
    expect(jest.mocked(jot).mock.calls[1]![1].clientId).not.toBe(jest.mocked(jot).mock.calls[0]![1].clientId);
  });

  it('undoes a filed line from where it was jotted', async () => {
    await render(inApp(<JotBar />));
    await type('milk and eggs');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add' }));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Undo Eggs' }));
    await waitFor(() => expect(screen.queryByLabelText('Eggs, Groceries')).toBeNull());
    expect(undoJot).toHaveBeenCalledWith('j-eggs');
    expect(mockCache.jotUndone).toHaveBeenCalledWith('c-linds', expect.objectContaining({ id: 'j-eggs' }));
    expect(screen.getByLabelText('Milk, Groceries')).toBeOnTheScreen();
  });

  it('files for everyone when the person says so', async () => {
    await render(inApp(<JotBar />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await type('milk');
    await enter();
    await waitFor(() => expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ audience: 'circle' })));
  });

  it('holds back what looks like a code, and makes it a note when the person says so', async () => {
    jest.mocked(jot).mockResolvedValue([codeJot]);
    jest.mocked(moveJot).mockResolvedValue({ ...codeJot, became: 'note', where: 'Note', thingId: 'p-1', thingKind: 'page' });
    await render(inApp(<JotBar />));
    await type('the gate code is 4471');
    await enter();
    expect(await screen.findByText('“Gate code 4471” looks like a code')).toBeOnTheScreen();
    expect(screen.getByText("It hasn't been kept anywhere yet.")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "It's just a note" }));
    expect(await screen.findByLabelText('Gate code 4471, Note')).toBeOnTheScreen();
    expect(moveJot).toHaveBeenCalledWith('j-code', expect.objectContaining({ to: 'note' }));
    expect(screen.queryByText('“Gate code 4471” looks like a code')).toBeNull();
  });

  it("hands a code to the Vault's own screen in memory, never in the address", async () => {
    jest.mocked(jot).mockResolvedValue([codeJot]);
    await render(inApp(<JotBar />));
    await type('the gate code is 4471');
    await enter();
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Keep in the Vault' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/password');
    const held = takeHeldCode();
    expect(held).toMatchObject({ words: 'the gate code is 4471', circleId: linds.id });
    expect(takeHeldCode()).toBeNull();
    // Once the Vault has saved it, the jot is forgotten: the API stops keeping the words.
    await held!.kept();
    expect(undoJot).toHaveBeenCalledWith('j-code');
    expect(mockCache.jotUndone).toHaveBeenCalledWith('c-linds', expect.objectContaining({ id: 'j-code' }));
  });

  it('sends a code straight on to the Vault when that was chosen on Ways in', async () => {
    mockWays = ways({ codes: 'vault' });
    jest.mocked(jot).mockResolvedValue([codeJot]);
    await render(inApp(<JotBar />));
    await type('the gate code is 4471');
    await enter();
    await waitFor(() => expect(mockRouter.push).toHaveBeenLastCalledWith('/new/password'));
    expect(takeHeldCode()?.words).toBe('the gate code is 4471');
  });

  it("says what the API says when a line can't be filed, and keeps the line", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    jest.mocked(jot).mockRejectedValue(new ApiError(400, 'too_long', 'Keep a jot to 2,000 characters or fewer.'));
    await render(inApp(<JotBar />));
    await type('milk');
    await enter();
    expect(await screen.findByText('Keep a jot to 2,000 characters or fewer.')).toBeOnTheScreen();
    expect(box().props.value).toBe('milk');
  });
});
