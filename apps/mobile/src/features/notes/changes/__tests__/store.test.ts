import { changeStore } from '../store.web';
import type { Change } from '../types';

const change = (key: string, owner: string, seq: number): Change => ({ key, owner, seq, target: { kind: 'checklist', id: 'l-1' }, at: '2026-11-12T10:00:00.000Z', body: { op: 'change', itemId: key, change: { done: true } } });

describe("waiting changes in a browser's own storage", () => {
  const kept = new Map<string, string>();
  beforeEach(() => {
    kept.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value), removeItem: (key: string) => void kept.delete(key) },
    });
  });

  it("keeps a person's changes in the order they were made, and nobody else's with them", async () => {
    await changeStore.save(change('b', 'nora', 2));
    await changeStore.save(change('a', 'nora', 1));
    await changeStore.save(change('x', 'alex', 3));
    expect((await changeStore.load('nora')).map((one) => one.key)).toEqual(['a', 'b']);
    expect((await changeStore.load('alex')).map((one) => one.key)).toEqual(['x']);
    expect(await changeStore.load('nobody')).toEqual([]);
  });

  it('writes a change again under the same name, takes changes away, and forgets a whole account', async () => {
    await changeStore.save(change('a', 'nora', 1));
    await changeStore.save({ ...change('a', 'nora', 1), body: { op: 'change', itemId: 'item-7', change: { done: true } } });
    await changeStore.save(change('b', 'nora', 2));
    await changeStore.save(change('x', 'alex', 3));
    expect((await changeStore.load('nora')).map((one) => one.body)).toEqual([
      { op: 'change', itemId: 'item-7', change: { done: true } },
      { op: 'change', itemId: 'b', change: { done: true } },
    ]);
    await changeStore.remove(['a']);
    await changeStore.remove([]);
    expect((await changeStore.load('nora')).map((one) => one.key)).toEqual(['b']);
    await changeStore.removeAll('nora');
    expect(await changeStore.load('nora')).toEqual([]);
    expect((await changeStore.load('alex')).map((one) => one.key)).toEqual(['x']);
  });

  it('starts empty when what it kept cannot be read, and goes on when the storage is full', async () => {
    kept.set('homeport.changes.v1', 'not a list {');
    expect(await changeStore.load('nora')).toEqual([]);
    kept.set('homeport.changes.v1', '{"a":1}');
    expect(await changeStore.load('nora')).toEqual([]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('full');
        },
      },
    });
    await expect(changeStore.save(change('a', 'nora', 1))).resolves.toBeUndefined();
  });
});
