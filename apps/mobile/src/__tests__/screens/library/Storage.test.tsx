import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetStorage } from '@/api/generated/homeport';
import Storage from '@/app/(app)/settings/storage';
import { formatBytes, formatDuration } from '@/features/library/sizes';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending, soloCircle } from '@/test/samples';
import { storage } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockCircle = linds;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle }));
jest.mock('@/api/generated/homeport', () => ({ useGetStorage: jest.fn() }));
// What was kept from Journey, in numbers, comes from the link with Journey.
jest.mock('@/features/journeyLink/keep/useKeptTotals', () => ({ useKeptTotals: () => mockKept }));

const asked = jest.mocked(useGetStorage) as unknown as jest.Mock;
let mockKept: { journeys: number; here: number; matched: number } | undefined = { journeys: 0, here: 0, matched: 0 };

describe('12.2 Storage and backup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCircle = linds;
    asked.mockReturnValue(loaded(storage));
    mockKept = { journeys: 0, here: 0, matched: 0 };
  });

  it('says what is used of what the circle may keep, by what', async () => {
    await render(inApp(<Storage />));
    expect(asked).toHaveBeenCalledWith('c-linds');
    expect(screen.getByRole('header', { name: 'Storage and backup' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '48 GB' })).toBeOnTheScreen();
    expect(screen.getByText('of 200 GB · shared by The Linds')).toBeOnTheScreen();
    for (const kind of ['Photos 31 GB', 'Videos 14 GB', 'Files 2 GB', 'Other 1 GB']) expect(screen.getByText(kind)).toBeOnTheScreen();
  });

  it('says who added how much', async () => {
    await render(inApp(<Storage />));
    expect(screen.getByText('By person')).toBeOnTheScreen();
    for (const person of ['You: 22 GB', 'Alex: 19 GB', 'Mia: 6 GB', 'Leo: 1 GB']) expect(screen.getByLabelText(person)).toBeOnTheScreen();
  });

  it('counts what was added by people who have left', async () => {
    asked.mockReturnValue(loaded({ ...storage, people: [{ person: undefined, you: false, bytes: 5 * 1024 ** 2 }] }));
    await render(inApp(<Storage />));
    expect(screen.getByLabelText('People who left: 5 MB')).toBeOnTheScreen();
  });

  it("draws this phone's rows, and says plainly what needs a phone when they are pressed", async () => {
    await render(inApp(<Storage />));
    const user = userEvent.setup();
    expect(screen.getByText('This phone')).toBeOnTheScreen();
    expect(screen.getByText('Kept from Journey')).toBeOnTheScreen();
    expect(screen.getByText('Nothing yet. Keep one from Journey and its photos land here.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^Backing up, on Wi‑Fi only\./ }));
    expect(screen.getByText('Backing up a camera roll by itself needs the app on a phone. In a browser, add photos with the + button.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Free up' }));
    expect(screen.getByText('Freeing up space needs the app on a phone: a browser keeps no copies to remove.')).toBeOnTheScreen();
  });

  it('says how much came home from Journey and how much of it was here already, and leads to the kept journeys', async () => {
    mockKept = { journeys: 1, here: 214, matched: 201 };
    await render(inApp(<Storage />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Kept from Journey. 214 · 201 matched to photos you already had' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/kept');
  });

  it('names nobody to share with in a circle of one', async () => {
    mockCircle = soloCircle;
    await render(inApp(<Storage />));
    expect(screen.getByText('of 200 GB')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Storage />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says what went wrong and asks again', async () => {
    const broken = failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(broken);
    await render(inApp(<Storage />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });
});

describe('sizes as people read them', () => {
  it('writes bytes in the unit they read best in', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(714)).toBe('714 B');
    expect(formatBytes(53653)).toBe('52 KB');
    expect(formatBytes(7.9 * 1024 ** 2)).toBe('7.9 MB');
    expect(formatBytes(2.44 * 1024 ** 3)).toBe('2.4 GB');
    expect(formatBytes(48 * 1024 ** 3)).toBe('48 GB');
    // Just under a thousand of one unit is still that unit; a thousand and more is the next.
    expect(formatBytes(999 * 1024)).toBe('999 KB');
    expect(formatBytes(1000 * 1024)).toBe('1 MB');
  });

  it("writes a video's length as a clock", () => {
    expect(formatDuration(42)).toBe('0:42');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(4500)).toBe('1:15:00');
    expect(formatDuration(0)).toBe('0:00');
  });
});
