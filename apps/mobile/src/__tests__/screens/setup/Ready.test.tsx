import { act, render, screen, userEvent } from '@testing-library/react-native';

import Ready from '@/app/(setup)/setup/ready';
import { useCircles } from '@/features/circles/current';
import { keep } from '@/lib/keep';
import { forgetKeptChoices } from '@/lib/useKept';
import { onPhone } from '@/test/phone';
import { alex, circle, coupleCircle, crewCircle, linds, loaded, me, soloCircle } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams = { circle: 'c-linds' };
const mockFinish = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn() }));
jest.mock('@/features/circles/useFinishSetup', () => ({ useFinishSetup: () => mockFinish }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe) }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));

const mockMe = loaded(me());
const flat = circle({ id: 'c-flat', kind: 'flat', name: 'Trubarjeva 9' });
const withInvited = circle({ members: [linds.members[0]!, { ...alex, status: 'invited' }] });

describe('2.4 All set', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    forgetKeptChoices();
    jest.mocked(keep.get).mockResolvedValue(null);
    mockParams = { circle: 'c-linds' };
    jest.mocked(useCircles).mockReturnValue([withInvited, coupleCircle, crewCircle, flat, soloCircle]);
  });

  it('says the circle is ready, and who has an invitation', async () => {
    await render(onPhone(<Ready />));
    expect(screen.getByRole('header', { name: 'The Linds is ready' })).toBeOnTheScreen();
    expect(screen.getByText('Alex has an invitation.')).toBeOnTheScreen();
    // There is no way back from the last step: the way on is Home.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('says that what was asked for comes in as each part is built', async () => {
    jest.mocked(keep.get).mockResolvedValue(JSON.stringify({ photos: true, journey: false, calendars: false }));
    await render(onPhone(<Ready />));
    expect(await screen.findByText('Alex has an invitation. What you asked to bring in comes in as each part of Homeport is built.')).toBeOnTheScreen();
  });

  it.each([
    ['c-linds', 'Add this week. school, bins, dentist', 'Start from a template. 53 ready to use'],
    ['c-couple', 'Add this week. date night, the dentist, the bins', 'Start from a template. 16 ready to use'],
    ['c-flat', 'Add this week. bins, the cleaning, rent day', 'Start from a template. 15 ready to use'],
    ['c-crew', 'Add the next plan. a dinner, a trip, a match', 'Start from a template. 17 ready to use'],
    ['c-solo', 'Add this week. appointments, bins, a birthday', 'Start from a template. ready to use'],
  ])('offers three first things to do that fit the kind: %s', async (id, week, template) => {
    mockParams = { circle: id };
    await render(onPhone(<Ready />));
    expect(screen.getByRole('button', { name: week })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: template })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep your first password. the Wi‑Fi?' })).toBeOnTheScreen();
  });

  it('says a circle of one is yours alone', async () => {
    mockParams = { circle: 'c-solo' };
    await render(onPhone(<Ready />));
    expect(screen.getByRole('header', { name: 'Just me is ready' })).toBeOnTheScreen();
    expect(screen.getByText("It's yours alone until you share something.")).toBeOnTheScreen();
  });

  it('"Go to Home" ends setting up', async () => {
    await render(onPhone(<Ready />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it.each([
    [/^Add this week/, '/new/event'],
    [/^Start from a template/, { pathname: '/', params: { place: 'notes' } }],
    [/^Keep your first password/, '/new/password'],
  ])('a shortcut ends setting up and opens its screen on top of Home: %s', async (name, to) => {
    await render(onPhone(<Ready />));
    await userEvent.setup().press(screen.getByRole('button', { name }));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    await act(async () => new Promise((later) => setTimeout(later, 5)));
    expect(mockRouter.push).toHaveBeenCalledWith(to);
  });

  it('is nothing for a circle that is not there', async () => {
    mockParams = { circle: 'c-gone' };
    await render(onPhone(<Ready />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
