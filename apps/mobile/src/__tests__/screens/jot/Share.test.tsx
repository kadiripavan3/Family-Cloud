import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createBill, createEvent, createPage, createReminder } from '@/api/generated/homeport';
import ShareIn from '@/app/(app)/jot/share';
import { handIn } from '@/features/jot/handedIn';
import { inApp } from '@/test/phone';
import { letterReading, letterText } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockCache = { letterSaved: jest.fn() };
let mockIds = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `client-${(mockIds += 1)}` }));
jest.mock('@/features/jot/useReading', () => ({ useReading: (_circleId: string, text: string) => ({ reading: text.trim() ? mockRead() : undefined, isReading: false, error: null }) }));
jest.mock('@/api/generated/homeport', () => ({ createEvent: jest.fn(), createReminder: jest.fn(), createBill: jest.fn(), createPage: jest.fn() }));
const mockRead = () => jest.requireActual<typeof import('@/test/samples/jot')>('@/test/samples/jot').letterReading;

const paste = (text: string) => fireEvent.changeText(screen.getByLabelText('The letter'), text);
const share = () => userEvent.setup().press(screen.getByRole('button', { name: 'Share into Homeport' }));

describe('14.7 Share into it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIds = 0;
    jest.mocked(createEvent).mockResolvedValue({ id: 'e-1', title: 'Class 4B is going to the Postojna caves' } as Awaited<ReturnType<typeof createEvent>>);
    jest.mocked(createReminder).mockResolvedValue({ id: 'r-1', title: 'Sign the attached form and return it' } as Awaited<ReturnType<typeof createReminder>>);
    jest.mocked(createBill).mockResolvedValue({ id: 'b-1', title: 'Class 4B' } as Awaited<ReturnType<typeof createBill>>);
    jest.mocked(createPage).mockResolvedValue({ id: 'p-1', title: 'Class 4B' } as Awaited<ReturnType<typeof createPage>>);
  });

  it("stands in for another app: a place to paste a letter's words, and says so", async () => {
    await render(inApp(<ShareIn />));
    expect(screen.getByRole('header', { name: 'A letter' })).toBeOnTheScreen();
    expect(screen.getByText("On a phone, any app's share button hands the letter over. Here, paste its words or pick a text file, then press the share button above.")).toBeOnTheScreen();
    // Nothing to share yet: the sheet stays shut.
    await share();
    expect(screen.queryByRole('header', { name: 'Save to Homeport' })).toBeNull();
  });

  it('lists what was read from the letter, each with a switch: a day, a deadline, an amount, and the letter itself', async () => {
    await render(inApp(<ShareIn />));
    await paste(letterText);
    await share();
    expect(screen.getByRole('header', { name: 'Save to Homeport' })).toBeOnTheScreen();
    expect(screen.getByText('Read from the letter')).toBeOnTheScreen();
    expect(screen.getByText('Class 4B is going to the Postojna caves · Fri 20 Nov, 8:00')).toBeOnTheScreen();
    expect(screen.getByText('On the calendar')).toBeOnTheScreen();
    expect(screen.getByText('Sign the attached form and return it by Wed 18 Nov')).toBeOnTheScreen();
    expect(screen.getByText('A reminder for you')).toBeOnTheScreen();
    expect(screen.getByText('€12 to pay')).toBeOnTheScreen();
    expect(screen.getByText('A bill, due Wed 18 Nov')).toBeOnTheScreen();
    expect(screen.getByText('Keep the letter')).toBeOnTheScreen();
    expect(screen.getAllByRole('switch', { checked: true })).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Save 4 things' })).toBeEnabled();
    expect(screen.getByText('1 line · pasted')).toBeOnTheScreen();
  });

  it('makes what stays switched on: the event through Plan, and nothing else', async () => {
    await render(inApp(<ShareIn />));
    await paste(letterText);
    await share();
    const user = userEvent.setup();
    for (const name of ['Sign the attached form and return it by Wed 18 Nov', '€12 to pay', 'Keep the letter']) await user.press(screen.getByRole('switch', { name }));
    await user.press(screen.getByRole('button', { name: 'Save 1 thing' }));

    expect(await screen.findByRole('header', { name: 'Saved 1 thing' })).toBeOnTheScreen();
    expect(createEvent).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Class 4B is going to the Postojna caves', day: '2026-11-20', time: '08:00', timeZone: expect.any(String), audience: 'me' });
    expect(createReminder).not.toHaveBeenCalled();
    expect(createBill).not.toHaveBeenCalled();
    expect(createPage).not.toHaveBeenCalled();
    expect(mockCache.letterSaved).toHaveBeenCalledWith('c-linds');

    // What was saved opens as what it is.
    await user.press(screen.getByRole('button', { name: 'Class 4B is going to the Postojna caves. Event' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: 'e-1' } });
  });

  it('makes all four when nothing is switched off, for everyone when the person says so', async () => {
    await render(inApp(<ShareIn />));
    await paste(letterText);
    await share();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: 'Save 4 things' }));
    expect(await screen.findByRole('header', { name: 'Saved 4 things' })).toBeOnTheScreen();
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ audience: 'circle' }));
    expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign the attached form and return it', dueOn: '2026-11-18', dueTime: undefined, audience: 'circle' }));
    expect(createBill).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1200, currency: 'EUR', dueOn: '2026-11-18' }));
    expect(createPage).toHaveBeenCalledWith(expect.objectContaining({ body: letterText, audience: 'circle' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("says what the API says when something can't be saved, and makes nothing twice on the next try", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    jest.mocked(createReminder).mockRejectedValueOnce(new ApiError(500, 'error', 'Something went wrong on our side. Try again.'));
    await render(inApp(<ShareIn />));
    await paste(letterText);
    await share();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Save 4 things' }));
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save 4 things' }));
    expect(await screen.findByRole('header', { name: 'Saved 4 things' })).toBeOnTheScreen();
    // The event that was made the first time is sent again under the same id, so the API makes it once.
    expect(jest.mocked(createEvent).mock.calls.map(([sent]) => sent.clientId)).toEqual(['client-1', 'client-1']);
  });

  it('opens on what another app handed over, with nothing to save when all is switched off', async () => {
    handIn({ text: letterText, name: 'School trip.txt', from: 'share' });
    await render(inApp(<ShareIn />));
    expect(screen.getByRole('header', { name: 'Save to Homeport' })).toBeOnTheScreen();
    expect(screen.getByText('1 line · from a file')).toBeOnTheScreen();
    const user = userEvent.setup();
    for (const one of screen.getAllByRole('switch')) await user.press(one);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nothing to save' })).toBeDisabled());
    expect(letterReading.dates).toHaveLength(2);
  });
});
