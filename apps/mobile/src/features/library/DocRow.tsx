import { Bell, Folder, Lock, TriangleAlert } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { AlbumResponse, DocumentCard } from '@/api/generated/homeport';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { formatDay, formatMonthShort, timeAgo } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The small line under a document's name: what it says, the icon before it, and whether it wants attention. */
export type DocLine = { text: string; icon: 'bell' | 'alert' | null; warn: boolean };

/** The day that matters about a document, in a few words: "Expires 2 Aug 2027", "Runs out in 19 days". Null when it has none. */
export function keyDateWords(document: DocumentCard): string | null {
  const key = document.keyDate;
  if (!key?.date) return null;
  return words.library.files.keyDate(key.label, formatDay(key.date), formatMonthShort(key.date), key.daysLeft ?? 0, !!key.soon);
}

/**
 * What a document's row says under its name, by what the document knows about itself: the day that matters
 * (in the warning colour when it is time to act, with a bell once a reminder is set), a receipt's total and
 * its warranty, what it is linked from, or how many pages it has and whose page it is on.
 */
export function docLine(document: DocumentCard): DocLine {
  const says = words.library.files;
  const key = document.keyDate;
  const amount = document.amountCents != null ? formatMoney(document.amountCents, document.currency ?? undefined) : null;
  if (key?.date) {
    const late = (key.daysLeft ?? 0) < 0;
    if (amount && !key.soon && !late) {
      return { text: words.common.join([amount, says.keyDateAfter(key.label, formatDay(key.date), formatMonthShort(key.date), key.daysLeft ?? 0, false)]), icon: null, warn: false };
    }
    const text = words.common.join([keyDateWords(document), document.reminderSet ? says.reminderSet : null]);
    if (key.soon || late) return { text, icon: 'alert', warn: true };
    return { text, icon: document.reminderSet ? 'bell' : null, warn: false };
  }
  if (document.linkedFrom) return { text: says.linkedFrom(document.linkedFrom), icon: null, warn: false };
  const about = (document.about ?? []).map((person) => firstName(person.name)).filter(Boolean);
  const facts = words.common.join([amount, document.pages ? says.pages(document.pages) : null, about.length ? says.onPage(about[0]!) : null]);
  return { text: facts || says.added(timeAgo(document.addedAt ?? new Date().toISOString())), icon: null, warn: false };
}

/** A document as a small sheet of paper with a few lines on it and what kind of file it is: PDF, JPG, ID. */
export function DocThumb({ badge }: { badge?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 46, height: 58, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface }}>
      <View style={{ gap: 5, marginTop: 9, marginHorizontal: 7 }}>
        {[0, 1, 2].map((line) => (
          <View key={line} style={{ height: 3, backgroundColor: colors.fill2 }} />
        ))}
      </View>
      {badge ? (
        <View style={{ position: 'absolute', left: 5, bottom: 5, paddingVertical: 1, paddingHorizontal: 5, borderRadius: radius.chip, backgroundColor: colors.text }}>
          <Txt variant="micro" allowFontScaling={false} style={{ color: colors.bg }}>
            {badge}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A document in the list of files: its sheet of paper, its name, the line that says what matters about
 * it, and who can see it (or a lock when it is kept in the Vault). Pressing opens the document.
 */
export function DocRow({ document, onPress }: { document: DocumentCard; onPress: () => void }) {
  const { colors } = useTheme();
  const line = docLine(document);
  const color = line.warn ? colors.warn : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.library.files.row(document.title ?? '', document.badge, line.text)}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 7, paddingHorizontal: layout.rowGutter, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      <DocThumb badge={document.badge} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={1}>
          {document.title?.trim() || words.things.untitled}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {line.icon === 'bell' ? <Bell size={13} color={color} /> : line.icon === 'alert' ? <TriangleAlert size={13} color={color} /> : null}
          <Txt variant="footnote" weight={line.warn ? 700 : 500} numberOfLines={2} style={{ flex: 1, color }}>
            {line.text}
          </Txt>
        </View>
      </View>
      {document.inVault ? (
        <View accessible accessibilityLabel={words.library.files.inVault}>
          <Lock size={18} color={colors.muted} />
        </View>
      ) : (
        <AudienceChip thing={document} quiet />
      )}
    </Pressable>
  );
}

/** A folder of files as a row: a folder on a tile, its name, how many files it holds, and who can see it. */
export function FolderRow({ folder, onPress }: { folder: AlbumResponse; onPress: () => void }) {
  const { colors } = useTheme();
  const line = words.library.files.inFolder(folder.count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.library.files.folder(folder.title, line)}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
        <Folder size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={1}>
          {folder.title}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      <AudienceChip thing={folder} quiet />
    </Pressable>
  );
}
