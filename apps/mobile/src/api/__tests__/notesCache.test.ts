import { cacheFor } from '@/api/cache';
import { getGetChecklistQueryKey, getGetFolderQueryKey, getGetPageQueryKey } from '@/api/generated/homeport';
import { newClient } from '@/test/phone';
import { checklist, item } from '@/test/samples';
import { block, dropsList, folder, note, notesHome, wifiPage } from '@/test/samples/notes';

/** Whether an answer has to be asked for again. */
const stale = (client: ReturnType<typeof newClient>, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated ?? false;

describe("what Notes does to what the app has loaded", () => {
  const notesKey = ['/v1/circles/c-linds/notes'];
  const itemsKey = ['/v1/folders/f-home/items', 'infinite'];
  const todayKey = ['/v1/circles/c-linds/today'];

  function loadedApp() {
    const client = newClient();
    client.setQueryData(notesKey, notesHome());
    client.setQueryData(itemsKey, { pages: [{ items: [note({ id: 'n-1', pinned: false })], nextCursor: null }], pageParams: [undefined] });
    client.setQueryData(todayKey, { day: '2026-11-12' });
    return client;
  }

  it('shows the list the API sent back everywhere it is drawn: on its own screen and inside each page', async () => {
    const client = loadedApp();
    client.setQueryData(getGetChecklistQueryKey(dropsList.id), dropsList);
    client.setQueryData(getGetPageQueryKey('p-wifi'), wifiPage({ id: 'p-wifi' }));
    const now = { ...dropsList, version: 'v2', left: 0, done: 2, items: dropsList.items.map((line) => ({ ...line, done: true })) };
    await cacheFor(client).listSent(dropsList.id, now);
    expect(client.getQueryData(getGetChecklistQueryKey(dropsList.id))).toEqual(now);
    const drawn = client.getQueryData<ReturnType<typeof wifiPage>>(getGetPageQueryKey('p-wifi'))!.blocks.find((one) => one.kind === 'checklist');
    expect(drawn!.checklist).toEqual(now);
    // What only shows its counts is asked for again; the list itself has just been read.
    expect(stale(client, notesKey)).toBe(true);
    expect(stale(client, itemsKey)).toBe(true);
    expect(stale(client, todayKey)).toBe(true);
    expect(stale(client, getGetChecklistQueryKey(dropsList.id))).toBe(false);
  });

  it('drops an answer about the list that was on its way from before the change', async () => {
    const client = loadedApp();
    const key = getGetChecklistQueryKey(dropsList.id);
    client.setQueryData(key, dropsList);
    let late!: (value: typeof dropsList) => void;
    const asking = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<typeof dropsList>((resolve) => (late = resolve)), staleTime: 0 }).catch(() => undefined);
    const now = { ...dropsList, version: 'v2' };
    await cacheFor(client).listSent(dropsList.id, now);
    late({ ...dropsList, version: 'older' });
    await asking;
    expect(client.getQueryData<typeof dropsList>(key)!.version).toBe('v2');
  });

  it('asks for the list again when the API sent nothing back with its answer', async () => {
    const client = loadedApp();
    client.setQueryData(getGetChecklistQueryKey('l-1'), checklist({ id: 'l-1' }));
    await cacheFor(client).listSent('l-1', undefined);
    expect(stale(client, getGetChecklistQueryKey('l-1'))).toBe(true);
  });

  it('shows the page the API sent back, and asks its lists again', async () => {
    const client = loadedApp();
    client.setQueryData(getGetPageQueryKey('p-wifi'), wifiPage({ id: 'p-wifi' }));
    const now = wifiPage({ id: 'p-wifi', version: 'v2', blocks: [block({ id: 'b-new', text: 'New words' })] });
    await cacheFor(client).pageSent('p-wifi', now);
    expect(client.getQueryData(getGetPageQueryKey('p-wifi'))).toEqual(now);
    expect(stale(client, notesKey)).toBe(true);
    expect(stale(client, itemsKey)).toBe(true);
  });

  it('says at once that something is pinned, on every loaded copy, and asks for the pins again', async () => {
    const client = loadedApp();
    client.setQueryData(getGetChecklistQueryKey('n-1'), checklist({ id: 'n-1', pinned: false, items: [item()] }));
    await cacheFor(client).notePinned({ id: 'n-1', circleId: 'c-linds' }, true);
    expect(client.getQueryData<ReturnType<typeof checklist>>(getGetChecklistQueryKey('n-1'))!.pinned).toBe(true);
    const rows = client.getQueryData<{ pages: { items: ReturnType<typeof note>[] }[] }>(itemsKey)!.pages[0]!.items;
    expect(rows[0]!.pinned).toBe(true);
    expect(stale(client, notesKey)).toBe(true);
    expect(stale(client, todayKey)).toBe(false);
  });

  it('writes a renamed folder over every copy', async () => {
    const client = loadedApp();
    client.setQueryData(getGetFolderQueryKey('f-home'), folder());
    const cache = cacheFor(client);
    const renamed = folder({ title: 'House' });
    await cache.folderSaved(renamed);
    expect(client.getQueryData(getGetFolderQueryKey('f-home'))).toEqual(renamed);
    expect(client.getQueryData<ReturnType<typeof notesHome>>(notesKey)!.spaces![0]!.title).toBe('House');

  });

  it.each(['noteMade', 'noteFiled', 'noteGone', 'insideShared'] as const)('asks the shelves again after %s', async (what) => {
    const client = loadedApp();
    const cache = cacheFor(client);
    await (what === 'noteMade' ? cache.noteMade('c-linds') : cache[what]({ id: 'n-1', circleId: 'c-linds' }));
    expect(stale(client, itemsKey)).toBe(true);
    expect(stale(client, notesKey)).toBe(true);
  });
});
