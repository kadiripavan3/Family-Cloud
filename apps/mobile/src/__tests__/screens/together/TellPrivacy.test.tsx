import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeJourneyDraftCheck, postJourneyDraft, useCheckJourneyDraft, useGetJourneyDraft, useGetJourneyJob } from '@/api/generated/homeport';
import BeforeItLeaves from '@/app/(app)/journey/tell/[id]/check';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { check, draft, DRAFT, id, job } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true), dismiss: jest.fn(), dismissAll: jest.fn(), navigate: jest.fn() };
let mockParams = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000005' };
const mockCache = { journeyDraftChecked: jest.fn(), journeyDraftSent: jest.fn(() => Promise.resolve()) };
const mockOpenJourney = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/journeyLink/open', () => ({ useOpenJourney: () => mockOpenJourney }));
jest.mock('@/api/generated/homeport', () => ({ useCheckJourneyDraft: jest.fn(), useGetJourneyDraft: jest.fn(), useGetJourneyJob: jest.fn(), changeJourneyDraftCheck: jest.fn(), postJourneyDraft: jest.fn() }));

const asked = jest.mocked(useCheckJourneyDraft) as unknown as jest.Mock;
const draftAsked = jest.mocked(useGetJourneyDraft) as unknown as jest.Mock;
const jobAsked = jest.mocked(useGetJourneyJob) as unknown as jest.Mock;
const change = jest.mocked(changeJourneyDraftCheck);
const send = jest.mocked(postJourneyDraft);
const on = (name: string | RegExp) => screen.getByRole('switch', { name }).props['aria-checked'];

