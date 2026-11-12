import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/** 3.3 Find anything, still to be built: one search across the circle, opened from the pill at the top of Home. */
export default function Search() {
  return <NotBuiltYet title={words.search.pill.today.title} header={<AppBar />} />;
}
