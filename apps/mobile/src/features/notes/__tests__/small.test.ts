import { ApiError } from '@/api/fetcher';
import { newClient } from '@/test/phone';
import { checklist, item } from '@/test/samples';

import { centsFrom, typedFrom } from '../amounts';
import { underHeadings } from '../list';
import { askAgain } from '../live';
import { paged, rows } from '../pages';
import { isRecent, shortAgo } from '../when';

describe('an amount, as it is typed', () => {
  it('is read as whole cents', () => {
    expect(centsFrom('45')).toBe(4500);
    expect(centsFrom('4.50')).toBe(450);
    expect(centsFrom('4,5')).toBe(450);
    expect(centsFrom('€ 12')).toBe(1200);
    expect(centsFrom('0.07')).toBe(7);
  });

  it('is nothing when nothing is typed, and unreadable when it is no amount', () => {
    expect(centsFrom('')).toBeNull();
    expect(centsFrom('   ')).toBeNull();
    for (const wrong of ['about ten', '1.234', '4.5.6', '-3', '12345678901']) expect(centsFrom(wrong)).toBeUndefined();
  });

  it('is written back into the box the way it is typed', () => {
    expect(typedFrom(4500)).toBe('45');
    expect(typedFrom(4550)).toBe('45.50');
    expect(typedFrom(7)).toBe('0.07');
    expect(typedFrom(null)).toBe('');
  });
});

describe('how long ago, as short as it gets', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  it('counts minutes, then hours, then days', () => {
    expect(shortAgo('2026-11-12T11:59:50Z', now)).toBe('1m');
    expect(shortAgo('2026-11-12T11:35:00Z', now)).toBe('25m');
    expect(shortAgo('2026-11-12T10:00:00Z', now)).toBe('2h');
    expect(shortAgo('2026-11-09T12:00:00Z', now)).toBe('3d');
  });

  it('knows what happened in the last while', () => {
    expect(isRecent('2026-11-12T11:30:00Z', 60 * 60 * 1000, now)).toBe(true);
    expect(isRecent('2026-11-12T10:30:00Z', 60 * 60 * 1000, now)).toBe(false);
    expect(isRecent(null, 60 * 60 * 1000, now)).toBe(false);
  });
});

describe("a list's lines under their headings", () => {
  const list = checklist({
    sections: [{ name: 'Fridge' }, { name: '' }, { name: 'Other' }],
    items: [item({ id: '1', section: 'Fridge' }), item({ id: '2', section: '' }), item({ id: '3', section: 'Other', done: true }), item({ id: '4', section: 'Fridge', done: true }), item({ id: '5', section: 'New on the phone' })],
  });

  it('stand in the order the list gives its headings, the lines under no heading first, a new heading last', () => {
    expect(underHeadings(list).map((group) => [group.heading, group.items.map((one) => one.id)])).toEqual([
      ['', ['2']],
      ['Fridge', ['1', '4']],
      ['Other', ['3']],
      ['New on the phone', ['5']],
    ]);
  });

  it('leave the ticked lines out when the person hides them, and a heading with nothing left under it', () => {
    expect(underHeadings(list, false).map((group) => [group.heading, group.items.map((one) => one.id)])).toEqual([
      ['', ['2']],
      ['Fridge', ['1']],
      ['New on the phone', ['5']],
    ]);
  });
});

describe('asking again with the version the phone has', () => {
  const key = ['/v1/checklists/l-1'];
  const signal = new AbortController().signal;

  it('asks plainly the first time', async () => {
    const client = newClient();
    const ask = jest.fn(async () => checklist({ version: 'v1' }));
    await askAgain(client, key, ask)({ signal });
    expect(ask).toHaveBeenCalledWith({ signal });
  });

  it('sends the version it has in double quotes, and takes the new answer when there is one', async () => {
    const client = newClient();
    client.setQueryData(key, checklist({ version: '15.1793424923120499.2' }));
    const next = checklist({ version: '16.1793424923120999.2' });
    const ask = jest.fn(async () => next);
    await expect(askAgain(client, key, ask)({ signal })).resolves.toBe(next);
    expect(ask).toHaveBeenCalledWith({ signal, headers: { 'If-None-Match': '"15.1793424923120499.2"' } });
  });

  it('keeps exactly the answer it has when the API says nothing changed', async () => {
    const client = newClient();
    const have = checklist({ version: 'v7' });
    client.setQueryData(key, have);
    const same = jest.fn(async () => {
      throw new ApiError(304, 'error', 'Something went wrong on our side. Try again.');
    });
    await expect(askAgain(client, key, same)({ signal })).resolves.toBe(have);
  });

  it('fails like any other request when something else went wrong', async () => {
    const client = newClient();
    client.setQueryData(key, checklist({ version: 'v7' }));
    const gone = new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.");
    await expect(
      askAgain(client, key, async () => {
        throw gone;
      })({ signal }),
    ).rejects.toBe(gone);
    // "Nothing changed" with nothing to keep is no answer at all.
    await expect(
      askAgain(newClient(), key, async () => {
        throw new ApiError(304, 'error', 'x');
      })({ signal }),
    ).rejects.toMatchObject({ status: 304 });
  });
});

describe("Notes' own paged lists", () => {
  it('ask for the next page with the cursor the last one handed out, and stop when there is none', () => {
    expect(paged.getNextPageParam({ nextCursor: 'abc' })).toBe('abc');
    expect(paged.getNextPageParam({ nextCursor: null })).toBeUndefined();
    expect(paged.getNextPageParam({})).toBeUndefined();
  });

  it('show every row once, in order, also when one came twice', () => {
    expect(rows(undefined)).toBeUndefined();
    expect(rows({ pages: [{ items: [{ id: 'a' }, { id: 'b' }] }, { items: [{ id: 'b' }, { id: 'c' }] }, {}], pageParams: [] })).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});
