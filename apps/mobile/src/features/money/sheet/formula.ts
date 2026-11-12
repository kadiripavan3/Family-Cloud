import type { FunctionResponse, PartResponse } from '@/api/generated/homeport';

/**
 * A formula while it is being built from chips. The app keeps the pieces in the order they were tapped and
 * writes them out as the text the API reads (`[Cost]`, `SUM(…)`, `-`). It never works anything out itself:
 * the sentence and the answer come back from the API for the text it sends.
 */
export type Piece =
  /** A function, with its bracket opened: SUM( */
  | { kind: 'fn'; name: string; label: string; arity: number }
  | { kind: 'column'; name: string }
  /** A sign between two things: + − × ÷ = < >, or AND, OR, NOT written between them. */
  | { kind: 'sign'; text: string }
  /** A number as it is typed: 12, 0.5, 5%, €250. */
  | { kind: 'number'; text: string }
  /** Words in quotes: "Alex". */
  | { kind: 'words'; text: string }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'comma' }
  /** Something the app can't take apart: kept as it is, and removed as a whole. */
  | { kind: 'raw'; text: string };

/** How a sign is drawn, by how it is typed. */
const DRAWN: Record<string, string> = { '-': '−', '*': '×', '/': '÷', '<>': '≠', '<=': '≤', '>=': '≥' };
/** And the other way round. */
const TYPED: Record<string, string> = { '−': '-', '–': '-', '×': '*', '·': '*', '÷': '/', '≠': '<>', '≤': '<=', '≥': '>=' };

/** The signs the builder offers as chips, as they are drawn. */
export const SIGNS = ['+', '−', '×', '÷'] as const;

/** How a function is typed, from the API's own example of it: "SUMIF" from "SUMIF([Paid], [Cost])". */
function typedName(fn: FunctionResponse): string {
  return /^[A-Za-z_]+/.exec(fn.example)?.[0] ?? fn.name;
}

/** How many things go in a function's brackets, counted in the API's own example of it. */
function arityOf(example: string): number {
  const open = example.indexOf('(');
  // Written without brackets ("NOT [Paid]"): it takes the one thing that follows.
  if (open < 0) return 1;
  let depth = 0;
  let commas = 0;
  let inside = '';
  let quoted = false;
  for (const char of example.slice(open)) {
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 1 && char === ',') commas += 1;
    else if (depth >= 1 && char.trim()) inside += char;
  }
  return inside ? commas + 1 : 0;
}

/** The chip for a function the API offers. */
export function functionPiece(fn: FunctionResponse): Piece {
  return { kind: 'fn', name: typedName(fn), label: fn.label, arity: arityOf(fn.example) };
}

type Frame = { fn: boolean; arity: number; args: number; hasValue: boolean };

/** The brackets that are open after these pieces, the outermost first. The first is the formula itself. */
function frames(pieces: readonly Piece[]): Frame[] {
  const open: Frame[] = [{ fn: false, arity: Infinity, args: 0, hasValue: false }];
  for (const piece of pieces) {
    const top = open[open.length - 1]!;
    switch (piece.kind) {
      case 'fn':
        top.hasValue = true;
        open.push({ fn: true, arity: piece.arity, args: 0, hasValue: false });
        break;
      case 'open':
        top.hasValue = true;
        open.push({ fn: false, arity: Infinity, args: 0, hasValue: false });
        break;
      case 'close':
        if (open.length > 1) open.pop();
        break;
      case 'comma':
        top.args += 1;
        top.hasValue = false;
        break;
      case 'sign':
        top.hasValue = false;
        break;
      default:
        top.hasValue = true;
    }
  }
  return open;
}

/**
 * The pieces with one more chip tapped. Brackets and commas take care of themselves: a second thing inside
 * a function that takes two gets a comma before it, a function that is full is closed before whatever comes
 * next, and a function that takes nothing (TODAY) is closed at once.
 */
export function add(pieces: readonly Piece[], piece: Piece): Piece[] {
  const out = [...pieces];
  const value = piece.kind === 'fn' || piece.kind === 'column' || piece.kind === 'number' || piece.kind === 'words' || piece.kind === 'open' || piece.kind === 'raw';
  if (value) {
    for (;;) {
      const open = frames(out);
      const top = open[open.length - 1]!;
      if (!top.hasValue || !top.fn) break;
      if (top.args + 1 < top.arity) {
        out.push({ kind: 'comma' });
        break;
      }
      out.push({ kind: 'close' });
    }
    out.push(piece);
    if (piece.kind === 'fn' && piece.arity === 0) out.push({ kind: 'close' });
    return out;
  }
  if (piece.kind === 'sign') {
    for (;;) {
      const open = frames(out);
      const top = open[open.length - 1]!;
      if (!(open.length > 1 && top.fn && top.hasValue && top.args + 1 >= top.arity)) break;
      out.push({ kind: 'close' });
    }
  }
  out.push(piece);
  return out;
}

