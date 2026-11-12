import { cleaned, narrowFrom, narrowParams, selectHref, viewerHref } from '../narrow';

describe('the narrowing of the wall, as it travels in an address', () => {
  it('reads only what narrows, and only what makes sense', () => {
    expect(cleaned(narrowFrom({ id: 'x', album: 'a-1', by: 'm-alex', kind: 'video', loved: 'true', first: 'p-1' }))).toEqual({ album: 'a-1', by: 'm-alex', kind: 'video', loved: true });
    expect(cleaned(narrowFrom({ kind: 'document', loved: 'yes', place: '' }))).toEqual({});
    expect(cleaned(narrowFrom({ place: ['Lake Bled', 'Home'] }))).toEqual({ place: 'Lake Bled' });
  });

  it('writes it back the same way', () => {
    const narrow = { album: 'a-1', by: 'm-alex', kind: 'video' as const, loved: true };
    expect(narrowParams(narrow)).toEqual({ album: 'a-1', by: 'm-alex', kind: 'video', loved: 'true' });
    expect(cleaned(narrowFrom(narrowParams(narrow)))).toEqual(narrow);
    expect(narrowParams({})).toEqual({});
  });

  it('opens a photo where a thing of its kind opens, inside what it was opened from', () => {
    expect(viewerHref({ id: 'p-1', kind: 'photo' }, { album: 'a-1' })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: 'p-1', album: 'a-1' } });
    expect(viewerHref({ id: 'v-1', kind: 'video' }, { place: 'Lake Bled' })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'video', id: 'v-1', place: 'Lake Bled' } });
  });

  it('keeps a photo opened from the whole wall inside its own moment', () => {
    expect(viewerHref({ id: 'p-1', kind: 'photo' })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: 'p-1', moment: 'p-1' } });
    expect(viewerHref({ id: 'p-1' }, { by: undefined })).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: 'p-1', moment: 'p-1' } });
  });

  it('opens the screen for selecting over the same photos, with the one that was held', () => {
    expect(selectHref({ moment: 'p-1', by: undefined }, 'p-4')).toEqual({ pathname: '/library/select', params: { moment: 'p-1', first: 'p-4' } });
    expect(selectHref({})).toEqual({ pathname: '/library/select', params: {} });
  });
});
