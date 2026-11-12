import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeCircle, renewJoinLink } from '@/api/generated/homeport';
import CircleSettings from '@/app/(app)/circle/[id]/index';
import YourCircles from '@/app/(app)/circles';
import { useCircles } from '@/features/circles/current';
import { inApp } from '@/test/phone';
import { circle, coupleCircle, crewCircle, linds } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams = { id: 'c-linds' };
const mockChanged = jest.fn(() => Promise.resolve());
const mockSwitch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleChanged: mockChanged }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn(), useCircle: () => mockLinds, useSwitchCircle: () => mockSwitch }));
jest.mock('@/api/generated/homeport', () => ({ changeCircle: jest.fn(), renewJoinLink: jest.fn() }));
jest.mock('@/lib/share', () => ({ copyText: jest.fn(() => Promise.resolve(true)), shortLink: (url: string) => url.replace('https://', '') }));

const mockLinds = linds;

describe('"Your circles", from You', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircles).mockReturnValue([linds, coupleCircle, crewCircle]);
  });

  it("lists every circle with its kind and people, and opens a circle's settings", async () => {
    await render(inApp(<YourCircles />));
    expect(screen.getByRole('header', { name: 'Your circles' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The Linds. Family · 4 people and Biscuit. Open its settings' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Lisbon crew. Friends · 5 people. Open its settings' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/circle/[id]', params: { id: 'c-crew' } });
  });

  it('"New circle" starts setting one up', async () => {
    await render(inApp(<YourCircles />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^New circle/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/setup');
  });
});

describe("a circle's settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'c-linds' };
    jest.mocked(useCircles).mockReturnValue([linds, coupleCircle, crewCircle]);
  });

  it('shows its name, its kind, its people, and the link to join', async () => {
    await render(inApp(<CircleSettings />));
    expect(screen.getByRole('header', { name: 'Circle settings' })).toBeOnTheScreen();
    expect(screen.getByText('Family · 4 people and Biscuit')).toBeOnTheScreen();
    expect(screen.getByLabelText('Name of the circle').props.value).toBe('The Linds');
    expect(screen.getByRole('button', { name: 'Kind of circle. Family' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'People. 5' })).toBeOnTheScreen();
    expect(screen.getByText('homeport.app/join/the-linds')).toBeOnTheScreen();
  });

  it('renames the circle', async () => {
    const renamed = { ...linds, name: 'Lind-Strand' };
    jest.mocked(changeCircle).mockResolvedValue(renamed);
    await render(inApp(<CircleSettings />));
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await user.clear(screen.getByLabelText('Name of the circle'));
    await user.type(screen.getByLabelText('Name of the circle'), 'Lind-Strand');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockChanged).toHaveBeenCalledWith(renamed));
    expect(changeCircle).toHaveBeenCalledWith('c-linds', { name: 'Lind-Strand' });
  });

  it("says what the API says about a name it won't take", async () => {
    jest.mocked(changeCircle).mockRejectedValue(new ApiError(400, 'invalid', 'Use 1 to 40 characters.', { name: 'Use 1 to 40 characters.' }));
    await render(inApp(<CircleSettings />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name of the circle'), '!');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use 1 to 40 characters.')).toBeOnTheScreen();
  });

  it('opens its kind, and its people and guest passes as the current circle', async () => {
    mockParams = { id: 'c-crew' };
    await render(inApp(<CircleSettings />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Kind of circle. Friends' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/circle/[id]/kind', params: { id: 'c-crew' } });
    await user.press(screen.getByRole('button', { name: /^Guest passes/ }));
    expect(mockSwitch).toHaveBeenLastCalledWith('c-crew');
    expect(mockRouter.push).toHaveBeenLastCalledWith('/guest-passes');
    await user.press(screen.getByRole('button', { name: 'People. 5' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/people');
  });

  it('makes a new link to join only after asking, since the old one stops working', async () => {
    const renewed = { ...linds, joinUrl: 'https://homeport.app/join/the-linds-2' };
    jest.mocked(renewJoinLink).mockResolvedValue(renewed);
    await render(inApp(<CircleSettings />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Make a new link' }));
    expect(screen.getByRole('header', { name: 'Make a new link?' })).toBeOnTheScreen();
    expect(renewJoinLink).not.toHaveBeenCalled();
    await user.press(screen.getAllByRole('button', { name: 'Make a new link' }).pop()!);
    await waitFor(() => expect(mockChanged).toHaveBeenCalledWith(renewed));
    expect(renewJoinLink).toHaveBeenCalledWith('c-linds');
  });

  it('can be read but not changed by someone who does not run the circle', async () => {
    jest.mocked(useCircles).mockReturnValue([circle({ iRunIt: false, myRole: 'teen', joinUrl: null })]);
    await render(inApp(<CircleSettings />));
    expect(screen.getByText('Only the people who run this circle can change it.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Guest passes/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make a new link' })).toBeNull();
    expect(screen.getByLabelText('Name of the circle').props.editable).toBe(false);
  });

  it('is nothing for a circle the person is not in', async () => {
    mockParams = { id: 'c-gone' };
    await render(inApp(<CircleSettings />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
