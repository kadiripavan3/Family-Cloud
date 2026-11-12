import { keepPreviousData, useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Columns3, Ellipsis, Eye, LayoutGrid, Pencil, Plus, Sigma, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import {
  addSheetRow,
  addSheetTab,
  changeSheet,
  changeSheetRow,
  changeSheetTab,
  type ColumnResponse,
  deleteThing,
  removeSheetRow,
  removeSheetTab,
  type RowResponse,
  type SheetResponse,
  useGetSheet,
  useGetSheetRowsInfinite,
} from '@/api/generated/homeport';
import { paged, rows as loadedRows } from '@/api/pages';
import { FIGURES, Trouble } from '@/features/money/parts';
import { ColumnSheet } from '@/features/money/sheet/ColumnSheet';
import { FormulaParts } from '@/features/money/sheet/FormulaParts';
import { Tiles } from '@/features/money/sheet/Tiles';
import { flipKey, Grid, totalText } from '@/features/money/sheet/Grid';
import { formulaHref } from '@/features/money/sheet/links';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { ToggleRow } from '@/ui/Rows';
import { Sheet as BottomSheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How often an open sheet asks again: what someone else changes shows up by itself, and so does who else is here. */
const ASK_AGAIN_MS = 4000;
/** How many rows come with the sheet, and with each "Show more rows". */
const ROWS = 100;

/**
 * 8.5 A sheet: a real spreadsheet, shaped for a phone. Its tiles on top (named totals), the grid of one tab
 * with typed columns and the row of totals, the bar that says in words what the chosen total does, and the
 * tabs along the bottom. Rows open as cards, a tick is pressed where it stands, a column's header changes
 * the column, a tile opens its formula. While it is open it asks again every few seconds, so "Alex is here
 * too" and what Alex changes show up by themselves. Every number on it is worked out by the API.
 */
export default function Sheet() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const [tab, setTab] = useState<string | undefined>(params.tab);
  const asked = useGetSheet(params.id, { tab, limit: ROWS, day: today() }, { query: { refetchInterval: ASK_AGAIN_MS, placeholderData: keepPreviousData } });
  const load = loadState(asked);
  const sheet = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !sheet ? (
        <>
          <AppBar />
          {load.offline ? <Loading offline /> : <SheetSkeleton />}
        </>
      ) : (
        <Loaded sheet={sheet} onTab={setTab} />
      )}
    </SafeAreaView>
  );
}

type Open = 'menu' | 'rename' | 'audience' | 'delete' | 'addTab' | 'tabMenu' | 'renameTab' | 'removeTab' | 'addColumn' | 'column' | 'rowMenu' | 'removeRow' | null;

