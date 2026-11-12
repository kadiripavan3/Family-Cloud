import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, ScanLine, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addSheetRowPaper, changeSheetRow, type ColumnResponse, getGetSheetRowQueryKey, type MediaResponse, removeSheetRowPaper, type RowCardResponse, type RowChangeRequest, useGetSheetRow, useGetThing } from '@/api/generated/homeport';
import { uploadPhoto } from '@/api/upload';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { Trouble } from '@/features/money/parts';
import { pickPaper } from '@/features/money/pick';
import { CellField, type CellValue, isWide } from '@/features/money/sheet/CellField';
import { cellText } from '@/features/money/sheet/cells';
import { useLeave } from '@/features/navigation/useLeave';
import { PageProblem } from '@/features/states/PageProblem';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 8.6 A row, as a card: nobody should pinch a tiny grid to fix one number. Every column of the row is a box
 * of its own, changed the way its kind asks for (typed, picked from the calendar, switched, picked from the
 * circle's people), with a note under them and room for receipts and papers. Each box is saved as it is
 * left, with only that cell; the two buttons at the bottom go to the row before and the row after.
 */
export default function SheetRow() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetSheetRow(id, { day: today() });
  const load = loadState(asked);
  const card = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !card || card.row.id !== id ? (
        <>
          <AppBar />
          {load.offline ? <Loading offline /> : <CardSkeleton />}
        </>
      ) : (
        <Loaded key={card.row.id} card={card} />
      )}
    </SafeAreaView>
  );
}

/** The columns in the order of the card: a wide one takes a line, the others stand two to a line. */
function lines(columns: readonly ColumnResponse[]): ColumnResponse[][] {
  const out: ColumnResponse[][] = [];
  let half: ColumnResponse | null = null;
  for (const column of columns) {
    if (isWide(column)) {
      out.push([column]);
    } else if (half) {
      out[out.indexOf(HOLD)] = [half, column];
      half = null;
    } else {
      half = column;
      out.push(HOLD);
    }
  }
  if (half) out[out.indexOf(HOLD)] = [half];
  return out;
}
/** Keeps the place of a line whose second box hasn't come up yet. */
const HOLD: ColumnResponse[] = [];

