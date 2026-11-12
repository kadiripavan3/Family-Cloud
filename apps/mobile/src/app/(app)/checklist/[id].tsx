import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Check, Ellipsis, ListX, Plus, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addChecklistItem, changeChecklistItem, type ChecklistResponse, clearDoneItems, deleteThing, getGetChecklistQueryKey, type ItemResponse, removeChecklistItem, useGetChecklist } from '@/api/generated/homeport';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { bySection } from '@/features/things/lines';
import { loadState } from '@/lib/loading';
import { formatMoney } from '@/lib/money';
import { newClientId } from '@/lib/ids';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { ListSkeleton } from '@/ui/Skeleton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** How often an open list asks again, so another person's ticks appear by themselves. */
const ASK_AGAIN_MS = 4000;

/**
 * A list: lines with ticks under their headings, amounts at the right, and a line to add at the bottom.
 * Whoever may edit it ticks, unticks, adds and removes; everyone else reads. While it is open it asks again
 * every few seconds, so what someone else ticks shows up without doing anything. (Assigning a line,
 * repeating ones and working offline arrive with Notes.)
 */
export default function Checklist() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetChecklist(id, { query: { refetchInterval: ASK_AGAIN_MS } });
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
          <ListSkeleton count={6} />
        </>
      ) : (
        <Loaded list={list} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ list }: { list: ChecklistResponse }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const cache = useCache();
  const leave = useLeave();
  const [typed, setTyped] = useState('');
  const [menu, setMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** The line whose own small menu is open. */
  const [lineId, setLineId] = useState<string | null>(null);
  const clientId = useRef(newClientId());
  const line = list.items.find((item) => item.id === lineId);

  /** Shows a change at once, before the API has answered; the answer (or asking again) puts things right. */
  const show = (change: (items: ItemResponse[]) => ItemResponse[]) =>
    client.setQueryData<ChecklistResponse>(getGetChecklistQueryKey(list.id), (old) => {
      if (!old) return old;
      const items = change(old.items);
      return { ...old, items, left: items.filter((item) => !item.done).length, done: items.filter((item) => item.done).length };
    });
  const settled = () => cache.checklistLineChanged(list);

  const tick = useMutation({
    mutationFn: (item: ItemResponse) => changeChecklistItem(item.id, { done: !item.done }),
    onMutate: (item) => void show((items) => items.map((one) => (one.id === item.id ? { ...one, done: !item.done } : one))),
    onSettled: settled,
  });
  const add = useMutation({
    mutationFn: (text: string) => addChecklistItem(list.id, { clientId: clientId.current, text }),
    onSuccess: (item) => {
      // The next line is a new one: it gets an id of its own.
      clientId.current = newClientId();
      setTyped('');
      show((items) => [...items.filter((one) => one.id !== item.id), item]);
    },
    onSettled: settled,
  });
  const remove = useMutation({
    mutationFn: (item: ItemResponse) => removeChecklistItem(item.id),
    onMutate: (item) => {
      setLineId(null);
      show((items) => items.filter((one) => one.id !== item.id));
    },
    onSettled: settled,
  });
  const clear = useMutation({
    mutationFn: () => clearDoneItems(list.id),
    onSuccess: (saved) => cache.checklistSaved(saved),
  });
  const removeList = useMutation({
    mutationFn: () => deleteThing(list.id),
    onSuccess: () => {
      setDeleting(false);
      leave();
      void cache.thingDeleted(list);
    },
  });
  const problem = [tick, add, remove, clear].find((one) => one.isError)?.error;
  const all = list.left + list.done;
  const canAdd = typed.trim().length > 0 && !add.isPending;

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <AppBar
        title={list.title.trim() || words.things.untitled}
        subtitle={words.things.list.left(list.left, all)}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={list} />
            {list.canEdit ? <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setMenu(true)} /> : null}
          </View>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {list.items.length === 0 ? (
          <Txt variant="callout" color="muted" style={{ marginTop: 22, marginHorizontal: layout.gutter }}>
            {words.things.list.empty}
          </Txt>
        ) : null}
        {bySection(list.items).map((group) => (
          <View key={group.section}>
            {group.section ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{group.section}</GroupLabel> : <View style={{ height: 8 }} />}
            {group.items.map((item) => (
              <Line key={item.id} item={item} canEdit={list.canEdit} onTick={() => tick.mutate(item)} onMore={() => setLineId(item.id)} />
            ))}
          </View>
        ))}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: layout.barGutter, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
            <Plus size={19} color={colors.muted} style={{ flexShrink: 0 }} />
            <TextInput
              accessibilityLabel={words.things.list.add}
              placeholder={words.things.list.add}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={typed}
              onChangeText={setTyped}
              maxLength={300}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={() => (canAdd ? add.mutate(typed.trim()) : undefined)}
              style={[webNoOutline, textStyle('item', 600, { oneLine: true }), { flex: 1, minWidth: 0, minHeight: 24, padding: 0, color: colors.text }]}
            />
          </View>
          <Button label={words.things.list.addButton} variant="soft" inline disabled={!canAdd} loading={add.isPending} onPress={() => add.mutate(typed.trim())} />
        </View>
      ) : null}

      <Sheet visible={!!line} onClose={() => setLineId(null)} title={line?.text}>
        <SheetRow first danger icon={(c) => <Trash2 size={22} color={c} />} label={words.things.list.remove} onPress={() => (line ? remove.mutate(line) : undefined)} />
      </Sheet>
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        {list.done > 0 ? (
          <SheetRow
            first
            icon={(c) => <ListX size={22} color={c} />}
            label={words.things.list.clearDone}
            onPress={() => {
              setMenu(false);
              clear.mutate();
            }}
          />
        ) : null}
        {list.mine ? (
          <SheetRow
            first={list.done === 0}
            danger
            icon={(c) => <Trash2 size={22} color={c} />}
            label={words.things.list.delete}
            onPress={() => {
              setMenu(false);
              setDeleting(true);
            }}
          />
        ) : null}
      </Sheet>
      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={words.things.list.deleteAsk.title}
        body={words.things.list.deleteAsk.body}
        confirm={words.things.list.deleteAsk.confirm}
        busy={removeList.isPending}
        problem={removeList.isError ? messageFor(removeList.error) : null}
        onConfirm={() => removeList.mutate()}
      />
    </AvoidKeyboard>
  );
}

