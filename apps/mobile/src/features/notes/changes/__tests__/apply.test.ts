import type { LateBlockChange, LateLineChange } from '@/api/generated/homeport';
import { block, groceries, miaBrief, noraBrief, routerPhoto, wifiPage, brief } from '@/test/samples/notes';

import { listWithWaiting, type People, pageWithWaiting, steadyKeys } from '../apply';
import type { Change, Target } from '../types';

const list: Target = { kind: 'checklist', id: 'groceries' };
const page: Target = { kind: 'page', id: 'wifi' };
let seq = 0;
const change = (target: Target, body: LateLineChange | LateBlockChange, more: Partial<Change> = {}): Change => ({ key: `k${(seq += 1)}`, owner: 'nora', target, seq, at: '2026-11-12T10:00:00.000Z', body, ...more });
const line = (body: LateLineChange) => change(list, body);
const part = (body: LateBlockChange, more: Partial<Change> = {}) => change(page, body, more);
const people: People = { me: noraBrief, of: (id) => (id === 'm-mia' ? miaBrief : null) };
const over = (changes: Change[], aliases: Record<string, string> = {}) => ({ changes, aliases });

describe('a list with the changes that wait laid over it', () => {
  it('is the list itself while nothing waits', () => {
    const loaded = groceries();
    const shown = listWithWaiting(loaded, over([]), people);
    expect(shown.list).toBe(loaded);
    expect(shown.waiting.size).toBe(0);
  });

  it('ticks and unticks, says who did it, and counts again', () => {
    const shown = listWithWaiting(
      groceries(),
      over([line({ op: 'change', itemId: 'i-bananas', change: { done: true } }), line({ op: 'change', itemId: 'i-berries', change: { done: true } }), line({ op: 'change', itemId: 'i-butter', change: { done: false } })]),
      people,
    );
    const by = Object.fromEntries(shown.list.items.map((item) => [item.id, item]));
    expect(by['i-bananas']).toMatchObject({ done: true, doneAt: '2026-11-12T10:00:00.000Z', doneBy: noraBrief });
    expect(by['i-butter']).toMatchObject({ done: false, doneAt: null, doneBy: null });
    expect(shown.list).toMatchObject({ left: 4, done: 3 });
    expect(shown.list.sections).toEqual([
      { name: 'Fruit and veg', left: 0, done: 3, sumCents: null },
      { name: 'Fridge', left: 2, done: 0, sumCents: null },
      { name: 'Other', left: 2, done: 0, sumCents: null },
    ]);
    expect([...shown.waiting]).toEqual(['i-bananas', 'i-berries', 'i-butter']);
  });

  it('adds a line under the heading it had before, known by its clientId until the API names it', () => {
    const shown = listWithWaiting(groceries(), over([line({ op: 'add', add: { clientId: 'c1', text: '  eggs ' } }), line({ op: 'add', add: { clientId: 'c2', text: 'Oat   milk', note: ' barista ', amountCents: 250, assignedTo: 'm-mia', repeats: 'weekly', hideFrom: ['m-mia'] } })]), people);
    expect(shown.list.items.at(-2)).toMatchObject({ id: 'c1', text: 'eggs', section: 'Fridge', done: false, addedBy: noraBrief, addedAt: '2026-11-12T10:00:00.000Z' });
    // Nothing says where it belongs: it stands under no heading until the API has filed it.
    expect(shown.list.items.at(-1)).toMatchObject({ id: 'c2', text: 'Oat milk', note: 'barista', section: '', amountCents: 250, assignedTo: miaBrief, repeats: 'weekly', hiddenFrom: ['Mia'] });
    expect(shown.list).toMatchObject({ left: 7, done: 2, sumCents: 250, sumDoneCents: 0 });
    expect(shown.list.sections.map((section) => section.name)).toEqual(['Fruit and veg', 'Fridge', 'Other', '']);
    expect([...shown.waiting]).toEqual(['c1', 'c2']);
  });

  it('ticks a line that was added on the phone, by the clientId it was added with', () => {
    const shown = listWithWaiting(groceries(), over([line({ op: 'add', add: { clientId: 'c1', text: 'Eggs' } }), line({ op: 'change', itemId: 'c1', change: { done: true } })]), people);
    expect(shown.list.items.at(-1)).toMatchObject({ id: 'c1', done: true });
    expect([...shown.waiting]).toEqual(['c1']);
  });

  it('finds a line under its new id once the API has given it one, and does not draw it twice', () => {
    const answered = groceries();
    answered.items.push({ ...answered.items[0]!, id: 'item-77', text: 'Eggs', section: 'Fridge' });
    const shown = listWithWaiting(answered, over([line({ op: 'add', add: { clientId: 'c1', text: 'Eggs' } }), line({ op: 'change', itemId: 'c1', change: { done: true } })], { c1: 'item-77' }), people);
    expect(shown.list.items.filter((item) => item.text === 'Eggs')).toHaveLength(1);
    expect(shown.list.items.at(-1)).toMatchObject({ id: 'item-77', done: true });
    expect([...shown.waiting]).toEqual(['item-77']);
  });

  it('changes words, small print, amount, heading, whose job it is and who it is kept from', () => {
    const shown = listWithWaiting(
      groceries(),
      over([
        line({ op: 'change', itemId: 'i-milk', change: { text: ' Milk,  3 litres ', note: 'the blue one', amountCents: 189, section: 'Drinks', stopRepeating: true, assignedTo: 'm-mia' } }),
        line({ op: 'change', itemId: 'i-candles', change: { hideFrom: [] } }),
        line({ op: 'change', itemId: 'i-milk', change: { removeAmount: true, unassign: true } }),
      ]),
      people,
    );
    const by = Object.fromEntries(shown.list.items.map((item) => [item.id, item]));
    expect(by['i-milk']).toMatchObject({ text: 'Milk, 3 litres', note: 'the blue one', amountCents: null, section: 'Drinks', repeats: null, assignedTo: null });
    expect(by['i-candles']!.hiddenFrom).toEqual([]);
    expect(shown.list.sections.map((section) => section.name)).toEqual(['Fruit and veg', 'Fridge', 'Other', 'Drinks']);
  });

  it('moves a line before another, or to the end', () => {
    const order = (changes: Change[]) => listWithWaiting(groceries(), over(changes), people).list.items.map((item) => item.id.replace('i-', ''));
    expect(order([line({ op: 'change', itemId: 'i-berries', change: { before: 'i-bananas' } })])).toEqual(['berries', 'bananas', 'onions', 'milk', 'butter', 'dog', 'candles']);
    expect(order([line({ op: 'change', itemId: 'i-bananas', change: { toEnd: true } })])).toEqual(['onions', 'berries', 'milk', 'butter', 'dog', 'candles', 'bananas']);
    // Before a line that is gone: it stays where it is.
    expect(order([line({ op: 'change', itemId: 'i-bananas', change: { before: 'gone' } })])[0]).toBe('bananas');
  });

  it('removes a line, and leaves out a change to one that is not there any more', () => {
    const shown = listWithWaiting(groceries(), over([line({ op: 'remove', itemId: 'i-dog' }), line({ op: 'change', itemId: 'i-dog', change: { done: true } }), line({ op: 'change', itemId: 'someone-removed-it', change: { done: true } })]), people);
    expect(shown.list.items.map((item) => item.id)).not.toContain('i-dog');
    expect(shown.list).toMatchObject({ left: 4, done: 2 });
    expect(shown.waiting.size).toBe(0);
  });

  it('adds the amounts up again, all of them and the ticked ones', () => {
    const shown = listWithWaiting(groceries(), over([line({ op: 'change', itemId: 'i-onions', change: { amountCents: 120 } }), line({ op: 'change', itemId: 'i-milk', change: { amountCents: 189 } })]), people);
    expect(shown.list).toMatchObject({ sumCents: 309, sumDoneCents: 120 });
    expect(shown.list.sections[0]).toMatchObject({ name: 'Fruit and veg', sumCents: 120 });
  });
});

