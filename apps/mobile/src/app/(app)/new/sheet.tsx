import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/**
 * /new/sheet, still to be built with Money: a table that does the maths. One of the ten things the + sheet opens. It goes into
 * the current circle (`useCircle()`); the + sheet hands over who it starts as seen by as `?audience=me` or
 * `?audience=circle` when the person changed it there (send it as the request's `audience`, or leave that out).
 */
export default function NewSheet() {
  return <NotBuiltYet title={words.today.plus.things.sheet} header={<AppBar leading="close" />} />;
}
