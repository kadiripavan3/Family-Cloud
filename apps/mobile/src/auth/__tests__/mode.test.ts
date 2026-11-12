import { authModeFor } from '../mode';

describe('which sign-in a build uses', () => {
  it('does what the build setting says', () => {
    expect(authModeFor('supabase', true, 'ios')).toBe('supabase');
    expect(authModeFor('local', false, 'ios')).toBe('local');
  });

  it('never falls back to the test sign-in in a built app for a phone', () => {
    expect(authModeFor(undefined, false, 'ios')).toBe('supabase');
    expect(authModeFor(undefined, false, 'android')).toBe('supabase');
    expect(authModeFor('', false, 'ios')).toBe('supabase');
    expect(authModeFor('Local', false, 'android')).toBe('supabase'); // a setting it doesn't know is no setting
  });

  it('uses the test sign-in while developing and in the browser preview, where nothing is released', () => {
    expect(authModeFor(undefined, true, 'ios')).toBe('local');
    expect(authModeFor(undefined, false, 'web')).toBe('local');
  });
});
