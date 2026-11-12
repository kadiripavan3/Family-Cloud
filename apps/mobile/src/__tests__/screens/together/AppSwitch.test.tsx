import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { useGetJourneySwitch } from '@/api/generated/homeport';
import { AppSwitchSheet } from '@/features/journeyLink/AppSwitchSheet';
import { openInJourney } from '@/features/journeyLink/open';
import { onPhone } from '@/test/phone';
import { linds, loaded, me, pending, soloCircle } from '@/test/samples';
import { appSwitch } from '@/test/samples/together';

let mockCircle = linds;
jest.mock('@/api/generated/homeport', () => ({ useGetJourneySwitch: jest.fn(), useGetMe: jest.fn(() => mockMe) }));
jest.mock('@/features/circles/current', () => ({ useCircleIfAny: () => mockCircle }));
jest.mock('@/features/journeyLink/open', () => ({ openInJourney: jest.fn() }));

const mockMe = loaded(me());
const asked = jest.mocked(useGetJourneySwitch) as unknown as jest.Mock;
const open = jest.mocked(openInJourney);

describe('10.1 One account, two apps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCircle = linds;
    asked.mockReturnValue(loaded(appSwitch()));
    open.mockResolvedValue('opened');
  });

  it('shows both apps: this one with a tick and the circle you are in, Journey with how many you follow', async () => {
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.getByRole('header', { name: 'Your apps' })).toBeOnTheScreen();
    expect(screen.getByText('Signed in as Nora Lind in both.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Homeport. What you keep · The Linds. You are here')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Journey. What you tell · 58 following. Open' })).toBeOnTheScreen();
  });

  it('says the three things the two apps share, naming someone of the circle', async () => {
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.getByText('Journey photos keep their originals')).toBeOnTheScreen();
    expect(screen.getByText('Full size here; Journey shows a lighter copy')).toBeOnTheScreen();
    expect(screen.getByText('Your people carry over')).toBeOnTheScreen();
    expect(screen.getByText('Invite Alex to a journey in one tap')).toBeOnTheScreen();
    expect(screen.getByText('One Sunday summary')).toBeOnTheScreen();
    expect(screen.getByText('Both apps in one email, or none')).toBeOnTheScreen();
  });

  it('names nobody in a circle of one', async () => {
    mockCircle = soloCircle;
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.getByText('Invite them to a journey in one tap')).toBeOnTheScreen();
  });

  it('opens your profile in Journey', async () => {
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Journey. What you tell · 58 following. Open' }));
    expect(open).toHaveBeenCalledWith('journey://profile/noralind');
    expect(screen.queryByText(/opens from here/)).toBeNull();
  });

  it('says why when there is no other app to open: in a browser, and on a phone without Journey', async () => {
    open.mockResolvedValue('browser');
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Journey. What you tell · 58 following. Open' }));
    await waitFor(() => expect(screen.getByText('Journey opens from here when both apps are on your phone. A browser has no app to hop to.')).toBeOnTheScreen());
    open.mockResolvedValue('missing');
    await user.press(screen.getByRole('button', { name: 'Journey. What you tell · 58 following. Open' }));
    await waitFor(() => expect(screen.getByText("Journey isn't on this phone. Once it is, this opens it, already signed in.")).toBeOnTheScreen());
  });

  it('says so when the account has no profile in Journey yet', async () => {
    asked.mockReturnValue(loaded(appSwitch({ journey: null })));
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.getByRole('button', { name: 'Journey. What you tell · no profile yet. Open' })).toBeOnTheScreen();
  });

  it('shows nothing of Journey when this app runs without it', async () => {
    asked.mockReturnValue(loaded(appSwitch({ mode: 'off', available: false, journey: null })));
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.queryByRole('button', { name: /^Journey\./ })).toBeNull();
    expect(screen.getByText('This Homeport runs without Journey. The two are linked when both are switched on.')).toBeOnTheScreen();
  });

  it("shows why Journey couldn't be asked, and what it can't do from here yet, in the API's own words", async () => {
    asked.mockReturnValue(loaded(appSwitch({ journey: null, note: 'Journey is not answering just now.', notYet: [{ code: 'clips', says: 'Clips stay in Journey for now.' }] })));
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.getByText('Journey is not answering just now.')).toBeOnTheScreen();
    expect(screen.getByText("What Journey can't do from here yet")).toBeOnTheScreen();
    expect(screen.getByText('Clips stay in Journey for now.')).toBeOnTheScreen();
  });

  it('is the sheet at once, with the name the app already knows, while Journey is being asked', async () => {
    asked.mockReturnValue(pending());
    await render(onPhone(<AppSwitchSheet visible onClose={jest.fn()} />));
    expect(screen.getByText('Signed in as Nora Lind in both.')).toBeOnTheScreen();
    expect(screen.getByText('Your people carry over')).toBeOnTheScreen();
  });

  it('asks Journey only while it is open', async () => {
    await render(onPhone(<AppSwitchSheet visible={false} onClose={jest.fn()} />));
    expect(asked).toHaveBeenCalledWith({ query: { enabled: false } });
    expect(screen.queryByText('Your apps')).toBeNull();
  });
});
