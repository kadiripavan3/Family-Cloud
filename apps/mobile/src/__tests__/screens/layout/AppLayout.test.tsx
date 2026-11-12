import { render, screen } from '@testing-library/react-native';

import AppLayout from '@/app/(app)/_layout';
import { useCircles } from '@/features/circles/current';
import { takeLink } from '@/lib/links';
import { onPhone } from '@/test/phone';
import { linds } from '@/test/samples';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const { Text: Words } = jest.requireActual<typeof import('react-native')>('react-native');
  function Stack() {
    return <Words>the tabs and what opens on them</Words>;
  }
  Stack.Screen = function Screen() {
    return null;
  };
  function Redirect({ href }: { href: string }) {
    return <Words>{`sent to ${href}`}</Words>;
  }
  return { Stack, Redirect, usePathname: () => '/', useRouter: () => ({ navigate: mockNavigate }) };
});
jest.mock('@/features/circles/current', () => ({ useCircles: jest.fn() }));
jest.mock('@/features/notifications/usePushNotifications', () => ({ usePushNotifications: jest.fn() }));
jest.mock('@/features/navigation/OfflineStrip', () => ({ OfflineStrip: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/links', () => ({ takeLink: jest.fn(() => null) }));

describe('the signed-in app', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends someone who is in no circle to set one up, before any screen is drawn', async () => {
    jest.mocked(useCircles).mockReturnValue([]);
    jest.mocked(takeLink).mockReturnValue('/join/the-linds');
    await render(onPhone(<AppLayout />));
    expect(screen.getByText('sent to /setup')).toBeOnTheScreen();
    expect(screen.queryByText('the tabs and what opens on them')).toBeNull();
    // The invitation that brought them is left for the setup steps to open.
    expect(takeLink).not.toHaveBeenCalled();
  });

  it('opens for someone who is in a circle, and on the link that brought them', async () => {
    jest.mocked(useCircles).mockReturnValue([linds]);
    jest.mocked(takeLink).mockReturnValue('/join/the-linds');
    await render(onPhone(<AppLayout />));
    expect(screen.getByText('the tabs and what opens on them')).toBeOnTheScreen();
    expect(mockNavigate).toHaveBeenCalledWith('/join/the-linds');
  });

  it('opens on Home when no link brought them', async () => {
    jest.mocked(useCircles).mockReturnValue([linds]);
    jest.mocked(takeLink).mockReturnValue(null);
    await render(onPhone(<AppLayout />));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText('the tabs and what opens on them')).toBeOnTheScreen();
  });
});