function Loaded({ card }: { card: RowCardResponse }) {
  const router = useRouter();
  const client = useQueryClient();
  const cache = useCache();
  const leave = useLeave();
  const day = today();
  const row = card.row;
  // The card doesn't say which circle its sheet is in; the sheet, as a thing, does.
  const circleId = useGetThing(card.sheetId).data?.circleId ?? null;
  const circle = useCircles().find((one) => one.id === circleId);
  const sheet = { id: card.sheetId, circleId };
  const [note, setNote] = useState(row.note);
  const [removing, setRemoving] = useState<MediaResponse | null>(null);
  const paperId = useRef(newClientId());

  const save = useMutation({
    mutationFn: (change: RowChangeRequest) => changeSheetRow(row.id, change, { day }),
    onSuccess: (changed) => {
      // The card shows what was saved at once; the cells its formulas work out come with the answer too.
      client.setQueryData<RowCardResponse>(getGetSheetRowQueryKey(row.id, { day }), (old) => (old ? { ...old, row: changed.row } : old));
      void cache.sheetRowSaved(sheet, card.tabId, changed);
    },
  });
  const addPaper = useMutation({
    mutationFn: async () => {
      const photo = await pickPaper();
      if (!photo) return null;
      return addSheetRowPaper(row.id, { clientId: paperId.current, mediaId: await uploadPhoto(photo) });
    },
    onSuccess: (saved) => {
      if (!saved) return;
      paperId.current = newClientId();
      client.setQueryData(getGetSheetRowQueryKey(row.id, { day }), saved);
      void cache.sheetChanged(sheet);
    },
  });
  const removePaper = useMutation({
    mutationFn: (paper: MediaResponse) => removeSheetRowPaper(row.id, paper.id),
    onSuccess: (_nothing, paper) => {
      client.setQueryData<RowCardResponse>(getGetSheetRowQueryKey(row.id, { day }), (old) => (old ? { ...old, papers: old.papers.filter((one) => one.id !== paper.id) } : old));
      setRemoving(null);
      void cache.sheetChanged(sheet);
    },
  });
  const to = (rowId: string) => router.replace({ pathname: '/money/row/[id]', params: { id: rowId } });
  const problem = [save, addPaper].find((one) => one.isError)?.error;

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <AppBar title={words.money.rowCard.title(row.number, card.of)} subtitle={card.sheetTitle} trailing={<BarLink label={words.common.done} onPress={leave} />} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}>
        <View style={{ gap: 12, marginHorizontal: layout.rowGutter }}>
          {lines(card.columns).map((line) => (
            <View key={line.map((column) => column.id).join()} style={{ flexDirection: 'row', gap: 12 }}>
              {line.map((column) => {
                const cell = row.cells[column.id];
                return (
                  // When the API's answer changes what a box holds, the box starts again from it.
                  <View key={`${column.id}:${cellText(cell, card.currency, true)}`} style={{ flex: 1 }}>
                    <CellField column={column} cell={cell} currency={card.currency} members={circle ? membersOf(circle) : []} canEdit={card.canEdit} onSave={(value: CellValue) => save.mutate({ cells: { [column.id]: value } })} />
                  </View>
                );
              })}
            </View>
          ))}
          <Field
            label={words.money.rowCard.note}
            value={note}
            onChangeText={setNote}
            editable={card.canEdit}
            multiline
            maxLength={2000}
            placeholder={card.canEdit ? words.money.rowCard.notePlaceholder : undefined}
            onBlur={() => (note.trim() === row.note ? undefined : save.mutate({ note: note.trim() }))}
          />
        </View>
        <Trouble message={problem ? messageFor(problem) : null} />
        {card.canEdit ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
            {words.money.rowCard.viewOnly}
          </Txt>
        )}

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.rowCard.papers}</GroupLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 2, paddingHorizontal: layout.barGutter }}>
          {card.papers.map((paper, index) => (
            <Paper key={paper.id} paper={paper} number={index + 1} onRemove={card.canEdit ? () => setRemoving(paper) : undefined} />
          ))}
          {card.canEdit ? <AddPaper busy={addPaper.isPending} onPress={() => addPaper.mutate()} /> : null}
        </ScrollView>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
        <Step back label={card.previous?.label} spoken={card.previous ? words.money.rowCard.previous(card.previous.label) : undefined} onPress={card.previous ? () => to(card.previous!.id) : undefined} />
        <Step label={card.next?.label} spoken={card.next ? words.money.rowCard.next(card.next.label) : undefined} onPress={card.next ? () => to(card.next!.id) : undefined} />
      </View>

      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title={words.money.rowCard.removePaperAsk.title}
        body={words.money.rowCard.removePaperAsk.body}
        confirm={words.money.rowCard.removePaperAsk.confirm}
        busy={removePaper.isPending}
        problem={removePaper.isError ? messageFor(removePaper.error) : null}
        onConfirm={() => (removing ? removePaper.mutate(removing) : undefined)}
      />
    </AvoidKeyboard>
  );
}

/** A receipt or a paper kept with the row: its picture, with a small cross that takes it off. */
function Paper({ paper, number, onRemove }: { paper: MediaResponse; number: number; onRemove?: () => void }) {
  const { colors } = useTheme();
  return (
    <Photo uri={paper.thumbUrl ?? paper.url} radius="photo" label={words.money.rowCard.paper(number)} style={{ width: 84, height: 104 }}>
      {onRemove ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.money.rowCard.removePaper(number)} hitSlop={11} onPress={onRemove} scaleTo={0.9} style={{ position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photoGlass }}>
          <X size={13} color={colors.onPhoto} strokeWidth={2.6} />
        </Tap>
      ) : null}
    </Photo>
  );
}

/** The tile that adds a paper: where the phone's camera would scan it, a picture is picked. */
function AddPaper({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.money.rowCard.addPaper} accessibilityState={{ busy }} disabled={busy} onPress={onPress} style={{ width: 84, height: 104, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.photo, borderWidth: 1.5, borderColor: colors.fill2, opacity: busy ? 0.5 : 1 }}>
      <ScanLine size={22} color={colors.muted} />
      <Txt variant="footnote" weight={700} color="muted">
        {words.money.rowCard.scan}
      </Txt>
    </Tap>
  );
}

/** One of the two buttons at the bottom: the row before, or the row after, by what its first column says. */
function Step({ back, label, spoken, onPress }: { back?: boolean; label?: string; spoken?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  if (!onPress) return <View style={{ flex: 1 }} />;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress} style={{ flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.fill }}>
      {back ? <ArrowLeft size={16} color={colors.text} /> : null}
      <Txt variant="callout" weight={700} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      {back ? null : <ArrowRight size={16} color={colors.text} />}
    </Tap>
  );
}

/** Loading: grey shapes where the boxes will stand. */
function CardSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ gap: 12, paddingTop: 8, paddingHorizontal: layout.rowGutter }}>
      <Sk height={62} radius="field" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Sk height={62} radius="field" style={{ flex: 1 }} />
        <Sk height={62} radius="field" style={{ flex: 1 }} />
      </View>
      <Sk height={104} radius="field" />
    </View>
  );
}
