import { render, screen } from '@testing-library/react-native';

import { useGetThing } from '@/api/generated/homeport';
import { ApiError } from '@/api/fetcher';
import ThingToCome from '@/app/(app)/[kind]/[id]';
import { onPhone } from '@/test/phone';
import { everyone, failed, linds, loaded, me, pending, thing } from '@/test/samples';

let mockParams = { kind: 'sheet', id: '11111111-1111-4111-8111-111111111111' };
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetThing: jest.fn(), useGetMe: jest.fn(() => mockMe) }));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetThing) as unknown as jest.Mock;

describe('a thing whose own screen is not built yet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { kind: 'sheet', id: '11111111-1111-4111-8111-111111111111' };
  });

  it('says what it is and which place it arrives with, and who sees it', async () => {
    asked.mockReturnValue(loaded(thing({ kind: 'sheet' as never, place: 'money', title: 'Party budget', chip: everyone })));
    await render(onPhone(<ThingToCome />));
    expect(screen.getByRole('header', { name: 'Party budget' })).toBeOnTheScreen();
    expect(screen.getByText('This is a sheet. It opens here once Money is built in Homeport.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('calls a kind it has never heard of "a thing", and still opens', async () => {
    asked.mockReturnValue(loaded(thing({ kind: 'wish_list' as never, place: undefined, title: '' })));
    await render(onPhone(<ThingToCome />));
    expect(screen.getByRole('header', { name: 'Untitled' })).toBeOnTheScreen();
    expect(screen.getByText('This is a thing. It opens here once its part of Homeport is built.')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(onPhone(<ThingToCome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so when the thing is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(onPhone(<ThingToCome />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.getByText("That isn't there any more, or it isn't shared with you.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeOnTheScreen();
  });

  it('is the "nothing at this address" page for an address that is not a thing at all', async () => {
    mockParams = { kind: 'new', id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(onPhone(<ThingToCome />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith('whatever', { query: { enabled: false } });
  });
});
