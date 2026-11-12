import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { changeCircle } from '@/api/generated/homeport';
import KindOfCircle from '@/app/(app)/circle/[id]/kind';
import { useCircles } from '@/features/circles/current';
import { inApp } from '@/test/phone';
import { circle, coupleCircle, crewCircle, linds, soloCircle } from '@/test/samples';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams = { id: 'c-crew' };
const mockChanged = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleChanged: mockChanged }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ changeCircle: jest.fn() }));

describe('2.6 What each kind gets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'c-crew' };
    jest.mocked(useCircles).mockReturnValue([linds, coupleCircle, crewCircle, soloCircle]);
  });

  it('says what a group of friends is set up with, in six rows', async () => {
    await render(inApp(<KindOfCircle />));
    expect(screen.getByRole('header', { name: 'Kind of circle' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Friends', checked: true })).toBeOnTheScreen();
    expect(screen.getByText('Lisbon crew is set up for friends')).toBeOnTheScreen();
    for (const line of ["You're called", 'The crew', 'To begin with', 'Everyone equal, everything shared with the five', 'Spaces', 'Trips · Plans · The dictionary', 'Templates', '17, from Secret Santa to splitting costs', 'Keepsakes', 'The dictionary · Predictions · The awards', 'Fair and fun', 'Find a date · Where next? · Draw names']) {
      expect(screen.getByText(line)).toBeOnTheScreen();
    }
    expect(screen.getByText('Changing the kind deletes nothing')).toBeOnTheScreen();
    expect(screen.getByText('It changes what is suggested from now on. Any template can still be found under All.')).toBeOnTheScreen();
  });

  it.each([
    ['c-linds', 'Family', 'The Linds is set up for a family', 'The family', '53, from the meal plan to babysitter notes'],
    ['c-couple', 'Couple', 'Nora and Alex is set up for a couple', 'The two of you', '16, from date ideas to who pays what'],
  ])('says it for each kind: %s', async (id, chosen, setUp, called, templates) => {
    mockParams = { id };
    await render(inApp(<KindOfCircle />));
    expect(screen.getByRole('radio', { name: chosen, checked: true })).toBeOnTheScreen();
    expect(screen.getByText(setUp)).toBeOnTheScreen();
    expect(screen.getByText(called)).toBeOnTheScreen();
    expect(screen.getByText(templates)).toBeOnTheScreen();
  });

  it('changes the kind with the control at the top, and tells every screen', async () => {
    const asFlat = { ...crewCircle, kind: 'flat' as const };
    jest.mocked(changeCircle).mockResolvedValue(asFlat);
    await render(inApp(<KindOfCircle />));
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Flat' }));
    await waitFor(() => expect(mockChanged).toHaveBeenCalledWith(asFlat));
    expect(changeCircle).toHaveBeenCalledWith('c-crew', { kind: 'flat' });
  });

  it('asks nothing of the API when the kind it already is gets pressed', async () => {
    await render(inApp(<KindOfCircle />));
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Friends' }));
    expect(changeCircle).not.toHaveBeenCalled();
  });

  it('can be read but not changed by someone who does not run the circle', async () => {
    jest.mocked(useCircles).mockReturnValue([circle({ iRunIt: false, myRole: 'child' })]);
    mockParams = { id: 'c-linds' };
    await render(inApp(<KindOfCircle />));
    expect(screen.getByText('Only the people who run this circle can change it.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Couple' }));
    expect(changeCircle).not.toHaveBeenCalled();
  });

  it('has words for a circle of one, with no kind chosen in the control', async () => {
    mockParams = { id: 'c-solo' };
    await render(inApp(<KindOfCircle />));
    expect(screen.getByText('Just me is set up for just you')).toBeOnTheScreen();
    expect(screen.getByText('Everything is yours alone')).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
  });
});
