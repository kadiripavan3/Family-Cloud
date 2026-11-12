import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import AppearanceSettings from '@/app/(app)/settings/appearance';
import DeleteAccount from '@/app/(app)/settings/delete-account';
import NotificationSettings from '@/app/(app)/settings/notifications';
import { onPhone } from '@/test/phone';
import { settings } from '@/test/samples';
import { setAppearance } from '@/theme/appearance';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, canDismiss: () => false, dismissAll: jest.fn(), navigate: jest.fn() };
const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', signOut: mockSignOut }) }));
jest.mock('@/features/notifications/support', () => ({ pushSupport: () => 'browser' }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(() => Promise.resolve()), getItemAsync: jest.fn(() => Promise.resolve(null)) }));

/** The API, as far as these pages go: what it answers to each call, and what it was sent. */
const api = { answers: new Map<string, () => Response>(), sent: [] as { call: string; body: unknown }[] };
const answer = (call: string, status: number, body?: unknown) => api.answers.set(call, () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
const DOWN = () => {
  throw new TypeError('Network request failed');
};
const CANT_REACH = "Can't reach Homeport right now. Check your connection and try again.";

let client: QueryClient;
const page = (ui: ReactElement) => onPhone(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  api.answers.clear();
  api.sent = [];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const call = `${init?.method ?? 'GET'} ${url.replace('http://api.test', '')}`;
    api.sent.push({ call, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return (api.answers.get(call) ?? DOWN)();
  }) as unknown as typeof fetch;
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
});

describe('Notification settings', () => {
  it('has a switch for what happens in your circles and two for the Sunday summary, and says where notifications arrive', async () => {
    answer('GET /v1/me/settings', 200, settings({ summaryEmail: false }));
    await render(page(<NotificationSettings />));
    expect(await screen.findByRole('switch', { name: 'What happens in your circles' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'The Sunday summary' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Also send it by email' })).not.toBeChecked();
    expect(screen.getByText('Notifications arrive on your phone. In the browser, everything new shows in Activity.')).toBeOnTheScreen();
  });

  it('shows a change at once, sends only what changed, and keeps what the API sends back', async () => {
    answer('GET /v1/me/settings', 200, settings());
    answer('PUT /v1/me/settings', 200, settings({ weeklySummary: false }));
    await render(page(<NotificationSettings />));
    await userEvent.setup().press(await screen.findByRole('switch', { name: 'The Sunday summary' }));
    expect(screen.getByRole('switch', { name: 'The Sunday summary' })).not.toBeChecked();
    await waitFor(() => expect(api.sent).toContainEqual({ call: 'PUT /v1/me/settings', body: { weeklySummary: false } }));
    await waitFor(() => expect(client.getQueryData(['/v1/me/settings'])).toEqual(settings({ weeklySummary: false })));
    // What came back is what is shown; the settings are not asked for a second time.
    expect(api.sent.filter((sent) => sent.call === 'GET /v1/me/settings')).toHaveLength(1);
  });

  it('puts the switch back and says why when the change could not be saved', async () => {
    answer('GET /v1/me/settings', 200, settings());
    await render(page(<NotificationSettings />));
    await userEvent.setup().press(await screen.findByRole('switch', { name: 'What happens in your circles' }));
    expect(await screen.findByText(CANT_REACH)).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'What happens in your circles' })).toBeChecked();
  });

  it('says what went wrong when the settings did not load, with a way to try again and its Back button still there', async () => {
    answer('GET /v1/me/settings', 500, { code: 'error', detail: 'Something went wrong on our side. Try again.' });
    await render(page(<NotificationSettings />));
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();

    answer('GET /v1/me/settings', 200, settings());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('switch', { name: 'The Sunday summary' })).toBeOnTheScreen();
  });
});

describe('Appearance', () => {
  it('offers automatic, light and dark, and changes the whole app at once', async () => {
    setAppearance('system');
    await render(page(<AppearanceSettings />));
    for (const choice of ['Automatic. Follows your phone', 'Light. Always light', 'Dark. Always dark']) expect(screen.getByRole('button', { name: choice })).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Dark. Always dark' }));
    // The page itself is drawn in the dark theme now.
    const { themeFor } = jest.requireActual<typeof import('@/theme')>('@/theme');
    const { StyleSheet } = jest.requireActual<typeof import('react-native')>('react-native');
    expect(StyleSheet.flatten(screen.getByText('Appearance').props.style).color).toBe(themeFor('dark').colors.text);
    setAppearance('system');
  });
});

describe('Delete account', () => {
  it('says what goes, in one sentence, and offers the way out as plainly as the way on', async () => {
    await render(page(<DeleteAccount />));
    expect(screen.getByRole('header', { name: 'Delete your account?' })).toBeOnTheScreen();
    expect(screen.getByText("This can't be undone. Your profile and everything you keep in Homeport are removed for good.")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep my account' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(api.sent).toEqual([]);
  });

  it('deletes the account, signs the person out and forgets what was loaded for them', async () => {
    // Only Homeport: the sign-in is shared with Journey and is left alone unless the person asks for both.
    answer('DELETE /v1/me?journeyToo=false', 200, { signIn: 'kept', message: '' });
    client.setQueryData(['/v1/me'], { id: 'a-nora' });
    await render(page(<DeleteAccount />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(api.sent.map((sent) => sent.call)).toEqual(['DELETE /v1/me?journeyToo=false']);
    await waitFor(() => expect(client.getQueryData(['/v1/me'])).toBeUndefined());
  });

  it('says why when the account could not be deleted, and stays signed in', async () => {
    await render(page(<DeleteAccount />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText(CANT_REACH)).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