/** The pieces with the last chip taken away again, and with it the comma or the bracket that was only there for it. */
export function removeLast(pieces: readonly Piece[]): Piece[] {
  const out = [...pieces];
  // A bracket that closed by itself goes with the thing it closed after.
  while (out.length && out[out.length - 1]!.kind === 'close') out.pop();
  out.pop();
  while (out.length && out[out.length - 1]!.kind === 'comma') out.pop();
  return out;
}

/** The formula as the API reads it. Brackets that are still open are closed, so a formula can be read while it is built. */
export function write(pieces: readonly Piece[]): string {
  let text = '';
  for (const piece of pieces) {
    switch (piece.kind) {
      case 'fn':
        text += `${piece.name}(`;
        break;
      case 'column':
        text += `[${piece.name}]`;
        break;
      case 'sign':
        text += ` ${TYPED[piece.text] ?? piece.text} `;
        break;
      case 'number':
        text += piece.text;
        break;
      case 'words':
        text += `"${piece.text}"`;
        break;
      case 'open':
        text += '(';
        break;
      case 'close':
        text += ')';
        break;
      case 'comma':
        text += ', ';
        break;
      default:
        text += piece.text;
    }
  }
  text += ')'.repeat(frames(pieces).length - 1);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A formula that is already kept (a tile's, a column's), taken apart into pieces, so it can be changed chip
 * by chip. What can't be taken apart stays one piece.
 */
export function read(formula: string, functions: readonly FunctionResponse[]): Piece[] {
  const known = new Map<string, Piece>();
  for (const fn of functions) {
    const piece = functionPiece(fn);
    known.set(fn.name.toUpperCase(), piece);
    if (piece.kind === 'fn') known.set(piece.name.toUpperCase(), piece);
  }
  const out: Piece[] = [];
  let at = 0;
  const text = formula.trim();
  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^\s+/.exec(rest);
    if (space) {
      at += space[0].length;
      continue;
    }
    const column = /^\[([^\]]*)\]/.exec(rest);
    const quoted = /^"([^"]*)"/.exec(rest);
    const number = /^[€$£]?\d+(?:\.\d+)?[%€]?/.exec(rest);
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    const sign = /^(<>|<=|>=|[+\-*/&=<>−–×·÷≠≤≥])/.exec(rest);
    if (column) {
      out.push({ kind: 'column', name: column[1]! });
      at += column[0].length;
    } else if (quoted) {
      out.push({ kind: 'words', text: quoted[1]! });
      at += quoted[0].length;
    } else if (number) {
      out.push({ kind: 'number', text: number[0] });
      at += number[0].length;
    } else if (name) {
      const after = /^\s*\(/.exec(rest.slice(name[0].length));
      if (after) {
        const fn = known.get(name[0].toUpperCase());
        out.push(fn ?? { kind: 'fn', name: name[0].toUpperCase(), label: name[0].toUpperCase(), arity: Infinity });
        at += name[0].length + after[0].length;
      } else {
        // AND, OR, NOT, TRUE and FALSE written between things.
        out.push({ kind: 'sign', text: name[0].toUpperCase() });
        at += name[0].length;
      }
    } else if (sign) {
      out.push({ kind: 'sign', text: DRAWN[sign[0]] ?? sign[0] });
      at += sign[0].length;
    } else if (rest[0] === '(') {
      out.push({ kind: 'open' });
      at += 1;
    } else if (rest[0] === ')') {
      out.push({ kind: 'close' });
      at += 1;
    } else if (rest[0] === ',' || rest[0] === ';') {
      out.push({ kind: 'comma' });
      at += 1;
    } else {
      return [{ kind: 'raw', text }];
    }
  }
  return out;
}

/** The pieces as chips to draw, in the shape the API sends a formula's parts in, so one drawing does for both. */
export function chips(pieces: readonly Piece[]): PartResponse[] {
  return pieces.flatMap((piece): PartResponse[] => {
    switch (piece.kind) {
      case 'fn':
        return [{ kind: 'function', text: piece.label, columnId: null }];
      case 'column':
        return [{ kind: 'column', text: piece.name, columnId: null }];
      case 'sign':
        return [{ kind: 'sign', text: DRAWN[piece.text] ?? piece.text, columnId: null }];
      case 'number':
        return [{ kind: 'number', text: piece.text, columnId: null }];
      case 'words':
        return [{ kind: 'text', text: `“${piece.text}”`, columnId: null }];
      case 'open':
        return [{ kind: 'bracket', text: '(', columnId: null }];
      case 'raw':
        return [{ kind: 'words', text: piece.text, columnId: null }];
      // A closing bracket and a comma say nothing while a formula is built: the chips before and after do.
      default:
        return [];
    }
  });
}
