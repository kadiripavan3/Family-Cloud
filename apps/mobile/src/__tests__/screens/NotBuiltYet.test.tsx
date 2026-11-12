import { render, screen } from '@testing-library/react-native';

import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { onPhone } from '@/test/phone';

const NOT_BUILT = "This part of Homeport isn't built yet. It's on its way.";

describe('a screen that is still to be built', () => {
  it('says which screen it is and that it is on its way', async () => {
    await render(onPhone(<NotBuiltYet title="Export the Vault" />));
    expect(screen.getByRole('header', { name: 'Export the Vault' })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });

  it('stands in for a part of a screen the same way', async () => {
    await render(onPhone(<NotBuiltYet title="Money" part />));
    expect(screen.getByRole('header', { name: 'Money' })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });
});
