import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import {
  addLibraryComment,
  addToAlbum,
  changeLibraryItem,
  deleteThing,
  loveLibraryItem,
  removeFromAlbum,
  removeLibraryComment,
  saveAbout,
  unloveLibraryItem,
  useGetAlbumsInfinite,
  useGetLibraryCommentsInfinite,
  useGetLibraryItem,
} from '@/api/generated/homeport';
import Photo from '@/app/(app)/photo/[id]';
import Video from '@/app/(app)/video/[id]';
import { openFile, saveFiles } from '@/features/library/save';
import { frameFor, whoSees } from '@/features/library/viewer/Viewer';
import { inApp } from '@/test/phone';
import { coupleCircle, failed, linds, loaded, me, notMia, onlyMe, pending, withAlex } from '@/test/samples';
import { alexBrief, canoe, clip, comment, id, lakeItems, libraryItem, pages, photo, photoBook } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), setParams: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams: Record<string, string> = {};
const mockCache = {
  photoLoved: jest.fn(() => Promise.resolve()),
  photoCommented: jest.fn(() => Promise.resolve()),
  photoTagged: jest.fn(() => Promise.resolve()),
  photoChanged: jest.fn(() => Promise.resolve()),
  albumChanged: jest.fn(() => Promise.resolve()),
  thingDeleted: jest.fn(() => Promise.resolve()),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/library/save', () => ({ saveFiles: jest.fn(), openFile: jest.fn() }));
jest.mock('@/features/sharing/AudienceSheet', () => ({
  AudienceSheet: ({ visible, thingId }: { visible: boolean; thingId: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text>{`the audience sheet of ${thingId}`}</Text> : null;
  },
}));
jest.mock('@/api/generated/homeport', () => ({
  useGetLibraryItem: jest.fn(),
  useGetLibraryCommentsInfinite: jest.fn(),
  useGetAlbumsInfinite: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  loveLibraryItem: jest.fn(),
  unloveLibraryItem: jest.fn(),
  deleteThing: jest.fn(),
  addToAlbum: jest.fn(),
  createAlbum: jest.fn(),
  removeFromAlbum: jest.fn(),
  saveAbout: jest.fn(),
  changeLibraryItem: jest.fn(),
  addLibraryComment: jest.fn(),
  removeLibraryComment: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetLibraryItem) as unknown as jest.Mock;
const comments = jest.mocked(useGetLibraryCommentsInfinite) as unknown as jest.Mock;
const mine = photo({ id: id(2), addedBy: { memberId: 'm-nora', name: 'Nora', avatarUrl: null }, mine: true, chip: onlyMe });

describe('6.4 A photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: canoe.id, moment: canoe.id };
    asked.mockReturnValue(loaded(libraryItem()));
    comments.mockReturnValue(pages([{ items: [comment(), comment({ id: id(51), body: 'Only one near miss with the jetty.', by: alexBrief, canRemove: false })], nextCursor: null }]));
    (jest.mocked(useGetAlbumsInfinite) as unknown as jest.Mock).mockReturnValue(pages([{ items: [photoBook], nextCursor: null }]));
  });

  it('asks for the photo under the narrowing it was opened from', async () => {
    await render(inApp(<Photo />));
    expect(asked).toHaveBeenCalledWith(canoe.id, { moment: canoe.id }, expect.anything());
  });

  it('shows where it stands, when and where it was taken, who added it and who sees it', async () => {
    await render(inApp(<Photo />));
    expect(screen.getByText('1 of 51')).toBeOnTheScreen();
    expect(screen.getByText('Sat 7 Nov · 11:42 · Lake Bled')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: "Mia's first time steering" })).toBeOnTheScreen();
    expect(screen.getByText('Added by Alex · everyone in The Linds can see it')).toBeOnTheScreen();
    expect(screen.getByText('2 loves · 3 comments')).toBeOnTheScreen();
  });

  it('takes a heart back and gives one, and shows it at once', async () => {
    jest.mocked(unloveLibraryItem).mockResolvedValue(undefined);
    jest.mocked(loveLibraryItem).mockResolvedValue(undefined);
    const view = await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Remove your heart' }));
    await waitFor(() => expect(mockCache.photoLoved).toHaveBeenCalledWith({ id: canoe.id, circleId: 'c-linds' }, false));
    expect(unloveLibraryItem).toHaveBeenCalledWith(canoe.id);
    asked.mockReturnValue(loaded(libraryItem({ item: { ...canoe, loved: false }, loves: 1 })));
    await view.rerender(inApp(<Photo />));
    await user.press(screen.getByRole('button', { name: 'Give it a heart' }));
    await waitFor(() => expect(mockCache.photoLoved).toHaveBeenCalledWith({ id: canoe.id, circleId: 'c-linds' }, true));
    expect(loveLibraryItem).toHaveBeenCalledWith(canoe.id);
  });

  it('steps to a neighbour from the strip, staying on the same screen', async () => {
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'The one before it' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ id: lakeItems[1]!.id });
    await user.press(screen.getByRole('button', { name: '2 before it' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ id: lakeItems[2]!.id });
    // It is the newest of its moment: nothing stands after it.
    expect(screen.queryByRole('button', { name: 'The one after it' })).toBeNull();
  });

  it('opens who can see it, from its line and from the share button', async () => {
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Added by Alex · everyone in The Linds can see it. Who can see this' }));
    expect(screen.getByText(`the audience sheet of ${canoe.id}`)).toBeOnTheScreen();
  });

  it('shows the comments, sends a new one and removes your own', async () => {
    const sent = comment({ id: id(52), body: 'Can we go again?' });
    jest.mocked(addLibraryComment).mockResolvedValue(sent);
    jest.mocked(removeLibraryComment).mockResolvedValue(undefined);
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '2 loves · 3 comments. Open the comments' }));
    expect(screen.getByRole('header', { name: '3 comments' })).toBeOnTheScreen();
    expect(screen.getByText('She did so well!')).toBeOnTheScreen();
    expect(screen.getByText('Only one near miss with the jetty.')).toBeOnTheScreen();
    // Only your own can be removed (or any under a photo of yours).
    expect(screen.queryByRole('button', { name: 'Remove the comment by Alex' })).toBeNull();

    await user.type(screen.getByLabelText('Add a comment'), 'Can we go again?');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockCache.photoCommented).toHaveBeenCalledWith(canoe.id));
    expect(addLibraryComment).toHaveBeenCalledWith(canoe.id, { clientId: 'client-1', body: 'Can we go again?' });
    expect(screen.getByText('Can we go again?')).toBeOnTheScreen();

    await user.press(screen.getAllByRole('button', { name: 'Remove the comment by Nora' })[0]!);
    await user.press(screen.getByRole('button', { name: 'Remove comment' }));
    await waitFor(() => expect(removeLibraryComment).toHaveBeenCalledWith(id(50)));
    await waitFor(() => expect(screen.queryByText('She did so well!')).toBeNull());
  });

  it('says who is in it, by hand: tick the people and save', async () => {
    jest.mocked(saveAbout).mockResolvedValue(undefined);
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    // The menu says who is tagged now.
    await user.press(screen.getByRole('button', { name: 'Who is in it. Mia' }));
    expect(screen.getByRole('header', { name: 'Who is in it?' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Mia', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Biscuit', checked: false })).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Leo' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.photoTagged).toHaveBeenCalledWith({ id: canoe.id, circleId: 'c-linds', canEdit: true }));
    expect(saveAbout).toHaveBeenCalledWith(canoe.id, { memberIds: ['m-mia', 'm-leo'] });
  });

  it('says where and when in full', async () => {
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Where and when' }));
    expect(screen.getByText('Sat 7 Nov, 11:42')).toBeOnTheScreen();
    expect(screen.getByText('Lake Bled, Slovenia')).toBeOnTheScreen();
    expect(screen.getByText('canoe.jpg · 52 KB')).toBeOnTheScreen();
    expect(screen.getByText('For the photo book')).toBeOnTheScreen();
  });

  it('puts it into an album, and says so', async () => {
    jest.mocked(addToAlbum).mockResolvedValue({ applied: 1, skipped: 0 });
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Add to an album' }));
    await user.press(screen.getByRole('button', { name: /^For the photo book/ }));
    await waitFor(() => expect(mockCache.albumChanged).toHaveBeenCalledWith({ id: photoBook.id, circleId: 'c-linds' }));
    expect(addToAlbum).toHaveBeenCalledWith(photoBook.id, { itemIds: [canoe.id] });
    expect(screen.getByText('Added to For the photo book.')).toBeOnTheScreen();
  });

  it('takes it out of the album it was opened from', async () => {
    mockParams = { id: canoe.id, album: photoBook.id };
    jest.mocked(removeFromAlbum).mockResolvedValue(undefined);
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Take it out of this album. For the photo book' }));
    await waitFor(() => expect(mockCache.albumChanged).toHaveBeenCalledWith({ id: photoBook.id, circleId: 'c-linds' }));
    expect(removeFromAlbum).toHaveBeenCalledWith(photoBook.id, canoe.id);
    // On to the one before it.
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ id: lakeItems[1]!.id });
  });

  it('changes the caption', async () => {
    jest.mocked(changeLibraryItem).mockResolvedValue({} as never);
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Change the caption' }));
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'First time steering');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.photoChanged).toHaveBeenCalledWith({ id: canoe.id, circleId: 'c-linds' }));
    expect(changeLibraryItem).toHaveBeenCalledWith(canoe.id, { title: 'First time steering' });
  });

  it('saves a copy of the file, and says where it went', async () => {
    jest.mocked(saveFiles).mockResolvedValue('saved');
    await render(inApp(<Photo />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(screen.getByText('Saved to your downloads.')).toBeOnTheScreen());
    expect(saveFiles).toHaveBeenCalledWith([{ url: 'https://img.test/canoe.jpg', name: 'canoe.jpg' }]);
  });

  it("offers Delete only on a photo of your own, and asks before it's gone", async () => {
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('deletes your own photo and moves on to its neighbour', async () => {
    asked.mockReturnValue(loaded(libraryItem({ item: mine, about: [], neighbours: { newer: [canoe], older: [lakeItems[2]!], position: 2, total: 51 } })));
    mockParams = { id: mine.id, moment: canoe.id };
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Photo />));
    const user = userEvent.setup();
    expect(screen.getByText('Added by you · only you can see it')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'Who is in it. Nobody tagged yet' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a caption' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('header', { name: 'Delete this photo?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete photo' }));
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalledWith({ id: mine.id, circleId: 'c-linds' }));
    expect(deleteThing).toHaveBeenCalledWith(mine.id);
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ id: lakeItems[2]!.id });
  });

  it('plays a video by opening its file', async () => {
    mockParams = { id: clip.id, moment: canoe.id };
    asked.mockReturnValue(loaded(libraryItem({ item: clip, largeUrl: null, fileName: 'clip.mp4', contentType: 'video/mp4', about: [], neighbours: { newer: [], older: [], position: 5, total: 51 } })));
    jest.mocked(openFile).mockResolvedValue(true);
    await render(inApp(<Video />));
    expect(screen.getByText('5 of 51')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Play the video' }));
    expect(openFile).toHaveBeenCalledWith('https://img.test/clip.mp4');
  });

  it('keeps its Back while it loads, on the dark stage', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Photo />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so when the photo is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<Photo />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.getByText("That isn't there any more, or it isn't shared with you.")).toBeOnTheScreen();
  });

  it('is the "nothing at this address" page for an address that is no photo', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(inApp(<Photo />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});

describe('who sees a photo, as the end of its line', () => {
  it('says it by what the chip holds and the kind of circle', () => {
    expect(whoSees(canoe, linds)).toBe('everyone in The Linds can see it');
    expect(whoSees(photo({ circleId: 'c-couple' }), coupleCircle)).toBe('the two of you can see it');
    expect(whoSees(photo({ chip: onlyMe, mine: true }), linds)).toBe('only you can see it');
    expect(whoSees(photo({ chip: withAlex, mine: true }), linds)).toBe('Alex and you can see it');
    expect(whoSees(photo({ chip: { audience: 'some', people: [], hiddenFrom: [] }, mine: false }), linds)).toBe('shared with you');
    expect(whoSees(photo({ chip: notMia }), linds)).toBe('everyone in The Linds can see it, but not Mia');
  });
});

describe('the frame a photo is shown in', () => {
  it('fills the frame with a photo close to its shape, and shows a tall or a wide one whole', () => {
    expect(frameFor(390, { width: 780, height: 700 })).toEqual({ height: 408, fit: 'cover' });
    expect(frameFor(390, { width: 700, height: 1400 })).toEqual({ height: 408, fit: 'contain' });
    expect(frameFor(390, { width: 3000, height: 1000 })).toEqual({ height: 408, fit: 'contain' });
    expect(frameFor(390, { width: null, height: null })).toEqual({ height: 408, fit: 'contain' });
  });
});
