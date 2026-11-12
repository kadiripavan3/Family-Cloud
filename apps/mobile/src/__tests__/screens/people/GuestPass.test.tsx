import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { endGuestPass, type GuestPassResponse, useGetGuestPass, useGetGuestPasses } from '@/api/generated/homeport';
import GuestPass from '@/app/(app)/guest-pass/[id]';
import GuestPasses from '@/app/(app)/guest-passes';
import { copyText, shareText } from '@/lib/share';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockChanged = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: 'g-1' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ guestPassChanged: mockChanged }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetGuestPass: jest.fn(), useGetGuestPasses: jest.fn(), useGetMe: jest.fn(() => mockMe), endGuestPass: jest.fn() }));
jest.mock('@/lib/share', () => ({ copyText: jest.fn(() => Promise.resolve(true)), shareText: jest.fn(), shortLink: (url: string) => url.replace('https://', '') }));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetGuestPass) as unknown as jest.Mock;
const list = jest.mocked(useGetGuestPasses) as unknown as jest.Mock;
const BABYSITTER = 'aaaaaaaa-1111-4111-8111-111111111111';

/** Tonight, 18:00 to 23:30, by this phone's clock. */
const at = (hours: number, minutes: number, days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};
const pass = (over: Partial<GuestPassResponse> = {}): GuestPassResponse => ({
  id: 'g-1',
  circleId: 'c-linds',
  guestName: 'Ines, the sitter',
  startsAt: at(0, 0),
  endsAt: at(23, 30),
  url: 'https://homeport.app/g/8f2k-linds',
  code: '4821',
  running: true,
  opened: false,
  things: [
    { id: BABYSITTER, kind: 'page', title: 'Babysitter notes' },
    { id: 'bbbbbbbb-1111-4111-8111-111111111111', kind: 'checklist', title: 'Emergency numbers' },
  ],
  ...over,
});

describe('4.5 Guest pass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(pass()));
  });

  it('says who it is for and when, what they can open, and how they get it', async () => {
    await render(inApp(<GuestPass />));
    expect(asked).toHaveBeenCalledWith('g-1');
    expect(screen.getByRole('header', { name: 'Guest pass' })).toBeOnTheScreen();
    expect(screen.getByText('Ines, the sitter')).toBeOnTheScreen();
    expect(screen.getByText('Today, 00:00 to 23:30')).toBeOnTheScreen();
    expect(screen.getByText('Ines can open')).toBeOnTheScreen();
    expect(screen.getByText('Babysitter notes')).toBeOnTheScreen();
    expect(screen.getByText('Emergency numbers')).toBeOnTheScreen();
    expect(screen.getByText('How Ines gets it')).toBeOnTheScreen();
    expect(screen.getByText('homeport.app/g/8f2k-linds')).toBeOnTheScreen();
    expect(screen.getByText(/^No account needed\. The link works on one phone, asks for the code /)).toHaveTextContent('No account needed. The link works on one phone, asks for the code 4821, and stops at 23:30.');
    expect(screen.getByText('Running · Not opened yet')).toBeOnTheScreen();
  });

  it('copies the link, and opens a thing on the pass', async () => {
    await render(inApp(<GuestPass />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Copy' }));
    expect(copyText).toHaveBeenCalledWith('https://homeport.app/g/8f2k-linds');
    await user.press(screen.getByRole('button', { name: 'Babysitter notes. Page' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: BABYSITTER } });
  });

  it("sends the link through the phone's share sheet", async () => {
    jest.mocked(shareText).mockResolvedValue('shared');
    await render(inApp(<GuestPass />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Send to Ines' }));
    await waitFor(() => expect(shareText).toHaveBeenCalledWith('Ines, here is your guest pass from The Linds: https://homeport.app/g/8f2k-linds'));
    expect(screen.queryByText('Link copied. Send it any way you like.')).toBeNull();
  });

  it('copies it instead where there is no share sheet, and says so', async () => {
    jest.mocked(shareText).mockResolvedValue('copied');
    await render(inApp(<GuestPass />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Send to Ines' }));
    expect(await screen.findByText('Link copied. Send it any way you like.')).toBeOnTheScreen();
  });

  it('ends early, after asking', async () => {
    jest.mocked(endGuestPass).mockResolvedValue(undefined);
    await render(inApp(<GuestPass />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'End it now' }));
    expect(screen.getByRole('header', { name: 'End this pass now?' })).toBeOnTheScreen();
    expect(screen.getByText('The link stops working for Ines at once.')).toBeOnTheScreen();
    expect(endGuestPass).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'End the pass' }));
    await waitFor(() => expect(mockChanged).toHaveBeenCalledWith('c-linds'));
    expect(endGuestPass).toHaveBeenCalledWith('g-1');
  });

  it('says so once it has ended, and offers nothing to send', async () => {
    asked.mockReturnValue(loaded(pass({ running: false, opened: true })));
    await render(inApp(<GuestPass />));
    expect(screen.getByText('This pass has ended. The link no longer opens anything.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send to Ines' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End it now' })).toBeNull();
    expect(screen.queryByText('homeport.app/g/8f2k-linds')).toBeNull();
  });

  it('says a pass that starts later has not started, with both days when it runs overnight', async () => {
    asked.mockReturnValue(loaded(pass({ running: false, startsAt: at(18, 0, 1), endsAt: at(10, 0, 2) })));
    await render(inApp(<GuestPass />));
    expect(screen.getByText(/^Tomorrow 18:00 to \w{3} \d+ \w{3} 10:00$/)).toBeOnTheScreen();
    expect(screen.getByText('Not started yet · Not opened yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send to Ines' })).toBeOnTheScreen();
  });

  it('keeps its Close while it loads, and says so when the pass is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<GuestPass />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'pass_not_found', "We couldn't find that guest pass.")));
    await view.rerender(inApp(<GuestPass />));
    expect(screen.getByText("We couldn't find that guest pass.")).toBeOnTheScreen();
  });
});

describe("4.5 A circle's guest passes", () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists them, the latest first, each with when it runs and where it stands', async () => {
    list.mockReturnValue(loaded([pass(), pass({ id: 'g-0', guestName: 'Astrid', running: false, startsAt: at(8, 0, -3), endsAt: at(20, 0, -3) }), pass({ id: 'g-2', guestName: 'Petra', running: false, startsAt: at(8, 0, 2), endsAt: at(20, 0, 2) })]));
    await render(inApp(<GuestPasses />));
    expect(list).toHaveBeenCalledWith('c-linds');
    expect(screen.getByRole('header', { name: 'Guest passes' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ines, the sitter. Today, 00:00 to 23:30. Running' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Astrid\. .* Ended$/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Petra\. .* Not started yet$/ })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: /^Astrid/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/guest-pass/[id]', params: { id: 'g-0' } });
  });

  it('says so when there are none, and leads to a new one', async () => {
    list.mockReturnValue(loaded([]));
    await render(inApp(<GuestPasses />));
    expect(screen.getByText('No passes yet.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: /^New guest pass/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/guest-pass/new');
  });

  it("says what went wrong when they can't be fetched", async () => {
    list.mockReturnValue(failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.')));
    await render(inApp(<GuestPasses />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
  });
});
