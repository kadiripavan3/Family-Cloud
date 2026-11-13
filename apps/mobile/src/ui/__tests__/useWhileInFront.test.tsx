import { renderHook } from '@testing-library/react-native';

import { useWhileInFront } from '../useWhileInFront';

let mockInFront = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockInFront }));

describe('what a list shows while another screen lies over it', () => {
  beforeEach(() => {
    mockInFront = true;
  });

  it('follows what it is given while its screen is in front', async () => {
    const first = ['a', 'b'];
    const second = ['a'];
    const { result, rerender } = await renderHook(({ rows }: { rows: string[] }) => useWhileInFront(rows), { initialProps: { rows: first } });
    expect(result.current).toBe(first);
    await rerender({ rows: second });
    expect(result.current).toBe(second);
  });

  it('keeps what it had while covered, and lets go when its screen is in front again', async () => {
    const first = ['a', 'b'];
    const second = ['a'];
    const { result, rerender } = await renderHook(({ rows }: { rows: string[] }) => useWhileInFront(rows), { initialProps: { rows: first } });
    mockInFront = false;
    await rerender({ rows: second });
    expect(result.current).toBe(first);
    mockInFront = true;
    await rerender({ rows: second });
    expect(result.current).toBe(second);
  });
});
