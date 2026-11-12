import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetPlaces, useGetWallInfinite } from '@/api/generated/homeport';
import Places from '@/app/(app)/library/places';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { canoe, lakeItems, pages, places, wallPage } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({ useGetPlaces: jest.fn(), useGetWallInfinite: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetPlaces) as unknown as jest.Mock;
const wall = jest.mocked(useGetWallInfinite) as unknown as jest.Mock;

describe('6.6 Places', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(places));
    wall.mockReturnValue(pages([wallPage(lakeItems, [])]));
  });

  it('says how many places and countries, and lists each place with its cover and count', async () => {
    await render(inApp(<Places />));
    expect(asked).toHaveBeenCalledWith('c-linds');
    expect(screen.getByRole('header', { name: 'Places' })).toBeOnTheScreen();
    expect(screen.getByText('38 places · 6 countries')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lake Bled, 54. Show its photos' })).toBeOnTheScreen();
    expect(screen.getByText('3 visits · last on 7 Nov')).toBeOnTheScreen();
    // Whoever is reading is "you", and comes last.
    expect(screen.getByText('51 photos and 3 videos, from Alex, Mia and you')).toBeOnTheScreen();
    expect(screen.getByText('1 visit · 24 Sep 2019')).toBeOnTheScreen();
    expect(screen.getByText('1 photo, from you')).toBeOnTheScreen();
  });

  it("opens a place's photos underneath it, and closes them again", async () => {
    await render(inApp(<Places />));
    const user = userEvent.setup();
    expect(wall).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Lake Bled, 54. Show its photos' }));
    expect(wall).toHaveBeenCalledWith('c-linds', { place: 'Lake Bled', limit: 24 }, expect.anything());
    await user.press(screen.getByRole('button', { name: "Mia's first time steering. Photo added by Alex" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: canoe.id, place: 'Lake Bled' } });
    await user.press(screen.getByRole('button', { name: 'Lake Bled, 54. Its photos are showing' }));
    expect(screen.queryByRole('button', { name: "Mia's first time steering. Photo added by Alex" })).toBeNull();
  });

  it('says plainly that the map is not built yet', async () => {
    await render(inApp(<Places />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Map layers' }));
    expect(screen.getByText("The map isn't built yet. For now your places are a list.")).toBeOnTheScreen();
  });

  it('goes back to the wall from the pill', async () => {
    await render(inApp(<Places />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Back to the wall' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { place: 'library' } });
  });

  it('says what gathers here when no photo knows where it was taken', async () => {
    asked.mockReturnValue(loaded({ places: 0, countries: 0, list: [] }));
    await render(inApp(<Places />));
    expect(screen.getByRole('header', { name: 'No places yet' })).toBeOnTheScreen();
  });

  it('keeps its bar while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Places />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says what went wrong and asks again', async () => {
    const broken = failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(broken);
    await render(inApp(<Places />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });
});
