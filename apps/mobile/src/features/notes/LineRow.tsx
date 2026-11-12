import { Check, EyeOff, Repeat } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { ItemResponse } from '@/api/generated/homeport';
import { timeAgo } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { WaitingMark } from './WaitingMark';
import { isRecent } from './when';

/** For how long after someone else added a line the list says who did. */
const NEW_FOR_MS = 60 * 60 * 1000;

type Props = {
  item: ItemResponse;
  /**
   * The list's own screen ticks round boxes. A list drawn inside a page ticks square ones and keeps the
   * page's margins: "page" in the text of a page, "form" under a small label, as on a page that is a surprise.
   */
  look?: 'list' | 'page' | 'form';
  /** True when the person may tick and change lines. */
  canEdit: boolean;
  /** A change to this line is on the phone and hasn't reached the API: it shows the small "waiting" mark. */
  waiting?: boolean;
  /** The currency of the list's amounts. */
  currency?: string;
  /** The reader's own member id: their own picture isn't shown on what they added themselves. */
  myMemberId?: string;
  onTick: () => void;
  /** Pressing the words: the line's own sheet. Left out, the words aren't pressable. */
  onMore?: () => void;
  /** Holding the words, where that means something else than pressing them (in a page: the block's menu). */
  onHold?: () => void;
};

/**
 * One line of a list: its box to tick, its words with the small print under them (a note, "Every week",
 * who can't see it, who just added it), whose job it is, and its amount. A ticked line is struck through.
 */
export function LineRow({ item, look = 'list', canEdit, waiting, currency, myMemberId, onTick, onMore, onHold }: Props) {
  const { colors } = useTheme();
  const inPage = look !== 'list';
  // In the text of a page a ticked line stays as readable as the rest: it is a step that was done, not a thing that is gone.
  const struck = item.done && look !== 'page';
  const tone = struck ? colors.muted : colors.text;
  const who = item.done ? null : (item.assignedTo ?? (item.addedBy && item.addedBy.memberId !== myMemberId ? item.addedBy : null));
  const justAdded = !item.done && item.addedBy && item.addedBy.memberId !== myMemberId && isRecent(item.addedAt, NEW_FOR_MS);

  const small = (key: string, text: string, icon?: ReactNode) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
      {icon}
      <Txt variant="footnote" color="muted" style={{ flexShrink: 1 }}>
        {text}
      </Txt>
    </View>
  );
  const said = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 }}>
        <Txt variant={look === 'page' ? 'body' : 'lead'} weight={600} style={{ flexShrink: 1, color: tone, textDecorationLine: struck ? 'line-through' : 'none' }}>
          {item.text}
        </Txt>
        {waiting ? <WaitingMark /> : null}
      </View>
      {item.note ? small('note', item.note) : null}
      {justAdded ? small('added', words.notes.list.addedBy(item.addedBy?.name ?? '', timeAgo(item.addedAt))) : null}
      {item.repeats ? small('repeats', words.notes.list.repeats[item.repeats], <Repeat size={13} color={colors.muted} />) : null}
      {item.hiddenFrom.length ? small('hidden', words.notes.list.hiddenFrom(item.hiddenFrom), <EyeOff size={13} color={colors.muted} />) : null}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: look === 'page' ? 8 : 10, paddingHorizontal: inPage ? 0 : layout.rowGutter }}>
      <Tap
        accessibilityRole="checkbox"
        accessibilityLabel={item.text}
        accessibilityState={{ checked: item.done, disabled: !canEdit }}
        // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
        aria-checked={item.done}
        disabled={!canEdit}
        hitSlop={10}
        onPress={onTick}
        scaleTo={0.88}
        style={{
          width: 24,
          height: 24,
          borderRadius: inPage ? radius.chip : radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: item.done ? 0 : 2,
          borderColor: colors.lineStrong,
          backgroundColor: item.done ? colors.accent : 'transparent',
        }}>
        {item.done ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
      </Tap>
      {canEdit && onMore ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.things.list.line(item.text)} onPress={onMore} onLongPress={onHold} scaleTo={0.99} style={{ flex: 1, flexDirection: 'row' }}>
          {said}
        </Tap>
      ) : (
        said
      )}
      {who ? <Avatar uri={who.avatarUrl} name={who.name ?? ''} size={24} /> : null}
      {item.amountCents === null ? null : (
        <Txt variant="item" weight={800}>
          {formatMoney(item.amountCents, currency)}
        </Txt>
      )}
    </View>
  );
}
