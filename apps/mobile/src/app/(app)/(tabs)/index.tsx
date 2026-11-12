import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { words } from '@/words';

/** 3 Home, still to be built: the search pill, the row of six places, and Today under it. */
export default function Home() {
  return <NotBuiltYet title={words.common.tabs.home} />;
}
