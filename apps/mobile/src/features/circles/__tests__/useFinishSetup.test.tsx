import { render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useFinishSetup } from '../useFinishSetup';

const mockRouter = { dismissTo: jest.fn() };
const mockFinish = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/onboarding', () => ({ useOnboarding: () => ({ finish: mockFinish }) }));

function Done() {
  const finish = useFinishSetup();
  return <Text onPress={finish}>done</Text>;
}

describe('the end of setting up or joining a circle', () => {
  it('ends sign-up for a new person, and goes to Home: back to it when it is underneath, in its place otherwise', async () => {
    await render(<Done />);
    await userEvent.setup().press(screen.getByText('done'));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
  });
});