describe('a page with the block changes that wait laid over it', () => {
  it('is the page itself while nothing waits', () => {
    const loaded = wifiPage();
    expect(pageWithWaiting(loaded, over([])).page).toBe(loaded);
  });

  it('adds blocks last, first, or after another one, with what the phone knows of them', () => {
    const thing = brief({ id: 'e-1', kind: 'event', title: 'Dentist' });
    const shown = pageWithWaiting(
      wifiPage(),
      over([
        part({ op: 'add', add: { clientId: 'n1', kind: 'paragraph', text: 'Last words' } }),
        part({ op: 'add', add: { clientId: 'n2', kind: 'heading', text: 'On top', atStart: true } }),
        part({ op: 'add', add: { clientId: 'n3', kind: 'bullet', text: 'After the heading', after: 'b-heading' } }),
        part({ op: 'add', add: { clientId: 'n4', kind: 'bullet', text: 'After the new one', after: 'n3' } }),
        part({ op: 'add', add: { clientId: 'n5', kind: 'live', thingId: 'e-1', after: 'not-there' } }, { shown: { thing } }),
        part({ op: 'add', add: { clientId: 'n6', kind: 'photo', mediaId: routerPhoto.id, text: 'Desk' } }, { shown: { media: routerPhoto } }),
        part({ op: 'add', add: { clientId: 'n7', kind: 'checklist', title: 'To pack', items: ['Socks'] } }),
      ]),
    );
    expect(shown.page.blocks.map((one) => one.id)).toEqual(['n2', 'b-wifi', 'b-heading', 'n3', 'n4', 'b-list', 'b-photo', 'b-heating', 'n1', 'n5', 'n6', 'n7']);
    const by = Object.fromEntries(shown.page.blocks.map((one) => [one.id, one]));
    expect(by.n5).toMatchObject({ kind: 'live', text: '', thing });
    expect(by.n6).toMatchObject({ kind: 'photo', text: 'Desk', media: routerPhoto });
    // A list started without a connection has a name and no lines to tick yet.
    expect(by.n7).toMatchObject({ kind: 'checklist', text: 'To pack', checklist: null, thing: null, unseen: false });
    expect(shown.waiting.size).toBe(7);
  });

  it('changes words and their marks, the kind of text, and where a place is', () => {
    const loaded = wifiPage({ blocks: [...wifiPage().blocks, block({ id: 'b-place', kind: 'place', text: 'The pool', lat: 46.05, lng: 14.5 })] });
    const shown = pageWithWaiting(
      loaded,
      over([
        part({ op: 'change', blockId: 'b-heating', change: { text: 'Ask Alex.' } }),
        part({ op: 'change', blockId: 'b-heading', change: { kind: 'bullet' } }),
        part({ op: 'change', blockId: 'b-place', change: { text: 'The pool on Kodeljevo', removePoint: true } }),
      ]),
    );
    const by = Object.fromEntries(shown.page.blocks.map((one) => [one.id, one]));
    // New words without new marks have none.
    expect(by['b-heating']).toMatchObject({ text: 'Ask Alex.', marks: [] });
    expect(by['b-heading']).toMatchObject({ kind: 'bullet', text: 'If the internet drops' });
    expect(by['b-place']).toMatchObject({ text: 'The pool on Kodeljevo', lat: null, lng: null });
    expect([...shown.waiting]).toEqual(['b-heating', 'b-heading', 'b-place']);
  });

  it('moves a block up, down and to the top', () => {
    const order = (changes: Change[]) => pageWithWaiting(wifiPage(), over(changes)).page.blocks.map((one) => one.id.replace('b-', ''));
    expect(order([part({ op: 'change', blockId: 'b-photo', change: { after: 'b-wifi' } })])).toEqual(['wifi', 'photo', 'heading', 'list', 'heating']);
    expect(order([part({ op: 'change', blockId: 'b-heating', change: { atStart: true } })])).toEqual(['heating', 'wifi', 'heading', 'list', 'photo']);
    expect(order([part({ op: 'change', blockId: 'b-wifi', change: { after: 'b-heading' } })])).toEqual(['heading', 'wifi', 'list', 'photo', 'heating']);
  });

  it('removes a block, finds one by the id the API gave it, and leaves out what is gone', () => {
    const answered = wifiPage({ blocks: [...wifiPage().blocks, block({ id: 'block-9', text: 'Sent a moment ago' })] });
    const shown = pageWithWaiting(
      answered,
      over([part({ op: 'add', add: { clientId: 'n1', kind: 'paragraph', text: 'Sent a moment ago' } }), part({ op: 'change', blockId: 'n1', change: { text: 'Sent, then changed' } }), part({ op: 'remove', blockId: 'b-photo' }), part({ op: 'change', blockId: 'gone', change: { text: 'x' } })], { n1: 'block-9' }),
    );
    expect(shown.page.blocks.map((one) => one.id)).toEqual(['b-wifi', 'b-heading', 'b-list', 'b-heating', 'block-9']);
    expect(shown.page.blocks.at(-1)!.text).toBe('Sent, then changed');
    expect([...shown.waiting]).toEqual(['block-9']);
  });
});

describe('the name a row is drawn under', () => {
  it('stays the clientId a line was added with after the API has given it an id, and is the id for everything else', () => {
    const steady = steadyKeys({ c1: 'item-77', c2: 'item-78' });
    expect(steady('item-77')).toBe('c1');
    expect(steady('c1')).toBe('c1');
    expect(steady('i-bananas')).toBe('i-bananas');
    expect(steadyKeys({})('x')).toBe('x');
  });
});
