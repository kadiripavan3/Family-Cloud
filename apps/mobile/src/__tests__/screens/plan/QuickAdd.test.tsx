import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeEvent, createEvent, createReminder, jot, readLine } from '@/api/generated/homeport';
import QuickAdd from '@/app/(app)/plan/quick-add';
import { inApp } from '@/test/phone';
import { linds, loaded, me } from '@/test/samples';
import { askAlex, event, ids, milk, onSampleToday, reading, readItem, reminder } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { planLineFiled: jest.fn(() => Promise.resolve()) };
let mockParams: { audience?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, usePreventRemove: () => jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
// The line is read a moment after the last key; here that moment is no time at all.
jest.mock('@/lib/useDebounced', () => ({ useDebounced: (value: unknown) => value }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe), readLine: jest.fn(), jot: jest.fn(), createEvent: jest.fn(), createReminder: jest.fn(), changeEvent: jest.fn() }));

const mockLinds = linds;
const mockMe = loaded(me());
const HAIRCUT = 'Haircut for Leo Saturday at 10, remind me an hour before';
const jotted = (over: object = {}) => ({ id: 'j-1', batchId: 'b-1', words: HAIRCUT, source: 'app', became: 'event', title: 'Haircut · Leo', where: 'Sat 14 Nov, 10:00', thingId: ids.haircut, thingKind: 'event', itemId: null, gone: false, createdAt: '2026-11-11T09:00:00Z', ...over }) as never;

/** Types a line and waits until its reading is on the screen. */
async function type(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('What to add'), text);
  await waitFor(() => expect(readLine).toHaveBeenLastCalledWith('c-linds', expect.objectContaining({ text }), expect.anything()));
  await screen.findAllByText('Read as');
  return user;
}

