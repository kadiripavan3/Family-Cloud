import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetFilesInfinite, useGetFilesSummary } from '@/api/generated/homeport';
import Files from '@/app/(app)/library/files';
import { docLine } from '@/features/library/DocRow';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { boilerManual, carRegistration, doc, filesSummary, insurance, pages, passport, receipt, schoolReport, taxFolder } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({ useGetFilesInfinite: jest.fn(), useGetFilesSummary: jest.fn(), useGetMe: jest.fn(() => mockMe) }));

const mockLinds = linds;
const mockMe = loaded(me());
const files = jest.mocked(useGetFilesInfinite) as unknown as jest.Mock;
const summary = jest.mocked(useGetFilesSummary) as unknown as jest.Mock;
const drawn = [insurance, passport, schoolReport, carRegistration, receipt, boilerManual];

describe('6.7 Files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    files.mockReturnValue(pages([{ items: drawn, nextCursor: null }]));
    summary.mockReturnValue(loaded(filesSummary));
  });

  it('shows how many there are, the kinds there are, and each file with what matters about it', async () => {
    await render(inApp(<Files />));
    expect(screen.getByRole('header', { name: 'Files' })).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Search inside scans and PDFs')).toBeOnTheScreen();
    for (const chip of ['All 86', 'IDs', 'Insurance', 'School', 'Receipts']) expect(screen.getByRole('button', { name: chip })).toBeOnTheScreen();
    expect(screen.getByText('Renews 1 Feb 2027 · reminder set')).toBeOnTheScreen();
    expect(screen.getByText('Expires 2 Aug 2027')).toBeOnTheScreen();
    expect(screen.getByText("4 pages · on Mia's page")).toBeOnTheScreen();
    expect(screen.getByText('Runs out in 19 days')).toBeOnTheScreen();
    expect(screen.getByText('€349 · warranty to Nov 2028')).toBeOnTheScreen();
    expect(screen.getByText('Linked from the House manual')).toBeOnTheScreen();
    // What is kept in the Vault shows a lock instead of who sees it.
    expect(screen.getByLabelText('Kept in the Vault')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Seen by: Alex and you').length).toBeGreaterThan(0);
  });

  it('shows the folders under the files, with how many each holds', async () => {
    await render(inApp(<Files />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Tax 2025. Folder. 14 files' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: taxFolder.id } });
  });

  it('opens a document, and the way to scan a new one', async () => {
    await render(inApp(<Files />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Mia's passport. ID. Expires 2 Aug 2027" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'document', id: passport.id } });
    await user.press(screen.getByRole('button', { name: 'Scan a document' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/scan');
  });

  it('narrows to one kind, and hides the folders while it does', async () => {
    await render(inApp(<Files />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'IDs' }));
    expect(files).toHaveBeenLastCalledWith('c-linds', { category: 'id', q: undefined, day: expect.any(String) }, expect.anything());
    expect(screen.queryByRole('button', { name: /^Tax 2025/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'All 86' }));
    expect(files).toHaveBeenLastCalledWith('c-linds', { category: undefined, q: undefined, day: expect.any(String) }, expect.anything());
  });

  it('searches names and the words inside, a moment after the typing stops', async () => {
    await render(inApp(<Files />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search inside scans and PDFs'), 'UTO');
    await waitFor(() => expect(files).toHaveBeenLastCalledWith('c-linds', { category: undefined, q: 'UTO', day: expect.any(String) }, expect.anything()));
    await user.press(screen.getByRole('button', { name: 'Clear the search' }));
    await waitFor(() => expect(files).toHaveBeenLastCalledWith('c-linds', { category: undefined, q: undefined, day: expect.any(String) }, expect.anything()));
  });

  it('says so when a search finds nothing', async () => {
    files.mockReturnValue(pages([{ items: [], nextCursor: null }]));
    await render(inApp(<Files />));
    await userEvent.setup().type(screen.getByLabelText('Search inside scans and PDFs'), 'zebra');
    await waitFor(() => expect(screen.getByRole('header', { name: 'Nothing found for “zebra”' })).toBeOnTheScreen());
    expect(screen.getByText('Names are searched, and the words inside scans and PDFs.')).toBeOnTheScreen();
  });

  it('invites the first document when there are none', async () => {
    files.mockReturnValue(pages([{ items: [], nextCursor: null }]));
    summary.mockReturnValue(loaded({ total: 0, categories: [], folders: [] }));
    await render(inApp(<Files />));
    expect(screen.getByRole('header', { name: 'No files yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add a document' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/scan');
  });

  it('keeps its bar and its search box while it loads', async () => {
    files.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    summary.mockReturnValue(pending());
    await render(inApp(<Files />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Search inside scans and PDFs')).toBeOnTheScreen();
  });

  it('says what went wrong and asks again', async () => {
    const broken = { ...failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };
    files.mockReturnValue(broken);
    await render(inApp(<Files />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });
});

describe("what a document's row says under its name", () => {
  it('puts the day that matters first, in the warning colour when it is time to act', () => {
    expect(docLine(passport)).toEqual({ text: 'Expires 2 Aug 2027', icon: 'alert', warn: true });
    expect(docLine(carRegistration)).toEqual({ text: 'Runs out in 19 days', icon: 'alert', warn: true });
    expect(docLine(doc({ keyDate: { label: 'valid_until', date: '2031-03-14', daysLeft: 1583, soon: false } }))).toEqual({ text: 'Valid until 14 Mar 2031', icon: null, warn: false });
    expect(docLine(doc({ keyDate: { label: 'due', date: '2026-11-13', daysLeft: 1, soon: true } })).text).toBe('Due tomorrow');
    expect(docLine(doc({ keyDate: { label: 'expires', date: '2025-01-05', daysLeft: -300, soon: false } }))).toEqual({ text: 'Ran out on 5 Jan 2025', icon: 'alert', warn: true });
  });

  it('shows a bell once a reminder is set', () => {
    expect(docLine(insurance)).toEqual({ text: 'Renews 1 Feb 2027 · reminder set', icon: 'bell', warn: false });
    expect(docLine({ ...insurance, reminderSet: false })).toEqual({ text: 'Renews 1 Feb 2027', icon: null, warn: false });
  });

  it("writes a receipt's total before its warranty", () => {
    expect(docLine(receipt).text).toBe('€349 · warranty to Nov 2028');
    expect(docLine(doc({ amountCents: 1250, currency: 'EUR', pages: 1 })).text).toBe('€12.50 · 1 page');
  });

  it('falls back on what it is linked from, its pages and whose page it is on, then on when it was added', () => {
    expect(docLine(boilerManual).text).toBe('Linked from the House manual');
    expect(docLine(schoolReport).text).toBe("4 pages · on Mia's page");
    expect(docLine(doc({ pages: null })).text).toMatch(/^Added /);
  });
});
