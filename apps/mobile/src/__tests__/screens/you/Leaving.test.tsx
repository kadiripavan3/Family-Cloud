import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { askForExport, removeExport, removeMember, useGetExports, useGetLeaving } from '@/api/generated/homeport';
import Leaving from '@/app/(app)/settings/leaving';
import { openFile } from '@/features/library/save';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { exported, leavingNumbers, NOW } from '@/test/samples/activity';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true), dismissAll: jest.fn() };
const mockSignOut = jest.fn();
const mockCache = { exportAsked: jest.fn(() => Promise.resolve()), exportRemoved: jest.fn(), circleLeft: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', provider: 'email', signOut: mockSignOut }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));
jest.mock('@/features/library/save', () => ({ openFile: jest.fn(async () => true) }));
jest.mock('@/api/generated/homeport', () => ({ useGetExports: jest.fn(), useGetLeaving: jest.fn(), askForExport: jest.fn(), removeExport: jest.fn(), removeMember: jest.fn() }));

const mockLinds = linds;
const exportsAsked = jest.mocked(useGetExports) as unknown as jest.Mock;
const numbers = jest.mocked(useGetLeaving) as unknown as jest.Mock;

describe('12.4 Export and leaving', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    exportsAsked.mockReturnValue(loaded([]));
    numbers.mockReturnValue(loaded(leavingNumbers()));
  });
  afterEach(() => jest.useRealTimers());
  const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  it('says the way out plainly: the two exports, what happens on leaving, leaving and deleting', async () => {
    await render(inApp(<Leaving />));
    expect(screen.getByRole('header', { name: 'Export and leaving' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your things stay yours' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Export everything. Notes as text and web pages, photos full size, sheets as CSV' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Export the Vault. A locked file other password apps can open' })).toBeOnTheScreen();
    expect(screen.getByText('If you leave The Linds')).toBeOnTheScreen();
    expect(screen.getByText('What you kept private leaves with you')).toBeOnTheScreen();
    expect(screen.getByText('What you shared stays for the others, as a copy')).toBeOnTheScreen();
    expect(screen.getByText('Passwords you shared stop working for them')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Leave The Linds' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete account. You choose: only Homeport, or Journey too' })).toBeOnTheScreen();
  });

  it('asks on a page of its own before deleting the account, and logs out with one tap', async () => {
    await render(inApp(<Leaving />));
    await user().press(screen.getByRole('button', { name: /^Delete account/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/delete-account');
    expect(mockSignOut).not.toHaveBeenCalled();
    await user().press(screen.getByRole('button', { name: 'Log out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('says why the Vault cannot be exported yet, instead of doing nothing', async () => {
    await render(inApp(<Leaving />));
    await user().press(screen.getByRole('button', { name: /^Export the Vault/ }));
    expect(screen.getByText(/^Nobody but your phone can open your Vault, so only your phone can export it\. That part isn't built yet\./)).toBeOnTheScreen();
    await user().press(screen.getByRole('button', { name: 'Got it' }));
  });

  describe('exporting', () => {
    it('asks for an export of all you can see in this circle, once for one tap', async () => {
      const made = exported({ state: 'waiting', url: null, bytes: null, files: null, readyAt: null, expiresAt: null });
      jest.mocked(askForExport).mockResolvedValue(made);
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: /^Export everything/ }));
      expect(exportsAsked).toHaveBeenLastCalledWith('c-linds', { query: expect.objectContaining({ enabled: true }) });
      expect(screen.getByText(/^One zip of ordinary files from The Linds: notes as text and web pages/)).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'All you can see', checked: true })).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Make the export' }));
      await waitFor(() => expect(askForExport).toHaveBeenCalledWith('c-linds', { clientId: 'client-1', scope: 'everything' }));
      await waitFor(() => expect(mockCache.exportAsked).toHaveBeenCalledWith(made));
    });

    it('asks for only what you made when that is chosen', async () => {
      jest.mocked(askForExport).mockResolvedValue(exported({ scope: 'mine', state: 'waiting' }));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: /^Export everything/ }));
      await user().press(screen.getByRole('radio', { name: 'Only what you made' }));
      await user().press(screen.getByRole('button', { name: 'Make the export' }));
      await waitFor(() => expect(askForExport).toHaveBeenCalledWith('c-linds', { clientId: 'client-1', scope: 'mine' }));
    });

    it('shows one being made, looks again by itself, and makes no second one meanwhile', async () => {
      exportsAsked.mockReturnValue(loaded([exported({ state: 'working', url: null, bytes: null, files: null, readyAt: null, expiresAt: null })]));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: /^Export everything/ }));
      expect(screen.getByText('Being made. You can leave this page: it shows up in Activity when it is ready.')).toBeOnTheScreen();
      expect(screen.getByText('All you can see · asked for 2h ago')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Make the export' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
      // While one is under way the list is asked for again every few seconds, and no longer once it is ready.
      const { refetchInterval } = exportsAsked.mock.lastCall[1].query as { refetchInterval: (query: { state: { data: unknown } }) => number | false };
      expect(refetchInterval({ state: { data: [exported({ state: 'waiting' })] } })).toBe(3000);
      expect(refetchInterval({ state: { data: [exported()] } })).toBe(false);
      expect(refetchInterval({ state: { data: undefined } })).toBe(false);
    });

    it('fetches one that is ready, says how long it is kept, and what was left out', async () => {
      exportsAsked.mockReturnValue(loaded([exported({ leftOut: ['3 videos over 2 GB were left out.'] })]));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: /^Export everything/ }));
      expect(screen.getByText('214 files · 48 MB')).toBeOnTheScreen();
      expect(screen.getByText('Kept until Wed 18 Nov, then removed')).toBeOnTheScreen();
      expect(screen.getByText('3 videos over 2 GB were left out.')).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Save the export. 214 files · 48 MB' }));
      expect(openFile).toHaveBeenCalledWith('https://files.example.com/exports/k3y/homeport-export-2026-11-11.zip');
    });

    it('removes one, and says when one did not work', async () => {
      const broken = exported({ state: 'failed', url: null, bytes: null, files: null, readyAt: null, expiresAt: null });
      exportsAsked.mockReturnValue(loaded([broken]));
      jest.mocked(removeExport).mockResolvedValue(undefined);
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: /^Export everything/ }));
      expect(screen.getByText("That one didn't work. Ask for another.")).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Remove this export' }));
      await waitFor(() => expect(removeExport).toHaveBeenCalledWith(broken.id));
      await waitFor(() => expect(mockCache.exportRemoved).toHaveBeenCalledWith(broken));
    });

    it('says why asking did not work, in the words of the API', async () => {
      jest.mocked(askForExport).mockRejectedValue(new ApiError(429, 'too_many', 'One export at a time. Wait for the one that is being made.'));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: /^Export everything/ }));
      await user().press(screen.getByRole('button', { name: 'Make the export' }));
      expect(await screen.findByText('One export at a time. Wait for the one that is being made.')).toBeOnTheScreen();
    });
  });

  describe('leaving the circle', () => {
    it('asks first, with the numbers and who becomes the owner', async () => {
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      expect(numbers).toHaveBeenLastCalledWith('c-linds', { query: expect.objectContaining({ enabled: true }) });
      expect(screen.getByRole('header', { name: 'Leave The Linds?' })).toBeOnTheScreen();
      expect(screen.getByText('24 things only you can see are deleted. Export first to keep them.')).toBeOnTheScreen();
      expect(screen.getByText('156 things you shared stay for the others, in your name')).toBeOnTheScreen();
      expect(screen.getByText('5 passwords you shared stop working for them')).toBeOnTheScreen();
      expect(screen.getByText('Alex becomes the owner.')).toBeOnTheScreen();
      expect(removeMember).not.toHaveBeenCalled();
      await user().press(screen.getByRole('button', { name: 'Stay' }));
      expect(removeMember).not.toHaveBeenCalled();
    });

    it('leaves as the person themselves, forgets the circle, and goes Home', async () => {
      jest.mocked(removeMember).mockResolvedValue(undefined);
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      await user().press(screen.getAllByRole('button', { name: 'Leave The Linds' }).pop()!);
      await waitFor(() => expect(removeMember).toHaveBeenCalledWith(linds.myMemberId));
      await waitFor(() => expect(mockCache.circleLeft).toHaveBeenCalledWith(linds));
      expect(mockRouter.dismissAll).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenLastCalledWith('/');
    });

    it('counts one thing as one, and says so when nothing is yours alone', async () => {
      numbers.mockReturnValue(loaded(leavingNumbers({ onlyYours: 1, shared: 1, passwords: 1, nextOwner: null })));
      const view = await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      expect(screen.getByText('1 thing only you can see is deleted. Export first to keep it.')).toBeOnTheScreen();
      expect(screen.getByText('1 thing you shared stays for the others, in your name')).toBeOnTheScreen();
      expect(screen.getByText('1 password you shared stops working for them')).toBeOnTheScreen();
      expect(screen.queryByText(/becomes the owner/)).toBeNull();
      numbers.mockReturnValue(loaded(leavingNumbers({ onlyYours: 0, shared: 0, passwords: 0, nextOwner: null })));
      await view.rerender(inApp(<Leaving />));
      expect(screen.getByText('Nothing here is only yours')).toBeOnTheScreen();
      expect(screen.getByText('You shared nothing here')).toBeOnTheScreen();
      expect(screen.getByText('You shared no passwords here')).toBeOnTheScreen();
    });

    it('says the circle goes too when you are the last one in it', async () => {
      numbers.mockReturnValue(loaded(leavingNumbers({ lastOne: true, nextOwner: null })));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      expect(screen.getByText('You are the last one here. The Linds and everything in it is deleted for good.')).toBeOnTheScreen();
    });

    it("won't let an owner leave while no other adult can take over, and says what to do", async () => {
      numbers.mockReturnValue(loaded(leavingNumbers({ ownerNeeded: true, nextOwner: null })));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      expect(screen.getByText("You can't leave yet. You are the owner, and no other adult is here to take over. Make someone else an adult on People first.")).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Leave The Linds' }).pop()).toBeDisabled();
    });

    it('waits for the numbers before it lets you leave, and says why they did not come', async () => {
      numbers.mockReturnValue(pending());
      const view = await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      expect(screen.getAllByRole('button', { name: 'Leave The Linds' }).pop()).toBeDisabled();
      numbers.mockReturnValue(failed(new ApiError(500, 'server_error', 'Something went wrong on our side.')));
      await view.rerender(inApp(<Leaving />));
      expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
    });

    it('says why leaving did not work, and stays', async () => {
      jest.mocked(removeMember).mockRejectedValue(new ApiError(409, 'owner_needed', 'Someone else has to be able to take over first.'));
      await render(inApp(<Leaving />));
      await user().press(screen.getByRole('button', { name: 'Leave The Linds' }));
      await user().press(screen.getAllByRole('button', { name: 'Leave The Linds' }).pop()!);
      expect(await screen.findByText('Someone else has to be able to take over first.')).toBeOnTheScreen();
      expect(mockCache.circleLeft).not.toHaveBeenCalled();
    });
  });
});
