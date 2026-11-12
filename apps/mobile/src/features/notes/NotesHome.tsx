import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { createFolder, type FolderResponse, type NoteItem, useGetNotes } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { useOpenThing } from '@/features/things/open';
import { timeAgo } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { MoreRow } from '@/ui/MoreRow';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { Rail } from '@/ui/Rail';
import { SectionHeader } from '@/ui/SectionHeader';
import { Sheet } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { NameSheet } from './NameSheet';
import { NoteMenu } from './NoteMenu';
import { NoteRow } from './NoteRow';

/** The emoji a pinned thing is drawn with when it has none of its own, by its kind. */
const PIN_EMOJI: Record<string, string> = { page: '📄', checklist: '✅', folder: '📓', sheet: '📊', board: '🧮' };

/**
 * 5.1 Notes, under Home's row of six places: what the person pinned, then the circle's spaces, each with
 * what is in it and who it is shared with; under them what changed lately, and a way to the pages and lists
 * that stand in no folder yet. One call brings all of it (`getNotes`).
 */
export function NotesHome() {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const open = useOpenThing();
  const asked = useGetNotes(circle.id);
  const load = loadState(asked);
  const [allSpaces, setAllSpaces] = useState(false);
  const [naming, setNaming] = useState(false);
  const [held, setHeld] = useState<NoteItem | null>(null);
  const home = asked.data;

  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!home) return load.offline ? <Loading offline /> : <Skeleton />;

  const spaces = home.spaces ?? [];
  const pinned = home.pinned ?? [];
  const recent = home.recent ?? [];
  const unfiled = home.unfiled ?? 0;
  const openSpace = (space: FolderResponse) => router.push({ pathname: '/folder/[id]', params: { id: space.id } });

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }}>
        {pinned.length ? (
          <>
            <SectionHeader title={words.notes.home.pinned} />
            <Rail>
              {pinned.map((item) => (
                <PinCard key={item.id} item={item} onPress={() => open(item)} onMore={() => setHeld(item)} />
              ))}
            </Rail>
          </>
        ) : null}

        <SectionHeader title={words.notes.home.spaces} onPress={() => setAllSpaces(true)} />
        {spaces.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: layout.barGutter }}>
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} onPress={() => openSpace(space)} />
            ))}
          </View>
        ) : (
          <View style={{ paddingVertical: 18 }}>
            <EmptyState emoji="📓" title={words.notes.home.empty.title} body={words.notes.home.empty.body} action={<Button label={words.notes.home.newSpace} inline icon={(c) => <Plus size={18} color={c} />} onPress={() => setNaming(true)} />} />
          </View>
        )}

        {recent.length ? (
          <>
            <SectionHeader title={words.notes.home.lately} />
            {recent.map((item) => (
              <NoteRow key={item.id} item={item} myMemberId={circle.myMemberId} onPress={() => open(item)} onMore={() => setHeld(item)} />
            ))}
          </>
        ) : null}
        {unfiled > 0 ? <MoreRow emoji="📦" title={words.notes.home.notFiled} rest={words.notes.home.notFiledRest(unfiled)} onPress={() => router.push({ pathname: '/folder/[id]', params: { id: 'unfiled', circle: circle.id } })} /> : null}
      </ScrollView>

      {/* Every space in a list, and the way to make one. */}
      <Sheet visible={allSpaces} onClose={() => setAllSpaces(false)} title={words.notes.home.allSpaces}>
        {spaces.map((space, index) => (
          <SpaceRow
            key={space.id}
            space={space}
            first={index === 0}
            onPress={() => {
              setAllSpaces(false);
              openSpace(space);
            }}
          />
        ))}
        <View style={{ paddingTop: 14, paddingHorizontal: layout.rowGutter }}>
          <Button
            label={words.notes.home.newSpace}
            variant="soft"
            size="lg"
            block
            icon={(c) => <Plus size={18} color={c} />}
            onPress={() => {
              setAllSpaces(false);
              setNaming(true);
            }}
          />
        </View>
      </Sheet>
      <NameSheet
        visible={naming}
        onClose={() => setNaming(false)}
        title={words.notes.name.newSpace}
        placeholder={words.notes.name.spacePlaceholder}
        withEmoji
        confirm={words.notes.name.create}
        onSubmit={async (title, emoji) => {
          const space = await createFolder({ clientId: newClientId(), circleId: circle.id, title, emoji });
          await cache.noteMade(circle.id);
          openSpace(space);
        }}
      />
      <NoteMenu item={held} onClose={() => setHeld(null)} />
    </>
  );
}

