import { render, screen, userEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { useGetMe } from '@/api/generated/homeport';
import { loaded, me, nora } from '@/test/samples';

import { TabBar } from '../TabBar';

jest.mock('@/features/today/PlusSheet', () => ({ PlusSheet: ({ visible }: { visible: boolean }) => mockSheet(visible) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn() }));
// "Your apps" (10.1) has its own test (screens/together/AppSwitch): here only that holding You opens it.
jest.mock('@/features/journeyLink/AppSwitchSheet', () => ({ AppSwitchSheet: ({ visible }: { visible: boolean }) => (visible ? mockWords('the sheet of your apps') : null) }));
jest.mock('expo-blur', () => ({ BlurView: () => null }));

function mockWords(text: string) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>{text}</Text>;
}
function mockSheet(visible: boolean) {
  return visible ? mockWords('the sheet of things to add') : null;
}

const TABS = [
  ['index', 'Home'],
  ['people', 'People'],
  ['activity', 'Activity'],
  ['you', 'You'],
] as const;
const navigateToTab = jest.fn();

/** The bar as the tabs layout draws it, with one tab open. */
function bar(open: number) {
  const routes = TABS.map(([name]) => ({ key: `${name}-key`, name }));
  const descriptors = Object.fromEntries(TABS.map(([name, title]) => [`${name}-key`, { options: { title } }]));
  const props = { state: { index: open, routes }, descriptors, navigateToTab, insets: { top: 47, bottom: 34, left: 0, right: 0 } } as unknown as BottomTabBarProps;
  return <TabBar {...props} />;
}

describe('the tab bar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetMe) as unknown as jest.Mock).mockReturnValue(loaded(me()));
  });

  it('has Home, People, the + button, Activity and You, in that order, and says which one is open', async () => {
    await render(bar(0));
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['Home', 'People', 'Activity', 'You']);
    expect(screen.getByRole('tab', { name: 'Home' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'You' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Add something' })).toBeOnTheScreen();
  });

  it('opens another tab, and does nothing for the one that is open already', async () => {
    await render(bar(0));
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Home' }));
    expect(navigateToTab).not.toHaveBeenCalled();
    await user.press(screen.getByRole('tab', { name: 'People' }));
    expect(navigateToTab).toHaveBeenCalledWith('people-key');
  });

  it('opens the ways to add something from the + button, whichever tab is open', async () => {
    await render(bar(2));
    expect(screen.queryByText('the sheet of things to add')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add something' }));
    // A sheet over the tab that is open: the tab underneath stays where it was.
    expect(screen.getByText('the sheet of things to add')).toBeOnTheScreen();
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('offers the other app when the You tab is held, from whichever tab is open, and opens You when it is pressed', async () => {
    await render(bar(0));
    const user = userEvent.setup();
    expect(screen.queryByText('the sheet of your apps')).toBeNull();
    await user.longPress(screen.getByRole('tab', { name: 'You' }));
    expect(screen.getByText('the sheet of your apps')).toBeOnTheScreen();
    expect(navigateToTab).not.toHaveBeenCalled();
    await user.press(screen.getByRole('tab', { name: 'You' }));
    expect(navigateToTab).toHaveBeenCalledWith('you-key');
  });

  it('offers nothing when another tab is held', async () => {
    await render(bar(0));
    await userEvent.setup().longPress(screen.getByRole('tab', { name: 'People' }));
    expect(screen.queryByText('the sheet of your apps')).toBeNull();
  });

  it("draws the You tab as the person's own picture: their photo, or their initials until they have one", async () => {
    const view = await render(bar(3));
    expect(screen.getByText('NL', { includeHiddenElements: true })).toBeOnTheScreen();

    (jest.mocked(useGetMe) as unknown as jest.Mock).mockReturnValue(loaded(me({ ...nora, avatarUrl: 'https://example.com/nora.jpg' })));
    await view.rerender(bar(3));
    expect(screen.queryByText('NL', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Nora Lind')).toBeOnTheScreen();
  });
});
