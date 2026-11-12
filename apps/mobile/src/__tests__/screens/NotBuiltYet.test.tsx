import { render, screen } from '@testing-library/react-native';

import Activity from '@/app/(app)/(tabs)/activity';
import { onPhone } from '@/test/phone';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const NOT_BUILT = "This part of Homeport isn't built yet. It's on its way.";

describe('the screens that are still to be built', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Activity says which tab it is and that it is on its way', async () => {
    await render(onPhone(<Activity />));
    expect(screen.getByRole('header', { name: 'Activity' })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });
});
