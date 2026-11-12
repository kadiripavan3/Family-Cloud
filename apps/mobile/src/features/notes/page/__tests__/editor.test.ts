import { block, brief } from '@/test/samples/notes';

import { type Draft, partsOf } from '../editor';
import { liveKind, BLOCK_TILES } from '../BlockPicker';

const typing = (over: Partial<Draft> = {}): Draft => ({ id: 'new-1', isNew: true, kind: 'paragraph', typed: '', from: { typed: '', kind: 'paragraph' }, after: null, ...over });
const live = (id: string) => block({ id, kind: 'live', text: '', thing: brief({ id: `t-${id}`, kind: 'event', title: id }) });
const shape = (parts: ReturnType<typeof partsOf>) => parts.map((part) => (part.draft ? `typing:${part.draft.id}` : part.links ? `links:${part.links.map((one) => one.id).join('+')}` : part.block?.id));

describe('what a page draws, in order', () => {
  const blocks = [block({ id: 'a' }), block({ id: 'b', kind: 'heading' }), block({ id: 'c', kind: 'bullet' })];

  it('draws each block by itself', () => {
    expect(shape(partsOf(blocks, null))).toEqual(['a', 'b', 'c']);
    expect(partsOf([], null)).toEqual([]);
  });

  it('puts the box of a new block after the block it follows, or last', () => {
    expect(shape(partsOf(blocks, typing({ after: 'a' })))).toEqual(['a', 'typing:new-1', 'b', 'c']);
    expect(shape(partsOf(blocks, typing()))).toEqual(['a', 'b', 'c', 'typing:new-1']);
    expect(shape(partsOf(blocks, typing({ after: 'gone' })))).toEqual(['a', 'b', 'c', 'typing:new-1']);
    expect(shape(partsOf([], typing()))).toEqual(['typing:new-1']);
  });

  it('turns the block that is being changed into its box, in its own place', () => {
    expect(shape(partsOf(blocks, typing({ id: 'b', isNew: false, kind: 'heading' })))).toEqual(['a', 'typing:b', 'c']);
  });

  it('draws two or more live blocks in a row as one card of links, and one by itself as its own', () => {
    const unseen = block({ id: 'u', kind: 'live', text: '', unseen: true });
    expect(shape(partsOf([blocks[0]!, live('x'), live('y'), live('z'), blocks[1]!, live('w')], null))).toEqual(['a', 'links:x+y+z', 'b', 'w']);
    // Something the reader can't see is no link: it stands by itself, and the links around it don't join over it.
    expect(shape(partsOf([live('x'), unseen, live('y')], null))).toEqual(['x', 'u', 'y']);
  });
});

describe('the tiles of "Add to this page"', () => {
  it('are fifteen, in the order of the drawing', () => {
    expect(BLOCK_TILES.map((tile) => tile.id)).toEqual(['text', 'checklist', 'photo', 'file', 'place', 'sheet', 'bill', 'event', 'password', 'goal', 'person', 'countdown', 'recipe', 'poll', 'sum']);
  });

  it('link to the kinds of thing the API keeps, and to nothing where a tile is its own or still to come', () => {
    const kinds = Object.fromEntries(BLOCK_TILES.map((tile) => [tile.id, liveKind(tile)]));
    expect(kinds).toMatchObject({ sheet: 'sheet', bill: 'bill', event: 'event', password: 'vault_item', goal: 'goal', text: null, photo: null, person: null, sum: null });
  });
});
