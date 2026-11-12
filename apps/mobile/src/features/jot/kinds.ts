import { Bell, Calendar, FileText, KeyRound, type LucideIcon, SquareCheck } from 'lucide-react-native';

import type { ReadAs, ReadItemResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { words } from '@/words';

/** The icon of what a jot is read as, or became: `const Icon = KIND_ICONS[jot.became]`. */
export const KIND_ICONS: Record<ReadAs, LucideIcon> = { event: Calendar, reminder: Bell, list_item: SquareCheck, note: FileText, code: KeyRound };

/** True when the reading names someone other than the person typing. */
function someoneElse(item: ReadItemResponse, myMemberId: string): boolean {
  return !!item.person?.memberId && item.person.memberId !== myMemberId;
}

/**
 * A reading as a chip under the line: "Eggs · Groceries", "Alex · today 18:00", "Call the dentist ·
 * tomorrow 9:00". Something given to someone else leads with their name: that is the news.
 */
export function readingChip(item: ReadItemResponse, myMemberId: string): string {
  if (item.as === 'list_item') return words.common.join([item.title, item.list?.title]);
  if (item.as === 'code') return words.common.join([item.title, words.jot.bar.looksLikeCode]);
  if (item.as === 'note') return words.common.join([item.title, words.jot.kinds.note]);
  const lead = item.personRole === 'given_to' && someoneElse(item, myMemberId) ? firstName(item.person?.name ?? '') : item.title;
  return words.common.join([lead, item.whenNear ?? words.jot.kinds[item.as]]);
}

/** A reading as the small line under a thing: "Groceries", "Reminder · today 18:00 · for you", "Looks like a code · the Vault". */
export function readingLine(item: ReadItemResponse): string {
  if (item.as === 'list_item') return item.list?.title || words.jot.kinds.list_item;
  if (item.as === 'code') return words.jot.voice.code;
  if (item.as === 'note') return words.common.join([words.jot.kinds.note, item.personLabel ? words.jot.voice.who(item.personLabel) : null]);
  return words.common.join([words.jot.kinds[item.as], item.whenNear, item.personLabel ? words.jot.voice.who(item.personLabel) : null]);
}
