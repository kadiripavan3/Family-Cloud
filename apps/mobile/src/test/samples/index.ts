import type { MeResponse, ProfileResponse, SettingsResponse } from '@/api/generated/homeport';

/** Made-up people and answers for tests: whole objects, the way the API sends them. */

export const nora: ProfileResponse = { id: 'p-nora', displayName: 'Nora Lind', avatarUrl: null };

/** Who is signed in: Nora, with her profile unless another one (or none) is given. */
export function me(profile: ProfileResponse | null = nora): MeResponse {
  return { id: 'a-nora', email: 'nora@example.com', profile };
}

export function settings(over: Partial<SettingsResponse> = {}): SettingsResponse {
  return { notifyActivity: true, weeklySummary: true, summaryEmail: false, ...over };
}

/** What a generated `use…` query hook gives a screen, for a mock: loaded with `data`, or still on its way. */
export function loaded<T>(data: T) {
  return { data, isPending: false, isError: false, error: null, isFetching: false, isRefetching: false, isPaused: false, refetch: jest.fn() };
}
export function pending() {
  return { data: undefined, isPending: true, isError: false, error: null, isFetching: true, isRefetching: false, isPaused: false, refetch: jest.fn() };
}
export function failed(error: unknown) {
  return { data: undefined, isPending: false, isError: true, error, isFetching: false, isRefetching: false, isPaused: false, refetch: jest.fn() };
}

// The spine's own made-up answers (circles, their people, things): every test can use them.
export * from './spine';
