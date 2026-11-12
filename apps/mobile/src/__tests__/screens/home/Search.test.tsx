import { act, render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useSearchCircle } from '@/api/generated/homeport';
import Search from '@/app/(app)/search';
import { onPhone } from '@/test/phone';
import { everyone, failed, linds, loaded, me, pending, thing, withAlex } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { place?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useSearchCircle: jest.fn(), useGetMe: jest.fn(() => mockMe) }));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useSearchCircle) as unknown as jest.Mock;
const WIFI = '11111111-1111-4111-8111-111111111111';
const SCAN = '22222222-1111-4111-8111-111111111111';
const hits = {
  words: 'passport',
  hits: [
    { thing: thing({ id: SCAN, kind: 'file' as never, place: 'library', title: 'Passport scan, Alex', glance: '2 pages', chip: withAlex }), snippet: null },
    { thing: thing({ id: WIFI, title: 'What to bring to Norway', chip: everyone }), snippet: '…all four passports and…' },
  ],
};

/** Types into the box and waits for the search to be sent. */
async function type(words: string) {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.type(screen.getByLabelText('Search The Linds'), words);
  await act(async () => jest.advanceTimersByTime(300));
  return user;
}

describe('3.3 Find anything', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    asked.mockReturnValue(pending());
  });
  afterEach(() => jest.useRealTimers());

  it('starts with a box to type in and the places to narrow to, and searches nothing yet', async () => {
    await render(onPhone(<Search />));
    expect(screen.getByLabelText('Search The Linds')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Everything' })).toBeSelected();
    for (const place of ['Notes', 'Library', 'Plan', 'Money', 'Vault']) expect(screen.getByRole('button', { name: place })).toBeOnTheScreen();
    expect(screen.getByText('One search across every place')).toBeOnTheScreen();
    expect(asked).toHaveBeenLastCalledWith('c-linds', { q: '' }, expect.objectContaining({ query: expect.objectContaining({ enabled: false }) }));
  });

  it('searches the circle a moment after typing stops, and groups what it finds by place', async () => {
    asked.mockReturnValue(loaded(hits));
    await render(onPhone(<Search />));
    await type('passport');
    expect(asked).toHaveBeenLastCalledWith('c-linds', { q: 'passport' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
    // (The chip and the heading of the group.)
    expect(screen.getAllByText('Library')).toHaveLength(2);
    expect(screen.getAllByText('Notes')).toHaveLength(2);
    expect(screen.getAllByText('Plan')).toHaveLength(1);
    expect(screen.getByText('Passport scan, Alex')).toBeOnTheScreen();
    // The words found inside a thing stand under its title; otherwise where it stands.
    expect(screen.getByText('“…all four passports and…”')).toBeOnTheScreen();
    expect(screen.getByText('2 pages')).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: Alex and you')).toBeOnTheScreen();
  });

  it('opens what it found, whatever kind it is', async () => {
    asked.mockReturnValue(loaded(hits));
    await render(onPhone(<Search />));
    const user = await type('passport');
    await user.press(screen.getByRole('button', { name: 'What to bring to Norway. Page. “…all four passports and…”' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: WIFI } });
    await user.press(screen.getByRole('button', { name: 'Passport scan, Alex. File. 2 pages' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'file', id: SCAN } });
  });

  it('narrows to one place with a chip, or from the address', async () => {
    asked.mockReturnValue(loaded(hits));
    await render(onPhone(<Search />));
    const user = await type('passport');
    await user.press(screen.getByRole('button', { name: 'Library' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { q: 'passport', place: 'library' }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'Everything' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { q: 'passport' }, expect.anything());
  });

  it("opens already narrowed when Home's pill was pressed on a place", async () => {
    mockParams = { place: 'vault' };
    await render(onPhone(<Search />));
    expect(screen.getByRole('button', { name: 'Vault' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Everything' })).not.toBeSelected();
  });

  it('says so when nothing was found', async () => {
    asked.mockReturnValue(loaded({ words: 'unicorn', hits: [] }));
    await render(onPhone(<Search />));
    await type('unicorn');
    expect(screen.getByText('Nothing found for “unicorn”')).toBeOnTheScreen();
    expect(screen.getByText("Try fewer words. Things that aren't shared with you don't show up.")).toBeOnTheScreen();
  });

  it("says what went wrong when the search can't be made", async () => {
    asked.mockReturnValue(failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.')));
    await render(onPhone(<Search />));
    await type('passport');
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
  });

  it('clears what was typed, and Cancel leaves', async () => {
    await render(onPhone(<Search />));
    const user = await type('passport');
    await user.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Search The Linds').props.value).toBe('');
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
