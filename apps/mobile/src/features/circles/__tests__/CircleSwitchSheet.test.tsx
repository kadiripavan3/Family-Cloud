import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createCircle, useGetToday } from '@/api/generated/homeport';
import { inApp } from '@/test/phone';
import { coupleCircle, crewCircle, linds, loaded, soloCircle, todayAnswer } from '@/test/samples';

import { CircleSwitchSheet } from '../CircleSwitchSheet';
import { useCircle, useCircles } from '../current';

const mockPush = jest.fn();
const mockSwitch = jest.fn();
const mockJoined = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../current', () => ({ useCircle: jest.fn(), useCircles: jest.fn(), useSwitchCircle: () => mockSwitch }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleJoined: mockJoined }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn(), createCircle: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const today = jest.mocked(useGetToday) as unknown as jest.Mock;
const make = jest.mocked(createCircle);

describe('3.2 Your circles', () => {
  const onClose = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircles).mockReturnValue([linds, crewCircle, coupleCircle]);
    jest.mocked(useCircle).mockReturnValue(linds);
    today.mockReturnValue(loaded(todayAnswer({ onlyYou: 38 })));
  });

  it('lists the circles with their kind and their people, and says which one you are in', async () => {
    await render(inApp(<CircleSwitchSheet visible onClose={onClose} />));
    expect(screen.getByRole('header', { name: 'Your circles' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The Linds. Family · 4 people and Biscuit. You are here' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lisbon crew. Friends · 5 people' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nora and Alex. Couple · 2 people' })).toBeOnTheScreen();
    expect(screen.getByText('38 things only you can see')).toBeOnTheScreen();
    expect(screen.getByText('Family, friends, housemates, a club')).toBeOnTheScreen();
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
