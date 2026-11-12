import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { readLine } from '@/api/generated/homeport';
import { newClient } from '@/test/phone';
import { eggsRead, readItem, reading } from '@/test/samples/jot';

import { READ_AFTER_MS, useReading } from '../useReading';

jest.mock('@/api/generated/homeport', () => ({ readLine: jest.fn() }));

const client = newClient();
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
/** Lets a moment pass, and everything that was waiting for it happen. */
const turn = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
/** Lets a moment pass, and then what follows from it: the words are settled, the API is asked, its answer is drawn. */
const pass = async (ms: number) => {
  await turn(ms);
  await turn(0);
  await turn(0);
};

describe('how a line is read while it is typed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    client.clear();
    jest.mocked(readLine).mockImplementation(async (_circle, { text }) => reading([readItem({ title: text })]));
  });
  afterEach(() => jest.useRealTimers());

  it('asks a short moment after the last key, once, with the day and the time zone of the phone', async () => {
    const hook = await renderHook(({ text }: { text: string }) => useReading('c-linds', text), { wrapper, initialProps: { text: '' } });
    expect(hook.result.current).toEqual({ reading: undefined, isReading: false, error: null });

    // Fast fingers: every key starts the moment again.
    for (const text of ['m', 'mi', 'mil', 'milk']) {
      await hook.rerender({ text });
      await pass(READ_AFTER_MS - 100);
    }
    expect(readLine).not.toHaveBeenCalled();
    expect(hook.result.current.isReading).toBe(true);

    await pass(150);
    expect(readLine).toHaveBeenCalledTimes(1);
    expect(jest.mocked(readLine).mock.calls[0]!.slice(0, 2)).toEqual(['c-linds', { text: 'milk', day: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), timeZone: expect.any(String) }]);
    expect(hook.result.current.reading?.items[0]?.title).toBe('milk');
    expect(hook.result.current.isReading).toBe(false);
  });

  it('keeps the last reading while the next is on its way, and has none for no words', async () => {
    const hook = await renderHook(({ text }: { text: string }) => useReading('c-linds', text), { wrapper, initialProps: { text: 'milk' } });
    await pass(READ_AFTER_MS + 50);
    expect(hook.result.current.reading?.items[0]?.title).toBe('milk');

    await hook.rerender({ text: 'milk and eggs' });
    expect(hook.result.current.reading?.items[0]?.title).toBe('milk');
    await pass(READ_AFTER_MS + 50);
    expect(hook.result.current.reading?.items[0]?.title).toBe('milk and eggs');

    // Spaces around the words change nothing, and are not read again.
    await hook.rerender({ text: ' milk and eggs ' });
    await pass(READ_AFTER_MS + 50);
    expect(readLine).toHaveBeenCalledTimes(2);

    await hook.rerender({ text: '  ' });
    expect(hook.result.current).toEqual({ reading: undefined, isReading: false, error: null });
  });

  it("says when the line couldn't be read", async () => {
    jest.mocked(readLine).mockRejectedValue(new Error('offline'));
    const hook = await renderHook(({ text }: { text: string }) => useReading('c-linds', text), { wrapper, initialProps: { text: 'milk' } });
    await pass(READ_AFTER_MS + 50);
    expect(hook.result.current.reading).toBeUndefined();
    expect(hook.result.current.error).toBeInstanceOf(Error);
    expect(eggsRead.title).toBe('Eggs');
  });
});
