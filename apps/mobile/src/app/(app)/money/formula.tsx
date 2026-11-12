import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Delete, Ellipsis, Sparkles, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addSheetColumn, addSheetTile, askFormula, changeSheetColumn, changeSheetTile, type FormulaResponse, readFormula, removeSheetTile, type SheetResponse, useGetSheet } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { FIGURES, Trouble } from '@/features/money/parts';
import { cellText } from '@/features/money/sheet/cells';
import { add, chips, functionPiece, type Piece, read, removeLast, SIGNS, write } from '@/features/money/sheet/formula';
import { FormulaParts, FxChip } from '@/features/money/sheet/FormulaParts';
import { Tiles } from '@/features/money/sheet/Tiles';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Segmented } from '@/ui/Segmented';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** How many functions stand under "Maths" before "More" brings the rest. */
const FIRST_FUNCTIONS = 6;
const BRACKETS = ['(', ')'] as const;
type As = 'tile' | 'column';

/**
 * 8.7 A formula you can read. It opens over a sheet, for a tile or a formula column that is there
 * (`?tile=…`, `?column=…`) or for a new one. The formula is built from chips: the tab's columns by name,
 * the functions, the four signs, brackets and numbers. Each tap sends the formula so far to the API, which
 * sends back the same formula as chips, as a sentence, and with its answer, so all three change as it is
 * built; what can't be read or worked out is said in a sentence. "Ask in words" hands a question to the API,
 * which answers the ones it knows with a formula and says how to write it for the rest. The app works
 * nothing out itself.
 */
export default function Formula() {
  const { colors } = useTheme();
  const leave = useLeave();
  const params = useLocalSearchParams<{ sheet: string; tab?: string; tile?: string; column?: string; as?: string; name?: string }>();
  const asked = useGetSheet(params.sheet, { tab: params.tab, limit: 100, day: today() });
  const load = loadState(asked);
  const sheet = asked.data;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ animation: 'fade' }} />
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
        </>
      ) : !sheet ? (
        <>
          <AppBar />
          <Loading offline={load.offline} />
        </>
      ) : (
        <>
          {/* The sheet it belongs to, dimmed underneath: its bar and its tiles. Pressing it closes the builder. */}
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ opacity: 0.9 }}>
            <AppBar
              title={sheet.title.trim() || words.money.sheet.untitled}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <AudienceChip thing={sheet} quiet />
                  <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} />
                </View>
              }
            />
            <Tiles sheet={sheet} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={words.common.close} onPress={leave} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />
          <Builder sheet={sheet} tileId={params.tile} columnId={params.column} startAs={params.as === 'column' || params.as === 'tile' ? params.as : null} startName={params.name ?? ''} />
        </>
      )}
    </SafeAreaView>
  );
}

type BuilderProps = { sheet: SheetResponse; tileId?: string; columnId?: string; startAs: As | null; startName: string };

