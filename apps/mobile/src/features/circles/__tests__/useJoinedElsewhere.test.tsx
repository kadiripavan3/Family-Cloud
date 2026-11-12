import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useGetCircles } from '@/api/generated/homeport';
import { newClient } from '@/test/phone';
import { linds } from '@/test/samples';

import { useJoinedElsewhere } from '../useJoinedElsewhere';

const KEY = ['/v1/circles'];
let mockPath = '/setup';
const mockFinish = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { usePathname: () => mockPath, useFocusEffect: (run: () => void) => useEffect(run, [run]) };
});
jest.mock('../useFinishSetup', () => ({ useFinishSetup: () => mockFinish }));
jest.mock('@/api/generated/homeport', () => ({ useGetCircles: jest.fn(), getGetCirclesQueryKey: () => ['/v1/circles'] }));

const refetch = jest.fn();
const asked = jest.mocked(useGetCircles) as unknown as jest.Mock;

/** The setup screens, for someone the app remembers as being in these circles. */
async function setup(remembered: unknown[] | undefined) {
  const client = newClient();
  if (remembered) client.setQueryData(KEY, remembered);
  const view = await renderHook(() => useJoinedElsewhere(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { client, view };
}

describe('someone who got into a circle elsewhere while the setup screens were open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPath = '/setup';
    refetch.mockResolvedValue({ data: [] });
    asked.mockReturnValue({ refetch });
  });

  it('asks for the circles again when the setup screens come to the front, and stays while there is none', async () => {
    await setup([]);
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('goes Home when the answer holds a circle', async () => {
    refetch.mockResolvedValue({ data: [linds] });
    await setup([]);
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));
  });

  it('asks again when the app itself comes back to the front', async () => {
    await setup([]);
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    refetch.mockResolvedValue({ data: [linds] });
    await act(async () => focusManager.setFocused(true));
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));
    // Put away: nothing is asked.
    refetch.mockClear();
    await act(async () => focusManager.setFocused(false));
    expect(refetch).not.toHaveBeenCalled();
    focusManager.setFocused(undefined);
  });

  it('leaves someone alone who is in a circle already and came to make another', async () => {
    await setup([linds]);
    expect(refetch).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('leaves the later steps alone: the circle they are about was made right here', async () => {
    mockPath = '/setup/people';
    refetch.mockResolvedValue({ data: [linds] });
    await setup([]);
    expect(refetch).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('does not go Home when the person moved on to the next step while the answer was on its way', async () => {
    let answer: (value: { data: unknown[] }) => void = () => undefined;
    refetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { view } = await setup([]);
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    mockPath = '/setup/people';
    await view.rerender({});
    await act(async () => answer({ data: [linds] }));
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('asks nothing while the circles are not known at all', async () => {
    await setup(undefined);
    expect(refetch).not.toHaveBeenCalled();
  });
});
