import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/** 3.4 The + button, still to be built: the ways to add something, wherever you are in the app. */
export default function Plus() {
  return <NotBuiltYet title={words.common.add} header={<AppBar leading="close" />} />;
}
