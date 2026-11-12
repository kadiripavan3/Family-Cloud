import { render, screen, userEvent } from '@testing-library/react-native';

import Activity from '@/app/(app)/(tabs)/activity';
import Home from '@/app/(app)/(tabs)/index';
import People from '@/app/(app)/(tabs)/people';
import Plus from '@/app/(app)/plus';
import Setup from '@/app/(setup)/setup';
import { onPhone } from '@/test/phone';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockFinish = jest.fn();
const mockEverything = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/onboarding', () => ({ useOnboarding: () => ({ finish: mockFinish }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ everything: mockEverything }) }));

const NOT_BUILT = "This part of Homeport isn't built yet. It's on its way.";

describe('the screens that are still to be built', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['Home', <Home key="home" />],
    ['People', <People key="people" />],
    ['Activity', <Activity key="activity" />],
  ])('%s says which tab it is and that it is on its way', async (name, tab) => {
    await render(onPhone(tab));
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });

  it('what the + button opens says so too, and closes back to the tab it came from', async () => {
    await render(onPhone(<Plus />));
    expect(screen.getByRole('header', { name: 'Add something' })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('setting up a circle ends sign-up with one button: the app opens, on fresh answers', async () => {
    await render(onPhone(<Setup />));
    expect(screen.getByRole('header', { name: 'Set up a circle' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockEverything).toHaveBeenCalledTimes(1);
  });
});
