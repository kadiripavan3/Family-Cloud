import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { stopKeepingJourney, useGetJourneyBook, useGetKeptJourneysInfinite } from '@/api/generated/homeport';
import { JourneyBook } from '@/features/journeyLink/book/JourneyBook';
import { useBookOf } from '@/features/journeyLink/book/useBookOf';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { ALBUM, book, BOOK, ICELAND, kept, pages } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { journeyUnkept: jest.fn(() => Promise.resolve()) };
const mockOpenJourney = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircleIfAny: () => mockLinds }));
jest.mock('@/features/journeyLink/open', () => ({ useOpenJourney: () => mockOpenJourney }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { thingId: string; visible: boolean }) => mockAudience(props) }));
jest.mock('@/api/generated/homeport', () => ({ useGetJourneyBook: jest.fn(), useGetKeptJourneysInfinite: jest.fn(), stopKeepingJourney: jest.fn() }));

function mockAudience({ thingId, visible }: { thingId: string; visible: boolean }) {
  const { Text: Words } = jest.requireActual<typeof import('react-native')>('react-native');
  return visible ? <Words>{`Who can see ${thingId}`}</Words> : null;
}

const mockLinds = linds;
const asked = jest.mocked(useGetJourneyBook) as unknown as jest.Mock;
const keptAsked = jest.mocked(useGetKeptJourneysInfinite) as unknown as jest.Mock;

