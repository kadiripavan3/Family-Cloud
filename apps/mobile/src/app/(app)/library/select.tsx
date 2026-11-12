import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Download, EyeOff, Layers, Lock, type LucideIcon, Route, Share, Trash2 } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addToAlbum, createAlbum, deleteSelected, hideSelected, shareSelected, useGetAlbum, useGetWallInfinite } from '@/api/generated/homeport';
import { more, paged, rows, useEveryPage } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { tellHref, tellOnly } from '@/features/journeyLink/tell/start';
import { AlbumPickSheet } from '@/features/library/AlbumPickSheet';
import { cleaned, narrowFrom } from '@/features/library/narrow';
import { PhotoTile } from '@/features/library/PhotoTile';
import { saveFiles } from '@/features/library/save';
import { useToast } from '@/features/library/Toast';
import { type WallItem, wallItems } from '@/features/library/types';
import { useLeave } from '@/features/navigation/useLeave';
import { PageProblem } from '@/features/states/PageProblem';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { GlassBar } from '@/ui/GlassBar';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.select;
/** The API takes this many at once. */
const MOST = 500;
const GAP = 2;
type Open = 'share' | 'album' | 'hide' | 'delete' | null;

/**
 * 6.9 Select and share: the same photos as where the person came from (the wall, a moment, an album, a
 * place), as a grid to pick from. One bar does everything to what is picked: who sees it, an album to put
 * it in, hiding it from one person, saving copies, deleting. Each says how many it was done to, because
 * only the ones that are yours can be changed. With `?into=<album>` it is the way photos are put into an
 * album from the album's own page.
 */