describe('7.4 Type it', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    jest.mocked(readLine).mockResolvedValue(reading());
  });

  it('starts with a line to write in and says how it works; there is nothing to add yet', async () => {
    await render(inApp(<QuickAdd />));
    expect(screen.getByRole('header', { name: 'New' })).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Haircut for Leo Saturday at 10, remind me an hour before')).toBeOnTheScreen();
    expect(screen.getByText(/^Write it the way you'd say it\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(readLine).not.toHaveBeenCalled();
  });

  it('shows how the line was read, piece by piece', async () => {
    await render(inApp(<QuickAdd />));
    await type(HAIRCUT);
    expect(readLine).toHaveBeenLastCalledWith('c-linds', { text: HAIRCUT, day: '2026-11-11', timeZone: expect.any(String) }, expect.anything());
    expect(screen.getByRole('button', { name: 'Read as: An event. Change' })).toBeOnTheScreen();
    expect(screen.getByLabelText('The Linds')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sat 14 Nov · 10:00 to 10:30. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'For Leo. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remind you · 1 hour before. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Barber Miha, from last time. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('files the line as it was read when nothing is corrected, and puts the place on the event', async () => {
    jest.mocked(jot).mockResolvedValue([jotted()]);
    jest.mocked(changeEvent).mockResolvedValue(event());
    await render(inApp(<QuickAdd />));
    const user = await type(HAIRCUT);
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockCache.planLineFiled).toHaveBeenCalledWith('c-linds'));
    expect(jot).toHaveBeenCalledWith('c-linds', { clientId: 'client-1', text: HAIRCUT, day: '2026-11-11', timeZone: expect.any(String), source: 'app', audience: undefined });
    expect(changeEvent).toHaveBeenCalledWith(ids.haircut, { place: 'Barber Miha' });
    expect(createEvent).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('corrects the time, shows the corrected reading, and makes the event from it', async () => {
    jest.mocked(createEvent).mockResolvedValue(event());
    await render(inApp(<QuickAdd />));
    const user = await type(HAIRCUT);
    await user.press(screen.getByRole('button', { name: 'Sat 14 Nov · 10:00 to 10:30. Change' }));
    expect(screen.getByRole('header', { name: 'When' })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Starts'));
    await user.type(screen.getByLabelText('Starts'), '11');
    expect(screen.getByText('Read as 11:00')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Ends'));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Sat 14 Nov · 11:00 to 11:30. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockCache.planLineFiled).toHaveBeenCalled());
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', circleId: 'c-linds', title: 'Haircut · Leo', day: '2026-11-14', time: '11:00', endTime: '11:30', place: 'Barber Miha', remindMinutes: 60, guests: [{ memberId: 'm-leo' }], about: ['m-leo'] }));
    expect(jot).not.toHaveBeenCalled();
  });

  it('refuses a time it cannot read', async () => {
    await render(inApp(<QuickAdd />));
    const user = await type(HAIRCUT);
    await user.press(screen.getByRole('button', { name: 'Sat 14 Nov · 10:00 to 10:30. Change' }));
    await user.clear(screen.getByLabelText('Starts'));
    await user.type(screen.getByLabelText('Starts'), 'soon');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Write a time like 9:30, 14:00 or 7pm.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'When' })).toBeOnTheScreen();
  });

  it('corrects who it is for, the reminder and how often it comes round', async () => {
    jest.mocked(createEvent).mockResolvedValue(event());
    jest.mocked(readLine).mockResolvedValue(reading([readItem({ repeat: { unit: 'week', every: 1, days: ['sat'], until: null, label: 'Saturdays' } })]));
    await render(inApp(<QuickAdd />));
    const user = await type(HAIRCUT);
    await user.press(screen.getByRole('button', { name: 'For Leo. Change' }));
    await user.press(screen.getByRole('radio', { name: 'Mia' }));
    expect(screen.getByRole('button', { name: 'For Mia. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remind you · 1 hour before. Change' }));
    await user.press(screen.getByRole('radio', { name: '1 day before' }));
    expect(screen.getByRole('button', { name: 'Remind you · 1 day before. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Saturdays. Change' }));
    await user.press(screen.getByRole('radio', { name: "Doesn't repeat" }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: "Doesn't repeat. Change" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Haircut · Mia', remindMinutes: 1440, repeat: undefined, guests: [{ memberId: 'm-mia' }] })));
  });

  it('turns what was read as a reminder into an event, and back', async () => {
    jest.mocked(readLine).mockResolvedValue(reading([askAlex]));
    jest.mocked(createEvent).mockResolvedValue(event());
    await render(inApp(<QuickAdd />));
    const user = await type('Ask Alex to book the car service tomorrow at 6');
    expect(screen.getByRole('button', { name: 'Thu 12 Nov · 18:00. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Given to Alex. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Read as: A reminder. Change' }));
    await user.press(screen.getByRole('radio', { name: /^An event/ }));
    expect(screen.getByRole('button', { name: 'Read as: An event. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Book the car service', day: '2026-11-12', time: '18:00', endTime: '18:30' })));
    expect(createReminder).not.toHaveBeenCalled();
  });

  it('makes a corrected reminder from its fields, and files the rest of the line by its own words', async () => {
    jest.mocked(readLine).mockResolvedValue(reading([askAlex, milk]));
    jest.mocked(createReminder).mockResolvedValue(reminder());
    jest.mocked(jot).mockResolvedValue([jotted({ became: 'list_item', thingId: 'l-groceries' })]);
    await render(inApp(<QuickAdd />));
    const user = await type('Ask Alex to book the car service tomorrow at 6 and milk');
    expect(screen.getByText('Goes on Groceries')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Given to Alex. Change' }));
    await user.press(screen.getByRole('radio', { name: 'Nobody in particular' }));
    expect(screen.getByRole('button', { name: 'For nobody in particular. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockCache.planLineFiled).toHaveBeenCalled());
    expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ title: 'Book the car service', dueOn: '2026-11-12', dueTime: '18:00', givenTo: [] }));
    expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'milk' }));
  });

  it('never sends something that looks like a code, and says where it belongs', async () => {
    jest.mocked(readLine).mockResolvedValue(reading([readItem({ as: 'code', title: 'Wifi 4471', code: 'code', day: null, time: null, endTime: null, whenLabel: null, person: null, personRole: null, personLabel: null, remindMinutes: null, remindLabel: null, place: null })]));
    await render(inApp(<QuickAdd />));
    await type('wifi 4471');
    expect(screen.getByText('This looks like a code or a password')).toBeOnTheScreen();
    expect(screen.getByText("It isn't saved from here. Keep it in the Vault, where it is scrambled on your phone.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('keeps something long whole, as a page', async () => {
    jest.mocked(readLine).mockResolvedValue(reading([], { letter: true }));
    jest.mocked(jot).mockResolvedValue([jotted({ became: 'note' })]);
    await render(inApp(<QuickAdd />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What to add'), 'Dear parents, the trip is on Friday');
    expect(await screen.findByText('This is long, so it is kept whole as a page in Notes.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'Dear parents, the trip is on Friday' })));
  });

  it('sends who it starts as seen by when the + sheet handed that over', async () => {
    mockParams = { audience: 'circle' };
    jest.mocked(jot).mockResolvedValue([jotted()]);
    jest.mocked(readLine).mockResolvedValue(reading([readItem({ place: null })]));
    await render(inApp(<QuickAdd />));
    const user = await type(HAIRCUT);
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ audience: 'circle' })));
    expect(changeEvent).not.toHaveBeenCalled();
  });

  it('says what the API said when the line could not be read', async () => {
    jest.mocked(readLine).mockRejectedValue(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    await render(inApp(<QuickAdd />));
    await userEvent.setup().type(screen.getByLabelText('What to add'), 'Haircut');
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('says what the API said when the line could not be added, and stays', async () => {
    jest.mocked(readLine).mockResolvedValue(reading([readItem({ place: null })]));
    jest.mocked(jot).mockRejectedValue(new ApiError(429, 'slow_down', 'That was a lot at once. Try again in a minute.'));
    await render(inApp(<QuickAdd />));
    const user = await type(HAIRCUT);
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('That was a lot at once. Try again in a minute.')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
