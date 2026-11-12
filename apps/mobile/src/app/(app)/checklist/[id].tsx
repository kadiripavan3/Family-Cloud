import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUp, Ellipsis, Eye, EyeOff, FolderInput, ListX, Mic, Pencil, Pin, PinOff, Plus, ShoppingBasket, Trash2 } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type ChecklistResponse, clearDoneItems, lookAtChecklist, renameChecklist } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import { useLeave } from '@/features/navigation/useLeave';
import { useNoteActions } from '@/features/notes/actions';
import { steadyKeys } from '@/features/notes/changes/apply';
import { LineRow } from '@/features/notes/LineRow';
import { LineSheet } from '@/features/notes/LineSheet';
import { underHeadings, useList } from '@/features/notes/list';
import { useLiveList } from '@/features/notes/live';
import { MoveSheet } from '@/features/notes/MoveSheet';
import { NameSheet } from '@/features/notes/NameSheet';
import { useCircleOf } from '@/features/notes/people';
import { WaitingNote } from '@/features/notes/WaitingNote';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { formatMoney } from '@/lib/money';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { rich } from '@/ui/rich';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { ListSkeleton } from '@/ui/Skeleton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/**
 * 5.5 A shared list, and 13.2 the same list offline. Lines under their headings, with ticks, amounts and
 * their sum; who else is in it right now; what it held before, one tap away; a box at the bottom that adds
 * line after line with the keyboard staying up. While it is open it asks again every few seconds with the
 * version it has, so another person's ticks appear by themselves.
 *
 * Nothing here calls the API to change a line. A tick, a new line, a changed or removed one goes into the
 * queue of changes (`features/notes/changes`): it is on the screen at once, goes up when it can, and waits
 * on the phone, marked "waiting", when there is no connection.
 */
