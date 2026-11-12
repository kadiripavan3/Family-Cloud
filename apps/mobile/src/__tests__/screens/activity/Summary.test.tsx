import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetSettings, useGetSummary, useSaveSettings } from '@/api/generated/homeport';
import Summary from '@/app/(app)/summary/[circleId]';
import { inApp } from '@/test/phone';
import { failed, loaded, pending, settings } from '@/test/samples';
import { ids, summary } from '@/test/samples/activity';

const CIRCLE = 'aa5d33d2-e3e6-466b-a57b-ac865cb0cf1b';
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn(), navigate: jest.fn() };
let mockParams: { circleId: string; week?: string } = { circleId: CIRCLE, week: '2026-11-02' };
const mockSave = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ settingsSaved: jest.fn() }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetSummary: jest.fn(), useGetSettings: jest.fn(), useSaveSettings: jest.fn(), getGetSettingsQueryKey: () => ['/v1/me/settings'] }));

const asked = jest.mocked(useGetSummary) as unknown as jest.Mock;

describe('11.3 The Sunday summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { circleId: CIRCLE, week: '2026-11-02' };
    asked.mockReturnValue(loaded(summary()));
    (jest.mocked(useGetSettings) as unknown as jest.Mock).mockReturnValue(loaded(settings()));
    (jest.mocked(useSaveSettings) as unknown as jest.Mock).mockReturnValue({ mutate: mockSave, isError: false, error: null });
  });

  it('asks for the week the address names, and says whose week it is', async () => {
    await render(inApp(<Summary />));
    expect(asked).toHaveBeenCalledWith(CIRCLE, { week: '2026-11-02' }, { query: { enabled: true } });
    expect(screen.getByRole('header', { name: 'Your week' })).toBeOnTheScreen();
    expect(screen.getByText('The Linds · 2 to 8 Nov')).toBeOnTheScreen();
  });

  it('asks for this week when the address names none, or something that is no day', async () => {
    mockParams = { circleId: CIRCLE };
    const view = await render(inApp(<Summary />));
    expect(asked).toHaveBeenLastCalledWith(CIRCLE, undefined, expect.anything());
    mockParams = { circleId: CIRCLE, week: 'last' };
    await view.rerender(inApp(<Summary />));
    expect(asked).toHaveBeenLastCalledWith(CIRCLE, undefined, expect.anything());
  });

  it("shows the week's best photo with its label and words, and opens it", async () => {
    await render(inApp(<Summary />));
    expect(screen.getByText('Most loved')).toBeOnTheScreen();
    expect(screen.getByText('86 new photos, one very good Saturday')).toBeOnTheScreen();
    expect(screen.getByText("Mia's first time steering")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "Most loved. 86 new photos, one very good Saturday. Mia's first time steering" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: ids.hero } });
  });

  it('lays the numbers side by side, in their own order', async () => {
    await render(inApp(<Summary />));
    expect(screen.getAllByLabelText(/^(86 photos|5 events|3 bills paid|€350 saved)$/).map((stat) => stat.props.accessibilityLabel)).toEqual(['86 photos', '5 events', '3 bills paid', '€350 saved']);
  });

  it('lists what next week holds, and opens each by its kind', async () => {
    await render(inApp(<Summary />));
    expect(screen.getByText('Next week')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Dentist for Mia, haircut for Leo. Wed 15:30 · Sat 10:00' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: ids.dentist } });
    await user.press(screen.getByRole('button', { name: 'Electricity, €84.20. Due Thursday' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: ids.bill } });
  });

  it('draws the sections other places add, each under its own title, and none while there are none', async () => {
    const view = await render(inApp(<Summary />));
    expect(screen.queryByText('From Journey')).toBeNull();
    asked.mockReturnValue(loaded(summary({ sections: [{ title: 'From Journey', rows: [{ thingId: null, kind: undefined, emoji: null, imageUrl: 'https://example.com/bike.jpg', title: 'Alex · Lofoten by bike', line: 'Day 6 of 9 · 4 new entries', day: null }] }] })));
    await view.rerender(inApp(<Summary />));
    expect(screen.getByText('From Journey')).toBeOnTheScreen();
    expect(screen.getByLabelText('Alex · Lofoten by bike. Day 6 of 9 · 4 new entries')).toBeOnTheScreen();
  });

  it('leaves out what a week has none of: no photo, no numbers', async () => {
    asked.mockReturnValue(loaded(summary({ hero: null, stats: [] })));
    await render(inApp(<Summary />));
    expect(screen.queryByText('Most loved')).toBeNull();
    expect(screen.getByText('Next week')).toBeOnTheScreen();
  });

  it('says so for a quiet week', async () => {
    asked.mockReturnValue(loaded(summary({ anything: false, hero: null, stats: [], nextWeek: [], inShort: '' })));
    await render(inApp(<Summary />));
    expect(screen.getByRole('header', { name: 'A quiet week' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing was added, done or paid in The Linds from 2 to 8 Nov. Nothing is sent for a week like that.')).toBeOnTheScreen();
  });

  it('holds its two switches behind the gear, and saves each as it is changed', async () => {
    await render(inApp(<Summary />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Summary settings' }));
    expect(screen.getByRole('header', { name: 'The Sunday summary' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Send it to my phone' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Also send it by email' })).not.toBeChecked();
    await user.press(screen.getByRole('switch', { name: 'Also send it by email' }));
    expect(mockSave).toHaveBeenLastCalledWith({ data: { summaryEmail: true } });
    await user.press(screen.getByRole('switch', { name: 'Send it to my phone' }));
    expect(mockSave).toHaveBeenLastCalledWith({ data: { weeklySummary: false } });
  });

  it('keeps its way back while loading, and says what went wrong with a way to try again', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Summary />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'server_error', 'Something went wrong on our side.'));
    asked.mockReturnValue(problem);
    await view.rerender(inApp(<Summary />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });

  it("says it isn't there for a circle this person is not in, with only the way Home", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That circle isn't there.")));
    await render(inApp(<Summary />));
    expect(screen.getByText("That circle isn't there.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeOnTheScreen();
  });

  it('says so when it waits for a connection', async () => {
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await render(inApp(<Summary />));
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
  });
});
