import { render, screen, userEvent } from '@testing-library/react-native';

import CircleMade from '@/app/(setup)/setup/made';
import { useCircles } from '@/features/circles/current';
import { onPhone } from '@/test/phone';
import { circle, coupleCircle, crewCircle, linds } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams = { circle: 'c-couple' };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn() }));

describe('2.5 Made for your kind of circle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { circle: 'c-couple' };
    jest.mocked(useCircles).mockReturnValue([linds, coupleCircle, crewCircle, circle({ id: 'c-flat', kind: 'flat', name: 'Trubarjeva 9' })]);
  });

  it('says what choosing Couple gave you', async () => {
    await render(onPhone(<CircleMade />));
    expect(screen.getByRole('header', { name: 'Made for two' })).toBeOnTheScreen();
    expect(screen.getByText('Because you chose Couple, you start with this.')).toBeOnTheScreen();
    for (const line of ['Its own words', '“The two of you”, “ours”. Never “members”.', 'Shared unless you say otherwise', 'Our place · Money · Trips · Someday', '16 templates for couples', 'Keepsakes and small rituals']) {
      expect(screen.getByText(line)).toBeOnTheScreen();
    }
    expect(screen.getByText("You can change the kind later. Nothing you've kept is lost.")).toBeOnTheScreen();
  });

  it.each([
    ['c-flat', 'Made for a shared home', 'Because you chose Housemates, you start with this.', '15 templates for housemates', 'The flat · Bills · Landlord'],
    ['c-crew', 'Made for friends', 'Because you chose Friends, you start with this.', '17 templates for friends', 'Trips · Plans · The dictionary'],
  ])('says it in the words of the kind that was chosen: %s', async (id, title, because, templates, spaces) => {
    mockParams = { circle: id };
    await render(onPhone(<CircleMade />));
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText(because)).toBeOnTheScreen();
    expect(screen.getByText(templates)).toBeOnTheScreen();
    expect(screen.getByText(spaces)).toBeOnTheScreen();
  });

  it('goes on to the people of the circle', async () => {
    await render(onPhone(<CircleMade />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/setup/people', params: { circle: 'c-couple' } });
  });

  it('is not a step for a family, or for a circle that is not there', async () => {
    mockParams = { circle: 'c-linds' };
    const view = await render(onPhone(<CircleMade />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
    mockParams = { circle: 'c-gone' };
    await view.rerender(onPhone(<CircleMade />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
