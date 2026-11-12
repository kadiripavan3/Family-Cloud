import { render, screen, userEvent } from '@testing-library/react-native';

import { useCircle } from '@/features/circles/current';
import { newThingHref } from '@/features/today/newThings';
import { PlusSheet } from '@/features/today/PlusSheet';
import { onPhone } from '@/test/phone';
import { crewCircle, linds, loaded, me, soloCircle } from '@/test/samples';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn(), useCircles: () => [mockLinds, mockCrew, mockSolo], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe) }));

const mockLinds = linds;
const mockCrew = crewCircle;
const mockSolo = soloCircle;
const mockMe = loaded(me());
const onClose = jest.fn();

describe('3.4 The + button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircle).mockReturnValue(linds);
  });

  it('offers ten things to add, each with its own screen', async () => {
    await render(onPhone(<PlusSheet visible onClose={onClose} />));
    const user = userEvent.setup();
    const things = ['Note', 'Checklist', 'Photos', 'Scan', 'Event', 'Reminder', 'Bill', 'Sheet', 'Password', 'Goal'];
    const routes = ['/new/note', '/new/checklist', '/new/photos', '/new/scan', '/new/event', '/new/reminder', '/new/bill', '/new/sheet', '/new/password', '/new/goal'];
    for (const [index, thing] of things.entries()) {
      await user.press(screen.getByRole('button', { name: thing }));
      expect(mockRouter.push).toHaveBeenLastCalledWith(routes[index]);
    }
    expect(onClose).toHaveBeenCalledTimes(10);
  });

  it('says where the thing goes and who it starts as seen by: only you, in a family', async () => {
    await render(onPhone(<PlusSheet visible onClose={onClose} />));
    expect(screen.getByText('Goes into')).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: The Linds')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeOnTheScreen();
  });

  it('changes who this one thing starts as seen by, and hands that to its screen', async () => {
    await render(onPhone(<PlusSheet visible onClose={onClose} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: 'Seen by The Linds. Change' }));
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: 'Event' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/new/event', params: { audience: 'circle' } });
  });

  it('starts things as shared among equals', async () => {
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    await render(onPhone(<PlusSheet visible onClose={onClose} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Seen by Lisbon crew. Change' }));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Note' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/new/note', params: { audience: 'me' } });
  });

  it('has nobody to share with in a circle of one', async () => {
    jest.mocked(useCircle).mockReturnValue(soloCircle);
    await render(onPhone(<PlusSheet visible onClose={onClose} />));
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeDisabled();
  });

  it('opens "Type it" from the line on top, with who it starts as seen by when that was changed', async () => {
    await render(onPhone(<PlusSheet visible onClose={onClose} />));
    expect(screen.getByText('Type it: “Haircut for Leo, Saturday 10”')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Type what to add' }));
    expect(onClose).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan/quick-add');
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: 'Type what to add' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/plan/quick-add', params: { audience: 'circle' } });
  });

  it('forgets what was changed for one thing when it is opened for the next', async () => {
    const view = await render(onPhone(<PlusSheet visible onClose={onClose} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await view.rerender(onPhone(<PlusSheet visible={false} onClose={onClose} />));
    await view.rerender(onPhone(<PlusSheet visible onClose={onClose} />));
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeOnTheScreen();
  });

  it('knows the screen of each of the ten, and a note for a word that is none of them', () => {
    expect(newThingHref('goal')).toBe('/new/goal');
    expect(newThingHref('bill', 'me')).toEqual({ pathname: '/new/bill', params: { audience: 'me' } });
    expect(newThingHref('spaceship')).toBe('/new/note');
  });
});
