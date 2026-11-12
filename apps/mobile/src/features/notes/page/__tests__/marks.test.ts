import type { Mark } from '@/api/generated/homeport';

import { fromTyped, type Named, pieces, toTyped } from '../marks';

const people: Named[] = [
  { memberId: 'm-alex', name: 'Alex Strand', first: 'Alex' },
  { memberId: 'm-mia', name: 'Mia', first: 'Mia' },
];

describe('the marks of a text block, as they are typed', () => {
  it('reads bold, slanted and struck words back into plain words with marks over them', () => {
    expect(fromTyped('Take the *blue* bin out on _Tuesday_, ~not Monday~.')).toEqual({
      text: 'Take the blue bin out on Tuesday, not Monday.',
      marks: [
        { start: 9, end: 13, kind: 'bold' },
        { start: 25, end: 32, kind: 'italic' },
        { start: 34, end: 44, kind: 'strike' },
      ],
    });
  });

  it('takes an address as a link to itself, and leaves the full stop after it to the sentence', () => {
    expect(fromTyped('Book at https://example.com/pool.')).toEqual({ text: 'Book at https://example.com/pool.', marks: [{ start: 8, end: 32, kind: 'link', url: 'https://example.com/pool' }] });
    expect(fromTyped('See [the timetable](https://example.com/t?x=1) first').marks).toEqual([{ start: 4, end: 17, kind: 'link', url: 'https://example.com/t?x=1' }]);
    expect(fromTyped('See [the timetable](https://example.com/t?x=1) first').text).toBe('See the timetable first');
  });

  it("names someone of the circle by the name they are called or their whole name, and nobody who isn't in it", () => {
    expect(fromTyped('@Alex knows the boiler code.', people)).toEqual({ text: '@Alex knows the boiler code.', marks: [{ start: 0, end: 5, kind: 'mention', memberId: 'm-alex' }] });
    expect(fromTyped('Ask @Alex Strand, or @Mia.', people).marks).toEqual([
      { start: 4, end: 16, kind: 'mention', memberId: 'm-alex' },
      { start: 21, end: 25, kind: 'mention', memberId: 'm-mia' },
    ]);
    expect(fromTyped('Ask @Petra or @Alexander.', people).marks).toEqual([]);
    expect(fromTyped('nora@example.com wrote to @Mia', people).marks).toEqual([{ start: 26, end: 30, kind: 'mention', memberId: 'm-mia' }]);
  });

  it('reads a name inside bold words, and keeps both marks', () => {
    expect(fromTyped('*Ask @Mia first*', people)).toEqual({
      text: 'Ask @Mia first',
      marks: [
        { start: 0, end: 14, kind: 'bold' },
        { start: 4, end: 8, kind: 'mention', memberId: 'm-mia' },
      ],
    });
  });

  it('leaves signs alone that are not marks: maths, a file name, a lone star', () => {
    for (const plain of ['2 * 3 * 4 = 24', 'the file my_first_page.txt', 'a * b', '~ 5 minutes', 'snake_case_name', '*not closed', '5*6*7']) {
      expect(fromTyped(plain)).toEqual({ text: plain, marks: [] });
    }
  });

  it('writes the marks out again exactly as they are typed', () => {
    for (const typed of ['Take the *blue* bin out on _Tuesday_, ~not Monday~.', 'See [the timetable](https://example.com/t) first', 'Book at https://example.com/pool.', '*Ask @Mia first*', 'Plain words.']) {
      const read = fromTyped(typed, people);
      expect(toTyped(read.text, read.marks)).toBe(typed);
    }
  });

  it('writes marks that begin or end together so they nest', () => {
    const marks: Mark[] = [
      { start: 0, end: 9, kind: 'bold' },
      { start: 0, end: 4, kind: 'italic' },
      { start: 5, end: 9, kind: 'strike' },
    ];
    expect(toTyped('very good news', marks)).toBe('*_very_ ~good~* news');
    expect(fromTyped('*_very_ ~good~* news').marks).toEqual(expect.arrayContaining(marks));
    // A mark that reaches past the words is left out rather than drawn wrong.
    expect(toTyped('short', [{ start: 2, end: 40, kind: 'bold' }])).toBe('short');
    expect(toTyped('short', undefined)).toBe('short');
  });

  it('cuts the words where marks begin and end, each piece with the marks over it', () => {
    const cut = pieces('Ask Alex first', [
      { start: 0, end: 14, kind: 'bold' },
      { start: 4, end: 8, kind: 'mention', memberId: 'm-alex' },
    ]);
    expect(cut.map((piece) => [piece.text, piece.marks.map((mark) => mark.kind)])).toEqual([
      ['Ask ', ['bold']],
      ['Alex', ['bold', 'mention']],
      [' first', ['bold']],
    ]);
    expect(pieces('Plain', [])).toEqual([{ text: 'Plain', marks: [] }]);
    expect(pieces('', undefined)).toEqual([]);
  });
});
