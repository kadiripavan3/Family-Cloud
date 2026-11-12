import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/**
 * /new/scan, still to be built with Library: a document, scanned with the camera or picked as a file. One of the ten things the + sheet opens. It goes into
 * the current circle (`useCircle()`); the + sheet hands over who it starts as seen by as `?audience=me` or
 * `?audience=circle` when the person changed it there (send it as the request's `audience`, or leave that out).
 */
export default function NewScan() {
  return <NotBuiltYet title={words.today.plus.things.scan} header={<AppBar leading="close" />} />;
}
