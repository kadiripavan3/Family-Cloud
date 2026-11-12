import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/**
 * /new/checklist, still to be built with Notes: a list of lines to tick. Built with the spine. One of the ten things the + sheet opens. It goes into
 * the current circle (`useCircle()`); the + sheet hands over who it starts as seen by as `?audience=me` or
 * `?audience=circle` when the person changed it there (send it as the request's `audience`, or leave that out).
 */
export default function NewChecklist() {
  return <NotBuiltYet title={words.today.plus.things.checklist} header={<AppBar leading="close" />} />;
}
