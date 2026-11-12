import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createGuestPass, useGetChecklistsInfinite, useGetPagesInfinite } from '@/api/generated/homeport';
import NewGuestPass from '@/app/(app)/guest-pass/new';
import { today } from '@/lib/dates';
import { inApp } from '@/test/phone';
import { everyone, linds, loaded, me, onlyMe } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockChanged = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ guestPassChanged: mockChanged }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetPagesInfinite: jest.fn(), useGetChecklistsInfinite: jest.fn(), useGetMe: jest.fn(() => mockMe), createGuestPass: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockLinds = linds;
const mockMe = loaded(me());
const pages = jest.mocked(useGetPagesInfinite) as unknown as jest.Mock;
const lists = jest.mocked(useGetChecklistsInfinite) as unknown as jest.Mock;
/** One page of a paged list, as an `…Infinite` hook hands it over. */
const onePage = <T,>(items: T[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
const BABYSITTER = 'aaaaaaaa-1111-4111-8111-111111111111';
const NUMBERS = 'bbbbbbbb-1111-4111-8111-111111111111';

describe('4.5 Guest pass: making one', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pages.mockReturnValue(
      onePage([
        { id: BABYSITTER, circleId: 'c-linds', title: 'Babysitter notes', start: 'Bedtimes: Leo at 19:30.\nSnacks: fruit.', mine: true, chip: everyone },
        { id: NUMBERS, circleId: 'c-linds', title: 'Emergency numbers', start: 'Nora: 041 555 010', mine: false, chip: onlyMe },
      ]),
    );
    lists.mockReturnValue(onePage([{ id: 'cccccccc-1111-4111-8111-111111111111', circleId: 'c-linds', title: 'Groceries', mine: true, chip: everyone, left: 7, done: 5 }]));
  });

  it("offers the circle's pages and lists to put on the pass", async () => {
    await render(inApp(<NewGuestPass />));
    expect(screen.getByRole('header', { name: 'Guest pass' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Babysitter notes. Not on the pass' })).toBeOnTheScreen();
    expect(screen.getByText('Bedtimes: Leo at 19:30.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Groceries. Not on the pass' })).toBeOnTheScreen();
    expect(screen.getByText('7 left of 12')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Give the pass' })).toBeDisabled();
  });

  it('gives a pass for a person, a time and chosen things, and shows the pass', async () => {
    jest.mocked(createGuestPass).mockResolvedValue({ id: 'g-1', circleId: 'c-linds', guestName: 'Ines, the sitter', startsAt: '', endsAt: '', url: '', code: '4821', running: true, opened: false, things: [], cards: [], keyForMaker: null });
    await render(inApp(<NewGuestPass />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Who is it for?'), 'Ines, the sitter');
    expect(screen.getByText('Ines can open')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '00:05');
    await user.clear(screen.getByLabelText('Until'));
    await user.type(screen.getByLabelText('Until'), '23:55');
    await user.press(screen.getByRole('checkbox', { name: 'Babysitter notes. Not on the pass' }));
    await user.press(screen.getByRole('checkbox', { name: 'Emergency numbers. Not on the pass' }));
    expect(screen.getByRole('checkbox', { name: 'Babysitter notes. On the pass', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Give the pass' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/guest-pass/[id]', params: { id: 'g-1' } }));
    const sent = jest.mocked(createGuestPass).mock.calls[0]!;
    expect(sent[0]).toBe('c-linds');
    expect(sent[1]).toMatchObject({ clientId: 'client-1', guestName: 'Ines, the sitter', thingIds: [BABYSITTER, NUMBERS] });
    // It ends today at 23:55 by this phone's clock, sent as a moment.
    const ends = new Date(sent[1].endsAt);
    expect([ends.getHours(), ends.getMinutes()]).toEqual([23, 55]);
    expect(sent[1].endsAt.endsWith('Z')).toBe(true);
    expect(mockChanged).toHaveBeenCalledWith('c-linds');
    expect(today()).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('takes a thing off the pass again', async () => {
    await render(inApp(<NewGuestPass />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Groceries. Not on the pass' }));
    await user.press(screen.getByRole('checkbox', { name: 'Groceries. On the pass', checked: true }));
    expect(screen.getByRole('checkbox', { name: 'Groceries. Not on the pass', checked: false })).toBeOnTheScreen();
  });

  it('says how to write the times when they are not times', async () => {
    await render(inApp(<NewGuestPass />));
    const user = userEvent.setup();
    expect(screen.getByText('Times as 18:00. A pass can run for up to a week.')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Until'));
    await user.type(screen.getByLabelText('Until'), 'late');
    expect(screen.getByText('Write the times like 18:00.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Who is it for?'), 'Ines');
    await user.press(screen.getByRole('checkbox', { name: /^Groceries/ }));
    expect(screen.getByRole('button', { name: 'Give the pass' })).toBeDisabled();
  });

  it("says what the API says when the pass can't be given", async () => {
    jest.mocked(createGuestPass).mockRejectedValue(new ApiError(400, 'invalid_things', "One of those can't be put on a pass."));
    await render(inApp(<NewGuestPass />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Who is it for?'), 'Ines');
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '00:05');
    await user.press(screen.getByRole('checkbox', { name: /^Groceries/ }));
    await user.press(screen.getByRole('button', { name: 'Give the pass' }));
    expect(await screen.findByText("One of those can't be put on a pass.")).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('says so when there is nothing to put on a pass yet', async () => {
    pages.mockReturnValue(onePage([]));
    lists.mockReturnValue(onePage([]));
    await render(inApp(<NewGuestPass />));
    expect(screen.getByText('Nothing to put on a pass yet. Write a page or a list first.')).toBeOnTheScreen();
  });
});
