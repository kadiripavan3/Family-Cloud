import { Fragment, type ReactNode } from 'react';

import type { Rich } from '@/words';

/**
 * Draws a sentence from the catalog whose marked parts look or behave differently: a title in bold, a link.
 * Put the result inside a `Txt`; `marks` says how each mark is drawn. A mark nobody named is drawn as plain text.
 *
 *     <Txt>{rich(words.signIn.agree, { terms: (text) => <Txt onPress={openTerms}>{text}</Txt> })}</Txt>
 */
export function rich(parts: Rich, marks: Record<string, (text: string) => ReactNode>): ReactNode[] {
  return parts.map((part, index) => (typeof part === 'string' ? part : <Fragment key={index}>{marks[part.mark]?.(part.text) ?? part.text}</Fragment>));
}
