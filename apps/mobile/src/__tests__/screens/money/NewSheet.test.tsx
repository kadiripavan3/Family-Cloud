import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createSheet, useGetSheetTemplates } from '@/api/generated/homeport';
import NewSheet from '@/app/(app)/new/sheet';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { onThe12th, sheet, templates } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { sheetMade: jest.fn(() => Promise.resolve()) };
let mockParams: { audience?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetSheetTemplates: jest.fn(), createSheet: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockLinds = linds;

describe('/new/sheet: a table that does the maths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    mockParams = {};
    jest.mocked(useGetSheetTemplates).mockReturnValue(loaded(templates) as never);
  });
  afterEach(() => jest.useRealTimers());

  it('starts a blank one by name, seen only by its maker in a family, and opens it', async () => {
    const made = sheet({ id: 'new-sheet', title: 'Holiday budget', template: null, tag: '' });
    jest.mocked(createSheet).mockResolvedValue(made);
    await render(inApp(<NewSheet />));
    const user = userEvent.setup();
    expect(screen.getByRole('header', { name: 'New sheet' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start blank' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Name of the sheet'), ' Holiday budget ');
    await user.press(screen.getByRole('button', { name: 'Start blank' }));
    await waitFor(() => expect(createSheet).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Holiday budget', audience: 'me', day: '2026-11-12' }));
    await waitFor(() => expect(mockCache.sheetMade).toHaveBeenCalledWith(made));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: 'new-sheet' } });
  });

  it('or starts from a template, with who sees it as chosen here', async () => {
    jest.mocked(createSheet).mockResolvedValue(sheet({ id: 'from-template' }));
    await render(inApp(<NewSheet />));
    const user = userEvent.setup();
    expect(screen.getByText('Or start from a template')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: /^Tax checklist\./ }));
    await waitFor(() => expect(createSheet).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', template: 'tax_checklist', audience: 'circle', day: '2026-11-12' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: 'from-template' } }));
  });

  it('shows what the API says about the name', async () => {
    jest.mocked(createSheet).mockRejectedValue(new ApiError(400, 'no_name', 'Give the sheet a name.', { title: 'Give the sheet a name.' }));
    await render(inApp(<NewSheet />));
    await fireEvent.changeText(screen.getByLabelText('Name of the sheet'), 'x');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Start blank' }));
    expect(await screen.findByText('Give the sheet a name.')).toBeOnTheScreen();
  });
});
