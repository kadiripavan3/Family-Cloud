import { useEffect, useMemo, useRef, useState } from 'react';

import type { BlockResponse, LateBlockChange, MediaResponse, PageResponse, ThingBrief } from '@/api/generated/homeport';
import { newClientId } from '@/lib/ids';

import { useChanges } from '../changes/outbox';
import type { Shown, Target } from '../changes/types';
import { isText, type TextKind } from './blocks';
import { fromTyped, type Named, toTyped } from './marks';

/** A text block while it is typed in: a new one that isn't on the page yet, or one that is being changed. */
export type Draft = {
  /** The block's id; for a new one, the `clientId` it will be added with. */
  id: string;
  isNew: boolean;
  kind: TextKind;
  /** What is in the box now, with its marks written out. */
  typed: string;
  /** What was in the box when typing began, and the kind it had. */
  from: { typed: string; kind: TextKind };
  /** For a new block: the block it comes after. Null: at the end. */
  after: string | null;
};

/** One thing the page draws under its title: a block, a run of live blocks drawn together as a card of links, or the box that is being typed in. */
export type Part = { key: string; block?: BlockResponse; links?: BlockResponse[]; draft?: Draft };

/**
 * What a page draws, in order. The block that is being typed in is a box in its own place; a new one stands
 * after the block it follows, or last. Two or more live blocks in a row are one card of links ("the party":
 * its event, its budget, its list); a live block by itself is a card of its own.
 */
export function partsOf(blocks: readonly BlockResponse[], draft: Draft | null): Part[] {
  const parts: Part[] = [];
  const typing = (now: Draft): Part => ({ key: `typing-${now.id}`, draft: now });
  let placed = !draft || !draft.isNew;
  for (const block of blocks) {
    if (draft && !draft.isNew && draft.id === block.id) {
      parts.push(typing(draft));
      continue;
    }
    const last = parts.at(-1);
    const link = block.kind === 'live' && !!block.thing;
    if (link && last?.links) last.links.push(block);
    else if (link && last?.block?.kind === 'live' && last.block.thing) parts[parts.length - 1] = { key: last.key, links: [last.block, block] };
    else parts.push({ key: block.id, block });
    if (draft && !placed && draft.after === block.id) {
      parts.push(typing(draft));
      placed = true;
    }
  }
  if (draft && !placed) parts.push(typing(draft));
  return parts;
}

/**
 * Everything a person does to the blocks of a page, one block at a time. Nothing here calls the API: each
 * change goes into the page's queue (`changes/`), shows at once, and goes up when it can.
 *
 * Words are typed in place. Pressing a text block turns it into a box; Return ends the block and begins the
 * next (a bullet after a bullet, plain text after anything else); "Done" ends it, and so does starting on
 * anything else or leaving the page. A block that is left empty is removed, and a new one that stays empty
 * is never made. Beginning a block with "# " makes it a heading, with "- " a bullet.
 */
