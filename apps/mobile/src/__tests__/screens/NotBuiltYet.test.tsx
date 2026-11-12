import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createCircle } from '@/api/generated/homeport';
import Activity from '@/app/(app)/(tabs)/activity';
import People from '@/app/(app)/(tabs)/people';
import NewBill from '@/app/(app)/new/bill';
import NewChecklist from '@/app/(app)/new/checklist';
import NewEvent from '@/app/(app)/new/event';
import NewGoal from '@/app/(app)/new/goal';
import NewNote from '@/app/(app)/new/note';
import NewPassword from '@/app/(app)/new/password';
import NewPhotos from '@/app/(app)/new/photos';
import NewReminder from '@/app/(app)/new/reminder';
import NewScan from '@/app/(app)/new/scan';
import NewSheet from '@/app/(app)/new/sheet';
import Plus from '@/app/(app)/plus';
import Search from '@/app/(app)/search';
import Setup from '@/app/(setup)/setup/index';
import { LibraryHome } from '@/features/library/LibraryHome';
import { MoneyHome } from '@/features/money/MoneyHome';
import { NotesHome } from '@/features/notes/NotesHome';
import { PlanHome } from '@/features/plan/PlanHome';
import { TodayHome } from '@/features/today/TodayHome';
import { VaultHome } from '@/features/vault/VaultHome';
import { inApp, onPhone } from '@/test/phone';
import { soloCircle } from '@/test/samples';

const mockRouter = { back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
const mockFinish = jest.fn();
const mockJoined = jest.fn(() => Promise.resolve());
const mockSwitch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/onboarding', () => ({ useOnboarding: () => ({ finish: mockFinish }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleJoined: mockJoined }) }));
jest.mock('@/api/generated/homeport', () => ({ createCircle: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ switchCircle: (id: string) => mockSwitch(id) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const NOT_BUILT = "This part of Homeport isn't built yet. It's on its way.";

describe('the screens that are still to be built', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['People', <People key="people" />],
    ['Activity', <Activity key="activity" />],
  ])('%s says which tab it is and that it is on its way', async (name, tab) => {
    await render(onPhone(tab));
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });

  it.each([
    ['Today', <TodayHome key="today" />],
    ['Plan', <PlanHome key="plan" />],
    ['Notes', <NotesHome key="notes" />],
    ['Library', <LibraryHome key="library" />],
    ['Money', <MoneyHome key="money" />],
    ['Vault', <VaultHome key="vault" />],
  ])("%s, one of Home's six places, says which place it is and that it is on its way", async (name, place) => {
    await render(onPhone(place));
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
  });

  it.each([
    ['Note', <NewNote key="note" />],
    ['Checklist', <NewChecklist key="checklist" />],
    ['Photos', <NewPhotos key="photos" />],
    ['Scan', <NewScan key="scan" />],
    ['Event', <NewEvent key="event" />],
    ['Reminder', <NewReminder key="reminder" />],
    ['Bill', <NewBill key="bill" />],
    ['Sheet', <NewSheet key="sheet" />],
    ['Password', <NewPassword key="password" />],
    ['Goal', <NewGoal key="goal" />],
  ])('%s, one of the ten things the + sheet opens, says what it is and closes', async (name, page) => {
    await render(onPhone(page));
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('what the + button opens says so too, and closes back to the tab it came from', async () => {
    await render(onPhone(<Plus />));
    expect(screen.getByRole('header', { name: 'Add something' })).toBeOnTheScreen();
    expect(screen.getByText(NOT_BUILT)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('search has its place, and a way back', async () => {
    await render(onPhone(<Search />));
    expect(screen.getByRole('header', { name: 'Find anything' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('setting up a circle offers the one way through that is there: a circle of one, then Home', async () => {
    jest.mocked(createCircle).mockResolvedValue(soloCircle);
    await render(inApp(<Setup />));
    expect(screen.getByRole('header', { name: 'Set up a circle' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Just me for now' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(createCircle).toHaveBeenCalledWith({ clientId: 'client-1', kind: 'solo', name: 'Just me' });
    expect(mockJoined).toHaveBeenCalledWith(soloCircle);
    expect(mockSwitch).toHaveBeenCalledWith('c-solo');
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });
});
