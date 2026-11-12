import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeCircle, createCircle } from '@/api/generated/homeport';
import CircleKindStep from '@/app/(setup)/setup/index';
import { inApp } from '@/test/phone';
import { circle, coupleCircle, linds, loaded, me, soloCircle } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockJoined = jest.fn(() => Promise.resolve());
const mockSwitch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleJoined: mockJoined }) }));
jest.mock('@/features/circles/current', () => ({ switchCircle: (id: string) => mockSwitch(id) }));
jest.mock('@/api/generated/homeport', () => ({ createCircle: jest.fn(), changeCircle: jest.fn(), useGetMe: jest.fn(() => mockMe) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockMe = loaded(me());
const make = jest.mocked(createCircle);
const change = jest.mocked(changeCircle);

describe('2.1 Who is it for?', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
  });

  it('offers four kinds of circle, Family to begin with, and "Just me for now"', async () => {
    await render(inApp(<CircleKindStep />));
    expect(screen.getByRole('header', { name: 'Who are you sharing with?' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Family. Adults, children and grandparents, each with their own view', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Couple. Two people. Shared by default, private when you say so', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Housemates. Bills, chores and the Wi‑Fi password', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Friends. A trip, a club, or a group that splits costs', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Just me for now. share later' })).toBeOnTheScreen();
  });

  it('makes a family named after the person, makes it the current circle, and goes on to its people', async () => {
    make.mockResolvedValue(linds);
    await render(inApp(<CircleKindStep />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/setup/people', params: { circle: 'c-linds' } }));
    expect(make).toHaveBeenCalledWith({ clientId: 'client-1', kind: 'family', name: 'The Linds' });
    expect(mockJoined).toHaveBeenCalledWith(linds);
    expect(mockSwitch).toHaveBeenCalledWith('c-linds');
  });

  it('shows what a couple, a flat or friends get before their people', async () => {
    make.mockResolvedValue(coupleCircle);
    await render(inApp(<CircleKindStep />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Couple/ }));
    expect(screen.getByRole('radio', { name: /^Couple/, checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/setup/made', params: { circle: 'c-couple' } }));
    expect(make).toHaveBeenCalledWith({ clientId: 'client-1', kind: 'couple', name: 'Nora and …' });
  });

  it('"Just me for now" makes a circle of one and goes straight to the end', async () => {
    make.mockResolvedValue(soloCircle);
    await render(inApp(<CircleKindStep />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Just me for now/ }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/setup/ready', params: { circle: 'c-solo' } }));
    expect(make).toHaveBeenCalledWith({ clientId: 'client-1', kind: 'solo', name: 'Just me' });
  });

  it('changes the circle it made instead of making a second, when the person comes back and chooses again', async () => {
    make.mockResolvedValue(linds);
    const asCrew = circle({ kind: 'crew', name: 'The crew' });
    change.mockResolvedValue(asCrew);
    await render(inApp(<CircleKindStep />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    await user.press(screen.getByRole('radio', { name: /^Friends/ }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/setup/made', params: { circle: 'c-linds' } }));
    expect(make).toHaveBeenCalledTimes(1);
    // The name nobody typed follows the kind.
    expect(change).toHaveBeenCalledWith('c-linds', { kind: 'crew', name: 'The crew' });
  });

  it('says so when the circle could not be made, and stays', async () => {
    make.mockRejectedValue(new ApiError(409, 'too_many', 'You can be in 20 circles at most.'));
    await render(inApp(<CircleKindStep />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('You can be in 20 circles at most.')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('has no Back for someone who was sent here because they are in no circle', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await render(inApp(<CircleKindStep />));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
