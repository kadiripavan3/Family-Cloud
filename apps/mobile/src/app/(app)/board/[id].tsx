import { useLocalSearchParams } from 'expo-router';

import { BoardScreen } from '@/features/templates/BoardScreen';

/**
 * A board: a thing of kind `board`, opened at `/board/<id>` by every list of mixed things (`useOpenThing`).
 * Whichever template it was started from, it opens here; `BoardScreen` reads it and draws that template's
 * own screen.
 */
export default function Board() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BoardScreen id={id} />;
}
