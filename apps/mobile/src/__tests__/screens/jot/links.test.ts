import { redirectSystemPath } from '@/app/+native-intent';
import { hrefFor } from '@/features/notifications/target';
import { linksKnowSession, rememberLink, screenFor, takeLink } from '@/lib/links';

describe('the links that open the jot bar', () => {
  afterEach(() => {
    linksKnowSession(false);
    takeLink();
  });

  it("leaves the app's own link as it came: the router opens the bar itself", () => {
    expect(screenFor('homeport://jot')).toBe('homeport://jot');
    expect(screenFor('/jot')).toBe('/jot');
    // It is not a web page: nothing at that address on the web opens the app.
    expect(screenFor('https://homeport.app/jot')).toBe('https://homeport.app/jot');
  });

  it('remembers the bar, voice and the share screen for someone who has to sign in first', () => {
    for (const [link, screen] of [
      ['homeport://jot', '/jot'],
      ['homeport:///jot', '/jot'],
      ['homeport://jot/', '/jot'],
      ['homeport://jot?from=widget', '/jot'],
      ['homeport://jot/voice', '/jot/voice'],
      ['homeport://jot/share', '/jot/share'],
    ] as const) {
      expect(redirectSystemPath({ path: link, initial: true })).toBe(link);
      expect(takeLink()).toBe(screen);
    }
  });

  it('remembers nothing for someone who is signed in, and nothing that is not one of those screens', () => {
    rememberLink('/jot/ways', 1_000);
    rememberLink('/jotter', 1_000);
    expect(takeLink(2_000)).toBeNull();
    linksKnowSession(true);
    rememberLink('/jot', 1_000);
    expect(takeLink(2_000)).toBeNull();
  });

  it('opens the bar when the pinned note is tapped', () => {
    expect(hrefFor('/jot')).toBe('/jot');
  });
});
