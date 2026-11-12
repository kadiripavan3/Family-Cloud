import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatDayLong } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { doorBoard, doorView } from '@/test/samples/keepsakes';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('15.7 The doorframe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(doorBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'mark-new', board: doorBoard() });
  });

  it('draws the ruler with every mark and its date, a card for each child, and the lines the API words', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The doorframe' })).toBeOnTheScreen();
    expect(screen.getByLabelText(`Mia, 138 cm, ${formatDayLong('2026-11-02')}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Leo, 105 cm, ${formatDayLong('2024-09-15')}`)).toBeOnTheScreen();
    expect(screen.getByText(/^138 Mia · Nov 26$/)).toBeOnTheScreen();
    expect(screen.getByText(/^112 Leo · Sep 25$/)).toBeOnTheScreen();
    expect(screen.getByText('138 cm')).toBeOnTheScreen();
    expect(screen.getByText('119 cm')).toBeOnTheScreen();
    // The API's own sentences.
    expect(screen.getByText('6 cm since the last birthday')).toBeOnTheScreen();
    expect(screen.getByText('7 cm this year, the most yet')).toBeOnTheScreen();
    expect(screen.getByText('Tall enough for the big slide')).toBeOnTheScreen();
    expect(screen.getByText("Mia was Leo's height in the spring of 2023.")).toBeOnTheScreen();
  });

  it('adds a mark: whose, how tall in centimetres, on which day', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a mark' }));
    expect(screen.getByRole('button', { name: 'Mark it' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Leo' }));
    await user.type(screen.getByLabelText('Height in cm'), '120,5');
    await user.press(screen.getByRole('button', { name: 'Mark it' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'mark', fields: { memberId: 'm-leo', heightMm: 1205, day: '2026-11-11' } }, DAY);
  });

  it("won't take a height nobody can have", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a mark' }));
    await user.type(screen.getByLabelText('Height in cm'), '12');
    expect(screen.getByText('A height between 30 and 250 cm.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark it' })).toBeDisabled();
  });

  it('adds a line of the family to measure against, from More', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: /^Add a line to measure against/ }));
    await user.type(screen.getByLabelText('What it is'), 'The light switch');
    await user.type(screen.getByLabelText('Height in cm'), '110');
    await user.press(screen.getByRole('button', { name: 'Add the line' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'landmark', fields: { text: 'The light switch', heightMm: 1100 } }, DAY));
  });

  it('says an empty doorframe has no marks yet, and offers no button to someone who may only look', async () => {
    asked.mockReturnValue(loaded(doorBoard(doorView({ marks: [], children: [], comparisons: [] }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('No marks yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add a mark' })).toBeNull();
  });
});
