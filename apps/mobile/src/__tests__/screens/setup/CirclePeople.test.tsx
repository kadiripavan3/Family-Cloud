import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addMember, changeCircle, changeMember } from '@/api/generated/homeport';
import CirclePeople from '@/app/(setup)/setup/people';
import { useCircles } from '@/features/circles/current';
import { copyText } from '@/lib/share';
import { inApp } from '@/test/phone';
import { alex, circle, coupleCircle, linds, member, mia } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams = { circle: 'c-linds' };
const mockCache = { circleChanged: jest.fn(() => Promise.resolve()), memberAdded: jest.fn(() => Promise.resolve()), memberSaved: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ addMember: jest.fn(), changeCircle: jest.fn(), changeMember: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/share', () => ({ copyText: jest.fn(() => Promise.resolve(true)), shortLink: (url: string) => url.replace('https://', '') }));

const invitedAlex = { ...alex, status: 'invited' as const };
const family = circle({ members: [linds.members[0]!, invitedAlex, mia, member({ id: 'm-biscuit', name: 'Biscuit', kind: 'pet', role: 'child', status: 'no_phone', about: 'Dog' })] });

describe('2.2 Name it and invite people', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { circle: 'c-linds' };
    jest.mocked(useCircles).mockReturnValue([family, coupleCircle]);
  });

  it('shows the circle with its name and its people, and what each is to it', async () => {
    await render(inApp(<CirclePeople />));
    expect(screen.getByRole('header', { name: "Who's in it?" })).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 2 of 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Name of the circle').props.value).toBe('The Linds');
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.getByText('Owner')).toBeOnTheScreen();
    expect(screen.getByText('Invited by email')).toBeOnTheScreen();
    expect(screen.getByText('No phone needed · you look after their things')).toBeOnTheScreen();
    expect(screen.getByText('Dog')).toBeOnTheScreen();
    expect(screen.getByText('homeport.app/join/the-linds')).toBeOnTheScreen();
  });

  it('lets each person of a family have a role, but not the owner or a pet', async () => {
    await render(inApp(<CirclePeople />));
    expect(screen.getByRole('button', { name: 'Alex: Adult. Change role' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mia: Child. Change role' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Nora: / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Biscuit: / })).toBeNull();
  });

  it('changes a role from the sheet behind its pill', async () => {
    const asTeen = { ...invitedAlex, role: 'teen' as const };
    jest.mocked(changeMember).mockResolvedValue(asTeen);
    await render(inApp(<CirclePeople />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Alex: Adult. Change role' }));
    expect(screen.getByRole('header', { name: "Alex's role" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Teen. Like an adult, without Money and the Vault' }));
    await waitFor(() => expect(mockCache.memberSaved).toHaveBeenCalledWith(asTeen));
    expect(changeMember).toHaveBeenCalledWith('m-alex', { role: 'teen' });
  });

  it('has no roles among equals', async () => {
    mockParams = { circle: 'c-couple' };
    await render(inApp(<CirclePeople />));
    expect(screen.queryByRole('button', { name: /Change role$/ })).toBeNull();
    expect(screen.getByText('Started this circle')).toBeOnTheScreen();
  });

  it('invites an adult by email', async () => {
    const astrid = member({ id: 'm-astrid', name: 'Astrid Lind', role: 'adult', status: 'invited' });
    jest.mocked(addMember).mockResolvedValue(astrid);
    await render(inApp(<CirclePeople />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add someone. A person, a child or a pet' }));
    expect(screen.getByRole('button', { name: 'Send the invitation' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Astrid Lind');
    await user.type(screen.getByLabelText('Their email'), 'astrid@example.com');
    await user.press(screen.getByRole('button', { name: 'Send the invitation' }));
    await waitFor(() => expect(mockCache.memberAdded).toHaveBeenCalledWith(astrid));
    expect(addMember).toHaveBeenCalledWith('c-linds', { clientId: 'client-1', name: 'Astrid Lind', kind: 'person', email: 'astrid@example.com', birthday: undefined, about: undefined });
  });

  it('adds a child or a pet without a phone', async () => {
    jest.mocked(addMember).mockResolvedValue(member({ id: 'm-leo', name: 'Leo', kind: 'child', role: 'child', status: 'no_phone' }));
    await render(inApp(<CirclePeople />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Add someone/ }));
    await user.press(screen.getByRole('radio', { name: 'A child' }));
    expect(screen.queryByLabelText('Their email')).toBeNull();
    await user.type(screen.getByLabelText('Name'), 'Leo');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addMember).toHaveBeenCalledWith('c-linds', { clientId: 'client-1', name: 'Leo', kind: 'child', email: undefined, birthday: undefined, about: undefined }));

    await user.press(screen.getByRole('button', { name: /^Add someone/ }));
    await user.press(screen.getByRole('radio', { name: 'A pet' }));
    await user.type(screen.getByLabelText('Name'), 'Momo');
    await user.type(screen.getByLabelText('What kind of pet'), 'Cat');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addMember).toHaveBeenLastCalledWith('c-linds', { clientId: 'client-1', name: 'Momo', kind: 'pet', email: undefined, birthday: undefined, about: 'Cat' }));
  });

  it("says what the API says about an email it can't use, under the email", async () => {
    jest.mocked(addMember).mockRejectedValue(new ApiError(400, 'invalid_email', 'Check that email address.', { email: 'Check that email address.' }));
    await render(inApp(<CirclePeople />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Add someone/ }));
    await user.type(screen.getByLabelText('Name'), 'Astrid');
    await user.type(screen.getByLabelText('Their email'), 'astrid');
    await user.press(screen.getByRole('button', { name: 'Send the invitation' }));
    expect(await screen.findByText('Check that email address.')).toBeOnTheScreen();
    expect(mockCache.memberAdded).not.toHaveBeenCalled();
  });

  it('copies the link that lets someone join', async () => {
    await render(inApp(<CirclePeople />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Copy' }));
    expect(copyText).toHaveBeenCalledWith('https://homeport.app/join/the-linds');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeOnTheScreen();
  });

  it('saves a new name on the way on, and only then', async () => {
    const renamed = { ...family, name: 'Lind-Strand' };
    jest.mocked(changeCircle).mockResolvedValue(renamed);
    await render(inApp(<CirclePeople />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(changeCircle).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/setup/bring-in', params: { circle: 'c-linds' } });

    await user.clear(screen.getByLabelText('Name of the circle'));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name of the circle'), 'Lind-Strand');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockCache.circleChanged).toHaveBeenCalledWith(renamed));
    expect(changeCircle).toHaveBeenCalledWith('c-linds', { name: 'Lind-Strand' });
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });
});
