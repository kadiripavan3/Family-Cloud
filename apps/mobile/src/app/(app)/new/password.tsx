import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { AppBar } from '@/ui/AppBar';
import { words } from '@/words';

/**
 * /new/password, still to be built with Vault: a login, a card or a code, scrambled on the phone. One of the ten things the + sheet opens. It goes into
 * the current circle (`useCircle()`); the + sheet hands over who it starts as seen by as `?audience=me` or
 * `?audience=circle` when the person changed it there (send it as the request's `audience`, or leave that out).
 */
export default function NewPassword() {
  return <NotBuiltYet title={words.today.plus.things.password} header={<AppBar leading="close" />} />;
}
