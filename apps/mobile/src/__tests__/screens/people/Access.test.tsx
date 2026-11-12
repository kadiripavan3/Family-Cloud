import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { changeMember, useGetPerson } from '@/api/generated/homeport';
import PersonAccess from '@/app/(app)/person/[id]/access';
import { useCircles } from '@/features/circles/current';
import { inApp } from '@/test/phone';
import { alex, circle, leo, linds, loaded, pending, thing } from '@/test/samples';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockSaved = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: 'm-leo' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ memberSaved: mockSaved }) }));
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetPerson: jest.fn(), changeMember: jest.fn() }));

const asked = jest.mocked(useGetPerson) as unknown as jest.Mock;
const pages = [thing({ id: 'p-1' }), thing({ id: 'p-2' }), thing({ id: 'p-3' }), thing({ id: 'l-1', kind: 'checklist' })];

describe("4.6 A child's view", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircles).mockReturnValue([linds]);
    asked.mockReturnValue(loaded({ member: leo, kept: pages }));
  });

  it('says what a child can see: the fun parts on, Money and the Vault drawn and shut', async () => {
    await render(inApp(<PersonAccess />));
    expect(screen.getByRole('header', { name: 'Leo' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Child', checked: true })).toBeOnTheScreen();
    expect(screen.getAllByRole('radio').map((one) => one.props.accessibilityLabel)).toEqual(['Child', 'Teen', 'Adult']);
    expect(screen.getByText('Leo can')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: "See the family's photos" })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'See the calendar and their jobs' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Open pages you share with them' })).toBeChecked();
    expect(screen.getByText('3 pages so far')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Money' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Vault' })).not.toBeChecked();
    expect(screen.getAllByText('Off for children')).toHaveLength(2);
  });

  it('draws the two rows about leaving the circle, with the other adult by name', async () => {
    await render(inApp(<PersonAccess />));
    expect(screen.getByText('Leaving the circle')).toBeOnTheScreen();
    expect(screen.getByText('Sharing with someone outside')).toBeOnTheScreen();
    expect(screen.getByText('You or Alex get asked first')).toBeOnTheScreen();
    expect(screen.getByText('Ask first')).toBeOnTheScreen();
    expect(screen.getByText('Becomes a Teen')).toBeOnTheScreen();
    expect(screen.getByText('At 13')).toBeOnTheScreen();
  });

  it('saves each of the three switches as it is pressed', async () => {
    jest.mocked(changeMember).mockResolvedValue({ ...leo, seesPlan: false });
    await render(inApp(<PersonAccess />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'See the calendar and their jobs' }));
    await waitFor(() => expect(mockSaved).toHaveBeenCalledWith({ ...leo, seesPlan: false }));
    expect(changeMember).toHaveBeenCalledWith('m-leo', { seesPlan: false });
  });

  it('shows the switches as the API has them', async () => {
    asked.mockReturnValue(loaded({ member: { ...leo, seesLibrary: false, seesPages: false }, kept: [] }));
    await render(inApp(<PersonAccess />));
    expect(screen.getByRole('switch', { name: "See the family's photos" })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'See the calendar and their jobs' })).toBeChecked();
    expect(screen.getByText('None so far')).toBeOnTheScreen();
  });

  it('changes the role with the control at the top', async () => {
    jest.mocked(changeMember).mockResolvedValue({ ...leo, role: 'teen' });
    await render(inApp(<PersonAccess />));
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Teen' }));
    await waitFor(() => expect(changeMember).toHaveBeenCalledWith('m-leo', { role: 'teen' }));
  });

  it('has its own words for a teen, and says an adult sees everything', async () => {
    asked.mockReturnValue(loaded({ member: { ...leo, role: 'teen' }, kept: [] }));
    const view = await render(inApp(<PersonAccess />));
    expect(screen.getAllByText('Off for teens')).toHaveLength(2);
    expect(screen.getByText('Becomes an Adult')).toBeOnTheScreen();
    expect(screen.getByText('At 18')).toBeOnTheScreen();
    asked.mockReturnValue(loaded({ member: alex, kept: [] }));
    await view.rerender(inApp(<PersonAccess />));
    expect(screen.getByRole('radio', { name: 'Adult', checked: true })).toBeOnTheScreen();
    expect(screen.getByText('An adult sees everything that is shared with The Linds, Money and the Vault too.')).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('can be read but not changed by someone who does not run the circle', async () => {
    jest.mocked(useCircles).mockReturnValue([circle({ iRunIt: false, myRole: 'teen' })]);
    await render(inApp(<PersonAccess />));
    expect(screen.getByText('Only the adults who run this circle can change this.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Adult' }));
    expect(changeMember).not.toHaveBeenCalled();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<PersonAccess />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });
});