/** One line: its box to tick, its words with a small note under them, and its amount at the right. Pressing the words opens the line's own menu. */
function Line({ item, canEdit, onTick, onMore }: { item: ItemResponse; canEdit: boolean; onTick: () => void; onMore: () => void }) {
  const { colors } = useTheme();
  const said = (
    <View style={{ flex: 1 }}>
      <Txt variant="lead" weight={600} style={{ color: item.done ? colors.muted : colors.text, textDecorationLine: item.done ? 'line-through' : 'none' }}>
        {item.text}
      </Txt>
      {item.note ? (
        <Txt variant="footnote" color="muted" style={{ marginTop: 1 }}>
          {item.note}
        </Txt>
      ) : null}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10, paddingHorizontal: layout.rowGutter }}>
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
        style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: item.done ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: item.done ? colors.accent : 'transparent' }}>
        {item.done ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
      </Tap>
      {canEdit ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.things.list.line(item.text)} onPress={onMore} scaleTo={0.99} style={{ flex: 1, flexDirection: 'row' }}>
          {said}
        </Tap>
      ) : (
        said
      )}
      {item.amountCents === null ? null : (
        <Txt variant="item" weight={800} style={{ color: item.done ? colors.muted : colors.text }}>
          {formatMoney(item.amountCents)}
        </Txt>
      )}
    </View>
  );
}
