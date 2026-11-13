import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, useGetBoard, useGetBoards } from '@/api/generated/homeport';
import { RunningLow } from '@/features/flat/RunningLow';
import { BOARD_ID, mockBoardCache, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { flatCircle, kittyBoard, kittyCard, kittyView, pinClock } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi({ useGetBoards: jest.fn() }));

const boards = jest.mocked(useGetBoards) as unknown as jest.Mock;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;

describe('18.1 "Running low" on a flat\'s Today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    boards.mockReturnValue(loaded({ items: [kittyCard], nextCursor: null }));
    asked.mockReturnValue(loaded(kittyBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(kittyBoard());
  });
  afterEach(() => jest.useRealTimers());

  it("draws the kitty's usual things as chips under its title: ticked for what is running low, a plus for the rest", async () => {
    await render(inApp(<RunningLow circle={flatCircle} />));
    expect(boards).toHaveBeenCalledWith('c-flat', { template: 'kitty' });
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-12' }, expect.anything());
    expect(screen.getByText('Running low')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Loo roll' })).toBeChecked();
    for (const thing of ['Bin bags', 'Oil', 'Dish soap', 'Coffee']) expect(screen.getByRole('checkbox', { name: thing })).not.toBeChecked();
  });

  it("marks a thing as running low, or as not, with the kitty's own verb", async () => {
    await render(inApp(<RunningLow circle={flatCircle} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Coffee' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'low', body: { itemId: 'item-coffee', low: true } }, { day: '2026-11-12' }));
    // The kitty comes back as it now stands, and every loaded copy of it is told.
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(kittyBoard()));
    await user.press(screen.getByRole('checkbox', { name: 'Loo roll' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'low', body: { itemId: 'item-loo-roll', low: false } }, { day: '2026-11-12' }));
  });

  it('leads to the kitty from its title', async () => {
    await render(inApp(<RunningLow circle={flatCircle} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Running low. Open the kitty' }));
    expect(mockBoardRouterState.navigate).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: BOARD_ID } });
  });

  it('says why a tap did not work', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(0, 'unreachable', "Can't reach Homeport. Check your connection."));
    await render(inApp(<RunningLow circle={flatCircle} />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Oil' }));
    expect(await screen.findByText("Can't reach Homeport. Check your connection.")).toBeOnTheScreen();
  });

  it('draws nothing in a circle without a kitty, while it loads, when it cannot be read, or with no usual things', async () => {
    boards.mockReturnValue(loaded({ items: [], nextCursor: null }));
    const { rerender } = await render(inApp(<RunningLow circle={flatCircle} />));
    expect(screen.queryByText('Running low')).toBeNull();
    expect(asked).not.toHaveBeenCalled();

    boards.mockReturnValue(pending());
    await rerender(inApp(<RunningLow circle={flatCircle} />));
    expect(screen.queryByText('Running low')).toBeNull();

    boards.mockReturnValue(loaded({ items: [kittyCard], nextCursor: null }));
    asked.mockReturnValue(failed(new ApiError(500, 'server_error', 'Something went wrong on our side.')));
    await rerender(inApp(<RunningLow circle={flatCircle} />));
    expect(screen.queryByText('Running low')).toBeNull();

    asked.mockReturnValue(loaded(kittyBoard(kittyView({ items: [] }))));
    await rerender(inApp(<RunningLow circle={flatCircle} />));
    expect(screen.queryByText('Running low')).toBeNull();
  });

  it('shows the chips to someone who may only look, without the tap', async () => {
    boards.mockReturnValue(loaded({ items: [{ ...kittyCard, canEdit: false }], nextCursor: null }));
    await render(inApp(<RunningLow circle={flatCircle} />));
    expect(screen.getByRole('checkbox', { name: 'Loo roll' })).toBeDisabled();
  });
});