export default function Checklist() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useLiveList(id);
  const load = loadState(asked);
  const list = asked.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !list ? (
        <>
          <AppBar />
          {load.offline ? <Loading offline /> : <ListSkeleton count={6} />}
        </>
      ) : (
        <Loaded loaded={list} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ loaded }: { loaded: ChecklistResponse }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cache = useCache();
  const leave = useLeave();
  const actions = useNoteActions();
  const online = useOnline();
  const circle = useCircleOf(loaded.circleId);
  const { list, marked, waiting, target, tick, add, change, remove } = useList(loaded);
  const [typed, setTyped] = useState('');
  const [sheet, setSheet] = useState<'menu' | 'rename' | 'move' | 'delete' | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [micSaid, setMicSaid] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const line = list.items.find((item) => item.id === lineId) ?? null;
  const thing = { ...loaded, kind: 'checklist' };

  /** What the API sends back whole is shown as it is: the list with its name changed, its ticked lines cleared, or shown another way. */
  const direct = { onSuccess: (saved: ChecklistResponse) => void cache.listSent(saved.id, saved) };
  const look = useMutation({ mutationFn: (showTicked: boolean) => lookAtChecklist(list.id, { showTicked }), ...direct });
  const clear = useMutation({ mutationFn: () => clearDoneItems(list.id), ...direct });
  const aisles = useMutation({ mutationFn: (on: boolean) => renameChecklist(list.id, { aisles: on }), ...direct });
  const problem = [look, clear, aisles, actions.pin].find((one) => one.isError)?.error;

  const groups = underHeadings(list, list.showTicked);
  const steady = steadyKeys(waiting.aliases);
  const hidden = list.showTicked ? 0 : list.done;
  // Who is in it right now is only known while the phone can ask.
  const here = online ? list.here.flatMap((hand) => (hand.who ? [{ ...hand, who: hand.who }] : [])) : [];
  // What it held before, without what is on it again already (also what was just added and still waits).
  const again = list.suggestions.flatMap((one) => (one.text && !list.items.some((item) => item.text.toLowerCase() === one.text?.toLowerCase()) ? [one.text] : []));
  const canAdd = typed.trim().length > 0;

  const addLine = (text: string) => {
    add(text.trim());
    setTyped('');
    setMicSaid(false);
    // The new line is the last one: bring it into view under the keyboard's edge.
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  };
  const close = () => setSheet(null);

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <AppBar
        title={list.title.trim() || words.things.untitled}
        subtitle={words.things.list.left(list.left, list.left + list.done)}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={loaded} />
            <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setSheet('menu')} />
          </View>
        }
      />
      <WaitingNote target={target} waiting={waiting} offline={words.notes.list.offline} resting={words.notes.list.resting} />

      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {here.length ? (
          <View accessible style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.barGutter, marginBottom: 2, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: radius.cardLarge, backgroundColor: colors.fill }}>
            <Avatar uri={here[0]!.who.avatarUrl} name={here[0]!.who.name ?? ''} size={28} />
            <Txt variant="caption" weight={500} color="muted" style={{ flexShrink: 1 }}>
              {rich(
                words.notes.list.here(
                  here.map((hand) => hand.who.name ?? ''),
                  here[0]!.did,
                ),
                {
                  name: (text) => (
                    <Txt variant="caption" weight={700}>
                      {text}
                    </Txt>
                  ),
                },
              )}
            </Txt>
          </View>
        ) : null}

        {list.items.length === 0 ? (
          <Txt variant="callout" color="muted" style={{ marginTop: 22, marginHorizontal: layout.gutter }}>
            {words.things.list.empty}
          </Txt>
        ) : null}
        {groups.map((group) => (
          <View key={group.heading}>
            {group.heading ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{group.heading}</GroupLabel> : <View style={{ height: 8 }} />}
            {group.items.map((item) => (
              <LineRow key={steady(item.id)} item={item} canEdit={list.canEdit} waiting={waiting.held && marked.has(item.id)} currency={list.currency} myMemberId={circle?.myMemberId} onTick={() => tick(item)} onMore={() => setLineId(item.id)} />
            ))}
          </View>
        ))}

        {hidden > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginHorizontal: layout.gutter }}>
            <Txt variant="footnote" color="muted">
              {words.notes.list.hidden(hidden)}
            </Txt>
            <Button size="sm" variant="soft" inline label={words.notes.list.showThem} spoken={words.notes.list.menu.showTicked} loading={look.isPending} onPress={() => look.mutate(true)} />
          </View>
        ) : null}
        {list.sumCents !== null ? (
          <Txt variant="footnote" weight={600} color="muted" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
            {words.notes.list.sum(formatMoney(list.sumCents, list.currency), list.sumDoneCents ? formatMoney(list.sumDoneCents, list.currency) : null)}
          </Txt>
        ) : null}
        {list.canEdit ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 18, marginHorizontal: layout.gutter }}>
            {words.things.list.viewOnly}
          </Txt>
        )}
        {problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {messageFor(problem)}
          </Txt>
        ) : null}
      </ScrollView>

      {list.canEdit ? (
        <View style={{ gap: 10, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
          {again.length ? (
            <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
              {again.map((text) => (
                <Tap
                  key={text}
                  accessibilityRole="button"
                  accessibilityLabel={words.notes.list.again(text)}
                  hitSlop={{ top: 6, bottom: 6 }}
                  onPress={() => addLine(text)}
                  scaleTo={0.94}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
                  <Plus size={15} color={colors.accentText} strokeWidth={2.4} />
                  <Txt variant="caption" weight={700} color="accentText">
                    {text}
                  </Txt>
                </Tap>
              ))}
            </ScrollView>
          ) : null}
          {micSaid ? (
            <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.gutter }}>
              {words.notes.list.micLater}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginHorizontal: layout.barGutter, paddingLeft: 16, paddingRight: canAdd ? 6 : 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
            <Plus size={19} color={colors.accentText} style={{ flexShrink: 0 }} />
            <TextInput
              accessibilityLabel={words.notes.list.add}
              placeholder={words.notes.list.add}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={typed}
              onChangeText={setTyped}
              maxLength={300}
              returnKeyType="done"
              // The keyboard stays up: the next line can be typed straight away. (A browser reads the older of the two settings.)
              submitBehavior="submit"
              blurOnSubmit={false}
              onSubmitEditing={() => (canAdd ? addLine(typed) : undefined)}
              style={[webNoOutline, textStyle('control', 500, { oneLine: true }), { flex: 1, minWidth: 0, minHeight: 24, padding: 0, color: colors.text }]}
            />
            {canAdd ? (
              <Tap accessibilityRole="button" accessibilityLabel={words.notes.list.addButton} hitSlop={6} onPress={() => addLine(typed)} scaleTo={0.9} style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                <ArrowUp size={18} color={colors.onAccent} strokeWidth={2.6} />
              </Tap>
            ) : (
              <Tap accessibilityRole="button" accessibilityLabel={words.notes.list.mic} hitSlop={12} onPress={() => setMicSaid(true)} scaleTo={0.9}>
                <Mic size={19} color={colors.text} />
              </Tap>
            )}
          </View>
        </View>
      ) : null}

      <LineSheet item={line} list={list} circle={circle} onClose={() => setLineId(null)} onChange={change} onRemove={remove} />

      <Sheet visible={sheet === 'menu'} onClose={close} title={list.title.trim() || words.things.untitled}>
        <SheetRow
          first
          icon={(c) => (list.showTicked ? <EyeOff size={22} color={c} /> : <Eye size={22} color={c} />)}
          label={list.showTicked ? words.notes.list.menu.hideTicked : words.notes.list.menu.showTicked}
          onPress={() => {
            close();
            look.mutate(!list.showTicked);
          }}
        />
        {list.canEdit && list.done > 0 ? (
          <SheetRow
            icon={(c) => <ListX size={22} color={c} />}
            label={words.things.list.clearDone}
            onPress={() => {
              close();
              clear.mutate();
            }}
          />
        ) : null}
        <SheetRow
          icon={(c) => (list.pinned ? <PinOff size={22} color={c} /> : <Pin size={22} color={c} />)}
          label={list.pinned ? words.notes.list.menu.unpin : words.notes.list.menu.pin}
          onPress={() => {
            close();
            actions.pin.mutate({ thing, pinned: !list.pinned });
          }}
        />
        {list.canEdit ? <SheetRow icon={(c) => <Pencil size={22} color={c} />} label={words.notes.list.menu.rename} onPress={() => setSheet('rename')} /> : null}
        {list.canEdit ? (
          <SheetRow
            icon={(c) => <ShoppingBasket size={22} color={c} />}
            label={list.aisles ? words.notes.list.menu.aislesOff : words.notes.list.menu.aislesOn}
            onPress={() => {
              close();
              aisles.mutate(!list.aisles);
            }}
          />
        ) : null}
        {list.canEdit ? <SheetRow icon={(c) => <FolderInput size={22} color={c} />} label={words.notes.list.menu.move} onPress={() => setSheet('move')} /> : null}
        {list.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.things.list.delete} onPress={() => setSheet('delete')} /> : null}
      </Sheet>
      <NameSheet
        visible={sheet === 'rename'}
        onClose={close}
        title={words.notes.list.renameSheet.title}
        label={words.notes.list.renameSheet.label}
        name={list.title}
        confirm={words.notes.list.renameSheet.save}
        onSubmit={(title) => actions.rename.mutateAsync({ thing, title })}
      />
      <MoveSheet thing={sheet === 'move' ? thing : null} onClose={close} />
      <ConfirmSheet
        visible={sheet === 'delete'}
        onClose={close}
        title={words.things.list.deleteAsk.title}
        body={words.things.list.deleteAsk.body}
        confirm={words.things.list.deleteAsk.confirm}
        busy={actions.remove.isPending}
        problem={actions.remove.isError ? messageFor(actions.remove.error) : null}
        onConfirm={() =>
          actions.remove.mutate(thing, {
            onSuccess: () => {
              close();
              leave();
            },
          })
        }
      />
    </AvoidKeyboard>
  );
}