/** What a pinned thing says under its name: how much of a list is left and who is in it, when a page was changed, or where it stands. */
function pinLine(item: NoteItem): string | null {
  if (item.kind === 'checklist' && typeof item.left === 'number') {
    const hand = item.here?.[0];
    return words.notes.home.listLine(item.left, item.done ?? 0, hand?.who?.name ? words.notes.home.hand(hand.who.name, hand.did) : null);
  }
  if (item.kind === 'page' && item.editedAt) return words.things.page.edited(timeAgo(item.editedAt));
  return item.glance ?? null;
}

/** One pinned thing as a small card in the rail: its emoji, its name, and a line on where it stands. Holding it opens its menu (to take the pin away). */
function PinCard({ item, onPress, onMore }: { item: NoteItem; onPress: () => void; onMore: () => void }) {
  const { colors, shadow } = useTheme();
  const title = item.title?.trim() || words.things.untitled;
  const line = pinLine(item);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([title, line])}
      accessibilityHint={words.notes.space.hint}
      onPress={onPress}
      onLongPress={onMore}
      style={{ width: 150, minHeight: 112, padding: 14, gap: 3, borderRadius: radius.card, backgroundColor: colors.surface, boxShadow: shadow.sm, marginVertical: 4 }}>
      <View style={{ marginBottom: 6 }}>
        <Emoji char={item.emoji || PIN_EMOJI[item.kind ?? ''] || '📄'} size={28} />
      </View>
      <Txt variant="control" numberOfLines={2}>
        {title}
      </Txt>
      {line ? (
        <Txt variant="small" weight={500} color="muted" numberOfLines={2}>
          {line}
        </Txt>
      ) : null}
    </Tap>
  );
}

/** One space as a card in the grid of two: its emoji, its name, how much is in it, and who it is shared with. */
function SpaceCard({ space, onPress }: { space: FolderResponse; onPress: () => void }) {
  const { colors } = useTheme();
  const name = space.title.trim() || words.things.untitled;
  const inside = words.notes.home.inside(space.folders, space.pages);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([name, inside])}
      onPress={onPress}
      style={{ flexBasis: '47%', flexGrow: 1, alignItems: 'flex-start', gap: 3, padding: 15, borderRadius: radius.cardLarge, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.line }}>
      <View style={{ marginBottom: 6 }}>
        <Emoji char={space.emoji || '📓'} size={34} />
      </View>
      <Txt variant="headline" weight={800} numberOfLines={1}>
        {name}
      </Txt>
      <Txt variant="footnote" color="muted">
        {inside}
      </Txt>
      <View style={{ marginTop: 8 }}>
        <AudienceChip thing={space} quiet />
      </View>
    </Tap>
  );
}

/** One space as a row of the "Spaces" sheet. */
function SpaceRow({ space, first, onPress }: { space: FolderResponse; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const name = space.title.trim() || words.things.untitled;
  const inside = words.notes.home.inside(space.folders, space.pages);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([name, inside])}
      onPress={onPress}
      scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingVertical: 11, paddingHorizontal: layout.gutter, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Emoji char={space.emoji || '📓'} size={28} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="headline" weight={600} numberOfLines={1}>
          {name}
        </Txt>
        <Txt variant="footnote" color="muted">
          {inside}
        </Txt>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Tap>
  );
}

/** Grey shapes in the layout that is coming: the rail of pins, then the grid of spaces. */
function Skeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ paddingTop: layout.section }}>
      <Sk width={110} height={22} style={{ marginLeft: layout.rowGutter, marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: layout.barGutter, overflow: 'hidden' }}>
        {Array.from({ length: 3 }, (_, index) => (
          <Sk key={index} width={150} height={112} radius="card" />
        ))}
      </View>
      <Sk width={110} height={22} style={{ marginLeft: layout.rowGutter, marginTop: layout.section, marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: layout.barGutter }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Sk key={index} height={150} radius="cardLarge" style={{ flexBasis: '47%', flexGrow: 1 }} />
        ))}
      </View>
    </View>
  );
}
