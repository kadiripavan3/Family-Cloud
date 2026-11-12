import { Linking, Platform } from 'react-native';

import { openInJourney } from '../open';

describe('opening the Journey app', () => {
  const platform = Platform.OS;
  const on = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    on(platform);
    jest.restoreAllMocks();
  });

  it('opens the link on a phone that has Journey', async () => {
    on('ios');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openInJourney('journey://journey/abc')).resolves.toBe('opened');
    expect(open).toHaveBeenCalledWith('journey://journey/abc');
  });

  it('says the app is missing when the phone refuses the link, or there is no link', async () => {
    on('android');
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No Activity found'));
    await expect(openInJourney('journey://journey/abc')).resolves.toBe('missing');
    await expect(openInJourney(null)).resolves.toBe('missing');
  });

  it('never tries in a browser: there is no app to hop to', async () => {
    on('web');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openInJourney('journey://journey/abc')).resolves.toBe('browser');
    expect(open).not.toHaveBeenCalled();
  });
});
