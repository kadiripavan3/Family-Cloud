import type { BoardResponse } from '@/api/generated/homeport';

/**
 * What every test of a template's screen needs around it: the address, the router, the cache, the circle,
 * and the API's calls as mocks. A test file can't share `jest.mock` lines, so each one writes them out; this
 * file holds what they hand over, so the lines stay short and the same everywhere:
 *
 *     jest.mock('expo-router', () => mockBoardRouter());
 *     jest.mock('@/api/cache', () => ({ useCache: () => mockBoardCache }));
 *     jest.mock('@/api/generated/homeport', () => mockBoardApi());
 *
 * (`MealPlan.test.tsx` is the example.)
 */

/** The id every sample board has. */
export const BOARD_ID = '33333333-3333-4333-8333-333333333333';

export const mockBoardRouterState = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };

/** `expo-router`, as a board's screen uses it: it was opened at `/board/<BOARD_ID>`. */
export function mockBoardRouter() {
  return { useRouter: () => mockBoardRouterState, useLocalSearchParams: () => ({ id: BOARD_ID }), useIsFocused: () => true };
}

/** `useCache()`, with the functions a board's changes call. */
export const mockBoardCache = {
  boardSaved: jest.fn((_board: BoardResponse) => Promise.resolve()),
  boardTouched: jest.fn(() => Promise.resolve()),
  thingDeleted: jest.fn(() => Promise.resolve()),
  thingMade: jest.fn(() => Promise.resolve()),
};

/** The generated client, as far as boards use it: every call a mock for the test to answer. */
export function mockBoardApi(extra: Record<string, unknown> = {}) {
  return {
    useGetBoard: jest.fn(),
    useGetMe: jest.fn(() => ({ data: { id: 'a-nora', email: 'nora@example.com', profile: { id: 'p-nora', displayName: 'Nora Lind', avatarUrl: null } } })),
    useGetBoardEntriesInfinite: jest.fn(),
    addBoardEntry: jest.fn(),
    changeBoardEntry: jest.fn(),
    removeBoardEntry: jest.fn(),
    actOnBoard: jest.fn(),
    changeBoard: jest.fn(),
    deleteThing: jest.fn(),
    startUpload: jest.fn(),
    completeUpload: jest.fn(),
    ...extra,
  };
}