function Loaded({ sheet, onTab }: { sheet: SheetResponse; onTab: (tabId: string) => void }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const leave = useLeave();
  const day = today();
  const tab = sheet.tab;
  const [open, setOpen] = useState<Open>(null);
  const [column, setColumn] = useState<ColumnResponse | null>(null);
  const [row, setRow] = useState<RowResponse | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [flips, setFlips] = useState<Record<string, boolean>>({});
  const [typed, setTyped] = useState('');
  const [sameColumns, setSameColumns] = useState(true);
  const [wantMore, setWantMore] = useState(false);
  const rowClientId = useRef(newClientId());
  const tabClientId = useRef(newClientId());

  // The rows after the first hundred come a page at a time, when asked for.
  const further = useGetSheetRowsInfinite(sheet.id, { tab: tab.id, limit: ROWS, day }, { query: { ...paged, initialPageParam: tab.nextRows ?? undefined, enabled: wantMore && !!tab.nextRows } });
  const rows = [...tab.rows, ...(wantMore ? (loadedRows(further.data) ?? []).filter((one) => !tab.rows.some((known) => known.id === one.id)) : [])];

  const withTotals = tab.columns.filter((one) => one.total);
  const selected = withTotals.find((one) => one.id === chosen) ?? withTotals[0] ?? null;
  const here = sheet.here.map((person) => firstName(person.name)).filter(Boolean);

  const tick = useMutation({
    mutationFn: ({ row: ticked, column: of, next }: { row: RowResponse; column: ColumnResponse; next: boolean }) => changeSheetRow(ticked.id, { cells: { [of.id]: next } }, { day }),
    onMutate: ({ row: ticked, column: of, next }) => setFlips((old) => ({ ...old, [flipKey(ticked.id, of.id)]: next })),
    onSuccess: (changed) => void cache.sheetRowSaved(sheet, tab.id, changed),
    onSettled: (_changed, _error, { row: ticked, column: of }) =>
      setFlips((old) => {
        const { [flipKey(ticked.id, of.id)]: _done, ...rest } = old;
        return rest;
      }),
  });
  const addRow = useMutation({
    mutationFn: () => addSheetRow(tab.id, { clientId: rowClientId.current }, { day }),
    onSuccess: (changed) => {
      rowClientId.current = newClientId();
      void cache.sheetRowSaved(sheet, tab.id, changed);
      // A new row is filled in as a card, each cell by its kind.
      router.push({ pathname: '/money/row/[id]', params: { id: changed.row.id } });
    },
  });
  const removeRow = useMutation({
    mutationFn: (gone: RowResponse) => removeSheetRow(gone.id),
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      setOpen(null);
    },
  });
  const rename = useMutation({
    mutationFn: () => changeSheet(sheet.id, { title: typed.trim() }),
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      setOpen(null);
    },
  });
  const addTab = useMutation({
    mutationFn: () => addSheetTab(sheet.id, { clientId: tabClientId.current, name: typed.trim(), copyColumnsOf: sameColumns ? tab.id : undefined }),
    onSuccess: (saved) => {
      tabClientId.current = newClientId();
      void cache.sheetChanged(sheet);
      setOpen(null);
      // The new tab is the last one, and the one to look at now.
      const added = saved.tabs[saved.tabs.length - 1];
      if (added) onTab(added.id);
    },
  });
  const renameTab = useMutation({
    mutationFn: () => changeSheetTab(tab.id, { name: typed.trim() }),
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      setOpen(null);
    },
  });
  const removeTab = useMutation({
    mutationFn: () => removeSheetTab(tab.id),
    onSuccess: () => {
      const other = sheet.tabs.find((one) => one.id !== tab.id);
      setOpen(null);
      if (other) onTab(other.id);
      void cache.sheetTabRemoved(sheet, tab.id);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(sheet.id),
    onSuccess: () => {
      setOpen(null);
      leave();
      void cache.thingDeleted(sheet);
    },
  });
  const ask = (what: Open, start = '') => {
    setTyped(start);
    for (const one of [rename, addTab, renameTab]) one.reset();
    setOpen(what);
  };
  const openRow = (one: RowResponse) => router.push({ pathname: '/money/row/[id]', params: { id: one.id } });
  const problem = [tick, addRow].find((one) => one.isError)?.error;
  const title = sheet.title.trim() || words.money.sheet.untitled;

  return (
    <>
      <AppBar
        title={title}
        subtitle={here.length ? words.money.sheet.here(here) : undefined}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={sheet} />
            <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setOpen('menu')} />
          </View>
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        <Tiles sheet={sheet} onTile={sheet.canEdit ? (tile) => router.push(formulaHref(sheet, { tile: tile.id })) : undefined} />
        <Grid
          sheet={sheet}
          rows={rows}
          flips={flips}
          selected={selected?.id ?? null}
          onSelect={(one) => setChosen(one.id)}
          onOpenRow={openRow}
          onRowMenu={(one) => {
            setRow(one);
            setOpen('rowMenu');
          }}
          onTick={(one, of, next) => tick.mutate({ row: one, column: of, next })}
          onColumn={(one) => {
            setColumn(one);
            setOpen('column');
          }}
          onAddColumn={() => setOpen('addColumn')}
          onAddRow={() => (addRow.isPending ? undefined : addRow.mutate())}
        />
        {tab.nextRows && !wantMore ? (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <Button label={words.money.sheet.moreRows} variant="line" size="sm" inline onPress={() => setWantMore(true)} />
          </View>
        ) : wantMore ? (
          <MoreButton pages={further} label={words.money.sheet.moreRows} />
        ) : null}

        {selected?.total ? (
          <View accessible accessibilityLabel={words.money.sheet.bar(selected.total.says, totalText(selected, sheet.currency))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginHorizontal: layout.barGutter, paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
            <Sigma size={18} color={colors.accentText} />
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <FormulaParts parts={selected.total.parts} />
            </View>
            <Txt variant="callout" weight={800} style={FIGURES}>
              {totalText(selected, sheet.currency)}
            </Txt>
          </View>
        ) : null}
        <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.rowGutter }}>
          {selected?.total ? words.money.sheet.say(selected.total.says, selected.total.leftOutSays) : rows.length === 0 ? words.money.sheet.noRows : words.money.sheet.noTotals}
        </Txt>
        {sheet.canEdit ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.rowGutter }}>
            {words.money.sheet.viewOnly}
          </Txt>
        )}
        <Trouble message={problem ? messageFor(problem) : null} />
      </ScrollView>

      {/* The tabs along the bottom, and the + that adds one. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
          {sheet.tabs.map((one) => {
            const on = one.id === tab.id;
            return (
              <Tap
                key={one.id}
                accessibilityRole="tab"
                accessibilityLabel={one.name}
                accessibilityState={{ selected: on }}
                // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
                aria-selected={on}
                onPress={() => (on && sheet.canEdit ? setOpen('tabMenu') : onTab(one.id))}
                onLongPress={sheet.canEdit && on ? () => setOpen('tabMenu') : undefined}
                style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.thumb, backgroundColor: on ? colors.fill : 'transparent' }}>
                <Txt variant="note" weight={700} numberOfLines={1} style={{ color: on ? colors.text : colors.muted }}>
                  {one.name}
                </Txt>
              </Tap>
            );
          })}
        </ScrollView>
        {sheet.canEdit ? (
          <Tap accessibilityRole="button" accessibilityLabel={words.money.sheet.addTab} hitSlop={12} onPress={() => ask('addTab')} style={{ padding: 4 }}>
            <Plus size={18} color={colors.muted} />
          </Tap>
        ) : null}
      </View>

      <BottomSheet visible={open === 'menu'} onClose={() => setOpen(null)}>
        {sheet.canEdit ? (
          <>
            <SheetRow first icon={(c) => <Pencil size={22} color={c} />} label={words.money.sheet.menu.rename} onPress={() => ask('rename', sheet.title)} />
            <SheetRow
              icon={(c) => <LayoutGrid size={22} color={c} />}
              label={words.money.sheet.menuAddTile}
              onPress={() => {
                setOpen(null);
                router.push(formulaHref(sheet, { as: 'tile' }));
              }}
            />
            <SheetRow icon={(c) => <Columns3 size={22} color={c} />} label={words.money.sheet.addColumn} onPress={() => setOpen('addColumn')} />
          </>
        ) : null}
        <SheetRow first={!sheet.canEdit} icon={(c) => <Eye size={22} color={c} />} label={words.money.sheet.menu.whoSees} trailing={<AudienceChip thing={sheet} quiet />} onPress={() => setOpen('audience')} />
        {sheet.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.sheet.menu.delete} onPress={() => setOpen('delete')} /> : null}
      </BottomSheet>

      <BottomSheet visible={open === 'rename'} onClose={() => setOpen(null)} title={words.money.sheet.menu.rename}>
        <NameForm label={words.money.sheet.renameTitle} value={typed} onChange={setTyped} save={words.money.sheet.save} busy={rename.isPending} error={rename.error} onSave={() => rename.mutate()} />
      </BottomSheet>

      <BottomSheet visible={open === 'addTab'} onClose={() => setOpen(null)} title={words.money.sheet.addTab}>
        <NameForm label={words.money.sheet.tabName} placeholder={words.money.sheet.tabNamePlaceholder} value={typed} onChange={setTyped} save={words.money.sheet.add} busy={addTab.isPending} error={addTab.error} onSave={() => addTab.mutate()}>
          <View style={{ marginHorizontal: -16 }}>
            <ToggleRow first label={words.money.sheet.sameColumns.label} note={words.money.sheet.sameColumns.note} value={sameColumns} onChange={setSameColumns} />
          </View>
        </NameForm>
      </BottomSheet>

      <BottomSheet visible={open === 'tabMenu'} onClose={() => setOpen(null)} title={tab.name}>
        <SheetRow first icon={(c) => <Pencil size={22} color={c} />} label={words.money.sheet.renameTab} onPress={() => ask('renameTab', tab.name)} />
        {sheet.tabs.length > 1 ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.sheet.removeTab} onPress={() => setOpen('removeTab')} /> : null}
      </BottomSheet>
      <BottomSheet visible={open === 'renameTab'} onClose={() => setOpen(null)} title={words.money.sheet.renameTab}>
        <NameForm label={words.money.sheet.tabName} value={typed} onChange={setTyped} save={words.money.sheet.save} busy={renameTab.isPending} error={renameTab.error} onSave={() => renameTab.mutate()} />
      </BottomSheet>
      <ConfirmSheet
        visible={open === 'removeTab'}
        onClose={() => setOpen(null)}
        title={words.money.sheet.removeTabAsk.title}
        body={words.money.sheet.removeTabAsk.body}
        confirm={words.money.sheet.removeTabAsk.confirm}
        busy={removeTab.isPending}
        problem={removeTab.isError ? messageFor(removeTab.error) : null}
        onConfirm={() => removeTab.mutate()}
      />

      <BottomSheet visible={open === 'rowMenu'} onClose={() => setOpen(null)} title={row ? words.money.rowCard.unnamed(row.number) : undefined}>
        <SheetRow
          first
          icon={(c) => <Pencil size={22} color={c} />}
          label={words.money.sheet.rowMenu.open}
          onPress={() => {
            setOpen(null);
            if (row) openRow(row);
          }}
        />
        <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.sheet.rowMenu.remove} onPress={() => setOpen('removeRow')} />
      </BottomSheet>
      <ConfirmSheet
        visible={open === 'removeRow'}
        onClose={() => setOpen(null)}
        title={words.money.sheet.rowMenu.removeAsk.title}
        body={words.money.sheet.rowMenu.removeAsk.body}
        confirm={words.money.sheet.rowMenu.removeAsk.confirm}
        busy={removeRow.isPending}
        problem={removeRow.isError ? messageFor(removeRow.error) : null}
        onConfirm={() => (row ? removeRow.mutate(row) : undefined)}
      />

      <ColumnSheet
        sheet={sheet}
        visible={open === 'addColumn' || open === 'column'}
        column={open === 'column' ? (column ?? undefined) : undefined}
        onClose={() => setOpen(null)}
        onFormula={(of, name) => {
          setOpen(null);
          router.push(formulaHref(sheet, of ? { column: of.id } : { as: 'column', name }));
        }}
      />
      <AudienceSheet thingId={sheet.id} visible={open === 'audience'} onClose={() => setOpen(null)} />
      <ConfirmSheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title={words.money.sheet.deleteAsk.title}
        body={words.money.sheet.deleteAsk.body}
        confirm={words.money.sheet.deleteAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

type NameFormProps = { label: string; placeholder?: string; value: string; onChange: (text: string) => void; save: string; busy: boolean; error: unknown; onSave: () => void; children?: React.ReactNode };

/** One box for a name and the button that saves it: renaming the sheet or a tab, adding a tab. */
function NameForm({ label, placeholder, value, onChange, save, busy, error, onSave, children }: NameFormProps) {
  const failed = error instanceof ApiError ? error : null;
  const inField = failed?.fields.title ?? failed?.fields.name;
  return (
    <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={label} placeholder={placeholder} value={value} onChangeText={onChange} maxLength={120} autoFocus error={inField ?? (error && !inField ? messageFor(error) : null)} />
      {children}
      <Button label={save} size="lg" block disabled={value.trim().length === 0} loading={busy} onPress={onSave} />
    </View>
  );
}

/** Loading: grey shapes where the tiles and the grid will stand. */
function SheetSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading}>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 2, paddingHorizontal: layout.barGutter }}>
        {[0, 1, 2].map((one) => (
          <Sk key={one} height={62} radius="photo" style={{ flex: 1 }} />
        ))}
      </View>
      <View style={{ gap: 10, marginTop: 24, paddingHorizontal: layout.barGutter }}>
        {[0, 1, 2, 3, 4, 5].map((one) => (
          <Sk key={one} height={30} radius="chip" />
        ))}
      </View>
    </View>
  );
}
