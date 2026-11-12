import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Ellipsis, EyeOff, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changePage, deleteThing, type PageResponse, useGetAudience, useGetLinks, useGetPage } from '@/api/generated/homeport';
import { useLeave } from '@/features/navigation/useLeave';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { ThingRow } from '@/features/things/ThingRow';
import { formatDayLong, timeAgo } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, textStyle, useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/**
 * A page: a title and words. Whoever may edit it types straight into it and saves; everyone else reads. Its
 * chip in the bar says who sees it and opens the audience sheet (4.3). A page that is hidden from someone
 * today says so under its title, and until when (4.4, "Keep it a surprise"). What it is linked to stands
 * under its words. Its owner can delete it. (Blocks, folders and live lists arrive with Notes.)
 */
export default function Page() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetPage(id);
  const load = loadState(asked);
  const page = asked.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !page ? (
        <>
          <AppBar />
          <View accessibilityLabel={words.states.loading} style={{ gap: 12, paddingTop: 14, paddingHorizontal: layout.rowGutter }}>
            <Sk width="75%" height={30} />
            <Sk width="35%" height={12} />
            <Sk height={14} style={{ marginTop: 10 }} />
            <Sk width="90%" height={14} />
            <Sk width="60%" height={14} />
          </View>
        </>
      ) : (
        <Loaded page={page} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ page }: { page: PageResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const leave = useLeave();
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = draft?.title ?? page.title;
  const body = draft?.body ?? page.body;
  const changed = draft !== null && (draft.title !== page.title || draft.body !== page.body);
  const unsaved = useUnsaved(changed);

  const hiddenFrom = page.chip.hiddenFrom ?? [];
  // Until when it is hidden is on the audience sheet's answer; the chip only has the names.
  const audience = useGetAudience(page.id, { query: { enabled: hiddenFrom.length > 0 } }).data;
  const hidden = audience?.people.filter((person) => person.hidden) ?? [];
  const through = hidden.length > 0 && hidden.every((person) => person.hiddenThrough && person.hiddenThrough === hidden[0]!.hiddenThrough) ? hidden[0]!.hiddenThrough! : null;
  const links = useGetLinks(page.id).data ?? [];

  const save = useMutation({
    mutationFn: () => changePage(page.id, { title: title.trim(), body }),
    onSuccess: async (saved) => {
      setDraft(null);
      await cache.pageSaved(saved);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(page.id),
    onSuccess: () => {
      setDeleting(false);
      unsaved.release();
      leave();
      void cache.thingDeleted(page);
    },
  });

  const write = (change: Partial<{ title: string; body: string }>) => setDraft({ title, body, ...change });
  const typing = [webNoOutline, { padding: 0, color: colors.text }] as const;

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <AppBar
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={page} />
            {changed ? <BarLink label={words.things.save} disabled={save.isPending} onPress={() => save.mutate()} /> : page.mine ? <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setMenu(true)} /> : null}
          </View>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingTop: 4, paddingHorizontal: layout.rowGutter }}>
          {page.canEdit ? (
            <TextInput
              accessibilityLabel={words.things.page.title}
              placeholder={words.things.page.titlePlaceholder}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={title}
              onChangeText={(next) => write({ title: next })}
              maxLength={200}
              multiline
              scrollEnabled={false}
              style={[...typing, textStyle('heading'), { marginTop: 10 }]}
            />
          ) : (
            <Txt variant="heading" accessibilityRole="header" style={{ marginTop: 10 }}>
              {page.title.trim() || words.things.untitled}
            </Txt>
          )}
          <Txt variant="footnote" color="muted" style={{ marginTop: 6, marginBottom: 14 }}>
            {words.things.page.edited(timeAgo(page.updatedAt))}
          </Txt>
        </View>

        {hiddenFrom.length ? (
          <NoteBox soft icon={(c) => <EyeOff size={20} color={c} />} title={words.sharing.surprise.title(hidden.length ? hidden.map((person) => firstName(person.name)) : hiddenFrom, through ? formatDayLong(through) : null)} style={{ marginBottom: 14, marginHorizontal: layout.barGutter }}>
            {words.sharing.surprise.body(!!through)}
          </NoteBox>
        ) : null}

        <View style={{ paddingHorizontal: layout.rowGutter }}>
          {page.canEdit ? (
            <TextInput
              accessibilityLabel={words.things.page.body}
              placeholder={words.things.page.bodyPlaceholder}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={body}
              onChangeText={(next) => write({ body: next })}
              maxLength={100000}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={[...typing, textStyle('body'), { minHeight: 160 }]}
            />
          ) : (
            <>
              <Txt selectable>{page.body}</Txt>
              <Txt variant="footnote" color="muted" style={{ marginTop: 18 }}>
                {words.things.page.viewOnly}
              </Txt>
            </>
          )}
          {save.isError ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10 }}>
              {messageFor(save.error)}
            </Txt>
          ) : null}
        </View>

        {links.length ? (
          <>
            <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.things.linked}</GroupLabel>
            <RowGroup>
              {links.map((thing, index) => (
                <ThingRow key={thing.id} look="grouped" first={index === 0} thing={thing} />
              ))}
            </RowGroup>
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetRow
          first
          danger
          icon={(c) => <Trash2 size={22} color={c} />}
          label={words.things.page.delete}
          onPress={() => {
            setMenu(false);
            setDeleting(true);
          }}
        />
      </Sheet>
      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={words.things.page.deleteAsk.title}
        body={words.things.page.deleteAsk.body}
        confirm={words.things.page.deleteAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={words.things.discard.title} body={words.things.discard.body} confirm={words.things.discard.confirm} cancel={words.things.discard.cancel} onConfirm={unsaved.leave} />
    </AvoidKeyboard>
  );
}
