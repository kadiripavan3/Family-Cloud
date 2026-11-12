import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeMember, removeMember, useGetPerson } from '@/api/generated/homeport';
import { uploadPhoto } from '@/api/upload';
import Person from '@/app/(app)/person/[id]/index';
import { useCircles } from '@/features/circles/current';
import { pickSquarePhoto } from '@/features/media/pick';
import { toISODate } from '@/lib/dates';
import { inApp } from '@/test/phone';
import { alex, biscuit, circle, crewCircle, failed, linds, loaded, me, mia, notMia, pending, thing } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { memberSaved: jest.fn(() => Promise.resolve()), memberRemoved: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: 'm-mia' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/upload', () => ({ uploadPhoto: jest.fn() }));
jest.mock('@/features/media/pick', () => ({ pickSquarePhoto: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn(), useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
// What is coming up for them is Plan's own piece, with its own test: here only that it stands under its label.
jest.mock('@/features/plan/ComingUp', () => ({ ComingUp: ({ member }: { member: { name: string } }) => mockComingUp(member.name) }));
jest.mock('@/api/generated/homeport', () => ({ useGetPerson: jest.fn(), useGetMe: jest.fn(() => mockMe), changeMember: jest.fn(), removeMember: jest.fn() }));

const mockLinds = linds;
function mockComingUp(name: string) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>the calendar for {name}</Text>;
}
const mockMe = loaded(me());
const asked = jest.mocked(useGetPerson) as unknown as jest.Mock;
/** Mia, turning ten in 23 days, whenever the test runs. */
const in23 = new Date();
in23.setDate(in23.getDate() + 23);
const born = toISODate(new Date(in23.getFullYear() - 10, in23.getMonth(), in23.getDate()));
const miaSoon = { ...mia, birthday: born };
const plan = thing({ id: '33333333-3333-4333-8333-333333333333', title: "Mia's 10th birthday", chip: notMia });

describe("4.2 A person's page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircles).mockReturnValue([linds, crewCircle]);
    asked.mockReturnValue(loaded({ member: miaSoon, kept: [plan] }));
  });

  it('says who they are: their name, their age, what they are to the circle', async () => {
    await render(inApp(<Person />));
    expect(asked).toHaveBeenCalledWith('m-mia');
    expect(screen.getByRole('header', { name: 'Mia' })).toBeOnTheScreen();
    expect(screen.getByText('9 years old · Child in The Linds')).toBeOnTheScreen();
  });

  it('notes a birthday: how far off, the day, how old they turn, and that a plan is hidden from them', async () => {
    await render(inApp(<Person />));
    expect(screen.getByText('Birthday in 23 days')).toBeOnTheScreen();
    expect(screen.getByText(/ · turns 10 · a plan is hidden from Mia$/)).toBeOnTheScreen();
  });

  it('shows the facts the circle keeps as tags, and what is kept for them', async () => {
    await render(inApp(<Person />));
    expect(screen.getByText('Shoes 33')).toBeOnTheScreen();
    expect(screen.getByText('Class 4B')).toBeOnTheScreen();
    expect(screen.getByText('Kept for Mia')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "Mia's 10th birthday. Page" }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: plan.id } });
  });

  it('shows what is coming up for them from the calendar, and says so when nothing is kept', async () => {
    asked.mockReturnValue(loaded({ member: mia, kept: [] }));
    await render(inApp(<Person />));
    expect(screen.getByText('Coming up')).toBeOnTheScreen();
    expect(screen.getByText('the calendar for Mia')).toBeOnTheScreen();
    expect(screen.getByText('Nothing yet. Whatever is kept about Mia and shared with you shows here.')).toBeOnTheScreen();
  });

  it('changes the facts: take one away, add one, save', async () => {
    const saved = { ...miaSoon, facts: ['Class 4B', 'Allergic to nuts'] };
    jest.mocked(changeMember).mockResolvedValue(saved);
    await render(inApp(<Person />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('header', { name: 'About Mia' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove Shoes 33' }));
    await user.type(screen.getByLabelText('A fact'), 'Allergic to nuts');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.memberSaved).toHaveBeenCalledWith(saved));
    expect(changeMember).toHaveBeenCalledWith('m-mia', { facts: ['Class 4B', 'Allergic to nuts'] });
  });

  it('changes the picture from the menu: a photo from the phone goes up first', async () => {
    jest.mocked(pickSquarePhoto).mockResolvedValue({ uri: 'file:///mia.jpg', width: 800, height: 800 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-7');
    jest.mocked(changeMember).mockResolvedValue(miaSoon);
    await render(inApp(<Person />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Change picture' }));
    await waitFor(() => expect(changeMember).toHaveBeenCalledWith('m-mia', { avatarMediaId: 'media-7' }));
    expect(mockCache.memberSaved).toHaveBeenCalled();
  });

  it('changes or removes the birthday from the menu', async () => {
    jest.mocked(changeMember).mockResolvedValue(mia);
    await render(inApp(<Person />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: /^Birthday\. \d+ \w+ \d{4}$/ })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove the birthday' }));
    await waitFor(() => expect(changeMember).toHaveBeenCalledWith('m-mia', { removeBirthday: true }));
  });

  it('opens their role and what they can see, in a family', async () => {
    await render(inApp(<Person />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Role and what they can see. Child' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/person/[id]/access', params: { id: 'm-mia' } });
  });

  it('takes someone out of the circle only after asking', async () => {
    jest.mocked(removeMember).mockResolvedValue(undefined);
    await render(inApp(<Person />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Remove from The Linds' }));
    expect(screen.getByRole('header', { name: 'Remove Mia from The Linds?' })).toBeOnTheScreen();
    expect(screen.getByText('Mia stops seeing what is shared here. What they kept themselves stays theirs.')).toBeOnTheScreen();
    expect(removeMember).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Remove Mia' }));
    await waitFor(() => expect(mockCache.memberRemoved).toHaveBeenCalledWith(miaSoon));
    expect(removeMember).toHaveBeenCalledWith('m-mia');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("says why when someone can't be removed", async () => {
    jest.mocked(removeMember).mockRejectedValue(new ApiError(409, 'owner_stays', "The owner can't be removed from the circle."));
    await render(inApp(<Person />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Remove from The Linds' }));
    await user.press(screen.getByRole('button', { name: 'Remove Mia' }));
    expect(await screen.findByText("The owner can't be removed from the circle.")).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('can be read but not changed by someone who does not run the circle', async () => {
    jest.mocked(useCircles).mockReturnValue([circle({ iRunIt: false, myRole: 'teen' })]);
    await render(inApp(<Person />));
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByText('Shoes 33')).toBeOnTheScreen();
  });

  it('has its own words for a pet and for someone among equals', async () => {
    asked.mockReturnValue(loaded({ member: biscuit, kept: [] }));
    const view = await render(inApp(<Person />));
    expect(screen.getByText('Dog in The Linds')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    // A pet has no birthday to keep and no role.
    expect(screen.queryByRole('button', { name: /^Birthday/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Role/ })).toBeNull();
    asked.mockReturnValue(loaded({ member: { ...alex, id: 'm-crew-2', circleId: 'c-crew', name: 'Kai' }, kept: [] }));
    await view.rerender(inApp(<Person />));
    expect(screen.getByText('In Lisbon crew')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when the person is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Person />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'member_not_found', "We couldn't find that person.")));
    await view.rerender(inApp(<Person />));
    expect(screen.getByText("We couldn't find that person.")).toBeOnTheScreen();
  });
});