describe('10.4 A journey, kept as a book', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(book()));
  });

  it('opens on its cover: where it comes from, who told it, what it is called, and its numbers', async () => {
    await render(inApp(<JourneyBook pageId={BOOK} />));
    expect(asked).toHaveBeenCalledWith(BOOK);
    expect(screen.getByLabelText('Kept from Journey')).toBeOnTheScreen();
    expect(screen.getByText('A journey by Nora and Alex')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Iceland ring road' })).toBeOnTheScreen();
    expect(screen.getByLabelText('14 days')).toBeOnTheScreen();
    expect(screen.getByLabelText('62 entries')).toBeOnTheScreen();
    expect(screen.getByLabelText('214 photos')).toBeOnTheScreen();
  });

  it('lays out each day: its name, where and when, its words', async () => {
    await render(inApp(<JourneyBook pageId={BOOK} />));
    expect(screen.getByRole('header', { name: 'Day 1' })).toBeOnTheScreen();
    expect(screen.getByText('Reykjavík · Wed 1 Apr')).toBeOnTheScreen();
    expect(screen.getByText('Picked up the van, got lost twice before leaving the car park, and ate hot dogs by the harbour in the rain.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Day 2' })).toBeOnTheScreen();
    expect(screen.getByText('Skógafoss · Thu 2 Apr')).toBeOnTheScreen();
    expect(screen.getByText('A rainbow at the falls and nobody else there until nine.')).toBeOnTheScreen();
  });

  it("shows a day's first three photos and how many more it has, and leads to the album they are in", async () => {
    await render(inApp(<JourneyBook pageId={BOOK} />));
    // Seven that day: three are drawn, and the third says there are four more.
    expect(screen.getByText('+4')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'A photo of Day 1' })).toHaveLength(2);
    await userEvent.setup().press(screen.getByRole('button', { name: '4 more in the album' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: ALBUM } });
  });

  it('says where it is still live, and opens it in Journey', async () => {
    await render(inApp(<JourneyBook pageId={BOOK} />));
    expect(screen.getByText('Still live in Journey')).toBeOnTheScreen();
    expect(screen.getByText('Public · 58 people followed it')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open in Journey' }));
    expect(mockOpenJourney).toHaveBeenCalledWith(`journey://journey/${ICELAND}`);
  });

  it('has no such bar for a journey that can not be opened there', async () => {
    asked.mockReturnValue(loaded(book({ kept: kept({ openUrl: null }) })));
    await render(inApp(<JourneyBook pageId={BOOK} />));
    expect(screen.queryByText('Still live in Journey')).toBeNull();
  });

  it('opens the one sheet that says who can see it', async () => {
    await render(inApp(<JourneyBook pageId={BOOK} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Who can see it' }));
    expect(screen.getByText(`Who can see ${BOOK}`)).toBeOnTheScreen();
  });

  it('opens as the page it is, to write in it; shows its album; and brings home what is new', async () => {
    await render(inApp(<JourneyBook pageId={BOOK} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Open as a page in Notes. To write in it, add to it or move it' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/page/[id]', params: { id: BOOK, as: 'page' } });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'See the album' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: ALBUM } });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Bring home what is new' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/keep/[journeyId]', params: { journeyId: ICELAND } });
  });

  it('stops keeping it after asking: the page stays', async () => {
    jest.mocked(stopKeepingJourney).mockResolvedValue(undefined);
    await render(inApp(<JourneyBook pageId={BOOK} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Stop keeping it' }));
    expect(screen.getByText('Its page, its album and its photos stay here. They stop following the journey in Journey.')).toBeOnTheScreen();
    expect(stopKeepingJourney).not.toHaveBeenCalled();
    await user.press(screen.getAllByRole('button', { name: 'Stop keeping it' }).at(-1)!);
    await waitFor(() => expect(mockCache.journeyUnkept).toHaveBeenCalledWith(expect.objectContaining({ id: kept().id, circleId: 'c-linds' })));
    expect(stopKeepingJourney).toHaveBeenCalledWith(kept().id);
  });

  it("offers neither to someone who didn't keep it", async () => {
    asked.mockReturnValue(loaded(book({ kept: kept({ mine: false }) })));
    await render(inApp(<JourneyBook pageId={BOOK} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Stop keeping it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bring home what is new' })).toBeNull();
    expect(screen.getByRole('button', { name: 'See the album' })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<JourneyBook pageId={BOOK} />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("says so when the book isn't there any more", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<JourneyBook pageId={BOOK} />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});

function Probe({ pageId, circleId, plain }: { pageId: string; circleId?: string; plain?: boolean }) {
  return <Text>{useBookOf(pageId, circleId, plain)}</Text>;
}

describe('a page that is a book, and one that is not', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is a book when a kept journey of its circle names it', async () => {
    keptAsked.mockReturnValue(pages([kept()]));
    await render(inApp(<Probe pageId={BOOK} circleId="c-linds" />));
    expect(screen.getByText('book')).toBeOnTheScreen();
    expect(keptAsked).toHaveBeenCalledWith('c-linds', undefined, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
  });

  it("stays Notes' page when none does", async () => {
    keptAsked.mockReturnValue(pages([kept()]));
    await render(inApp(<Probe pageId="some-other-page" circleId="c-linds" />));
    expect(screen.getByText('page')).toBeOnTheScreen();
  });

  it('is not known yet while the kept journeys are on their way, or before the page has said its circle', async () => {
    keptAsked.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    expect((await render(inApp(<Probe pageId={BOOK} circleId="c-linds" />))).getByText('asking')).toBeOnTheScreen();
    // In the current circle's list it is not: the page may still be in another circle.
    keptAsked.mockReturnValue(pages([]));
    expect((await render(inApp(<Probe pageId="elsewhere" />))).getByText('asking')).toBeOnTheScreen();
  });

  it('is found in the current circle before the page itself has loaded', async () => {
    keptAsked.mockReturnValue(pages([kept()]));
    await render(inApp(<Probe pageId={BOOK} />));
    expect(screen.getByText('book')).toBeOnTheScreen();
  });

  it("is the page it is when the kept journeys can't be asked, and when it was opened \"as a page\"", async () => {
    keptAsked.mockReturnValue({ ...failed(new ApiError(0, 'unreachable', 'Nothing answered.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    expect((await render(inApp(<Probe pageId={BOOK} circleId="c-linds" />))).getByText('page')).toBeOnTheScreen();
    keptAsked.mockReturnValue(pages([kept()]));
    expect((await render(inApp(<Probe pageId={BOOK} circleId="c-linds" plain />))).getByText('page')).toBeOnTheScreen();
    expect(keptAsked).toHaveBeenLastCalledWith('c-linds', undefined, expect.objectContaining({ query: expect.objectContaining({ enabled: false }) }));
  });
});
