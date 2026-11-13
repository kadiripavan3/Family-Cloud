import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { markBillPaid, useGetActivityInfinite, useGetVault } from '@/api/generated/homeport';
import { changeNotSent } from '@/api/online';
import Activity from '@/app/(app)/(tabs)/activity';
import { allowAsk, CantAllow, sendAnswer } from '@/features/activity/asks';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { activityAsked, activityPage, ask, askLine, dueLine, ids, keptLine, NOW, oldLine, photosLine, wheelLine } from '@/test/samples/activity';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn() };
let mockParams: { filter?: string } = {};
let mockUnlocked = true;
const mockCache = { activitySeen: jest.fn(), circleMuted: jest.fn(), askAnswered: jest.fn(() => Promise.resolve()), billSaved: jest.fn(() => Promise.resolve()) };
const mockSeen = jest.fn();
const mockMute = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  // The tab is in front for as long as it is drawn: what it does on coming to the front, it does once drawn.
  return { useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true, useFocusEffect: (run: () => void | (() => void)) => useEffect(run, [run]) };
});
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/online', () => ({ changeNotSent: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({
  ActivityFilter: { all: 'all', asks: 'asks', photos: 'photos', money: 'money', plan: 'plan' },
  useGetActivityInfinite: jest.fn(),
  useMarkActivitySeen: () => ({ mutate: mockSeen }),
  useMuteCircle: (options: { mutation: { onMutate: (sent: unknown) => void } }) => ({
    isError: false,
    mutate: (sent: unknown) => {
      options.mutation.onMutate(sent);
      mockMute(sent);
    },
  }),
  useGetVault: jest.fn(),
  markBillPaid: jest.fn(),
}));
// What the phone does with keys has its own test; here it is stood in for.
jest.mock('@/features/activity/asks', () => ({ ...jest.requireActual('@/features/activity/asks'), allowAsk: jest.fn(), sendAnswer: jest.fn() }));
jest.mock('@/features/vault/session', () => ({ isVaultUnlocked: () => mockUnlocked, useVaultUnlocked: () => mockUnlocked, VaultLocked: class extends Error {} }));
jest.mock('@/features/vault/Locked', () => ({ Locked: ({ title }: { title: string }) => mockLocked(title) }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);

function mockLocked(title: string) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>{`the locked page: ${title}`}</Text>;
}

const mockLinds = linds;
const asked = jest.mocked(useGetActivityInfinite) as unknown as jest.Mock;
const vault = jest.mocked(useGetVault) as unknown as jest.Mock;

