import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createChecklist, useGetFolder } from '@/api/generated/homeport';
import NewChecklist from '@/app/(app)/new/checklist';
import { bySection, linesOf } from '@/features/things/lines';
import { inApp } from '@/test/phone';
import { checklist, item, linds, loaded } from '@/test/samples';
import { folder } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockMade = jest.fn(() => Promise.resolve());
let mockParams: { audience?: string; folder?: string } = { audience: 'circle' };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, usePreventRemove: () => jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ noteMade: mockMade }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ createChecklist: jest.fn(), useGetFolder: jest.fn(() => ({ data: undefined })) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockLinds = linds;

describe('/new/checklist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { audience: 'circle' };
    (jest.mocked(useGetFolder) as unknown as jest.Mock).mockReturnValue({ data: undefined });
  });

  it('makes a list with its first lines, one per row, and opens it', async () => {
    jest.mocked(createChecklist).mockResolvedValue(checklist({ id: 'l-new' }));
    await render(inApp(<NewChecklist />));
    expect(screen.getByRole('header', { name: 'New checklist' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name of the list'), 'Groceries');
    await user.type(screen.getByLabelText('Lines to start with'), 'Milk\n\n  Bread  \nApples');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: 'l-new' } }));
    expect(createChecklist).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Groceries', items: ['Milk', 'Bread', 'Apples'], audience: 'circle', aisles: false });
    expect(mockMade).toHaveBeenCalledWith('c-linds');
  });

  it('makes a shopping list that sorts by aisle, filed in the folder it was started from', async () => {
    mockParams = { folder: 'f-home' };
    (jest.mocked(useGetFolder) as unknown as jest.Mock).mockReturnValue(loaded(folder()));
    jest.mocked(createChecklist).mockResolvedValue(checklist({ id: 'l-new' }));
    await render(inApp(<NewChecklist />));
    expect(screen.getByText('Goes into Home')).toBeOnTheScreen();
    expect(screen.getByText('New lines find their aisle, and the aisles keep the order of a shop')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name of the list'), 'Groceries');
    await user.press(screen.getByRole('switch', { name: 'A shopping list' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createChecklist).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Groceries', items: [], audience: 'me', aisles: true, folderId: 'f-home' }));
  });

  it('needs a name, and no lines', async () => {
    jest.mocked(createChecklist).mockResolvedValue(checklist());
    await render(inApp(<NewChecklist />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Lines to start with'), 'Milk');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Lines to start with'));
    await user.type(screen.getByLabelText('Name of the list'), 'Someday');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createChecklist).toHaveBeenCalledWith(expect.objectContaining({ title: 'Someday', items: [] })));
  });
});

describe("a list's lines", () => {
  it('are read from what was typed, one per row, a hundred at most', () => {
    expect(linesOf(' Milk \n\nBread\n')).toEqual(['Milk', 'Bread']);
    expect(linesOf('')).toEqual([]);
    expect(linesOf(Array.from({ length: 130 }, (_, index) => `Line ${index}`).join('\n'))).toHaveLength(100);
  });

  it('stand under their headings in their own order, the ones without a heading first', () => {
    const lines = [item({ id: '1', section: 'Fridge' }), item({ id: '2', section: '' }), item({ id: '3', section: 'Fruit and veg' }), item({ id: '4', section: 'Fridge' })];
    expect(bySection(lines).map((group) => [group.section, group.items.map((one) => one.id)])).toEqual([
      ['', ['2']],
      ['Fridge', ['1', '4']],
      ['Fruit and veg', ['3']],
    ]);
    expect(bySection([])).toEqual([]);
  });
});
