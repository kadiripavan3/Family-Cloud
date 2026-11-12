import { ApiError } from '@/api/fetcher';
import { sendChecklistChanges, sendPageChanges } from '@/api/generated/homeport';
import { checklist, page } from '@/test/samples';

import { howItFailed, MOST_AT_ONCE, MOST_BYTES, nextPart, sendChanges } from '../send';
import type { Change, Target } from '../types';
import { refOf } from '../types';

jest.mock('@/api/generated/homeport', () => ({ sendChecklistChanges: jest.fn(), sendPageChanges: jest.fn() }));

const list: Target = { kind: 'checklist', id: 'l-1' };
const wifi: Target = { kind: 'page', id: 'p-1' };
const tick = (itemId: string, seq = 1): Change => ({ key: `k-${itemId}`, owner: 'nora', target: list, seq, at: '2026-11-12T10:00:00.000Z', body: { op: 'change', itemId, change: { done: true } } });

describe('sending a part of a queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends a list's changes to the list's route, exactly as they were made, and brings back each answer and the list", async () => {
    const now = checklist();
    jest.mocked(sendChecklistChanges).mockResolvedValue({ answers: [{ outcome: 'done', itemId: 'i-1' }, { outcome: 'gone', itemId: 'i-2', said: 'That line was removed while you were away, so there was nothing to change.' }], list: now });
    const part = [tick('i-1'), tick('i-2', 2), { ...tick('i-3', 3), body: { op: 'add' as const, add: { clientId: 'c-1', text: 'Eggs' } } }];
    const sent = await sendChanges(list, part);
    expect(sendChecklistChanges).toHaveBeenCalledWith('l-1', { changes: [part[0]!.body, part[1]!.body, part[2]!.body] });
    expect(sent.answers).toEqual([
      { outcome: 'done', id: 'i-1', said: null },
      { outcome: 'gone', id: 'i-2', said: 'That line was removed while you were away, so there was nothing to change.' },
      // An answer the API left out counts as done: it answers every change it took.
      { outcome: 'done', id: null, said: null },
    ]);
    expect(sent.now).toBe(now);
  });

  it("sends a page's changes to the page's route", async () => {
    const now = page();
    jest.mocked(sendPageChanges).mockResolvedValue({ answers: [{ outcome: 'refused', blockId: 'b-1', said: 'That is too long for one block.' }], page: now });
    const change: Change = { key: 'k', owner: 'nora', target: wifi, seq: 1, at: '2026-11-12T10:00:00.000Z', body: { op: 'change', blockId: 'b-1', change: { text: 'x' } } };
    const sent = await sendChanges(wifi, [change]);
    expect(sendPageChanges).toHaveBeenCalledWith('p-1', { changes: [change.body] });
    expect(sent).toEqual({ answers: [{ outcome: 'refused', id: 'b-1', said: 'That is too long for one block.' }], now });
  });

  it('takes the oldest changes first, as many as go in one request, and always at least one', () => {
    const many = Array.from({ length: 130 }, (_, index) => tick(`i-${index}`, index));
    expect(nextPart(many).map((change) => change.key)).toEqual(many.slice(0, MOST_AT_ONCE).map((change) => change.key));
    expect(nextPart(many, 1)).toEqual([many[0]]);
    expect(nextPart([])).toEqual([]);
    const huge: Change = { ...tick('big'), body: { op: 'change', itemId: 'big', change: { note: 'x'.repeat(MOST_BYTES + 10) } } };
    expect(nextPart([huge, tick('i-1')])).toEqual([huge]);
    expect(nextPart([tick('i-1'), huge, tick('i-2')])).toEqual([tick('i-1')]);
  });

  it('counts letters by the room they take on the way, not by how many there are', () => {
    const text = (letter: string) => ({ ...tick('i'), body: { op: 'change' as const, itemId: 'i', change: { note: letter.repeat(300) } } });
    // Three hundred letters of one byte each fit a hundred times; of four bytes each, far fewer.
    expect(nextPart(Array.from({ length: 100 }, () => text('a')))).toHaveLength(100);
    expect(nextPart(Array.from({ length: 100 }, () => text('😀'))).length).toBeLessThan(40);
  });

  it('names the line or block a change is about', () => {
    expect(refOf(tick('i-1'))).toBe('i-1');
    expect(refOf({ target: list, body: { op: 'add', add: { clientId: 'c-1', text: 'Eggs' } } })).toBe('c-1');
    expect(refOf({ target: wifi, body: { op: 'remove', blockId: 'b-1' } })).toBe('b-1');
    expect(refOf({ target: wifi, body: { op: 'remove' } })).toBeNull();
  });
});

describe('how a failed try is treated', () => {
  it.each([
    [new ApiError(0, 'unreachable', 'nothing answered'), 'unreachable'],
    [new ApiError(500, 'server', 'stumbled'), 'later'],
    [new ApiError(503, 'busy', 'being updated'), 'later'],
    [new ApiError(429, 'slow_down', 'too many'), 'later'],
    [new ApiError(408, 'timeout', 'too slow'), 'later'],
    [new ApiError(401, 'unauthorized', 'sign in again'), 'later'],
    [new ApiError(404, 'not_found', "isn't there"), 'gone'],
    [new ApiError(403, 'view_only', 'look, not change'), 'gone'],
    [new ApiError(410, 'gone', 'gone'), 'gone'],
    [new ApiError(400, 'invalid_input', 'no'), 'refused'],
    [new ApiError(413, 'too_large', 'too big'), 'refused'],
    [new ApiError(409, 'list_full', 'full'), 'refused'],
    [new Error('a bug of our own'), 'refused'],
  ])('%p is "%s"', (error, how) => {
    expect(howItFailed(error)).toBe(how);
  });
});
