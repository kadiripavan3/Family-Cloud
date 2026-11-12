import { render, screen, userEvent } from '@testing-library/react-native';

import People from '@/app/(app)/(tabs)/people';
import { useCircle, useCircles } from '@/features/circles/current';
import { memberLine } from '@/features/people/lines';
import { inApp } from '@/test/phone';
import { alex, biscuit, circle, coupleCircle, crewCircle, leo, linds, member, mia, noraInLinds } from '@/test/samples';

const mockRouter = { push: jest.fn() };
const mockSwitch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => ({}) }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn(), useCircles: jest.fn(), useSwitchCircle: () => mockSwitch }));
jest.mock('@/api/generated/homeport', () => ({ addMember: jest.fn() }));
jest.mock('@/lib/share', () => ({ copyText: jest.fn(() => Promise.resolve(true)), shortLink: (url: string) => url.replace('https://', '') }));

describe('4.1 People', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircles).mockReturnValue([linds, crewCircle, coupleCircle]);
    jest.mocked(useCircle).mockReturnValue(linds);
  });

  it('shows the circle in a sentence: its kind, since when, and what is shared here', async () => {
    jest.mocked(useCircle).mockReturnValue(circle({ shared: { photo: 3180, page: 200, checklist: 14, vault_item: 31 } }));
    await render(inApp(<People />));
    expect(screen.getByRole('header', { name: 'People' })).toBeOnTheScreen();
    expect(screen.getByText('Family · since March 2024 · 3,180 photos, 214 notes and 31 passwords shared here.')).toBeOnTheScreen();
  });

  it('lists who is in it, each with a line worked out from who they are', async () => {
    await render(inApp(<People />));
    expect(screen.getByText('In this circle')).toBeOnTheScreen();
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.getByText('Owner')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Alex Strand\. Adult\. Open their page$/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Mia\. Child, \d+/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Biscuit. Dog · vet, food and walks on their page. Open their page' })).toBeOnTheScreen();
    // Your own row opens nothing: your page is the last tab.
    expect(screen.queryByRole('button', { name: /^Nora Lind/ })).toBeNull();
  });

  it("opens a person's page", async () => {
    await render(inApp(<People />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Leo\./ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/person/[id]', params: { id: 'm-leo' } });
  });

  it('changes the circle with the chips at the top, for every screen', async () => {
    await render(inApp(<People />));
    expect(screen.getByRole('button', { name: 'The Linds' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Lisbon crew' }));
    expect(mockSwitch).toHaveBeenCalledWith('c-crew');
  });

  it('"Invite someone" offers adding someone, a guest pass, and the link to join', async () => {
    await render(inApp(<People />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Invite someone. Grandparents, a sitter for one evening, a friend' }));
    expect(screen.getByRole('header', { name: 'Invite someone' })).toBeOnTheScreen();
    expect(screen.getByText('homeport.app/join/the-linds')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^New guest pass/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/guest-pass/new');
  });

  it('adds someone from there', async () => {
    await render(inApp(<People />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Invite someone' }));
    await user.press(screen.getByRole('button', { name: /^Add someone/ }));
    expect(await screen.findByRole('header', { name: 'Add someone' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Their email')).toBeOnTheScreen();
  });

  it('offers no way in to someone who does not run the circle', async () => {
    jest.mocked(useCircle).mockReturnValue(circle({ iRunIt: false, myRole: 'teen', joinUrl: null }));
    await render(inApp(<People />));
    expect(screen.queryByRole('button', { name: /^Invite someone/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Alex Strand/ })).toBeOnTheScreen();
  });

  it('counts the three the drawing names, however many kinds of thing a circle shares', async () => {
    jest.mocked(useCircle).mockReturnValue(circle({ shared: { goal: 5, reminder: 6, album: 3, document: 8, bill: 18, photo: 86, checklist: 4, video: 4, vault_item: 6, folder: 16, split: 1, sheet: 5, page: 25, event: 7, board: 10 } }));
    await render(inApp(<People />));
    expect(screen.getByText('Family · since March 2024 · 90 photos, 39 notes and 6 passwords shared here.')).toBeOnTheScreen();
  });

  it('says so when nothing is shared in a circle yet, and counts things when none is a photo, a note or a password', async () => {
    jest.mocked(useCircle).mockReturnValue(coupleCircle);
    const view = await render(inApp(<People />));
    expect(screen.getByText('Couple · since March 2024 · nothing shared here yet.')).toBeOnTheScreen();
    jest.mocked(useCircle).mockReturnValue({ ...coupleCircle, shared: { bill: 2, event: 1 } });
    await view.rerender(inApp(<People />));
    expect(screen.getByText('Couple · since March 2024 · 3 things shared here.')).toBeOnTheScreen();
  });
});

describe("the line under a person's name", () => {
  const on = '2026-11-11';

  it('says their role in a family, with a child\'s age', () => {
    expect(memberLine(noraInLinds, linds, on)).toBe('Owner');
    expect(memberLine(alex, linds, on)).toBe('Adult');
    // Mia was born on 4 December 2016: nine, and ten in 23 days.
    expect(memberLine(mia, linds, on)).toBe('Child, 9 · birthday in 23 days');
    expect(memberLine(leo, linds, on)).toBe('Child, 6 · no phone, you look after their things');
  });

  it('says a birthday that is today or tomorrow in those words', () => {
    expect(memberLine(mia, linds, '2026-12-04')).toBe('Child, 10 · birthday today');
    expect(memberLine(mia, linds, '2026-12-03')).toBe('Child, 9 · birthday tomorrow');
  });

  it('says who is only invited so far', () => {
    expect(memberLine({ ...alex, status: 'invited' }, linds, on)).toBe('Adult · invited');
    expect(memberLine(member({ role: 'adult', status: 'invited' }), crewCircle, on)).toBe('Invited');
  });

  it('says what a pet is, and where its things are', () => {
    expect(memberLine(biscuit, linds, on)).toBe('Dog · vet, food and walks on their page');
    expect(memberLine({ ...biscuit, about: '' }, linds, on)).toBe('Pet · vet, food and walks on their page');
  });

  it('has no roles among equals: only who started the circle', () => {
    expect(memberLine(crewCircle.members[0]!, crewCircle, on)).toBe('Started this circle');
    expect(memberLine(crewCircle.members[2]!, crewCircle, on)).toBe('In this circle');
  });
});
