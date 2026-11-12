import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BoardResponse } from '@/api/generated/homeport';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId } from '@/features/things/open';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { ListSkeleton } from '@/ui/Skeleton';
import { words } from '@/words';

import { BoardFrame } from './BoardFrame';
import { SCREENS } from './templates';
import { useBoard } from './useBoard';

/**
 * A board: a template that does work, opened. It reads the board as this person sees it today and draws the
 * screen of its template. While it loads and when it can't be read it keeps its Back; a board whose
 * template has no screen in this version of the app says so, kindly, and still shows who sees it and can
 * still be renamed or deleted.
 */
export function BoardScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const isBoard = looksLikeId(id);
  const asked = useBoard(id);
  if (!isBoard) return <NotFound />;

  const load = loadState(asked);
  const board = asked.data;
  if (load.error || !board) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppBar />
        {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : load.offline ? <Loading offline /> : <ListSkeleton />}
      </SafeAreaView>
    );
  }

  const Screen = SCREENS[board.template];
  if (!Screen) return <BoardToCome board={board} />;
  // Another board is another screen: nothing typed or opened on the last one is carried over.
  return <Screen key={board.id} board={board} />;
}

/** A board whose template's screen isn't in this version of the app yet. What is in it is kept; it opens with the next update. */
function BoardToCome({ board }: { board: BoardResponse }) {
  return (
    <BoardFrame board={board}>
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
        <EmptyState emoji={board.emoji || '🛠️'} title={board.title} body={words.templates.board.toCome} />
      </View>
    </BoardFrame>
  );
}
