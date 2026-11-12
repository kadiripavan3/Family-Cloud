import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createPage, useGetFolder } from '@/api/generated/homeport';
import NewNote from '@/app/(app)/new/note';
import { useCircle } from '@/features/circles/current';
import { inApp } from '@/test/phone';
import { crewCircle, linds, loaded, page } from '@/test/samples';
import { folder } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { audience?: string; folder?: string } = {};
let mockGuardOn = false;
const mockRelease = jest.fn();
const mockMade = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (on: boolean) => {
    mockGuardOn = on;
    return mockRelease;
  },
}));
jest.mock('@/api/cache', () => ({ useCache: () => ({ noteMade: mockMade }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ createPage: jest.fn(), useGetFolder: jest.fn(() => ({ data: undefined })) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const make = jest.mocked(createPage);

describe('/new/note', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    jest.mocked(useCircle).mockReturnValue(linds);
    (jest.mocked(useGetFolder) as unknown as jest.Mock).mockReturnValue({ data: undefined });
  });

  it('makes a page in the current circle, seen by what a family starts things as, and opens it', async () => {
    make.mockResolvedValue(page({ id: 'p-new' }));
    await render(inApp(<NewNote />));
    expect(screen.getByRole('header', { name: 'New note' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Gift list');
    await user.type(screen.getByLabelText('Words'), 'The headphones.');
    expect(mockGuardOn).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: 'p-new' } }));
    expect(make).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Gift list', body: 'The headphones.', audience: 'me' });
    expect(mockMade).toHaveBeenCalledWith('c-linds');
    // What was typed is saved: leaving for the page asks nothing.
    expect(mockRelease).toHaveBeenCalled();
  });

  it('files it in the folder it was started from, and says which', async () => {
    mockParams = { folder: 'f-home' };
    (jest.mocked(useGetFolder) as unknown as jest.Mock).mockReturnValue(loaded(folder()));
    make.mockResolvedValue(page({ id: 'p-new' }));
    await render(inApp(<NewNote />));
    expect(useGetFolder).toHaveBeenCalledWith('f-home', { query: { enabled: true } });
    expect(screen.getByText('Goes into Home')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Bins and recycling days');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(make).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Bins and recycling days', body: '', audience: 'me', folderId: 'f-home' }));
  });

  it('starts as seen by whoever the + sheet said, and that can still be changed here', async () => {
    mockParams = { audience: 'circle' };
    make.mockResolvedValue(page());
    await render(inApp(<NewNote />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Seen by The Linds. Change' }));
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.type(screen.getByLabelText('Title'), 'House rules');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(make).toHaveBeenCalledWith(expect.objectContaining({ audience: 'circle' })));
  });

  it('starts as shared among equals', async () => {
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    await render(inApp(<NewNote />));
    expect(screen.getByRole('button', { name: 'Seen by Lisbon crew. Change' })).toBeOnTheScreen();
  });

  it("says what the API says when it can't be saved, and keeps what was typed", async () => {
    make.mockRejectedValue(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    await render(inApp(<NewNote />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Gift list');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Title').props.value).toBe('Gift list');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('closes without asking while nothing is typed', async () => {
    await render(inApp(<NewNote />));
    expect(mockGuardOn).toBe(false);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
