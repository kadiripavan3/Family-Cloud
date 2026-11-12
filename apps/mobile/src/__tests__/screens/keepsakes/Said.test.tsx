import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { uploadSound } from '@/features/templates/media';
import { pickSound, sound } from '@/features/templates/sound';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded, pending } from '@/test/samples';
import { quote, quoteBoss, quoteMoon, saidBoard, saidView } from '@/test/samples/keepsakes';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { visible: boolean }) => mockSheet(props) }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/features/templates/sound', () => ({ sound: { canAdd: true, canPlay: true }, pickSound: jest.fn(), playSound: jest.fn(() => jest.fn()) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
function mockSheet({ visible }: { visible: boolean }) {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
/** A list that has answered with these quotes, as the hook that reads a page at a time hands them over. */
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
const notYet = () => ({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('15.3 Things they said', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sound.canAdd = true;
    asked.mockReturnValue(loaded(saidBoard()));
    list.mockReturnValue(notYet());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'quote-new', board: saidBoard() });
  });

  it('shows the newest quotes at once, with who said each, how old they were, and a clip where there is one', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Things they said' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Everyone, 86' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'With a voice' })).toBeOnTheScreen();
    expect(screen.getByText("“I'm not tired. My eyes are just heavy.”")).toBeOnTheScreen();
    // Said yesterday: still news. The older ones carry only the age.
    expect(screen.getByText(/^Leo, 6 years and 7 months · yesterday$/)).toBeOnTheScreen();
    expect(screen.getByText(/^Mia, 7 years and 1 month$/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Play Leo's voice" })).toBeOnTheScreen();
    expect(screen.getByText('0:06')).toBeOnTheScreen();
    expect(list).toHaveBeenCalledWith(BOARD_ID, { kind: 'quote', member: undefined, filter: undefined, q: undefined, day: '2026-11-11' }, expect.anything());
  });

  it("has the audience on More, where the bar is full", async () => {
    await render(inApp(<Board />));
    expect(screen.queryByRole('button', { name: /^Seen by/ })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see this' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
  });

  it("shows one person's quotes, or only those with a voice, from the API's list", async () => {
    list.mockImplementation((_id: string, params: { member?: string; filter?: string }) => (params.member ? pageOf([quoteBoss]) : params.filter ? pageOf([quote()]) : notYet()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getAllByRole('button', { name: 'Mia' })[0]!);
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, expect.objectContaining({ member: 'm-mia', filter: undefined }), expect.anything());
    expect(screen.getByText("“When I'm grown up I'll still live here, but I'll be the boss.”")).toBeOnTheScreen();
    expect(screen.queryByText('“The moon is following our car.”')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'With a voice' }));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, expect.objectContaining({ member: undefined, filter: 'voice' }), expect.anything());
    expect(screen.getByText("“I'm not tired. My eyes are just heavy.”")).toBeOnTheScreen();
  });

  it('searches the words, and says so when nothing is found', async () => {
    list.mockImplementation((_id: string, params: { q?: string }) => (params.q === 'moon' ? pageOf([quoteMoon]) : params.q ? pageOf([]) : notYet()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // A chip that was chosen before doesn't narrow the search.
    await user.press(screen.getByRole('button', { name: 'With a voice' }));
    await user.press(screen.getByRole('button', { name: 'Search what they said' }));
    await user.type(screen.getByLabelText('Search what they said'), 'moon');
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, expect.objectContaining({ q: 'moon', filter: undefined, member: undefined }), expect.anything());
    expect(screen.getByText('“The moon is following our car.”')).toBeOnTheScreen();
    expect(screen.queryByText("“I'm not tired. My eyes are just heavy.”")).toBeNull();
    await user.type(screen.getByLabelText('Search what they said'), 'zz');
    expect(screen.getByText('Nobody said anything with “moonzz” in it.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.getByRole('button', { name: 'Everyone, 86' })).toBeOnTheScreen();
  });

  it('writes one down for the person who said it', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // The one who is quoted most is chosen to begin with; another is one tap.
    await user.press(screen.getAllByRole('button', { name: 'Mia' })[1]!);
    await user.type(screen.getByLabelText('What did they just say?'), 'Is it tomorrow yet?');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'quote', fields: { text: 'Is it tomorrow yet?', saidByMemberId: 'm-mia', mediaId: undefined } }, DAY));
  });

  it('keeps a clip with a quote: in a browser a picked sound file stands in for the microphone', async () => {
    jest.mocked(pickSound).mockResolvedValue({ uri: 'blob:clip', contentType: 'audio/wav', seconds: 6, name: 'clip.wav' });
    jest.mocked(uploadSound).mockResolvedValue('media-clip');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a recording' }));
    expect(await screen.findByText('Recording attached · 0:06')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What did they just say?'), 'I can hear the sea.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, expect.objectContaining({ kind: 'quote', fields: { text: 'I can hear the sea.', saidByMemberId: 'm-leo', mediaId: 'media-clip' } }), DAY));
    expect(uploadSound).toHaveBeenCalledWith({ uri: 'blob:clip', contentType: 'audio/wav', seconds: 6, name: 'clip.wav' });
  });

  it('says on a phone that the microphone arrives with the phone app', async () => {
    sound.canAdd = false;
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add a recording' }));
    expect(screen.getByText(/^Recording with the microphone arrives with the phone app\./)).toBeOnTheScreen();
  });

  it('opens a quote to see who wrote it down, and takes it out', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '“The moon is following our car.”. Leo, 4 years and 9 months' }));
    expect(screen.getByText('Leo, on 20 December 2024. Written down by Nora.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it out' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('quote-moon'));
  });

  it('says so when nothing was written down yet, and has no box for someone who may only look', async () => {
    asked.mockReturnValue(loaded(saidBoard(saidView({ total: 0, withVoice: 0, people: [], latest: [] }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Nothing written down yet')).toBeOnTheScreen();
    expect(screen.queryByLabelText('What did they just say?')).toBeNull();
  });
});