describe('10.6 Before it leaves home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: DRAFT };
    asked.mockReturnValue(loaded(check()));
    draftAsked.mockReturnValue(loaded(draft()));
    jobAsked.mockReturnValue(pending());
    change.mockResolvedValue(check());
  });

  it('says what stands between these photos and a journey other people read', async () => {
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByRole('header', { name: 'Before it leaves home' })).toBeOnTheScreen();
    expect(screen.getByText('These were private. Here is what a journey would show.')).toBeOnTheScreen();
  });

  it('has three switches, all on to begin with, each saying what it leaves out', async () => {
    await render(inApp(<BeforeItLeaves />));
    expect(on('Leave out Mia and Leo')).toBe(true);
    expect(screen.getByText('14 of 51 are tagged with a child')).toBeOnTheScreen();
    expect(on('Show the town, not the spot')).toBe(true);
    expect(screen.getByText('“Lake Bled”, not the exact spot you stood on')).toBeOnTheScreen();
    expect(on('Skip photos taken at home')).toBe(true);
    expect(screen.getByText('2 photos')).toBeOnTheScreen();
  });

  it('says what can never go, as a switch that can not be turned', async () => {
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('Files, bills and the Vault')).toBeOnTheScreen();
    expect(screen.getByText('Never go to Journey')).toBeOnTheScreen();
    expect(on('Files, bills and the Vault')).toBe(false);
  });

  it('says what the app can not know: only who is tagged', async () => {
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('The app goes by who is tagged. A photo of a child that nobody tagged is not left out, so look through what goes.')).toBeOnTheScreen();
  });

  it('turns a switch, and shows what the API then lets through', async () => {
    change.mockResolvedValue(check({ children: { on: false, count: 14, of: 51, names: ['Mia', 'Leo'] }, photosGoing: 49 }));
    await render(inApp(<BeforeItLeaves />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Leave out Mia and Leo' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { leaveOutChildren: false }));
    await waitFor(() => expect(mockCache.journeyDraftChecked).toHaveBeenCalledWith(expect.objectContaining({ draftId: DRAFT, photosGoing: 49 })));
  });

  it('turns the other two the same way', async () => {
    await render(inApp(<BeforeItLeaves />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Show the town, not the spot' }));
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(DRAFT, { townOnly: false }));
    await user.press(screen.getByRole('switch', { name: 'Skip photos taken at home' }));
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(DRAFT, { skipHome: false }));
  });

  it('says so when nobody has said where home is', async () => {
    asked.mockReturnValue(loaded(check({ home: { on: true, count: 0, homeKnown: false } })));
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('Nobody has said where home is yet, so none can be told apart')).toBeOnTheScreen();
  });

  it('starts as Private, and says what each choice means', async () => {
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('In Journey it starts as')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Private' }).props['aria-checked']).toBe(true);
    expect(screen.getByText('Only you can read it there, until you change that in Journey.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Public' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { visibility: 'public' }));
  });

  it('counts what would go, on the row and on the button, and says nothing has left yet', async () => {
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByRole('button', { name: '35 photos would go. 2 stay home · look through them one by one' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create the journey · 35 photos' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing has left Homeport yet.')).toBeOnTheScreen();
  });

  it('counts clips with the photos on the button, and says how a clip travels', async () => {
    asked.mockReturnValue(loaded(check({ photosGoing: 36, clipsGoing: 3, tooLong: 1 })));
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByRole('button', { name: 'Create the journey · 39 in all' })).toBeOnTheScreen();
    expect(screen.getByText(/^1 clip is longer than 60 seconds and stays home: Journey takes shorter ones\. A clip goes as it is/)).toBeOnTheScreen();
  });

  it('points at what is worth a second look', async () => {
    asked.mockReturnValue(loaded(check({ flags: [{ flag: 'someone_elses', count: 19 }, { flag: 'only_you', count: 1 }] })));
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('Worth a second look')).toBeOnTheScreen();
    expect(screen.getByText('19 were added by someone else. 1 is only yours to see here')).toBeOnTheScreen();
  });

  it('shows every photo one by one, with why one stays home', async () => {
    await render(inApp(<BeforeItLeaves />));
    await userEvent.setup().press(screen.getByRole('button', { name: /would go\./ }));
    expect(screen.getByRole('header', { name: 'What goes, one by one' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Stays home: A child' })).toBeOnTheScreen();
    expect(screen.getByText('You left it out')).toBeOnTheScreen();
    expect(screen.getByText('Sent after all')).toBeOnTheScreen();
  });

  it('sends one after all that a switch left out, and leaves it to the switches again', async () => {
    await render(inApp(<BeforeItLeaves />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /would go\./ }));
    await user.press(screen.getByRole('switch', { name: 'Stays home: A child' }));
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(DRAFT, { backOn: [id(202)] }));
    await user.press(screen.getByRole('switch', { name: 'Goes' }));
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(DRAFT, { backOff: [id(204)] }));
    // One that was dropped from the draft can't be switched here.
    expect(screen.getAllByRole('switch').filter((one) => one.props.accessibilityLabel === 'Stays home: You left it out')).toHaveLength(0);
  });

  it('sends it, and shows how far it is', async () => {
    send.mockResolvedValue(job({ kind: 'post', status: 'running', step: 'Sending photos', done: 10, total: 35, subjectId: DRAFT }));
    jobAsked.mockReturnValue(loaded(job({ kind: 'post', status: 'running', step: 'Sending photos', done: 20, total: 35, subjectId: DRAFT })));
    await render(inApp(<BeforeItLeaves />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Create the journey · 35 photos' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(DRAFT, { clientId: 'client-1' }));
    expect(await screen.findByText('Sending it to Journey')).toBeOnTheScreen();
    expect(screen.getByText('Sending photos')).toBeOnTheScreen();
    expect(screen.getByText('20 of 35')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: "It's in Journey" })).toBeNull();
  });

  it('says when it has arrived, what it starts as, and leads to it and out', async () => {
    send.mockResolvedValue(job({ kind: 'post', status: 'done', step: 'Told', done: 35, total: 35, subjectId: DRAFT }));
    draftAsked.mockReturnValue(loaded(draft({ openUrl: `journey://journey/${id(70)}` })));
    await render(inApp(<BeforeItLeaves />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Create the journey · 35 photos' }));
    expect(await screen.findByRole('header', { name: "It's in Journey" })).toBeOnTheScreen();
    expect(screen.getByText('It starts as Private. Carry on writing it there.')).toBeOnTheScreen();
    await waitFor(() => expect(mockCache.journeyDraftSent).toHaveBeenCalledWith(DRAFT));
    expect(mockCache.journeyDraftSent).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Open in Journey' }));
    expect(mockOpenJourney).toHaveBeenCalledWith(`journey://journey/${id(70)}`);
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockRouter.dismiss).toHaveBeenCalledWith(2);
  });

  it('says why sending failed, and offers the screen again', async () => {
    send.mockResolvedValue(job({ kind: 'post', status: 'failed', problem: "Journey didn't take it. Nothing was sent.", subjectId: DRAFT }));
    await render(inApp(<BeforeItLeaves />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Create the journey · 35 photos' }));
    expect(await screen.findByText("Journey didn't take it. Nothing was sent.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Create the journey · 35 photos' })).toBeOnTheScreen();
  });

  it("can't create a journey of nothing", async () => {
    asked.mockReturnValue(loaded(check({ photosGoing: 0, clipsGoing: 0 })));
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('Nothing would go. Switch a photo back on to create the journey.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create the journey · 0 photos' })).toBeDisabled();
  });

  it('shows a draft that is on its way already as that, when the screen is opened again', async () => {
    const running = job({ kind: 'post', status: 'running', step: 'Sending photos', done: 5, total: 35, subjectId: DRAFT });
    draftAsked.mockReturnValue(loaded(draft({ status: 'posting', job: running })));
    jobAsked.mockReturnValue(loaded(running));
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByText('Sending it to Journey')).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Leave out Mia and Leo' })).toBeNull();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it("is not there for anyone but the draft's writer", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    draftAsked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<BeforeItLeaves />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});
