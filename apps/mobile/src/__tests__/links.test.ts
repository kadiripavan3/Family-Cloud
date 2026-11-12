import { linksKnowSession, rememberLink, screenFor, takeLink } from '@/lib/links';
import { copyText, shortLink } from '@/lib/share';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

describe('links that open the app', () => {
  it('turns a shared web address into the screen it is about', () => {
    expect(screenFor('https://homeport.app/join/the-linds')).toBe('/join/the-linds');
    expect(screenFor('https://homeport.app/join/the-linds?utm=x')).toBe('/join/the-linds');
    expect(screenFor('http://localhost:8080/join/8f2k')).toBe('/join/8f2k');
    expect(screenFor('/join/8f2k')).toBe('/join/8f2k');
  });

  it('leaves every other link as it came', () => {
    expect(screenFor('homeport://settings/appearance')).toBe('homeport://settings/appearance');
    expect(screenFor('/settings/appearance')).toBe('/settings/appearance');
    expect(screenFor('https://homeport.app/terms')).toBe('https://homeport.app/terms');
    expect(screenFor('https://homeport.app/join/')).toBe('https://homeport.app/join/');
    // A guest pass is a web page for someone without the app; it has no screen here.
    expect(screenFor('https://homeport.app/g/8f2k-linds')).toBe('https://homeport.app/g/8f2k-linds');
  });

  it('remembers the screen a link asked for, hands it over once, and forgets it after half an hour', () => {
    expect(takeLink()).toBeNull();
    rememberLink('/join/the-linds', 1_000);
    expect(takeLink(2_000)).toBe('/join/the-linds');
    expect(takeLink(2_000)).toBeNull();

    rememberLink('/join/the-linds', 1_000);
    expect(takeLink(1_000 + 31 * 60 * 1000)).toBeNull();

    // Kept as the screen's own address, so it can be compared with where the app is.
    rememberLink('/join/the-linds?utm=x#top', 1_000);
    expect(takeLink(2_000)).toBe('/join/the-linds');

    // Only screens inside the app are worth coming back to.
    rememberLink('/192.168.1.5:8081/--/', 1_000);
    rememberLink('/terms', 1_000);
    expect(takeLink(2_000)).toBeNull();
  });

  it('remembers a link only for someone who still has to sign in', () => {
    try {
      // Opened before signing in: it is still there once they are in.
      rememberLink('/join/the-linds', 1_000);
      linksKnowSession(true);
      expect(takeLink(2_000)).toBe('/join/the-linds');

      // Opened while signed in: the router has shown it already. Remembering it would open it a second
      // time, later, from wherever the person has gone since.
      rememberLink('/join/lisbon-crew', 3_000);
      expect(takeLink(4_000)).toBeNull();

      linksKnowSession(false);
      rememberLink('/join/lisbon-crew', 5_000);
      expect(takeLink(6_000)).toBe('/join/lisbon-crew');
    } finally {
      linksKnowSession(false);
    }
  });

  it('takes web addresses only from the address the build answers to, when it has one', () => {
    // A build with EXPO_PUBLIC_LINK_HOST=go.homeport.app
    expect(screenFor('https://go.homeport.app/join/the-linds', 'go.homeport.app')).toBe('/join/the-linds');
    expect(screenFor('https://GO.homeport.app/join/the-linds', 'go.homeport.app')).toBe('/join/the-linds');
    expect(screenFor('https://elsewhere.example/join/the-linds', 'go.homeport.app')).toBe('https://elsewhere.example/join/the-linds');
    // A path without an address (the app's own) is taken as before.
    expect(screenFor('/join/the-linds', 'go.homeport.app')).toBe('/join/the-linds');
    // A build that claims no address: nothing changes.
    expect(screenFor('https://elsewhere.example/join/the-linds', null)).toBe('/join/the-linds');
  });
});

describe('links people read and copy', () => {
  it('shows an address without the parts nobody reads', () => {
    expect(shortLink('https://homeport.app/join/the-linds')).toBe('homeport.app/join/the-linds');
    expect(shortLink('http://localhost:8080/')).toBe('localhost:8080');
  });

  it('says whether copying worked', async () => {
    await expect(copyText('https://homeport.app/join/the-linds')).resolves.toBe(true);
  });
});
