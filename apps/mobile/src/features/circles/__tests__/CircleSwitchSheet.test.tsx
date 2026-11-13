import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createCircle, useGetCircleSwitcher } from '@/api/generated/homeport';
import { inApp } from '@/test/phone';
import { coupleCircle, crewCircle, linds, loaded, pending, soloCircle } from '@/test/samples';
import { switcher } from '@/test/samples/activity';

import { CircleSwitchSheet } from '../CircleSwitchSheet';
import { useCircle, useCircles } from '../current';

const mockPush = jest.fn();
const mockSwitch = jest.fn();
const mockJoined = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../current', () => ({ useCircle: jest.fn(), useCircles: jest.fn(), useSwitchCircle: () => mockSwitch }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleJoined: mockJoined }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetCircleSwitcher: jest.fn(), createCircle: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const asked = jest.mocked(useGetCircleSwitcher) as unknown as jest.Mock;
const make = jest.mocked(createCircle);

describe('3.2 Your circles', () => {
  const onClose = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircles).mockReturnValue([linds, crewCircle, coupleCircle]);
    jest.mocked(useCircle).mockReturnValue(linds);
    asked.mockReturnValue(loaded(switcher()));
  });

  it("lists the circles, each with the line the API writes for it, and says which one you are in", async () => {
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    expect(asked).toHaveBeenCalledWith({ query: { enabled: true, staleTime: 0 } });
    expect(screen.getByRole('header', { name: 'Your circles' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The Linds. Family · 4 people and Biscuit. You are here' })).toBeOnTheScreen();
    // What a place adds to a circle's line ("you're owed €64", from Money) comes with it.
    expect(screen.getByRole('button', { name: "Lisbon crew. Friends · 5 people · you're owed €64" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nora and Alex. Couple · 2 people' })).toBeOnTheScreen();
    // What "Just me" counts is the API's too: everything only you can see, in all your circles.
    expect(screen.getByRole('button', { name: 'Just me. 38 things only you can see' })).toBeOnTheScreen();
    expect(screen.getByText('Family, friends, housemates, a club')).toBeOnTheScreen();
  });

  it('says what the phone knows already while the lines are on their way, and no count it does not know', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    expect(screen.getByRole('button', { name: 'The Linds. Family · 4 people and Biscuit. You are here' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lisbon crew. Friends · 5 people' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Just me' })).toBeOnTheScreen();
  });

  it('asks nothing while it is closed', async () => {
    await render(inApp(<CircleSwitchSheet visible={false} onClose={onClose} />));
    expect(asked).toHaveBeenCalledWith({ query: { enabled: false, staleTime: 0 } });
  });

  it('makes the circle you press the current one, and closes', async () => {
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Lisbon crew/ }));
    expect(mockSwitch).toHaveBeenCalledWith('c-crew');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"Just me" opens your circle of one when you have it', async () => {
    jest.mocked(useCircles).mockReturnValue([linds, soloCircle]);
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    // It is the row with the lock, not one of the circles above.
    expect(screen.queryByRole('button', { name: /^Just me\. Just me ·/ })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^Just me/ }));
    expect(make).not.toHaveBeenCalled();
    expect(mockSwitch).toHaveBeenCalledWith('c-solo');
  });

  it('"Just me" makes that circle the first time, once, and goes there', async () => {
    make.mockResolvedValue(soloCircle);
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Just me/ }));
    await waitFor(() => expect(mockSwitch).toHaveBeenCalledWith('c-solo'));
    expect(make).toHaveBeenCalledWith({ clientId: 'client-1', kind: 'solo', name: 'Just me' });
    expect(mockJoined).toHaveBeenCalledWith(soloCircle);
  });

  it('says so when that circle could not be made', async () => {
    make.mockRejectedValue(new Error('no'));
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Just me/ }));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeOnTheScreen();
    expect(mockSwitch).not.toHaveBeenCalled();
  });

  it('"New circle" starts setting one up', async () => {
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^New circle/ }));
    expect(mockPush).toHaveBeenCalledWith('/setup');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
