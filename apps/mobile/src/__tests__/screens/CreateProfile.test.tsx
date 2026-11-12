import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { saveProfile } from '@/api/generated/homeport';
import { uploadPhoto } from '@/api/upload';
import CreateProfile from '@/app/(onboarding)/index';
import { pickSquarePhoto } from '@/features/media/pick';
import { onPhone } from '@/test/phone';
import { nora } from '@/test/samples';

const mockPush = jest.fn();
const mockBegin = jest.fn();
const mockSignOut = jest.fn();
const mockProfileSaved = jest.fn((_profile: unknown) => Promise.resolve());
const mockSuggestedName = jest.fn<Promise<string | null>, []>();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ profileSaved: mockProfileSaved }) }));
jest.mock('@/api/upload', () => ({ uploadPhoto: jest.fn() }));
jest.mock('@/features/media/pick', () => ({ pickSquarePhoto: jest.fn() }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', signOut: mockSignOut }) }));
jest.mock('@/auth/onboarding', () => ({ useOnboarding: () => ({ begin: mockBegin }) }));
jest.mock('@/auth/signIn', () => ({ signInService: { suggestedName: () => mockSuggestedName() } }));
jest.mock('@/api/generated/homeport', () => ({
  saveProfile: jest.fn(),
  useGetMe: () => ({ data: { id: 'a-nora', email: 'nora@example.com', profile: null } }),
}));

const saved = jest.mocked(saveProfile);
const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
const page = () => onPhone(<QueryClientProvider client={client}><CreateProfile /></QueryClientProvider>);

describe('Create your profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuggestedName.mockResolvedValue(null);
    saved.mockResolvedValue(nora);
  });

  it('asks for a name, a photo and the age, and for nothing else', async () => {
    await render(page());
    expect(screen.getByRole('header', { name: 'Create your profile' })).toBeOnTheScreen();
    expect(screen.getByText('This is how the people in your circles see you.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: "I'm 13 or older" })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Username')).toBeNull();
    // Nothing goes on until there is a name and the box is ticked.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('offers the name the sign-in already knows instead of asking for it again', async () => {
    mockSuggestedName.mockResolvedValue('Nora Lind'); // what Apple handed over, once
    await render(page());
    await waitFor(() => expect(screen.getByLabelText('Name').props.value).toBe('Nora Lind'));
  });

  it('takes a photo with the profile: it goes up first, the profile is saved with it and the age, and setting up a circle comes next', async () => {
    jest.mocked(pickSquarePhoto).mockResolvedValue({ uri: 'file:///picked.jpg', width: 800, height: 800 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-7');
    await render(page());
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change your photo' })).toBeOnTheScreen());
    await user.type(screen.getByLabelText('Name'), ' Nora Lind ');
    await user.press(screen.getByRole('checkbox', { name: "I'm 13 or older" }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/setup'));
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///picked.jpg', width: 800, height: 800 });
    expect(saved).toHaveBeenCalledWith({ displayName: 'Nora Lind', avatarMediaId: 'media-7', ageConfirmed: true });
    // The person stays in the sign-up steps although their profile now exists.
    expect(mockBegin).toHaveBeenCalled();
    // The new profile is told to the data layer by name; the screen invalidates nothing itself.
    expect(mockProfileSaved).toHaveBeenCalledWith(nora);
  });

  it('says so above the button when the photos cannot be opened, and goes on without a photo', async () => {
    jest.mocked(pickSquarePhoto).mockRejectedValue(new Error('no access'));
    await render(page());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(await screen.findByText(/couldn't open your photos/)).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Name'), 'Nora');
    await user.press(screen.getByRole('checkbox', { name: "I'm 13 or older" }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ avatarMediaId: undefined })));
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("shows what the API says: about the name under the name, anything else above the button, and doesn't move on", async () => {
    await render(page());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Nora');
    await user.press(screen.getByRole('checkbox', { name: "I'm 13 or older" }));

    saved.mockRejectedValueOnce(new ApiError(400, 'invalid_input', 'Check what you entered.', { displayName: 'Use 50 characters or fewer.' }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Use 50 characters or fewer.')).toBeOnTheScreen();
    expect(screen.queryByText('Check what you entered.')).toBeNull();

    saved.mockRejectedValueOnce(new ApiError(0, 'unreachable', "Can't reach Homeport right now."));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText("Can't reach Homeport right now.")).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets someone who signed in with the wrong email start again', async () => {
    await render(page());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Use a different email' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
