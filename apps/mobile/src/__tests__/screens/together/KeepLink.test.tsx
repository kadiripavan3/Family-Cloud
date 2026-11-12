import { render, screen } from '@testing-library/react-native';

import KeepLink from '@/app/(app)/keep';
import { linksKnowSession, rememberLink, screenFor, takeLink } from '@/lib/links';
import { onPhone } from '@/test/phone';
import { ICELAND } from '@/test/samples/together';

let mockParams: { journey?: string } = {};
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props.href);
    return null;
  },
}));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));

describe('10.2 "Keep in Homeport" on Journey\'s recap: the link it opens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    linksKnowSession(false);
    takeLink();
  });

  it('lands on "What to keep" for that journey', async () => {
    mockParams = { journey: ICELAND };
    await render(onPhone(<KeepLink />));
    expect(mockRedirect).toHaveBeenCalledWith({ pathname: '/journey/keep/[journeyId]', params: { journeyId: ICELAND } });
  });

  it('leads to the list of your journeys when it names none', async () => {
    mockParams = {};
    await render(onPhone(<KeepLink />));
    expect(mockRedirect).toHaveBeenCalledWith('/journey/keep');
  });

  it('is the "nothing at this address" page for something that is no journey', async () => {
    mockParams = { journey: 'whatever' };
    await render(onPhone(<KeepLink />));
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });

  it("is turned into the screen's own address when it opens the app", () => {
    expect(screenFor(`homeport://keep?journey=${ICELAND}`)).toBe(`/journey/keep/${ICELAND}`);
    expect(screenFor(`homeport:///keep?journey=${ICELAND}`)).toBe(`/journey/keep/${ICELAND}`);
    expect(screenFor(`/keep?source=recap&journey=${ICELAND}`)).toBe(`/journey/keep/${ICELAND}`);
    // Anything else of the app's own is left as it came.
    expect(screenFor('homeport://jot')).toBe('homeport://jot');
    expect(screenFor('/keep')).toBe('/keep');
  });

  it('is remembered through a sign-in, with its journey', () => {
    rememberLink(screenFor(`homeport://keep?journey=${ICELAND}`));
    expect(takeLink()).toBe(`/journey/keep/${ICELAND}`);
    expect(takeLink()).toBeNull();
  });
});