function Builder({ sheet, tileId, columnId, startAs, startName }: BuilderProps) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const cache = useCache();
  const leave = useLeave();
  const day = today();
  const tab = sheet.tab;
  const tile = tab.tiles.find((one) => one.id === tileId);
  const column = tab.columns.find((one) => one.id === columnId);
  const kept = tile?.formula ?? column?.formula ?? null;
  const circle = useCircles().find((one) => one.id === sheet.circleId);
  const someoneElse = circle ? membersOf(circle).find((member) => member.id !== circle.myMemberId && member.kind === 'person') : undefined;

  /** The chips as they were tapped. Null until the first tap: then they are the kept formula, taken apart. */
  const [edited, setEdited] = useState<Piece[] | null>(null);
  const [name, setName] = useState(tile?.name ?? column?.name ?? startName);
  const [chosenAs, setChosenAs] = useState<As | null>(startAs);
  const [more, setMore] = useState(false);
  const [number, setNumber] = useState('');
  const [question, setQuestion] = useState('');
  const [removing, setRemoving] = useState(false);
  const clientId = useRef(newClientId());

  // What can go into a formula on this tab: its columns, and the functions. They come with every reading.
  const pickers = useQuery({ queryKey: [`/v1/sheet-tabs/${tab.id}/formula`, '', columnId ?? null, day], queryFn: () => readFormula(tab.id, { formula: '', columnId, day }), staleTime: 60_000 });
  const functions = pickers.data?.functions;
  const pieces = edited ?? (kept && functions ? read(kept, functions) : kept ? null : []);
  const text = pieces ? write(pieces) : (kept ?? '');
  const reading = useQuery({
    queryKey: [`/v1/sheet-tabs/${tab.id}/formula`, text, columnId ?? null, day],
    queryFn: () => readFormula(tab.id, { formula: text, columnId, day }),
    enabled: text.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  /** What the API says of the formula as it stands now (not of the one before, while this one is on its way). */
  const answer: FormulaResponse | undefined = text.length > 0 && !reading.isPlaceholderData ? reading.data : undefined;
  const understood = answer?.understood === true;
  const as: As = tile ? 'tile' : column ? 'column' : (chosenAs ?? (answer && !answer.oneAnswer ? 'column' : 'tile'));
  const tap = (piece: Piece) => setEdited(add(pieces ?? [], piece));

  const ask = useMutation({
    mutationFn: (asked: string) => askFormula(tab.id, { question: asked, day }),
    onSuccess: (told) => {
      if (!told.understood || !told.formula) return;
      setEdited(read(told.formula, told.functions));
      setQuestion('');
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const named = name.trim();
      if (tile) await changeSheetTile(tile.id, { formula: text, name: named === tile.name ? undefined : named }, { day });
      else if (column) await changeSheetColumn(column.id, { formula: text, name: named === column.name ? undefined : named }, { day });
      else if (as === 'tile') await addSheetTile(tab.id, { clientId: clientId.current, name: named, formula: text }, { day });
      else await addSheetColumn(tab.id, { clientId: clientId.current, name: named, kind: 'formula', formula: text }, { day });
    },
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      leave();
    },
  });
  const remove = useMutation({
    mutationFn: () => removeSheetTile(tile!.id),
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      setRemoving(false);
      leave();
    },
  });

  const shownFunctions = (functions ?? []).slice(0, more ? undefined : FIRST_FUNCTIONS);
  const columns = (pickers.data?.columns ?? []).filter((one) => one.id !== columnId);
  const notUnderstood = ask.data && !ask.data.understood ? ask.data : null;
  const result = answer?.answer ?? null;

  return (
    <>
      <AvoidKeyboard style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View accessibilityViewIsModal style={{ maxHeight: Math.round(window.height * 0.88), paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.surface, boxShadow: shadow.sheet }}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, marginBottom: 8, backgroundColor: colors.fill2 }} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput
              accessibilityLabel={as === 'tile' ? words.money.formula.tileName : words.money.formula.columnName}
              placeholder={as === 'tile' ? words.money.formula.tileName : words.money.formula.columnName}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={name}
              onChangeText={setName}
              maxLength={60}
              style={[webNoOutline, textStyle('titleSmall', 800, { oneLine: true }), { minHeight: 37, paddingTop: 8, paddingBottom: 4, paddingHorizontal: 22, color: colors.text }]}
            />

            <View accessibilityLabel={words.money.formula.box} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 58, marginTop: 6, marginHorizontal: layout.barGutter, padding: 14, borderRadius: radius.photo, borderWidth: 2, borderColor: colors.text }}>
              {!pieces ? null : pieces.length === 0 ? (
                <Txt variant="footnote" color="muted" style={{ flex: 1 }}>
                  {words.money.formula.start}
                </Txt>
              ) : (
                <>
                  <FormulaParts parts={understood && answer ? answer.parts : chips(pieces)} />
                  <Tap accessibilityRole="button" accessibilityLabel={words.money.formula.takeBack} hitSlop={10} onPress={() => setEdited(removeLast(pieces))} onLongPress={() => setEdited([])} scaleTo={0.9} style={{ marginLeft: 'auto', minHeight: 26, justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Delete size={20} color={colors.muted} />
                  </Tap>
                </>
              )}
            </View>

            {text.length === 0 ? null : understood && answer ? (
              <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.rowGutter }}>
                {answer.says}
              </Txt>
            ) : answer?.problem ? (
              <Txt variant="footnote" weight={600} accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.rowGutter, color: colors.warn }}>
                {answer.problem}
              </Txt>
            ) : reading.isError ? (
              <Trouble message={messageFor(reading.error)} style={{ marginTop: 8 }} />
            ) : null}

            {understood && result ? (
              result.kind === 'problem' ? (
                // It reads, but it can't be worked out: the API says why, in plain words.
                <Txt variant="callout" weight={700} accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: layout.gutter, color: colors.warn }}>
                  {result.problem ?? words.money.sheet.cantWorkOut}
                </Txt>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, marginTop: 12, marginHorizontal: layout.gutter }}>
                  <Txt variant="titleLarge" accessibilityLiveRegion="polite" style={FIGURES}>
                    {cellText(result, sheet.currency, true) || words.money.rowCard.empty}
                  </Txt>
                  <Txt variant="footnote" weight={600} color="muted">
                    {answer?.oneAnswer ? words.money.formula.changes : words.money.formula.firstRow}
                  </Txt>
                </View>
              )
            ) : null}
            {understood && answer?.leftOutSays ? (
              <Txt variant="footnote" color="muted" style={{ marginTop: 4, marginHorizontal: layout.gutter }}>
                {answer.leftOutSays}
              </Txt>
            ) : null}

            <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{words.money.formula.columns}</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: layout.barGutter }}>
              {columns.map((one) => (
                <FxChip key={one.id} pick column text={one.name} onPress={() => tap({ kind: 'column', name: one.name })} />
              ))}
            </View>

            <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{words.money.formula.maths}</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: layout.barGutter }}>
              {shownFunctions.map((fn) => (
                <FxChip key={fn.name} pick text={fn.label} spoken={words.common.spoken([fn.label, fn.says])} onPress={() => tap(functionPiece(fn))} />
              ))}
              {functions && functions.length > FIRST_FUNCTIONS ? <FxChip pick text={more ? words.money.formula.fewer : words.money.formula.more} onPress={() => setMore(!more)} /> : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6, marginHorizontal: layout.barGutter }}>
              {SIGNS.map((sign) => (
                <FxChip key={sign} pick text={sign} spoken={words.money.formula.signs[sign]} onPress={() => tap({ kind: 'sign', text: sign })} />
              ))}
              {BRACKETS.map((bracket) => (
                <FxChip key={bracket} pick text={bracket} spoken={words.money.formula.signs[bracket]} onPress={() => tap({ kind: bracket === '(' ? 'open' : 'close' })} />
              ))}
              <TextInput
                accessibilityLabel={words.money.formula.number}
                placeholder={words.money.formula.numberPlaceholder}
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                keyboardType="decimal-pad"
                value={number}
                onChangeText={(typed) => setNumber(typed.replace(/[^0-9.,%]/g, '').replace(',', '.'))}
                maxLength={12}
                style={[webNoOutline, textStyle('caption', 800, { oneLine: true }), { width: 64, minHeight: 30, paddingVertical: 0, paddingHorizontal: 11, borderRadius: radius.chip, color: colors.text, backgroundColor: colors.fill }]}
              />
              {/^\d+(\.\d+)?%?$/.test(number) ? (
                <FxChip
                  pick
                  text={words.money.formula.numberAdd}
                  onPress={() => {
                    tap({ kind: 'number', text: number });
                    setNumber('');
                  }}
                />
              ) : null}
            </View>

            {/* Or ask in words. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginTop: 14, marginHorizontal: layout.barGutter, paddingLeft: 16, paddingRight: 8, borderRadius: radius.pill, backgroundColor: colors.fill }}>
              <Sparkles size={19} color={colors.accentText} />
              <TextInput
                accessibilityLabel={words.money.formula.askLabel}
                placeholder={words.money.formula.ask(someoneElse ? firstName(someoneElse.name) : null)}
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                value={question}
                onChangeText={setQuestion}
                maxLength={200}
                returnKeyType="go"
                onSubmitEditing={() => (question.trim() ? ask.mutate(question.trim()) : undefined)}
                style={[webNoOutline, textStyle('bodySmall', 500, { oneLine: true }), { flex: 1, minWidth: 0, minHeight: 24, padding: 0, color: colors.text }]}
              />
              {question.trim() ? <Button label={words.money.formula.askSend} variant="ink" size="sm" inline loading={ask.isPending} onPress={() => ask.mutate(question.trim())} /> : null}
            </View>
            {notUnderstood ? (
              <View style={{ marginTop: 8, marginHorizontal: layout.rowGutter }}>
                <Txt variant="footnote" weight={600} accessibilityLiveRegion="polite" style={{ color: colors.warn }}>
                  {notUnderstood.problem}
                </Txt>
                {notUnderstood.examples.length ? (
                  <View accessibilityLabel={words.money.formula.examples} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginHorizontal: -4 }}>
                    {notUnderstood.examples.map((example) => (
                      <FxChip key={example} pick text={example} onPress={() => ask.mutate(example)} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            <Trouble message={ask.isError ? messageFor(ask.error) : null} />

            {tile || column ? null : (
              <>
                <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{words.money.formula.as}</GroupLabel>
                <Segmented
                  label={words.money.formula.as}
                  options={[
                    { id: 'tile', label: words.money.formula.asTile },
                    { id: 'column', label: words.money.formula.asColumn },
                  ]}
                  value={as}
                  onChange={setChosenAs}
                />
              </>
            )}
            {tile ? (
              <Tap accessibilityRole="button" accessibilityLabel={words.money.formula.removeTile} onPress={() => setRemoving(true)} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, marginTop: 14, marginHorizontal: layout.gutter, paddingVertical: 6 }}>
                <Trash2 size={18} color={colors.danger} />
                <Txt variant="callout" weight={700} color="danger">
                  {words.money.formula.removeTile}
                </Txt>
              </Tap>
            ) : null}
            <Trouble message={save.isError ? messageFor(save.error) : understood && !name.trim() ? words.money.formula.needName : null} />
          </ScrollView>
          <View style={{ paddingTop: 14, paddingHorizontal: layout.barGutter }}>
            <Button label={words.money.formula.use} size="lg" block disabled={!understood || !name.trim()} loading={save.isPending} onPress={() => save.mutate()} />
          </View>
        </View>
      </AvoidKeyboard>

      <ConfirmSheet
        visible={removing}
        onClose={() => setRemoving(false)}
        title={words.money.formula.removeTileAsk.title}
        body={words.money.formula.removeTileAsk.body}
        confirm={words.money.formula.removeTileAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
