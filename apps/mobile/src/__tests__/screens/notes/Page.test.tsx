import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { changePage, deleteThing, pinThing, sendChecklistChanges, sendPageChanges, sharePageLists, useGetLinks, useGetPage } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import Page from '@/app/(app)/page/[id]';
import { ChangesProvider } from '@/features/notes/changes/outbox';
import { setLeaving } from '@/features/notes/live';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, page, pending, thing } from '@/test/samples';
import { block, brief, dropsList, memoryStore, wifiPage } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { listSent: jest.fn(() => Promise.resolve()), pageSent: jest.fn(() => Promise.resolve()), notePinned: jest.fn(() => Promise.resolve()), noteGone: jest.fn(() => Promise.resolve()), insideShared: jest.fn(() => Promise.resolve()) };
let mockNext = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache, cacheFor: () => mockCache }));
jest.mock('@/api/online', () => ({ useOnline: jest.fn(() => true) }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/notes/changes/store', () => ({ changeStore: {} }));
jest.mock('@/features/notes/MoveSheet', () => ({ MoveSheet: () => null }));
jest.mock('@/features/notes/page/LinkPicker', () => ({ LinkPicker: () => null }));
jest.mock('@/features/notes/page/send', () => ({ pickPhoto: jest.fn(), sendPhoto: jest.fn(), sendPickedFile: jest.fn() }));
jest.mock('@/features/notes/page/pickFile', () => ({ pickFile: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({
  ThingKind: { page: 'page', checklist: 'checklist', event: 'event', goal: 'goal', vault_item: 'vault_item', bill: 'bill', sheet: 'sheet' },
  useGetPage: jest.fn(),
  useGetAudience: jest.fn(() => ({ data: undefined })),
  useGetLinks: jest.fn(() => ({ data: [] })),
  useGetMe: jest.fn(() => mockMe),
  getGetPageQueryKey: (id: string) => [`/v1/pages/${id}`],
  getGetChecklistQueryKey: (id: string) => [`/v1/checklists/${id}`],
  getPage: jest.fn(),
  getChecklist: jest.fn(),
  sendPageChanges: jest.fn(),
  sendChecklistChanges: jest.fn(),
  changePage: jest.fn(),
  sharePageLists: jest.fn(),
  deleteThing: jest.fn(),
  pinThing: jest.fn(),
  unpinThing: jest.fn(),
  fileThing: jest.fn(),
  changeFolder: jest.fn(),
  renameChecklist: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => `client-${(mockNext += 1)}`) }));

const mockId = '11111111-1111-4111-8111-111111111111';
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetPage) as unknown as jest.Mock;
const send = jest.mocked(sendPageChanges);

/** Types into the box of the block that is being written, the way a keyboard does: the box keeps the cursor. (Leaving the box ends the block.) */
const typeInto = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
/** Return on the keyboard. */
const pressReturn = (label: string) => fireEvent(screen.getByLabelText(label), 'submitEditing');

/** The page on a phone, with the queue of changes around it as in the app. */
const onPhone = () => inApp(<ChangesProvider store={memoryStore().store}>{<Page />}</ChangesProvider>);
/** What the queue sent for the page, one change after another. */
const sent = () => send.mock.calls.flatMap(([, body]) => body.changes);

describe('5.3 a page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = 0;
    jest.mocked(useOnline).mockReturnValue(true);
    asked.mockReturnValue(loaded(wifiPage()));
    send.mockImplementation(async (_id, body) => ({ answers: body.changes.map(() => ({ outcome: 'done' as const })), page: wifiPage({ version: 'v2' }) }));
    jest.mocked(sendChecklistChanges).mockImplementation(async (_id, body) => ({ answers: body.changes.map(() => ({ outcome: 'done' as const })), list: dropsList }));
  });

  it('shows where it is filed, who sees it, its title and who changed it last', async () => {
    await render(onPhone());
    expect(screen.getByText('Home / House manual')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: Alex and you. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Title').props.value).toBe('Wi‑Fi and smart home');
    expect(screen.getByText('Edited by Alex · 2h ago')).toBeOnTheScreen();
  });

  it('draws its blocks in order: a live block, a heading, a list to tick, a photo with its words, and text that names someone', async () => {
    await render(onPhone());
    expect(screen.getByRole('button', { name: 'Linds-Home-5G. Vault item. Password kept in the Vault' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'If the internet drops' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Unplug the white box for 10 seconds', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Still nothing? Call Telemach, 080 12 34', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('Where the router lives')).toBeOnTheScreen();
    expect(screen.getByText('@Alex')).toBeOnTheScreen();
    expect(screen.getByText(/The heating app is on the hallway tablet\./)).toBeOnTheScreen();
  });

  it("asks again every few seconds with the version it has, until the answer is that the page isn't there", async () => {
    await render(onPhone());
    const [id, options] = asked.mock.calls.at(-1) as [string, { query: { refetchInterval: (asked: { state: { error: unknown } }) => number | false; queryFn: unknown } }];
    expect(id).toBe(mockId);
    expect(options.query.refetchInterval({ state: { error: null } })).toBe(4000);
    // A refresh that failed for another reason is tried again; "not found" and "not for you" are final.
    expect(options.query.refetchInterval({ state: { error: new ApiError(500, 'error', 'x') } })).toBe(4000);
    expect(options.query.refetchInterval({ state: { error: new ApiError(404, 'not_found', 'x') } })).toBe(false);
    expect(options.query.refetchInterval({ state: { error: new ApiError(403, 'forbidden', 'x') } })).toBe(false);
    expect(typeof options.query.queryFn).toBe('function');
  });

  it('opens the folder it is in from the way to it', async () => {
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Home / House manual. Open this folder' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'f-manual' } });
  });

  it('ticks a line of a list drawn in the page, through that list\'s own queue', async () => {
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Still nothing? Call Telemach, 080 12 34' }));
    await waitFor(() => expect(sendChecklistChanges).toHaveBeenCalledWith(dropsList.id, { changes: [{ op: 'change', itemId: 'i-call', change: { done: true } }] }));
    await waitFor(() => expect(mockCache.listSent).toHaveBeenCalledWith(dropsList.id, dropsList));
    expect(send).not.toHaveBeenCalled();
  });

  it('opens what a live block shows, and says that copying a password arrives with the Vault', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Linds-Home-5G\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: 'v-wifi' } });
    await user.press(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByText('Copying a password without showing it arrives with the Vault.')).toBeOnTheScreen();
  });

  it('draws a quiet placeholder where a block shows something the reader cannot see', async () => {
    asked.mockReturnValue(loaded(wifiPage({ blocks: [block({ id: 'b-secret', kind: 'live', text: '', unseen: true }), block({ id: 'b-list', kind: 'checklist', text: '', unseen: true })] })));
    await render(onPhone());
    expect(screen.getAllByText("Something you can't see")).toHaveLength(2);
    expect(screen.getAllByText('It is shared with other people, not with you.')).toHaveLength(2);
  });

  it('draws a live block of another kind with its line and who sees it, a file with its size, a place that opens a map', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    asked.mockReturnValue(
      loaded(
        wifiPage({
          blocks: [
            block({ id: 'b-event', kind: 'live', text: '', thing: brief({ id: 'e-1', kind: 'event', place: 'plan', title: 'Dentist', glance: 'Wed 15:30', chip: { audience: 'me', people: [], hiddenFrom: [] } }) }),
            block({ id: 'b-file', kind: 'file', text: 'Boiler manual', media: { id: 'm-1', kind: 'file', url: '', thumbUrl: null, fileUrl: 'https://example.com/boiler.pdf', fileName: 'boiler.pdf', contentType: 'application/pdf', width: null, height: null, durationSeconds: null, bytes: 245760 } }),
            block({ id: 'b-place', kind: 'place', text: 'The pool on Kodeljevo' }),
          ],
        }),
      ),
    );
    await render(onPhone());
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Dentist. Event. Wed 15:30' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: Only you')).toBeOnTheScreen();
    expect(screen.getByText('240 KB')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open Boiler manual' }));
    expect(open).toHaveBeenLastCalledWith('https://example.com/boiler.pdf');
    await user.press(screen.getByRole('button', { name: 'The pool on Kodeljevo. Open in Maps' }));
    expect(open.mock.calls.at(-1)![0]).toContain(encodeURIComponent('The pool on Kodeljevo'));
    open.mockRestore();
  });

  it('changes a text block in place, with its marks typed the way people write them', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Text: The heating app/ }));
    const box = screen.getByLabelText('Text');
    expect(box.props.value).toBe('The heating app is on the hallway tablet. @Alex knows the boiler code.');
    expect(screen.getByText('*bold*   _slanted_   ~struck~   @name')).toBeOnTheScreen();
    await typeInto('Text', 'Ask @Mia for the *boiler code*.');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(sent()).toEqual([
        {
          op: 'change',
          blockId: 'b-heating',
          change: {
            text: 'Ask @Mia for the boiler code.',
            marks: [
              { start: 4, end: 8, kind: 'mention', memberId: 'm-mia' },
              { start: 17, end: 28, kind: 'bold' },
            ],
          },
        },
      ]),
    );
    await waitFor(() => expect(mockCache.pageSent).toHaveBeenCalledWith(mockId, expect.objectContaining({ version: 'v2' })));
  });

  it('sends nothing for a block that was opened and left as it was, and removes one that was emptied', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Text: The heating app/ }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(send).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: /^Heading: If the internet drops/ }));
    await typeInto('Heading', '');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'remove', blockId: 'b-heading' }]));
  });

  it('adds text from the bar: Return ends a block and begins the next, an empty one is never made', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add text' }));
    await typeInto('Text', 'The fuse box is behind the coats.');
    await pressReturn('Text');
    // The first block is on its way; the box is ready for the next one, which comes after it.
    await typeInto('Text', '- Spare bulbs are in the top drawer');
    await pressReturn('Text');
    // A bullet is followed by a bullet. Leaving that one empty ends typing.
    expect(screen.getByLabelText('Bullet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()).toEqual([
      { op: 'add', add: { clientId: 'client-1', kind: 'paragraph', text: 'The fuse box is behind the coats.', marks: [] } },
      { op: 'add', add: { clientId: 'client-3', kind: 'bullet', text: 'Spare bulbs are in the top drawer', marks: [], after: 'client-1' } },
    ]);
    expect(screen.queryByLabelText('Bullet')).toBeNull();
  });

  it('keeps what was typed when the page is left with the box still open', async () => {
    const phone = memoryStore();
    const view = await render(inApp(<ChangesProvider store={phone.store}>{<Page />}</ChangesProvider>));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add text' }));
    await typeInto('Text', 'Half a thought');
    // The box stays a box while the cursor is elsewhere: only Done, Return, another block or leaving ends it.
    await fireEvent(screen.getByLabelText('Text'), 'blur');
    expect(screen.getByLabelText('Text').props.value).toBe('Half a thought');
    expect(send).not.toHaveBeenCalled();
    // (Here the whole app goes with the page, so the block waits on the phone; in the app it goes up at once.)
    await view.unmount();
    await waitFor(() => expect([...phone.rows.values()].map((change) => change.body)).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'paragraph', text: 'Half a thought', marks: [] } }]));
  });

  it("makes a heading of a block that begins with '# '", async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add text' }));
    await typeInto('Text', '# The smart plugs');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'heading', text: 'The smart plugs', marks: [] } }]));
  });

  it('turns text into a heading or a bullet, moves a block up and down, and removes it, from the menu that holding it opens', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    const menu = async (row: string) => {
      await user.longPress(screen.getByRole('button', { name: /^Text: The heating app/ }));
      await user.press(screen.getByRole('button', { name: row }));
    };
    await menu('Make it a bullet');
    await menu('Move up');
    await menu('Remove from the page');
    await waitFor(() => expect(sent()).toHaveLength(3));
    expect(sent()).toEqual([
      { op: 'change', blockId: 'b-heating', change: { kind: 'bullet' } },
      // Up from fifth place: after the third block.
      { op: 'change', blockId: 'b-heating', change: { after: 'b-list' } },
      { op: 'remove', blockId: 'b-heating' },
    ]);
    // The last block can't go further down.
    await user.longPress(screen.getByRole('button', { name: /^Heading: If the internet drops/ }));
    expect(screen.getByRole('button', { name: 'Move down' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Make it plain text' })).toBeOnTheScreen();
  });

  it('changes the words under a photo', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Where the router lives. More' }));
    await user.press(screen.getByRole('button', { name: 'Change the words under it' }));
    await user.clear(screen.getByLabelText('Caption'));
    await user.type(screen.getByLabelText('Caption'), 'Behind the speaker');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'change', blockId: 'b-photo', change: { text: 'Behind the speaker' } }]));
  });

  it('names someone in the text block that was typed in last', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Text: The heating app/ }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await user.press(screen.getByRole('button', { name: 'Mention someone' }));
    await user.press(screen.getByRole('button', { name: 'Mia' }));
    const text = 'The heating app is on the hallway tablet. @Alex knows the boiler code. @Mia';
    await waitFor(() =>
      expect(sent()).toEqual([
        {
          op: 'change',
          blockId: 'b-heating',
          change: {
            text,
            marks: [
              { start: 42, end: 47, kind: 'mention', url: null, memberId: 'm-alex' },
              { start: text.length - 4, end: text.length, kind: 'mention', memberId: 'm-mia' },
            ],
          },
        },
      ]),
    );
  });

  it('saves the title when its box is left, and the emoji when one is chosen', async () => {
    jest.mocked(changePage).mockResolvedValue(wifiPage({ title: 'Wi‑Fi', version: 'v3' }));
    await render(onPhone());
    const user = userEvent.setup();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Wi‑Fi');
    await fireEvent(screen.getByLabelText('Title'), 'blur');
    await waitFor(() => expect(changePage).toHaveBeenCalledWith(mockId, { title: 'Wi‑Fi' }));
    await waitFor(() => expect(mockCache.pageSent).toHaveBeenCalledWith(mockId, expect.objectContaining({ title: 'Wi‑Fi' })));
    await user.press(screen.getByRole('button', { name: 'Change the emoji' }));
    await user.press(screen.getByRole('radio', { name: '💡' }));
    await waitFor(() => expect(changePage).toHaveBeenLastCalledWith(mockId, { emoji: '💡' }));
  });

  it('pins it, gives the lists in it the same audience, and deletes it after asking', async () => {
    jest.mocked(pinThing).mockResolvedValue(undefined);
    jest.mocked(sharePageLists).mockResolvedValue({ changed: 1, notYours: 0 });
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(onPhone());
    const user = userEvent.setup();
    const menu = async (row: string) => {
      await user.press(screen.getByRole('button', { name: 'More' }));
      await user.press(screen.getByRole('button', { name: row }));
    };
    await menu('Pin to the top of Notes');
    await waitFor(() => expect(mockCache.notePinned).toHaveBeenCalledWith({ id: mockId, circleId: 'c-linds' }, true));
    await menu('Share the lists in it the same way');
    expect(await screen.findByText("1 list now has the page's audience.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await menu('Delete page');
    expect(screen.getByRole('header', { name: 'Delete this page?' })).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Delete page' }).at(-1)!);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(deleteThing).toHaveBeenCalledWith(mockId);
    expect(mockCache.noteGone).toHaveBeenCalledWith({ id: mockId, circleId: 'c-linds' });
    // The screen is still there while it closes: it doesn't ask for the page it has just deleted.
    expect((asked.mock.calls.at(-1) as [string, { query: { enabled: boolean } }])[1].query.enabled).toBe(false);
    await act(async () => setLeaving(mockId, false));
  });

  it('is for reading only for someone who may not change it', async () => {
    asked.mockReturnValue(loaded(wifiPage({ canEdit: false, mine: false })));
    await render(onPhone());
    expect(screen.getByRole('header', { name: 'Wi‑Fi and smart home' })).toBeOnTheScreen();
    expect(screen.getByText('You can read this page, but not change it.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to this page' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Text: / })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'Pin to the top of Notes' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Delete page' })).toBeNull();
  });

  it('invites to write where a page is still empty', async () => {
    asked.mockReturnValue(loaded(page({ title: 'New ideas', blocks: [] })));
    await render(onPhone());
    expect(screen.getByText('Nothing on this page yet. Tap here to write, or add something with the + below.')).toBeOnTheScreen();
    expect(screen.getByText(/^Edited /)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByText('Nothing on this page yet. Tap here to write, or add something with the + below.'));
    expect(screen.getByLabelText('Text')).toBeOnTheScreen();
  });

  it('lists what it is linked to under its blocks', async () => {
    jest.mocked(useGetLinks as unknown as jest.Mock).mockReturnValue({ data: [thing({ id: 'd-1', kind: 'document', title: 'Boiler manual', glance: 'PDF · 12 pages' })] });
    await render(onPhone());
    expect(screen.getByText('Linked')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Boiler manual. Document. PDF · 12 pages' })).toBeOnTheScreen();
  });

  it('says it is offline in its own words, keeps a change on the phone, and marks the block as waiting', async () => {
    jest.mocked(useOnline).mockReturnValue(false);
    await render(onPhone());
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline. What you change is saved here and will reach everyone when you're back.");
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add text' }));
    await typeInto('Text', 'Written in the cellar.');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Text: Written in the cellar.. Change' })).toBeOnTheScreen();
    expect(screen.getAllByText('waiting')).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
    // A photo has to go up first, and that needs a connection.
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(screen.getByText("That needs a connection. Try again when you're back online.")).toBeOnTheScreen();
    await act(async () => undefined);
  });

  it('draws its shape while it loads, keeps its Back, and says so when the page is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(onPhone());
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(onPhone());
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.getByText("That isn't there any more, or it isn't shared with you.")).toBeOnTheScreen();
  });
});
