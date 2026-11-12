import { Bell, Calendar, Check, FileText, SquareCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';

import { type JotResponse, type ReadAs, useGetChecklists } from '@/api/generated/homeport';
import { layout, useTheme } from '@/theme';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  /** The jot being moved; null while the sheet is shut. */
  jot: JotResponse | null;
  circleId: string;
  onClose: () => void;
  onMove: (to: ReadAs, listId?: string) => void;
  /** Why the move didn't work, in the API's words. */
  problem?: string | null;
};

/**
 * Where a jot can go instead: a reminder, an event, a note, or one of the circle's lists the person may add
 * to. What it is now is marked and can't be picked again.
 */
export function MoveSheet({ jot, circleId, onClose, onMove, problem }: Props) {
  const { colors } = useTheme();
  // Only asked for once the sheet opens.
  const lists = useGetChecklists(circleId, { limit: 50 }, { query: { enabled: !!jot } });
  const mark = (now: boolean): ReactNode => (now ? <Check size={18} color={colors.ok} strokeWidth={2.6} /> : null);
  const kinds = [
    { to: 'reminder', label: words.jot.filed.moveSheet.reminder, icon: Bell },
    { to: 'event', label: words.jot.filed.moveSheet.event, icon: Calendar },
    { to: 'note', label: words.jot.filed.moveSheet.note, icon: FileText },
  ] as const;
  return (
    <Sheet visible={!!jot} onClose={onClose} title={jot ? words.jot.filed.moveSheet.title(jot.title) : undefined} subtitle={words.jot.filed.moveSheet.body}>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {problem}
        </Txt>
      ) : null}
      {kinds.map(({ to, label, icon: Icon }, index) => {
        const now = jot?.became === to && !jot.gone;
        return <SheetRow key={to} first={index === 0} icon={(c) => <Icon size={22} color={c} />} label={label} note={now ? words.jot.filed.moveSheet.now : undefined} trailing={mark(now)} onPress={now ? undefined : () => onMove(to)} />;
      })}
      {(lists.data?.items ?? [])
        .filter((list) => list.id)
        .map((list) => {
          const now = jot?.became === 'list_item' && jot.thingId === list.id && !jot.gone;
          return (
            <SheetRow
              key={list.id}
              icon={(c) => <SquareCheck size={22} color={c} />}
              label={words.jot.filed.moveSheet.list(list.title ?? '')}
              note={now ? words.jot.filed.moveSheet.now : undefined}
              trailing={mark(now)}
              onPress={now ? undefined : () => onMove('list_item', list.id)}
            />
          );
        })}
    </Sheet>
  );
}
