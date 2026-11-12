import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatDay } from '@/lib/dates';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { letter, lettersBoard, lettersForReader, lettersView } from '@/test/samples/keepsakes';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { visible: boolean }) => mockSheet(props) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
function mockSheet({ visible }: { visible: boolean }) {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
const opened = `on ${formatDay('2026-11-02')}, at 21:40`;

describe('15.1 Open when…', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(lettersBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(lettersBoard());
  });

  it('shows the writer their envelopes: sealed ones, the one that was opened and when, and who they are for', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Open when…' })).toBeOnTheScreen();
    expect(screen.getByText('Letters for Mia, from you')).toBeOnTheScreen();
    expect(screen.getByText("…you can't sleep")).toBeOnTheScreen();
    expect(screen.getByText(`Mia opened it ${opened}`)).toBeOnTheScreen();
    expect(screen.getByText('Sealed · with a voice message')).toBeOnTheScreen();
    expect(screen.getByText('Sealed · comes forward when Mia is on a journey')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Write another' })).toBeOnTheScreen();
    expect(screen.getByText("Mia sees the envelopes, not what's inside. Once opened, a letter is Mia's to keep.")).toBeOnTheScreen();
  });

  it('words the chip as "For Mia", and it opens the one audience sheet', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Seen by: For Mia. Change who can see this' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
  });

  it('lets the writer read their own letter, and open it with a child who has no phone', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "…you can't sleep. Sealed" }));
    expect(screen.getByText('Count the stars on your ceiling.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open it with Mia' }));
    expect(screen.getByText('Open it with Mia now? It can only be opened once.')).toBeOnTheScreen();
    expect(actOnBoard).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Yes, open it' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'open', body: { entryId: 'letter-sleep' } }, DAY));
  });

  it('keeps an opened letter as it is: its writer reads it and can no longer take it back', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: `…you've had a bad day. Mia opened it ${opened}` }));
    expect(screen.getByText('First: it is allowed.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take the letter back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open it with Mia' })).toBeNull();
  });

  it('takes a letter back while it is sealed', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "…you can't sleep. Sealed" }));
    await user.press(screen.getByRole('button', { name: 'Take the letter back' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('letter-sleep'));
  });

  it('shows the reader envelopes and no words, and opens one after asking', async () => {
    asked.mockReturnValue(loaded(lettersBoard(lettersForReader, { mine: false, canEdit: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Letters for you')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: For you. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByText(`You opened it ${opened}`)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Write another' })).toBeNull();
    expect(screen.getByText("You see the envelopes, not what's inside. Once opened, a letter is yours to keep.")).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "…you can't sleep. Sealed" }));
    expect(screen.getByText("It's sealed. Open it when the moment has come: it can only be opened once.")).toBeOnTheScreen();
    expect(screen.queryByText('Count the stars on your ceiling.')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Open it' }));
    await user.press(screen.getByRole('button', { name: 'Yes, open it' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'open', body: { entryId: 'letter-sleep' } }, DAY));
  });

  it("tells someone it isn't for, and who didn't write it, only that it is sealed", async () => {
    const view = lettersView({ youOpenForThem: false, letters: [letter({ mine: false, canOpen: false, text: null })] });
    asked.mockReturnValue(loaded(lettersBoard(view, { mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Letters for Mia')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "…you can't sleep. Sealed" }));
    expect(screen.getByText('Only Mia can open this one, and only the person who wrote it can read it before that.')).toBeOnTheScreen();
  });

  it('writes a letter: what the envelope says, its picture, the words, and whether it comes forward', async () => {
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'letter-new', board: lettersBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write another' }));
    expect(screen.getByRole('button', { name: 'Seal the envelope' })).toBeDisabled();
    await user.type(screen.getByLabelText('Open when…'), 'you miss Biscuit');
    await user.press(screen.getByRole('radio', { name: 'Trophy' }));
    await user.type(screen.getByLabelText('The letter'), 'He misses you more.');
    await user.press(screen.getByRole('checkbox', { name: 'Bring it forward when Mia is away on a journey' }));
    await user.press(screen.getByRole('button', { name: 'Seal the envelope' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'letter', fields: { when: 'you miss Biscuit', emoji: '🏆', text: 'He misses you more.', mediaId: undefined, forwardOn: 'journey' } }, DAY));
  });

  it('says there are no letters yet, and offers the first', async () => {
    asked.mockReturnValue(loaded(lettersBoard(lettersView({ letters: [], sealed: 0, opened: 0 }))));
    await render(inApp(<Board />));
    expect(screen.getByText('No letters yet')).toBeOnTheScreen();
    expect(screen.getByText('Letters for Mia')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Write the first letter' })).toBeOnTheScreen();
  });
});