export function useEditor(page: PageResponse, people: readonly Named[]) {
  const changes = useChanges();
  const target = useMemo<Target>(() => ({ kind: 'page', id: page.id }), [page.id]);
  const [draft, setDraft] = useState<Draft | null>(null);
  // What is being typed, as the handlers of this very moment see it: a box that is left and a button that
  // is pressed happen in one breath, before the screen has been drawn again.
  const now = useRef<Draft | null>(null);
  const lastText = useRef<string | null>(null);

  const send = (body: LateBlockChange, shown?: Shown) => void changes.add({ target, body, shown });
  const hold = (next: Draft | null) => {
    now.current = next;
    setDraft(next);
  };

  /** Ends typing: what is in the box becomes the block. Answers the block's id and kind when it is on the page afterwards. */
  const finish = (): { id: string; kind: TextKind } | null => {
    const typing = now.current;
    if (!typing) return null;
    hold(null);
    const lead = /^(#|-)\s+/.exec(typing.typed);
    const kind: TextKind = lead ? (lead[1] === '#' ? 'heading' : 'bullet') : typing.kind;
    const { text, marks } = fromTyped((lead ? typing.typed.slice(lead[0].length) : typing.typed).trim(), people);
    if (typing.isNew) {
      if (!text) return null;
      send({ op: 'add', add: { clientId: typing.id, kind, text, marks, ...(typing.after ? { after: typing.after } : null) } });
    } else if (!text) {
      send({ op: 'remove', blockId: typing.id });
      return null;
    } else if (typing.typed !== typing.from.typed || kind !== typing.from.kind) {
      send({ op: 'change', blockId: typing.id, change: { text, marks, ...(kind !== typing.from.kind ? { kind } : null) } });
    }
    lastText.current = typing.id;
    return { id: typing.id, kind };
  };

  // Leaving the page with a box still open keeps what was typed in it.
  const last = useRef<() => unknown>(() => null);
  useEffect(() => {
    last.current = finish;
  });
  useEffect(() => () => void last.current(), []);

  const begin = (kind: TextKind, after: string | null) => hold({ id: newClientId(), isNew: true, kind, typed: '', from: { typed: '', kind }, after });
  const at = (block: BlockResponse) => page.blocks.findIndex((one) => one.id === block.id);
  /** Where a new block goes: after the block that is being typed in, or last. */
  const place = () => {
    const before = finish();
    return before ? { after: before.id } : null;
  };

  return {
    target,
    draft,
    /** Starts typing in a text block that is on the page. */
    edit: (block: BlockResponse) => {
      finish();
      const kind: TextKind = isText(block.kind) ? block.kind : 'paragraph';
      const typed = toTyped(block.text, block.marks);
      hold({ id: block.id, isNew: false, kind, typed, from: { typed, kind }, after: null });
    },
    /** Starts a new text block: after the one that is being typed in, or last. */
    write: (kind: TextKind = 'paragraph') => begin(kind, finish()?.id ?? null),
    type: (typed: string) => (now.current ? hold({ ...now.current, typed }) : undefined),
    /** Return: this block is done and the next one begins. Return in an empty box ends typing. */
    next: () => {
      const done = finish();
      if (done) begin(done.kind === 'bullet' ? 'bullet' : 'paragraph', done.id);
    },
    done: () => void finish(),

    turnInto: (block: BlockResponse, kind: TextKind) => send({ op: 'change', blockId: block.id, change: { kind } }),
    moveUp: (block: BlockResponse) => {
      const before = page.blocks[at(block) - 2];
      send({ op: 'change', blockId: block.id, change: before ? { after: before.id } : { atStart: true } });
    },
    moveDown: (block: BlockResponse) => {
      const next = page.blocks[at(block) + 1];
      if (next) send({ op: 'change', blockId: block.id, change: { after: next.id } });
    },
    remove: (block: BlockResponse) => send({ op: 'remove', blockId: block.id }),
    /** The words under a photo or a file, or where a place is. */
    reword: (block: BlockResponse, text: string) => (text.trim() !== block.text ? send({ op: 'change', blockId: block.id, change: { text: text.trim() } }) : undefined),

    /** A new list, started in the page with its first lines. */
    addList: (title: string, items: string[]) => send({ op: 'add', add: { clientId: newClientId(), kind: 'checklist', ...(title.trim() ? { title: title.trim() } : null), items, ...place() } }),
    /** A list that exists already, drawn here. */
    addExistingList: (thing: ThingBrief) => send({ op: 'add', add: { clientId: newClientId(), kind: 'checklist', thingId: thing.id, ...place() } }, { thing }),
    addLive: (thing: ThingBrief) => send({ op: 'add', add: { clientId: newClientId(), kind: 'live', thingId: thing.id, ...place() } }, { thing }),
    addPlace: (where: string) => send({ op: 'add', add: { clientId: newClientId(), kind: 'place', text: where.trim(), ...place() } }),
    /** A photo or a file that has just gone up. */
    addMedia: (kind: 'photo' | 'file', media: MediaResponse, text = '') => send({ op: 'add', add: { clientId: newClientId(), kind, mediaId: media.id, text, ...place() } }, { media }),

    /**
     * Writes someone's name: into the box that is being typed in; else onto the end of the text block that
     * was typed in last; else as a new line.
     */
    mention: (person: Named) => {
      const name = `@${person.first || person.name}`;
      if (now.current) {
        const typed = now.current.typed;
        hold({ ...now.current, typed: `${typed}${typed && !/\s$/.test(typed) ? ' ' : ''}${name} ` });
        return;
      }
      const last = page.blocks.find((block) => block.id === lastText.current && isText(block.kind));
      if (last) {
        const text = `${last.text}${/\s$/.test(last.text) ? '' : ' '}${name}`;
        send({ op: 'change', blockId: last.id, change: { text, marks: [...last.marks, { start: text.length - name.length, end: text.length, kind: 'mention', memberId: person.memberId }] } });
        return;
      }
      send({ op: 'add', add: { clientId: newClientId(), kind: 'paragraph', text: name, marks: [{ start: 0, end: name.length, kind: 'mention', memberId: person.memberId }] } });
    },
  };
}
