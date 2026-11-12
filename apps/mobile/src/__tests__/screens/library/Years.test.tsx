import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetTimeline } from '@/api/generated/homeport';
import Years from '@/app/(app)/library/years';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { id, timeline } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams: { year?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetTimeline: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetTimeline) as unknown as jest.Mock;

describe('6.2 Pinch out to a year', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { year: '2026' };
    asked.mockReturnValue(loaded(timeline()));
  });

  it('shows the year the address names, with how much it holds, month by month', async () => {
    await render(inApp(<Years />));
    expect(asked).toHaveBeenCalledWith('c-linds', { year: 2026, tiles: 16 });
    expect(screen.getByRole('header', { name: '2026' })).toBeOnTheScreen();
    expect(screen.getByText('3,180 photos · 212 videos')).toBeOnTheScreen();
    expect(screen.getByText('November')).toBeOnTheScreen();
    expect(screen.getByText('412')).toBeOnTheScreen();
    expect(screen.getByText('October')).toBeOnTheScreen();
    expect(screen.getByText('268')).toBeOnTheScreen();
    // The hint a phone's two fingers follow.
    expect(screen.getByText('Pinch: days, months, years')).toBeOnTheScreen();
  });

  it('opens the newest year when the address names none', async () => {
    mockParams = {};
    await render(inApp(<Years />));
    expect(asked).toHaveBeenCalledWith('c-linds', { year: undefined, tiles: 16 });
    expect(screen.getByRole('header', { name: '2026' })).toBeOnTheScreen();
  });

  it('narrows to what one person added, to videos, or to what you love', async () => {
    await render(inApp(<Years />));
    const user = userEvent.setup();
    // Everyone in the circle who can hold a camera; not the dog.
    expect(screen.getByRole('button', { name: 'By you' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'By Mia' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'By Biscuit' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'By Alex' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { by: 'm-alex', year: 2026, tiles: 16 });
    await user.press(screen.getByRole('button', { name: 'Videos' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { kind: 'video', year: 2026, tiles: 16 });
    await user.press(screen.getByRole('button', { name: 'Loved' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { loved: true, year: 2026, tiles: 16 });
    await user.press(screen.getByRole('button', { name: 'Everyone' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { year: 2026, tiles: 16 });
  });

  it('shows a month on the wall from its line, and opens a photo from its tile', async () => {
    await render(inApp(<Years />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'October, 268. Show it on the wall' }));
    expect(mockRouter.dismissTo).toHaveBeenLastCalledWith({ pathname: '/', params: { place: 'library', until: '2026-10-31' } });
    await user.press(screen.getByRole('button', { name: 'Video from November' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'video', id: id(5), moment: id(5) } });
  });

  it('keeps the narrowing when a photo is opened from it', async () => {
    await render(inApp(<Years />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Loved' }));
    await user.press(screen.getByRole('button', { name: 'Photo from November' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: id(1), loved: 'true' } });
  });

  it('offers the other years from the one at the top', async () => {
    await render(inApp(<Years />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '2026. Choose another year' }));
    expect(screen.getByRole('header', { name: 'Years' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '2019. 1 photo' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ year: '2019' });
  });

  it('searches the library from the bar', async () => {
    await render(inApp(<Years />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Search the library' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/search', params: { place: 'library' } });
  });

  it('says so when nothing in the year fits the narrowing', async () => {
    asked.mockReturnValue(loaded(timeline({ months: [] })));
    await render(inApp(<Years />));
    expect(screen.getByRole('header', { name: 'Nothing here' })).toBeOnTheScreen();
    expect(screen.queryByText('Pinch: days, months, years')).toBeNull();
  });

  it('draws grey tiles while it loads, and keeps its Back', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Years />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says what went wrong and asks again', async () => {
    const broken = failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(broken);
    await render(inApp(<Years />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });
});
