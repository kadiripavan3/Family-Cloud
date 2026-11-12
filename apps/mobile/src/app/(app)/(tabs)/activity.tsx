import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { words } from '@/words';

/** 11 Activity, still to be built: who added what, what is due, and who is asking for something. */
export default function Activity() {
  return <NotBuiltYet title={words.common.tabs.activity} />;
}
