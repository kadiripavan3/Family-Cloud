import { words } from '@/words';

/** 1200 becomes "1.2k". How it is written is each language's own (`words.common.compact`). */
export function compact(count: number): string {
  return words.common.compact(count);
}
