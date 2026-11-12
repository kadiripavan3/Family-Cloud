import { render, screen, userEvent } from '@testing-library/react-native';

import Activity from '@/app/(app)/(tabs)/activity';
import NewBill from '@/app/(app)/new/bill';
import NewPassword from '@/app/(app)/new/password';
import NewSheet from '@/app/(app)/new/sheet';
import { MoneyHome } from '@/features/money/MoneyHome';
import { VaultHome } from '@/features/vault/VaultHome';
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

  it.each([
    ['Money', <MoneyHome key="money" />],
    ['Vault', <VaultHome key="vault" />],
  ])("%s, one of Home's places, says which place it is and that it is on its way", async (name, place) => {
    await render(onPhone(place));
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });

  it.each([
    ['Bill', <NewBill key="bill" />],
    ['Sheet', <NewSheet key="sheet" />],
    ['Password', <NewPassword key="password" />],
  ])('%s, one of the things the + sheet opens, says what it is and closes', async (name, page) => {
    await render(onPhone(page));
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
