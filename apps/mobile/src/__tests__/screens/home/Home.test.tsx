import { render, screen, userEvent } from '@testing-library/react-native';

import Home from '@/app/(app)/(tabs)/index';
import { useCircle, useCircles } from '@/features/circles/current';
import { inApp } from '@/test/phone';
import { circle, coupleCircle, linds, loaded, todayAnswer } from '@/test/samples';

const mockRouter = { push: jest.fn(), setParams: jest.fn() };
let mockParams: { place?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn(), useCircles: jest.fn(), useSwitchCircle: () => jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => ({}) }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn(() => mockToday), createCircle: jest.fn() }));
// Each place is its own component; here only which one stands under the row matters.
jest.mock('@/features/today/TodayHome', () => ({ TodayHome: () => mockPlace('the place Today') }));
jest.mock('@/features/plan/PlanHome', () => ({ PlanHome: () => mockPlace('the place Plan') }));
jest.mock('@/features/notes/NotesHome', () => ({ NotesHome: () => mockPlace('the place Notes') }));
jest.mock('@/features/library/LibraryHome', () => ({ LibraryHome: () => mockPlace('the place Library') }));
jest.mock('@/features/money/MoneyHome', () => ({ MoneyHome: () => mockPlace('the place Money') }));
jest.mock('@/features/vault/VaultHome', () => ({ VaultHome: () => mockPlace('the place Vault') }));

const mockToday = loaded(todayAnswer());
function mockPlace(name: string) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>{name}</Text>;
}

describe('3 Home: the search pill, the row of six places, and the chosen place', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    jest.mocked(useCircle).mockReturnValue(linds);
    jest.mocked(useCircles).mockReturnValue([linds, coupleCircle]);
  });

  it('opens on Today, with all six places in the row', async () => {
    await render(inApp(<Home />));
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['Today', 'Plan', 'Notes', 'Library', 'Money', 'Vault']);
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeOnTheScreen();
    expect(screen.getByText('the place Today')).toBeOnTheScreen();
    expect(screen.getByText('Find anything')).toBeOnTheScreen();
    expect(screen.getByText('Notes · photos · bills · passwords')).toBeOnTheScreen();
  });

  it.each([
    ['plan', 'the place Plan', 'Find a date or a job'],
    ['notes', 'the place Notes', 'Search notes'],
    ['library', 'the place Library', 'Search the library'],
    ['money', 'the place Money', 'Search money'],
    ['vault', 'the place Vault', 'Search the Vault'],
  ])('shows the place the address names: %s', async (place, shown, pill) => {
    mockParams = { place };
    await render(inApp(<Home />));
    expect(screen.getByText(shown)).toBeOnTheScreen();
    expect(screen.getByText(pill)).toBeOnTheScreen();
    expect(screen.queryByText('the place Today')).toBeNull();
  });

  it('puts the chosen place into the address, and takes it out again for Today', async () => {
    await render(inApp(<Home />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Money' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ place: 'money' });
    await user.press(screen.getByRole('tab', { name: 'Today' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ place: undefined });
  });

  it('searches from the pill, within the place that is showing', async () => {
    const view = await render(inApp(<Home />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Find anything' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/search');
    mockParams = { place: 'library' };
    await view.rerender(inApp(<Home />));
    await user.press(screen.getByRole('button', { name: 'Search the library' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/search', params: { place: 'library' } });
  });

  it('opens "Your circles" from the round button, which carries the circle you are in', async () => {
    await render(inApp(<Home />));
    expect(screen.queryByRole('header', { name: 'Your circles' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'The Linds. Change circle' }));
    expect(screen.getByRole('header', { name: 'Your circles' })).toBeOnTheScreen();
  });

  it('draws Money and the Vault for a child, and says they are shut', async () => {
    jest.mocked(useCircle).mockReturnValue(circle({ myRole: 'child' }));
    mockParams = { place: 'money' };
    const view = await render(inApp(<Home />));
    expect(screen.getByRole('tab', { name: 'Money', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Money is shut for you' })).toBeOnTheScreen();
    expect(screen.getByText('In The Linds, Money is for the adults. Ask one of them if you need something from it.')).toBeOnTheScreen();
    expect(screen.queryByText('the place Money')).toBeNull();
    mockParams = { place: 'vault' };
    await view.rerender(inApp(<Home />));
    expect(screen.getByRole('header', { name: 'Vault is shut for you' })).toBeOnTheScreen();
    mockParams = { place: 'library' };
    await view.rerender(inApp(<Home />));
    expect(screen.getByText('the place Library')).toBeOnTheScreen();
  });
});
