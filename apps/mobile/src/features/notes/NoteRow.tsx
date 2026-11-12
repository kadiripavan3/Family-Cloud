import { ChevronDown, ChevronRight, EyeOff, Folder, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import type { NoteItem } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { isRecent, shortAgo } from './when';

/** For how long after someone else changed a page its row says who, and how long ago. */
const FRESH_FOR_MS = 48 * 60 * 60 * 1000;
/** How far each level of folders moves its rows in. */
const STEP = 28;

/** The kinds whose icon is drawn in the accent's colour: the ones that do something (a list to tick, a sheet that adds up). */
const LIVELY = ['checklist', 'sheet', 'board'];

type Props = {
  item: NoteItem;
  /** How deep it is inside folders: 0 for what stands in the space itself. */
  depth?: number;
  /** For a folder: whether what is in it is showing. */
  open?: boolean;
  /** The row the person opened last: it stays marked, so they find their place again. */
  current?: boolean;
  /** The reader's own member id: a page they changed themselves doesn't say so. */
  myMemberId?: string;
  onPress: () => void;
  /** Holding the row: its menu. */
  onMore?: () => void;
};

/** What stands at the end of a row, by what it is: how much is in a folder, how much is left of a list, who it is hidden from, who changed it. */
function end(item: NoteItem, myMemberId: string | undefined): { text?: string; who?: NoteItem['editedBy']; icon?: LucideIcon; spoken?: string } {
  const hiddenFrom = item.chip?.hiddenFrom ?? [];
  if (item.kind === 'folder') return item.pages ? { text: String(item.pages), spoken: words.notes.space.pages(item.pages) } : {};
  if (hiddenFrom.length) return { text: words.sharing.chip.not(hiddenFrom), icon: EyeOff };
  if (item.kind === 'checklist' && typeof item.left === 'number') {
    const text = item.left === 0 && (item.done ?? 0) > 0 ? words.notes.space.allDone : words.notes.space.left(item.left);
    const here = item.here?.[0]?.who;
    return { text, who: here, spoken: here ? words.common.join([text, words.notes.home.hand(here.name ?? '', item.here?.[0]?.did)]) : text };
  }
  if (item.kind === 'page') {
    const by = item.editedBy;
    if (by && by.memberId !== myMemberId && item.editedAt && isRecent(item.editedAt, FRESH_FOR_MS)) {
      const ago = shortAgo(item.editedAt);
      return { text: ago, who: by, spoken: words.notes.space.editedBy(by.name ?? '', ago) };
    }
    return {};
  }
  return item.glance ? { text: item.glance } : {};
}

/**
 * One row of a space: a folder with its twisty, or a page, a list, a sheet; its name; and a few quiet words
 * at the end. Pressing a folder shows what is in it, in place; pressing anything else opens it. Holding a
 * row opens its menu.
 */
export function NoteRow({ item, depth = 0, open, current, myMemberId, onPress, onMore }: Props) {
  const { colors } = useTheme();
  const folder = item.kind === 'folder';
  const kind = kindOf(item.kind);
  const Icon = folder ? Folder : kind.icon;
  const title = item.title?.trim() || words.things.untitled;
  const last = end(item, myMemberId);
  const Twisty = open ? ChevronDown : ChevronRight;
  const EndIcon = last.icon;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([title, folder ? words.notes.space.kinds.folder : kind.name, last.spoken ?? last.text, folder ? (open ? words.notes.space.fold(title) : words.notes.space.unfold(title)) : null])}
      accessibilityHint={onMore ? words.notes.space.hint : undefined}
      aria-expanded={folder ? !!open : undefined}
      onPress={onPress}
      onLongPress={onMore}
      scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 11, paddingRight: 20, paddingLeft: 14 + depth * STEP, backgroundColor: current ? colors.fill : 'transparent' }}>
      <View style={{ width: 18, alignItems: 'center' }}>{folder ? <Twisty size={16} color={colors.muted} /> : null}</View>
      <Icon size={20} color={LIVELY.includes(item.kind ?? '') ? colors.accentText : colors.muted} />
      <Txt variant="lead" weight={600} numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Txt>
      {last.text || last.who ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {last.who ? <Avatar uri={last.who.avatarUrl} name={last.who.name ?? ''} size={20} /> : null}
          {EndIcon ? <EndIcon size={14} color={colors.muted} /> : null}
          {last.text ? (
            <Txt variant="footnote" weight={600} color="muted" numberOfLines={1}>
              {last.text}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Tap>
  );
}