export default function Select() {
  const params = useLocalSearchParams<{ first?: string; into?: string; kind?: string; loved?: string; by?: string; about?: string; place?: string; album?: string; moment?: string }>();
  const { colors } = useTheme();
  const leave = useLeave();
  const router = useRouter();
  const cache = useCache();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const circle = useCircle();
  const { kind, loved, by, about, place, album, moment, into, first } = params;
  const narrow = useMemo(() => cleaned(narrowFrom({ kind, loved, by, about, place, album, moment })), [kind, loved, by, about, place, album, moment]);

  const wall = useGetWallInfinite(circle.id, { ...narrow, limit: 90 }, { query: paged });
  const target = useGetAlbum(into ?? '', { query: { enabled: !!into } });
  const load = loadState(wall);
  const pages = wall.data;
  const items = useMemo(() => wallItems(rows(pages)), [pages]);

  // What is picked, in the order it was picked. With "Select all" it is everything, less what was unpicked since.
  const [picked, setPicked] = useState<string[]>(first ? [first] : []);
  const [all, setAll] = useState(false);
  const [unpicked, setUnpicked] = useState<string[]>([]);
  useEveryPage(all ? wall : { hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined });
  const ids = all ? items.filter((item) => !unpicked.includes(item.id)).map((item) => item.id).slice(0, MOST) : picked;
  const chosen = items.filter((item) => ids.includes(item.id));
  const toggle = (item: WallItem) => {
    if (all) setUnpicked((now) => (now.includes(item.id) ? now.filter((id) => id !== item.id) : [...now, item.id]));
    else setPicked((now) => (now.includes(item.id) ? now.filter((id) => id !== item.id) : now.length < MOST ? [...now, item.id] : now));
  };
  const clear = () => {
    setAll(false);
    setUnpicked([]);
    setPicked([]);
  };

  const [open, setOpen] = useState<Open>(null);
  const [some, setSome] = useState<string[] | null>(null);
  const { say, toast } = useToast(insets.bottom + 108);
  const albumDraft = useRef(newClientId());
  const others = membersOf(circle).filter((member) => member.id !== circle.myMemberId && member.kind !== 'pet');
  const everyone = words.kinds[circle.kind].everyone(circle.name);

  const share = useMutation({
    mutationFn: async (to: { audience: 'me' | 'circle' } | { audience: 'some'; people: string[] }) => {
      const people = to.audience === 'some' ? to.people : [];
      const result = await shareSelected({ ids, audience: to.audience, people: to.audience === 'some' ? people.map((memberId) => ({ memberId, access: 'view' as const })) : undefined });
      const who = to.audience === 'me' ? says.onlyYou : to.audience === 'circle' ? says.everyone(everyone) : says.names(others.filter((member) => people.includes(member.id)).map((member) => firstName(member.name)));
      return says.shared(result.applied ?? 0, result.skipped ?? 0, who);
    },
    onSuccess: async (message) => {
      setOpen(null);
      setSome(null);
      say(message);
      await cache.selectionChanged(circle.id);
    },
  });
  const hide = useMutation({
    mutationFn: async (member: { id: string; name: string }) => {
      const result = await hideSelected({ ids, memberId: member.id });
      return says.hidden(result.applied ?? 0, result.skipped ?? 0, firstName(member.name));
    },
    onSuccess: async (message) => {
      setOpen(null);
      say(message);
      await cache.selectionChanged(circle.id);
    },
  });
  const intoAlbum = useMutation({
    mutationFn: async (to: { id?: string; title: string }) => {
      if (to.id) {
        const result = await addToAlbum(to.id, { itemIds: ids });
        return { id: to.id, message: says.added(result.applied ?? 0, result.skipped ?? 0, to.title) };
      }
      const made = await createAlbum({ clientId: albumDraft.current, circleId: circle.id, title: to.title, itemIds: ids });
      return { id: made.id, message: says.added(made.count, Math.max(0, ids.length - made.count), made.title) };
    },
    onSuccess: async (result) => {
      albumDraft.current = newClientId();
      await cache.albumChanged({ id: result.id, circleId: circle.id });
      // From an album's own page, adding is all there was to do here.
      if (into) return leave();
      setOpen(null);
      say(result.message);
    },
    onError: (error) => (into ? say(messageFor(error)) : undefined),
  });
  const remove = useMutation({
    mutationFn: () => deleteSelected({ ids }),
    onSuccess: async (result) => {
      const gone = ids;
      setOpen(null);
      clear();
      say(says.deleted(result.applied ?? 0, result.skipped ?? 0));
      await cache.selectionDeleted(circle.id, gone);
    },
  });
  const save = async () => {
    const result = await saveFiles(chosen.map((item) => ({ url: item.fileUrl ?? '' })));
    say(result === 'saved' ? says.saved(chosen.length) : result === 'opened' ? says.opened : says.notSaved);
  };
  /** An action needs something picked: without it, the bar says so. */
  const withPicked = (act: () => void) => () => (ids.length === 0 ? say(says.pickFirst) : act());

  const side = (width - GAP * 2) / 3 - 0.01;
  const none = (
    <View style={{ paddingTop: 80 }}>
      <EmptyState emoji="📷" title={says.none.title} body={says.none.body} />
    </View>
  );
  const allPicked = items.length > 0 && ids.length >= Math.min(items.length, MOST) && !wall.hasNextPage;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        left={<BarLink label={words.common.cancel} quiet onPress={leave} />}
        title={into && ids.length === 0 ? says.into.title(target.data?.title ?? '') : says.title(ids.length)}
        trailing={
          allPicked ? (
            <BarLink label={says.clear} onPress={clear} />
          ) : (
            <BarLink
              label={says.all}
              disabled={items.length === 0}
              onPress={() => {
                setAll(true);
                setUnpicked([]);
              }}
            />
          )
        }
      />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !pages ? (
        <Loading offline={load.offline} />
      ) : (
        <List
          data={items}
          columns={3}
          keyOf={(item) => item.id}
          row={(item, index) => {
            const order = ids.indexOf(item.id);
            const on = order >= 0;
            return (
              <PhotoTile item={item} plain state={on ? says.selected(order + 1) : says.notSelected} onPress={() => toggle(item)} style={{ width: side, height: side, marginBottom: GAP, marginRight: index % 3 === 2 ? 0 : GAP }}>
                {on ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: colors.accent, backgroundColor: withAlpha(colors.white, 0.14) }} /> : null}
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white, backgroundColor: on ? colors.accent : withAlpha(colors.black, 0.18) }}>
                  {on ? (
                    <Txt variant="caption" weight={800} allowFontScaling={false} style={{ color: colors.onAccent }}>
                      {order + 1}
                    </Txt>
                  ) : null}
                </View>
              </PhotoTile>
            );
          }}
          empty={none}
          bottom={insets.bottom + 120}
          loadingMore={wall.isFetchingNextPage}
          {...more(wall)}
        />
      )}

      {into ? (
        <View style={{ position: 'absolute', left: layout.rowGutter, right: layout.rowGutter, bottom: Math.max(insets.bottom, 24) }}>
          <Button label={says.into.add(ids.length)} size="lg" block disabled={ids.length === 0} loading={intoAlbum.isPending} onPress={() => intoAlbum.mutate({ id: into, title: target.data?.title ?? '' })} />
        </View>
      ) : (
        <GlassBar radius="pill" style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 24) }} contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minHeight: 70, paddingHorizontal: 6 }}>
          <BarButton icon={Share} label={says.bar.share} onPress={withPicked(() => setOpen('share'))} />
          <BarButton icon={Layers} label={says.bar.album} onPress={withPicked(() => setOpen('album'))} />
          <BarButton
            icon={Route}
            label={says.bar.journey}
            accent
            onPress={withPicked(() => {
              // "Tell it as a journey" (10.5), with only what is picked: drafted from the album or the moment it is in.
              tellOnly(ids);
              router.push(tellHref(narrow.album ? { album: narrow.album, circleId: circle.id } : { moment: narrow.moment ?? ids[0], circleId: circle.id }));
            })}
          />
          <BarButton icon={EyeOff} label={says.bar.hide} onPress={withPicked(() => setOpen('hide'))} />
          <BarButton icon={Download} label={says.bar.save} onPress={withPicked(() => void save())} />
          <BarButton icon={Trash2} label={says.bar.delete} onPress={withPicked(() => setOpen('delete'))} />
        </GlassBar>
      )}
      {toast}

      <Sheet
        visible={open === 'share'}
        onClose={() => {
          setOpen(null);
          setSome(null);
        }}
        title={says.share.title(ids.length)}
        subtitle={says.share.note}>
        {share.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
            {messageFor(share.error)}
          </Txt>
        ) : null}
        {some === null ? (
          <>
            <SheetRow first icon={(c) => <Lock size={22} color={c} />} label={words.sharing.sheet.onlyYou.label} note={words.sharing.sheet.onlyYou.note} onPress={share.isPending ? undefined : () => share.mutate({ audience: 'me' })} />
            {circle.kind === 'solo' ? null : <SheetRow icon={() => <Emoji char={words.kinds[circle.kind].emoji} size={24} />} label={everyone} onPress={share.isPending ? undefined : () => share.mutate({ audience: 'circle' })} />}
            {others.length > 0 ? <SheetRow icon={() => <Avatar uri={others[0]!.avatarUrl} name={others[0]!.name} size={24} />} label={says.share.some} note={says.share.someNote} onPress={() => setSome([])} /> : null}
          </>
        ) : (
          <>
            {others.map((member, index) => {
              const on = some.includes(member.id);
              return (
                <Pressable
                  key={member.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={member.name}
                  accessibilityState={{ checked: on }}
                  // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
                  aria-checked={on}
                  onPress={() => setSome(on ? some.filter((id) => id !== member.id) : [...some, member.id])}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8, paddingHorizontal: layout.gutter, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
                  <Avatar uri={member.avatarUrl} name={member.name} size={40} />
                  <Txt variant="headline" weight={600} numberOfLines={1} style={{ flex: 1 }}>
                    {member.name}
                  </Txt>
                  <View style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
                    {on ? <Check size={16} color={colors.onAccent} strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            })}
            <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 14 }}>
              <Button label={says.share.withThem} size="lg" block disabled={some.length === 0} loading={share.isPending} onPress={() => share.mutate({ audience: 'some', people: some })} />
            </View>
          </>
        )}
      </Sheet>

      <Sheet visible={open === 'hide'} onClose={() => setOpen(null)} title={says.hide.title(ids.length)} subtitle={says.hide.note}>
        {hide.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
            {messageFor(hide.error)}
          </Txt>
        ) : null}
        {others.map((member, index) => (
          <SheetRow key={member.id} first={index === 0} icon={() => <Avatar uri={member.avatarUrl} name={member.name} size={40} />} label={member.name} onPress={hide.isPending ? undefined : () => hide.mutate({ id: member.id, name: member.name })} />
        ))}
      </Sheet>

      <AlbumPickSheet
        circleId={circle.id}
        visible={open === 'album'}
        onClose={() => setOpen(null)}
        busy={intoAlbum.isPending}
        problem={intoAlbum.isError ? messageFor(intoAlbum.error) : null}
        onPick={(to) => intoAlbum.mutate({ id: to.id, title: to.title })}
        onNew={(title) => intoAlbum.mutate({ title })}
      />
      <ConfirmSheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title={says.deleteAsk.title(ids.length)}
        body={says.deleteAsk.body}
        confirm={says.deleteAsk.confirm(ids.length)}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </SafeAreaView>
  );
}

/** One thing the bar does: an icon over a word. */
function BarButton({ icon: Icon, label, onPress, accent }: { icon: LucideIcon; label: string; onPress: () => void; accent?: boolean }) {
  const { colors } = useTheme();
  const color = accent ? colors.accentText : colors.text;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.92} style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 10 }}>
      <Icon size={22} color={color} />
      <Txt variant="micro" weight={700} numberOfLines={1} style={{ color }}>
        {label}
      </Txt>
    </Tap>
  );
}