describe('11.1 Activity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    mockParams = {};
    mockUnlocked = true;
    asked.mockReturnValue(activityAsked());
    vault.mockReturnValue(loaded({ setUp: true }));
    mockSeen.mockImplementation((_sent, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
  });
  afterEach(() => jest.useRealTimers());

  it("asks for the current circle's Activity a page at a time, with the phone's day and time zone", async () => {
    await render(inApp(<Activity />));
    expect(asked).toHaveBeenCalledWith('c-linds', { filter: 'all', zone: expect.any(String), day: '2026-11-11' }, expect.objectContaining({ query: expect.objectContaining({ initialPageParam: undefined }) }));
    expect(screen.getByRole('header', { name: 'Activity' })).toBeOnTheScreen();
  });

  it('lays the lines under Today and Earlier this week, each with when it happened and its note', async () => {
    await render(inApp(<Activity />));
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Earlier this week')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'New. Alex asks to see Bank card PIN in the Vault. 12 min ago · for today only' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'New. Alex added 19 photos to Saturday at the lake. 2h ago' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Electricity is due tomorrow, €84.20. Your half is €42.10' })).toBeOnTheScreen();
    // A template's line names its board first; a line that counts several moments says the day alone.
    expect(screen.getByRole('button', { name: 'Leo fed Biscuit and earned a star. Chore wheel · 7:40' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex and Mia changed Groceries. Mon · 9 things added, 5 ticked' })).toBeOnTheScreen();
    // A guest has no page to open: the line is plain.
    expect(screen.getByLabelText('Ines opened their guest pass. Mon 18:02 · it ended at 23:30')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Ines opened/ })).toBeNull();
  });

  it('opens what a line is about: the thing by its kind, and the Library for a batch of photos', async () => {
    await render(inApp(<Activity />));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: /^Leo fed Biscuit/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: ids.wheel } });
    await user.press(screen.getByRole('button', { name: /^Electricity is due/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: ids.bill } });
    await user.press(screen.getByRole('button', { name: /Alex added 19 photos/ }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({ pathname: '/', params: { place: 'library' } });
  });

  it('draws a journey kept from the sister app, and opens nothing for one that has no thing of its own here', async () => {
    asked.mockReturnValue(activityAsked([activityPage({ due: [], items: [keptLine] })]));
    const view = await render(inApp(<Activity />));
    expect(screen.getByLabelText('Iceland ring road was kept from Journey. Sun 19:30 · 214 originals, now in Trips')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Iceland ring road/ })).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
    // One that was kept as an album here opens it, like any other line.
    asked.mockReturnValue(activityAsked([activityPage({ due: [], items: [{ ...keptLine, thingId: ids.wheel, thingKind: 'album' }] })]));
    await view.rerender(inApp(<Activity />));
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: /^Iceland ring road was kept from Journey/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: ids.wheel } });
  });

  it('marks everything as seen by being opened, and keeps the highlight of what was new while it is in front', async () => {
    const view = await render(inApp(<Activity />));
    expect(mockSeen).toHaveBeenCalledWith({ id: 'c-linds' }, expect.anything());
    expect(mockCache.activitySeen).toHaveBeenCalledWith('c-linds');
    // The list is read again, and the API no longer calls anything new.
    asked.mockReturnValue(activityAsked([activityPage({ items: [{ ...askLine, fresh: false }, { ...photosLine, fresh: false }, wheelLine], fresh: 0 })]));
    await view.rerender(inApp(<Activity />));
    expect(screen.getByRole('button', { name: /^New\. Alex asks to see/ })).toBeOnTheScreen();
    expect(mockSeen).toHaveBeenCalledTimes(1);
  });

  it('tells the API nothing when nothing is new', async () => {
    asked.mockReturnValue(activityAsked([activityPage({ items: [wheelLine], fresh: 0 })]));
    await render(inApp(<Activity />));
    expect(mockSeen).not.toHaveBeenCalled();
  });

  it('filters by chip, with how many asks wait on theirs', async () => {
    await render(inApp(<Activity />));
    expect(screen.getByRole('button', { name: 'All', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Asks, 1' })).toBeOnTheScreen();
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Money' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', expect.objectContaining({ filter: 'money' }), expect.anything());
    expect(screen.getByRole('button', { name: 'Money', selected: true })).toBeOnTheScreen();
  });

  it('opens on the chip a notification names', async () => {
    mockParams = { filter: 'asks' };
    await render(inApp(<Activity />));
    expect(asked).toHaveBeenLastCalledWith('c-linds', expect.objectContaining({ filter: 'asks' }), expect.anything());
    expect(screen.getByRole('button', { name: 'Asks, 1', selected: true })).toBeOnTheScreen();
  });

  it('loads the next page as the end comes near, and puts older lines under Earlier', async () => {
    const first = activityAsked([activityPage()], true);
    asked.mockReturnValue(first);
    const view = await render(inApp(<Activity />));
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByLabelText('the end of the list'));
    expect(first.fetchNextPage).toHaveBeenCalledTimes(1);
    asked.mockReturnValue(activityAsked([activityPage(), activityPage({ items: [oldLine], due: [] })]));
    await view.rerender(inApp(<Activity />));
    expect(screen.getByText('Earlier')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Leo fed Biscuit and earned a star. Chore wheel · 2 Oct' })).toBeOnTheScreen();
  });

  it('pays a bill from the line that says it is due: your share of that time', async () => {
    const bill = { id: ids.bill, circleId: 'c-linds' };
    jest.mocked(markBillPaid).mockResolvedValue(bill as never);
    await render(inApp(<Activity />));
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Pay. Electricity is due tomorrow, €84.20' }));
    await waitFor(() => expect(markBillPaid).toHaveBeenCalledWith(ids.bill, { dueOn: '2026-11-12' }));
    await waitFor(() => expect(mockCache.billSaved).toHaveBeenCalledWith(bill));
  });

  it('says so across the top when paying did not go through', async () => {
    jest.mocked(markBillPaid).mockRejectedValue(new ApiError(0, 'unreachable', 'Nothing answered.'));
    await render(inApp(<Activity />));
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: /^Pay\./ }));
    await waitFor(() => expect(changeNotSent).toHaveBeenCalled());
    expect(mockCache.billSaved).not.toHaveBeenCalled();
  });

  describe('answering an ask', () => {
    it('allows right on the line while the Vault is unlocked: the phone shares the item, then says so', async () => {
      const answered = ask({ state: 'allowed' });
      jest.mocked(allowAsk).mockResolvedValue({ ask: answered, item: { id: ids.pin, circleId: 'c-linds' } });
      await render(inApp(<Activity />));
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Allow. Alex asks to see Bank card PIN in the Vault' }));
      await waitFor(() => expect(allowAsk).toHaveBeenCalledWith({ askId: ids.ask, thingId: ids.pin, memberId: ids.alex, until: '2026-11-11T23:00:00Z', once: false }));
      await waitFor(() => expect(mockCache.askAnswered).toHaveBeenCalledWith(answered));
      expect(await screen.findByText('Alex can open it now')).toBeOnTheScreen();
    });

    it('opens the question from the line, with both answers; "Not now" tells the API and the asker', async () => {
      const answered = ask({ state: 'declined' });
      jest.mocked(sendAnswer).mockResolvedValue(answered);
      await render(inApp(<Activity />));
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.press(screen.getByRole('button', { name: /^New\. Alex asks to see/ }));
      expect(screen.getByRole('header', { name: 'Alex asks to see Bank card PIN in the Vault' })).toBeOnTheScreen();
      expect(screen.getByText('For today only. Allowing makes a key on this phone that opens it for Alex. Nobody at Homeport can do that for you.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Allow' })).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Not now' }));
      await waitFor(() => expect(sendAnswer).toHaveBeenCalledWith(ids.ask, false));
      await waitFor(() => expect(mockCache.askAnswered).toHaveBeenCalledWith(answered));
      expect(await screen.findByText('Alex was told: not now')).toBeOnTheScreen();
      expect(allowAsk).not.toHaveBeenCalled();
    });

    it('asks to unlock first when the Vault is locked, and carries on by itself once it is', async () => {
      mockUnlocked = false;
      jest.mocked(allowAsk).mockResolvedValue({ ask: ask({ state: 'allowed' }), item: { id: ids.pin, circleId: 'c-linds' } });
      const view = await render(inApp(<Activity />));
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: /^Allow\./ }));
      expect(screen.getByText('the locked page: Unlock the Vault to allow it')).toBeOnTheScreen();
      expect(allowAsk).not.toHaveBeenCalled();
      mockUnlocked = true;
      await view.rerender(inApp(<Activity />));
      await waitFor(() => expect(allowAsk).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByText(/^the locked page/)).toBeNull());
      expect(await screen.findByText('Alex can open it now')).toBeOnTheScreen();
    });

    it('says why it cannot allow: a sample item, an asker without a Vault, what the API said', async () => {
      jest.mocked(allowAsk).mockRejectedValueOnce(new CantAllow('sample'));
      await render(inApp(<Activity />));
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.press(screen.getByRole('button', { name: /^Allow\./ }));
      expect(await screen.findByText(/^This is a sample item\. It was never scrambled/)).toBeOnTheScreen();
      expect(mockCache.askAnswered).not.toHaveBeenCalled();

      jest.mocked(allowAsk).mockRejectedValueOnce(new CantAllow('no_vault'));
      await user.press(screen.getByRole('button', { name: 'Allow' }));
      expect(await screen.findByText("Alex hasn't set up their Vault yet, so nothing can be sealed for them. They can ask again once they have.")).toBeOnTheScreen();

      jest.mocked(allowAsk).mockRejectedValueOnce(new ApiError(404, 'not_found', "That question isn't there any more."));
      await user.press(screen.getByRole('button', { name: 'Allow' }));
      expect(await screen.findByText("That question isn't there any more.")).toBeOnTheScreen();
    });
  });

  describe('the sheet behind the gear', () => {
    it('mutes the circle, and shows it muted at once', async () => {
      await render(inApp(<Activity />));
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.press(screen.getByRole('button', { name: 'Activity settings' }));
      expect(screen.getByRole('header', { name: 'Activity in The Linds' })).toBeOnTheScreen();
      expect(screen.getByRole('switch', { name: 'Mute The Linds' })).not.toBeChecked();
      await user.press(screen.getByRole('switch', { name: 'Mute The Linds' }));
      expect(mockMute).toHaveBeenCalledWith({ id: 'c-linds', data: { muted: true } });
      expect(mockCache.circleMuted).toHaveBeenCalledWith('c-linds', true);
    });

    it('shows a muted circle as muted', async () => {
      asked.mockReturnValue(activityAsked([activityPage({ muted: true })]));
      await render(inApp(<Activity />));
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Activity settings' }));
      expect(screen.getByRole('switch', { name: 'Mute The Linds' })).toBeChecked();
    });

    it("leads to last week's Sunday summary, and to what the phone tells you about", async () => {
      await render(inApp(<Activity />));
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.press(screen.getByRole('button', { name: 'Activity settings' }));
      await user.press(screen.getByRole('button', { name: 'The Sunday summary. Last week on one page' }));
      expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/summary/[circleId]', params: { circleId: 'c-linds', week: '2026-11-02' } });
      await user.press(screen.getByRole('button', { name: 'Activity settings' }));
      await user.press(screen.getByRole('button', { name: 'Notification settings. What your phone tells you about' }));
      expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/notifications');
    });
  });

  describe('when there is nothing to show', () => {
    it('draws grey shapes while the first page is on its way', async () => {
      asked.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
      await render(inApp(<Activity />));
      expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Activity' })).toBeOnTheScreen();
    });

    it('says what belongs here when nothing has happened, in the words of the chip', async () => {
      asked.mockReturnValue(activityAsked([activityPage({ items: [], due: [], asks: 0, fresh: 0 })]));
      await render(inApp(<Activity />));
      expect(screen.getByRole('header', { name: 'Nothing has happened yet' })).toBeOnTheScreen();
      expect(screen.getByText("What is added and changed in The Linds, what is due and who is asking shows up here. Things you can't see never do.")).toBeOnTheScreen();
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Asks' }));
      expect(screen.getByRole('header', { name: 'Nobody is asking' })).toBeOnTheScreen();
    });

    it('says what went wrong, with a way to try again', async () => {
      const problem = { ...failed(new ApiError(500, 'server_error', 'Something went wrong on our side.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };
      asked.mockReturnValue(problem);
      await render(inApp(<Activity />));
      expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Try again' }));
      expect(problem.refetch).toHaveBeenCalled();
    });

    it('says so when it waits for a connection', async () => {
      asked.mockReturnValue({ ...pending(), isPaused: true, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
      await render(inApp(<Activity />));
      expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    });
  });

  it('keeps what is due out of sight under a chip that cannot hold it', async () => {
    asked.mockReturnValue(activityAsked([activityPage({ due: [], items: [askLine] })]));
    await render(inApp(<Activity />));
    expect(screen.queryByText(dueLine.sentence?.[0]?.text ?? 'Electricity')).toBeNull();
    await act(async () => undefined);
  });
});
