import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/** 12.2 Storage and backup, still to be built: what is used, by what and by whom. It arrives with the Library, whose photos and videos are what there is to count. */
export default function Storage() {
  return <NotBuiltYet title={words.you.rows.storage} header={<AppBar />} />;
}
