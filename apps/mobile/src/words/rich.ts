/**
 * A sentence in which some parts are drawn or behave differently: a title in bold, a link in the middle.
 * The catalog gives the parts in the language's own order; the screen says how each mark looks
 * (`rich()` in src/ui/rich).
 */
export type Rich = readonly (string | Marked)[];

/** One marked part: which mark it carries ("bold", "terms") and the words it holds. */
export type Marked = { readonly mark: string; readonly text: string };

export function mark(name: string, text: string): Marked {
  return { mark: name, text };
}
