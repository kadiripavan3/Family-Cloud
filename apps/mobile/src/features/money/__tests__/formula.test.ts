import type { FunctionResponse } from '@/api/generated/homeport';

import { add, chips, functionPiece, type Piece, read, removeLast, write } from '../sheet/formula';

const fn = (name: string, label: string, example: string): FunctionResponse => ({ name, label, says: '', example });
const SUM = fn('SUM', 'SUM', 'SUM([Cost])');
const SUMIF = fn('SUMIF', 'SUM IF', 'SUMIF([Paid], [Cost])');
const AVG = fn('AVG', 'AVERAGE', 'AVERAGE([Cost])');
const IF = fn('IF', 'IF', 'IF([Paid], 0, [Cost])');
const ROUND = fn('ROUND', 'ROUND', 'ROUND([Cost] / 3, 2)');
const TODAY = fn('TODAY', 'TODAY', 'TODAY()');
const NOT = fn('NOT', 'NOT', 'NOT [Paid]');
const JOIN = fn('JOIN', 'JOIN', 'JOIN([Item], " for ", [Who])');
const ALL = [SUM, SUMIF, AVG, IF, ROUND, TODAY, NOT, JOIN];

const col = (name: string): Piece => ({ kind: 'column', name });
const sign = (text: string): Piece => ({ kind: 'sign', text });
const num = (text: string): Piece => ({ kind: 'number', text });
const built = (...taps: Piece[]) => taps.reduce<Piece[]>((pieces, piece) => add(pieces, piece), []);

describe('a formula built from chips', () => {
  it('knows how a function is typed and how much goes in its brackets, from the example the API gives', () => {
    expect(functionPiece(SUM)).toEqual({ kind: 'fn', name: 'SUM', label: 'SUM', arity: 1 });
    expect(functionPiece(SUMIF)).toEqual({ kind: 'fn', name: 'SUMIF', label: 'SUM IF', arity: 2 });
    // The API calls it AVG and types it AVERAGE.
    expect(functionPiece(AVG)).toMatchObject({ name: 'AVERAGE', label: 'AVERAGE', arity: 1 });
    expect(functionPiece(IF)).toMatchObject({ arity: 3 });
    expect(functionPiece(ROUND)).toMatchObject({ arity: 2 });
    expect(functionPiece(TODAY)).toMatchObject({ arity: 0 });
    expect(functionPiece(NOT)).toMatchObject({ name: 'NOT', arity: 1 });
    // A comma inside quotes is not one between two things.
    expect(functionPiece(JOIN)).toMatchObject({ arity: 3 });
  });

  it('can be read while it is built: open brackets are closed', () => {
    expect(write(built(functionPiece(SUM)))).toBe('SUM()');
    expect(write(built(functionPiece(SUM), col('Cost')))).toBe('SUM([Cost])');
    expect(write(built(col('Cost'), sign('×'), num('2')))).toBe('[Cost] * 2');
  });

  it('is the drawn one after seven taps: SUM Cost − SUM IF Paid Cost', () => {
    const pieces = built(functionPiece(SUM), col('Cost'), sign('−'), functionPiece(SUMIF), col('Paid'), col('Cost'));
    expect(write(pieces)).toBe('SUM([Cost]) - SUMIF([Paid], [Cost])');
    expect(chips(pieces).map((chip) => chip.text)).toEqual(['SUM', 'Cost', '−', 'SUM IF', 'Paid', 'Cost']);
    expect(chips(pieces).map((chip) => chip.kind)).toEqual(['function', 'column', 'sign', 'function', 'column', 'column']);
  });

  it('keeps a sign inside brackets that still have room, and puts it after ones that are full', () => {
    expect(write(built(functionPiece(ROUND), col('Cost'), sign('÷'), num('3'), num('2')))).toBe('ROUND([Cost] / 3, 2)');
    expect(write(built(functionPiece(ROUND), col('Cost'), sign('÷'), num('3'), num('2'), sign('+'), num('1')))).toBe('ROUND([Cost] / 3, 2) + 1');
    expect(write(built(functionPiece(IF), col('Paid'), num('0'), col('Cost')))).toBe('IF([Paid], 0, [Cost])');
  });

  it('closes a function that is full before the next thing, and one that takes nothing at once', () => {
    // Two things with no sign between them: the API says what is missing, the app doesn't guess.
    expect(write(built(functionPiece(SUM), col('Cost'), functionPiece(SUM), col('Cost')))).toBe('SUM([Cost])SUM([Cost])');
    expect(write(built(functionPiece(TODAY)))).toBe('TODAY()');
    expect(write(built(functionPiece(SUM), { kind: 'open' }, col('Cost'), sign('×'), col('Qty'), { kind: 'close' }))).toBe('SUM(([Cost] * [Qty]))');
  });

  it('takes the last chip away, with the comma or the bracket that was only there for it', () => {
    const pieces = built(functionPiece(SUMIF), col('Paid'), col('Cost'));
    expect(write(removeLast(pieces))).toBe('SUMIF([Paid])');
    expect(write(removeLast(removeLast(pieces)))).toBe('SUMIF()');
    expect(removeLast(removeLast(removeLast(pieces)))).toEqual([]);
    expect(removeLast([])).toEqual([]);
    expect(write(removeLast(built(functionPiece(TODAY))))).toBe('');
    // After a function closed by a sign, the sign goes first, then the column inside.
    const minus = built(functionPiece(SUM), col('Cost'), sign('−'));
    expect(write(removeLast(minus))).toBe('SUM([Cost])');
    expect(write(removeLast(removeLast(minus)))).toBe('SUM()');
  });

  it('takes a kept formula apart, and writes the same one again', () => {
    for (const formula of ['SUM([Cost]) - SUMIF([Paid], [Cost])', 'IF([Paid], 0, [Cost])', 'ROUND([Cost] / 3, 2)', '[Price] * [Qty]', 'DAYS([Due], TODAY())', 'SUMIF(AND([Who] = "Alex", [Paid]), [Cost])', 'PAYMENT(€240000, 3.4, 25)', '[Cost] * 5%', 'AVERAGE([Cost])']) {
      expect(write(read(formula, ALL))).toBe(formula);
    }
    expect(read('SUM([Cost])', ALL)).toEqual([{ kind: 'fn', name: 'SUM', label: 'SUM', arity: 1 }, { kind: 'column', name: 'Cost' }, { kind: 'close' }]);
    // Signs are drawn the way people write them.
    expect(chips(read('[A] * [B] / 2 - 1', ALL)).map((chip) => chip.text)).toEqual(['A', '×', 'B', '÷', '2', '−', '1']);
    // What it can't take apart stays whole, and is still sent as it was.
    expect(read('SUM([Cost]) ? 2', ALL)).toEqual([{ kind: 'raw', text: 'SUM([Cost]) ? 2' }]);
    expect(write(read('SUM([Cost]) ? 2', ALL))).toBe('SUM([Cost]) ? 2');
  });

  it('goes on from a kept formula with more chips', () => {
    const kept = read('SUM([Cost])', ALL);
    expect(write(add(add(kept, sign('−')), num('100')))).toBe('SUM([Cost]) - 100');
  });
});
