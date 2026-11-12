import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changePage, deleteThing, useGetAudience, useGetLinks, useGetPage } from '@/api/generated/homeport';
import Page from '@/app/(app)/page/[id]';
import { inApp } from '@/test/phone';
import { everyone, failed, hiddenFromMia, linds, loaded, me, notMia, page, pending, thing } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { pageSaved: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
let mockGuard: { on: boolean; ask: ((how: { repeat: () => void }) => void) | undefined } = { on: false, ask: undefined };
const mockRepeat = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: mockId }),
  usePreventRemove: (on: boolean, ask: (how: { repeat: () => void }) => void) => {
    mockGuard = { on, ask };
    return jest.fn();
  },
}));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetPage: jest.fn(), useGetLinks: jest.fn(), useGetAudience: jest.fn(), useGetMe: jest.fn(() => mockMe), changePage: jest.fn(), deleteThing: jest.fn() }));

const mockId = '11111111-1111-4111-8111-111111111111';
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetPage) as unknown as jest.Mock;
const links = jest.mocked(useGetLinks) as unknown as jest.Mock;
const audience = jest.mocked(useGetAudience) as unknown as jest.Mock;
const justNow = new Date().toISOString();

describe('a page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(page({ updatedAt: justNow })));
    links.mockReturnValue(loaded([]));
    audience.mockReturnValue(pending());
  });

  it('shows its title and words, when it was edited, and who sees it', async () => {
    await render(inApp(<Page />));
    expect(asked).toHaveBeenCalledWith(mockId);
    expect(screen.getByLabelText('Title').props.value).toBe('Wi‑Fi and smart home');
    expect(screen.getByLabelText('Words').props.value).toBe('Network: Lind-Home');
    expect(screen.getByText('Edited just now')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: Only you. Change who can see this' })).toBeOnTheScreen();
    // Nothing is hidden: the sheet's answer isn't asked for.
    expect(audience).toHaveBeenCalledWith(mockId, { query: { enabled: false } });
  });

  it('is typed into directly by whoever may edit it, and saved with Save', async () => {
    const saved = page({ body: 'Network: Lind-Home\nThe router is in the hallway.' });
    jest.mocked(changePage).mockResolvedValue(saved);
    await render(inApp(<Page />));
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await user.type(screen.getByLabelText('Words'), '\nThe router is in the hallway.');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.pageSaved).toHaveBeenCalledWith(saved));
    // Only what changed is sent: a change of words leaves the title out, and the other way round.
    expect(changePage).toHaveBeenCalledWith(mockId, { body: 'Network: Lind-Home\nThe router is in the hallway.' });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('sends a new title without the words, so a page made of parts keeps its parts', async () => {
    jest.mocked(changePage).mockResolvedValue(page({ title: 'Wi‑Fi' }));
    await render(inApp(<Page />));
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Wi‑Fi');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changePage).toHaveBeenCalledWith(mockId, { title: 'Wi‑Fi' }));
  });

  it('says who edited it last and which folders it is in, when the API says so', async () => {
    asked.mockReturnValue(loaded(page({ editedBy: { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }, editedAt: justNow, breadcrumb: [{ id: 'f-1', title: 'Kids', emoji: '' }, { id: 'f-2', title: 'Birthdays', emoji: '' }] })));
    await render(inApp(<Page />));
    expect(screen.getByText('Edited by Alex · just now')).toBeOnTheScreen();
    expect(screen.getByText('Kids / Birthdays')).toBeOnTheScreen();
  });

  it('draws a page made of parts part by part: headings, words, and each thing it holds as it stands now', async () => {
    const prep = thing({ id: '22222222-2222-4222-8222-222222222222', kind: 'checklist', title: 'Party prep', glance: '4 of 9 done' });
    const budget = thing({ id: '33333333-3333-4333-8333-333333333333', kind: 'sheet', place: 'money', title: 'Party budget', glance: '€180 of €250' });
    const cake = thing({ id: '44444444-4444-4444-8444-444444444444', kind: 'reminder', place: 'plan', title: 'Order the cake', glance: 'Fri' });
    const block = { id: 'b-1', kind: 'live' as const, text: '', marks: [], thing: null, checklist: null, unseen: false, media: null, lat: null, lng: null, updatedAt: justNow };
    asked.mockReturnValue(
      loaded(
        page({
          body: 'The party\nAt home, 8 children.',
          blocks: [
            { ...block, id: 'b-0', kind: 'heading', text: 'The party' },
            { ...block, id: 'b-1', kind: 'paragraph', text: 'At home, 8 children.' },
            { ...block, id: 'b-2', thing: budget },
            { ...block, id: 'b-3', kind: 'checklist', thing: prep },
            // Something the reader may not see is left out, without a word.
            { ...block, id: 'b-4', unseen: true },
          ],
        }),
      ),
    );
    // What is linked and already on the page is not listed twice.
    links.mockReturnValue(loaded([prep, cake]));
    await render(inApp(<Page />));
    expect(screen.getByText('The party')).toBeOnTheScreen();
    expect(screen.getByText('At home, 8 children.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Party prep. List. 4 of 9 done' })).toHaveLength(1);
    expect(screen.getByText('Linked')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Order the cake. Reminder. Fri' })).toBeOnTheScreen();
    // Its parts are changed in Notes; here the words are not one box to type over.
    expect(screen.queryByLabelText('Words')).toBeNull();
    expect(screen.getByLabelText('Title')).toBeOnTheScreen();
    expect(screen.getByText(/^This page is made of parts/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Party budget. Sheet. €180 of €250' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: budget.id } });
  });

  it('asks before leaving with something typed and not saved', async () => {
    await render(inApp(<Page />));
    expect(mockGuard.on).toBe(false);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), '!');
    expect(mockGuard.on).toBe(true);
    await waitFor(() => mockGuard.ask?.({ repeat: mockRepeat }));
    expect(await screen.findByRole('header', { name: 'Leave without saving?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Leave' }));
    expect(mockRepeat).toHaveBeenCalledTimes(1);
  });

  it("says what the API says when saving doesn't work, and keeps what was typed", async () => {
    jest.mocked(changePage).mockRejectedValue(new ApiError(403, 'view_only', 'You can look at this, but not change it.'));
    await render(inApp(<Page />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Words'), ' more');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('You can look at this, but not change it.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Words').props.value).toBe('Network: Lind-Home more');
  });

  it('can be read but not changed by someone it is shared with to view', async () => {
    asked.mockReturnValue(loaded(page({ mine: false, canEdit: false, chip: everyone })));
    await render(inApp(<Page />));
    expect(screen.getByRole('header', { name: 'Wi‑Fi and smart home' })).toBeOnTheScreen();
    expect(screen.getByText('Network: Lind-Home')).toBeOnTheScreen();
    expect(screen.getByText('You can read this page, but not change it.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Words')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('4.4 says so when it is hidden from someone, and until when', async () => {
    const year = new Date().getFullYear();
    asked.mockReturnValue(loaded(page({ title: "Mia's 10th birthday", chip: notMia })));
    audience.mockReturnValue(loaded({ ...hiddenFromMia, people: hiddenFromMia.people.map((person) => (person.hidden ? { ...person, hiddenThrough: `${year}-12-04` } : person)) }));
    await render(inApp(<Page />));
    expect(audience).toHaveBeenCalledWith(mockId, { query: { enabled: true } });
    expect(screen.getByRole('button', { name: 'Seen by: Not Mia. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByText('Hidden from Mia until 4 December')).toBeOnTheScreen();
    expect(screen.getByText('Not in their search, their Activity or their calendar. It opens to them the morning after.')).toBeOnTheScreen();
  });

  it('says it is hidden for good when no day was picked, and already while the day is on its way', async () => {
    asked.mockReturnValue(loaded(page({ chip: notMia })));
    const view = await render(inApp(<Page />));
    expect(screen.getByText('Hidden from Mia')).toBeOnTheScreen();
    audience.mockReturnValue(loaded({ ...hiddenFromMia, people: hiddenFromMia.people.map((person) => (person.hidden ? { ...person, hiddenThrough: null } : person)) }));
    await view.rerender(inApp(<Page />));
    expect(screen.getByText('Not in their search, their Activity or their calendar, until you change it.')).toBeOnTheScreen();
  });

  it('lists what it is linked to, each opening by its kind', async () => {
    links.mockReturnValue(loaded([thing({ id: '22222222-2222-4222-8222-222222222222', kind: 'checklist', title: 'Party prep', glance: '4 of 9 done' })]));
    await render(inApp(<Page />));
    expect(screen.getByText('Linked')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Party prep. List. 4 of 9 done' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: '22222222-2222-4222-8222-222222222222' } });
  });

  it('is deleted by its owner, after asking', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Page />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete page' }));
    expect(screen.getByRole('header', { name: 'Delete this page?' })).toBeOnTheScreen();
    expect(deleteThing).not.toHaveBeenCalled();
    await user.press(screen.getAllByRole('button', { name: 'Delete page' }).pop()!);
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(deleteThing).toHaveBeenCalledWith(mockId);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('keeps its Back while it loads, and says so when it is not there or not shared', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Page />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<Page />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.getByText("That isn't there any more, or it isn't shared with you.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
