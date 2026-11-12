import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addEventGuest, answerEvent, changeEvent, changeEventGuest, createAlbum, createChecklist, createSheet, deleteThing, getAudience, linkThings, removeEventGuest, saveAudience, unlinkThings, useGetEvent } from '@/api/generated/homeport';
import EventPage from '@/app/(app)/event/[id]';
import { shareText } from '@/lib/share';
import { inApp } from '@/test/phone';
import { audience, checklist, everyone, failed, hiddenFromMia, linds, loaded, me, pending, thing } from '@/test/samples';
import { event, guest, ids, onSampleToday } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = {
  eventSaved: jest.fn(() => Promise.resolve()),
  eventGuestsChanged: jest.fn(() => Promise.resolve()),
  eventLinksChanged: jest.fn(() => Promise.resolve()),
  thingMade: jest.fn(() => Promise.resolve()),
  thingDeleted: jest.fn(() => Promise.resolve()),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/upload', () => ({ uploadPhoto: jest.fn() }));
jest.mock('@/lib/share', () => ({ shareText: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/plan/pickCover', () => ({ pickCover: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetEvent: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  answerEvent: jest.fn(),
  changeEvent: jest.fn(),
  deleteThing: jest.fn(),
  createChecklist: jest.fn(),
  createSheet: jest.fn(),
  createAlbum: jest.fn(),
  getAudience: jest.fn(),
  saveAudience: jest.fn(),
  linkThings: jest.fn(),
  unlinkThings: jest.fn(),
  addEventGuest: jest.fn(),
  changeEventGuest: jest.fn(),
  removeEventGuest: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());
const mockId = ids.party;
const asked = jest.mocked(useGetEvent) as unknown as jest.Mock;
const album = thing({ id: 'al-1', kind: 'album', place: 'library', title: 'Party album', glance: null });

describe('7.3 An event', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(event()));
  });

  it('shows when and where it is, who sees it, your answer, who is coming and what it gathers', async () => {
    await render(inApp(<EventPage />));
    expect(asked).toHaveBeenCalledWith(ids.party, { day: '2026-11-11' });
    expect(screen.getByText('Sat 5 Dec · 14:00 to 17:00')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: "Mia's 10th birthday party" })).toBeOnTheScreen();
    expect(screen.getByText('At home')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: Not Mia. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Going', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: "Can't", checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '9 going, 2 not answered yet. See who is coming' })).toBeOnTheScreen();
    expect(screen.getByText('9 going')).toBeOnTheScreen();
    // What it gathers: the list that is linked, a budget and an album to add.
    expect(screen.getByText('For this event')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Party prep. 4 of 9 done' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Add a to-do list/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a budget. What it may cost, and what is spent' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'An album for this event', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('Photos taken there land in it')).toBeOnTheScreen();
  });

  it('says when it comes round again and when it reminds, and that it lasts all day', async () => {
    asked.mockReturnValue(loaded(event({ title: 'Swimming', time: null, endTime: null, allDay: true, place: '', coverUrl: null, repeat: { unit: 'week', every: 1, days: ['thu'], until: null, label: 'Thursdays' }, nextDay: '2026-11-12', remindLabel: '1 hour before', remindMinutes: 60, notes: 'Bring the goggles', chip: everyone })));
    await render(inApp(<EventPage />));
    expect(screen.getByText('Sat 5 Dec · All day')).toBeOnTheScreen();
    expect(screen.getByText('Thursdays · next on Thu 12 Nov')).toBeOnTheScreen();
    expect(screen.getByText('Reminds you 1 hour before')).toBeOnTheScreen();
    expect(screen.getByText('Bring the goggles')).toBeOnTheScreen();
  });

  it('answers for yourself', async () => {
    const saved = event({ myAnswer: 'maybe', going: 8, maybe: 1 });
    jest.mocked(answerEvent).mockResolvedValue(saved);
    await render(inApp(<EventPage />));
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Maybe' }));
    expect(answerEvent).toHaveBeenCalledWith(ids.party, { answer: 'maybe' });
    await waitFor(() => expect(mockCache.eventSaved).toHaveBeenCalledWith(saved));
  });

  it('opens what is linked to it', async () => {
    await render(inApp(<EventPage />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Party prep. 4 of 9 done' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: ids.partyPrep } });
  });

  it('makes a to-do list for it that is as hidden as the event, links it and opens it', async () => {
    asked.mockReturnValue(loaded(event({ links: [] })));
    jest.mocked(createChecklist).mockResolvedValue(checklist({ id: 'l-new' }));
    jest.mocked(getAudience).mockResolvedValue(hiddenFromMia);
    jest.mocked(saveAudience).mockResolvedValue(hiddenFromMia);
    jest.mocked(linkThings).mockResolvedValue(undefined);
    await render(inApp(<EventPage />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add a to-do list. What has to be done before it' }));
    await waitFor(() => expect(linkThings).toHaveBeenCalledWith(ids.party, 'l-new'));
    // It starts as yours alone, and only then gets the event's audience: never wider in between.
    expect(createChecklist).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: "Mia's 10th birthday party: to do", audience: 'me' });
    expect(saveAudience).toHaveBeenCalledWith('l-new', expect.objectContaining({ audience: 'circle', hiddenFrom: [{ memberId: 'm-mia', through: '2026-12-04' }] }));
    expect(mockCache.eventLinksChanged).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: 'l-new' } });
  });

  it('makes a budget from the party template', async () => {
    jest.mocked(createSheet).mockResolvedValue({ id: 's-new' } as never);
    jest.mocked(getAudience).mockResolvedValue(audience({ audience: 'circle' }));
    jest.mocked(saveAudience).mockResolvedValue(audience());
    jest.mocked(linkThings).mockResolvedValue(undefined);
    await render(inApp(<EventPage />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Add a budget/ }));
    await waitFor(() => expect(linkThings).toHaveBeenCalledWith(ids.party, 's-new'));
    expect(createSheet).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: "Mia's 10th birthday party: budget", template: 'party_budget', audience: 'me', day: '2026-11-11' });
  });

  it('makes an album with the switch, and says what the phone app adds to that', async () => {
    jest.mocked(createAlbum).mockResolvedValue({ id: 'al-new' } as never);
    jest.mocked(getAudience).mockResolvedValue(audience({ audience: 'circle' }));
    jest.mocked(saveAudience).mockResolvedValue(audience());
    jest.mocked(linkThings).mockResolvedValue(undefined);
    await render(inApp(<EventPage />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'An album for this event' }));
    await waitFor(() => expect(linkThings).toHaveBeenCalledWith(ids.party, 'al-new'));
    expect(createAlbum).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: "Mia's 10th birthday party: album", audience: 'me' });
    expect(await screen.findByText("The album is made and linked. Filling it by itself with what is photographed there is the phone app's part.")).toBeOnTheScreen();
  });

  it('takes the album off again with the switch, and opens it from its row', async () => {
    asked.mockReturnValue(loaded(event({ links: [album] })));
    jest.mocked(unlinkThings).mockResolvedValue(undefined);
    await render(inApp(<EventPage />));
    const user = userEvent.setup();
    expect(screen.getByText('Party album')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Party album. Photos taken there land in it' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: 'al-1' } });
    await user.press(screen.getByRole('switch', { name: 'An album for this event', checked: true }));
    await waitFor(() => expect(unlinkThings).toHaveBeenCalledWith(ids.party, 'al-1'));
    expect(await screen.findByText('The album is no longer linked to this event. It is still in the Library.')).toBeOnTheScreen();
  });

  it('lists who is coming with their answers, and lets whoever may change it answer for someone', async () => {
    jest.mocked(changeEventGuest).mockResolvedValue(guest());
    await render(inApp(<EventPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /See who is coming$/ }));
    expect(screen.getByRole('header', { name: "Who's coming" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You: Going. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex: Going. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "Luka: Hasn't answered. Change" }));
    await user.press(screen.getAllByRole('radio', { name: "Can't" }).at(-1)!);
    expect(changeEventGuest).toHaveBeenCalledWith('g-luka', { answer: 'cant' });
    await waitFor(() => expect(mockCache.eventGuestsChanged).toHaveBeenCalled());
  });

  it('takes someone off, and puts someone on: one of the circle, or a name', async () => {
    jest.mocked(removeEventGuest).mockResolvedValue(undefined);
    jest.mocked(addEventGuest).mockResolvedValue(guest());
    await render(inApp(<EventPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /See who is coming$/ }));
    await user.press(screen.getByRole('button', { name: 'Alex: Going. Change' }));
    await user.press(screen.getByRole('button', { name: 'Take off the event' }));
    expect(removeEventGuest).toHaveBeenCalledWith('g-alex');
    await user.press(screen.getByRole('button', { name: 'Add someone' }));
    // Nora and Alex are on it already: the others of the circle are offered.
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Leo' }));
    expect(addEventGuest).toHaveBeenLastCalledWith(ids.party, { clientId: 'client-1', memberId: 'm-leo' });
    await user.type(screen.getByLabelText('Their name'), 'Grandma Astrid');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(addEventGuest).toHaveBeenLastCalledWith(ids.party, { clientId: 'client-1', name: 'Grandma Astrid' });
  });

  it('changes it: the same boxes, filled with what it is now', async () => {
    const saved = event({ title: "Mia's birthday party", place: "At Grandma's" });
    jest.mocked(changeEvent).mockResolvedValue(saved);
    await render(inApp(<EventPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('header', { name: 'Change the event' })).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Mia's 10th birthday party")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'When. Sat 5 Dec · 14:00 to 17:00' })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Where'));
    await user.type(screen.getByLabelText('Where'), "At Grandma's");
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.eventSaved).toHaveBeenCalledWith(saved));
    expect(changeEvent).toHaveBeenCalledWith(ids.party, { title: "Mia's 10th birthday party", day: '2026-12-05', time: '14:00', endDay: '2026-12-05', endTime: '17:00', timeZone: 'Europe/Ljubljana', place: "At Grandma's", notes: '' });
  });

  it('deletes it after asking, and leaves', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<EventPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete event' }));
    expect(screen.getByRole('header', { name: 'Delete this event?' })).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Delete event' }).at(-1)!);
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(deleteThing).toHaveBeenCalledWith(ids.party);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('hands its line to a message, and says so when it was copied instead', async () => {
    jest.mocked(shareText).mockResolvedValue('copied');
    await render(inApp(<EventPage />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Share' }));
    expect(shareText).toHaveBeenCalledWith("Mia's 10th birthday party · Sat 5 Dec · 14:00 to 17:00 · At home");
    expect(await screen.findByText('Copied, ready to paste into a message')).toBeOnTheScreen();
  });

  it('only shows what it is to someone who may not change it', async () => {
    asked.mockReturnValue(loaded(event({ mine: false, canEdit: false, links: [album] })));
    await render(inApp(<EventPage />));
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: /^Add a budget/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'An album for this event' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Party album. Photos taken there land in it' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete event' })).toBeNull();
    await user.press(screen.getByRole('button', { name: "Who's coming" }));
    expect(screen.getByLabelText('Alex: Going')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add someone' })).toBeNull();
  });

  it('keeps its Back while it loads, and says so when it is not there or not shared with this person', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<EventPage />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<EventPage />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeOnTheScreen();
  });
});
