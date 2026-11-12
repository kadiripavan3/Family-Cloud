import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, changeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { spotBoard, spotView } from '@/test/samples/keepsakes';
import { picture } from '@/test/samples/templates';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { visible: boolean }) => mockSheet(props) }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
function mockSheet({ visible }: { visible: boolean }) {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
const PHOTO = { uri: 'file:///first-day.jpg', width: 1200, height: 1600 };

describe('15.4 Same spot, every year', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(spotBoard()));
    jest.mocked(pickPhoto).mockResolvedValue(PHOTO);
    jest.mocked(uploadPhoto).mockResolvedValue('media-2026');
  });

  it("shows this year's place with last year's photo laid faintly over it, and the years so far", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'First day of school · 2026' })).toBeOnTheScreen();
    expect(screen.getByLabelText('The photo from 2025, faintly')).toBeOnTheScreen();
    expect(screen.getByText('Last year, faintly. Line it up.')).toBeOnTheScreen();
    for (const year of [2023, 2024, 2025]) expect(screen.getByRole('button', { name: `Show ${year}` })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '2026, this year' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Pick this year's photo" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it("picks this year's photo, lines it up under last year's, and keeps it", async () => {
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'shot-2026', board: spotBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Pick this year's photo" }));
    expect(await screen.findByLabelText('The photo you picked for this year')).toBeOnTheScreen();
    expect(screen.getByLabelText('The photo from 2025, faintly')).toBeOnTheScreen();
    expect(addBoardEntry).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Keep it as the photo for 2026' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'photo', fields: { mediaId: 'media-2026' } }, DAY));
    expect(uploadPhoto).toHaveBeenCalledWith(PHOTO);
  });

  it("takes this year's again in place of the one that is there", async () => {
    const taken = { id: 'shot-2026', year: 2026, day: '2026-09-01', photo: picture('spot-2026'), note: null };
    asked.mockReturnValue(loaded(spotBoard(spotView({ takenThisYear: true, years: [...spotView().years, taken] }))));
    jest.mocked(changeBoardEntry).mockResolvedValue(spotBoard());
    await render(inApp(<Board />));
    expect(screen.getByText('2026 is taken. The button takes it again.')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Pick a photo' }));
    await user.press(await screen.findByRole('button', { name: 'Keep it as the photo for 2026' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('shot-2026', { fields: { mediaId: 'media-2026' } }, DAY));
  });

  it("shows an earlier year's photo, and plays the years as a strip", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Show 2024' }));
    expect(screen.getByLabelText('The photo from 2024')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'First day of school · 2024' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Play the years as a strip' }));
    // Each year stays up for a moment, then the next one.
    expect(screen.getByLabelText('The photo from 2023')).toBeOnTheScreen();
    expect(await screen.findByLabelText('The photo from 2024', {}, { timeout: 2500 })).toBeOnTheScreen();
    expect(await screen.findByLabelText('The photo from 2025', {}, { timeout: 2500 })).toBeOnTheScreen();
    // After the last year it is this year's turn again.
    expect(await screen.findByRole('header', { name: 'First day of school · 2026' }, { timeout: 2500 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play the years as a strip' })).toBeOnTheScreen();
  }, 15000);

  it('says the camera arrives with the phone app, has More for the audience and deleting, and Close leaves', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Turn the camera round' }));
    expect(screen.getByText(/^The camera arrives with the phone app\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Who can see this' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockBoardRouterState.back).toHaveBeenCalled();
  });

  it('says the first photo is the first, and that a strip needs a second year', async () => {
    asked.mockReturnValue(loaded(spotBoard(spotView({ last: null, years: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('The first one. Next year lines up with this.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Play the years as a strip' }));
    expect(screen.getByText('After a second year the photos play as a strip: the spot stays still and everyone grows.')).toBeOnTheScreen();
  });
});
