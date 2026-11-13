import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type SheetBriefResponse, useGetSheetsInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { Amount, SheetTile } from '@/features/money/parts';
import { cellHeadline } from '@/features/money/sheet/cells';
import { TemplateGrid } from '@/features/money/sheet/Templates';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref, useOpenThing } from '@/features/things/open';
import { newThingHref } from '@/features/today/newThings';
import { daysBetween, formatDay, toISODate, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 8.4 Sheets: the circle's sheets, the one changed last first, and under them the templates a new one can
 * start from. The + starts one by name (`/new/sheet`). A sheet that the whole circle sees shows its first
 * tile's number at the end of its row; one that only some see shows who.
 */
export default function Sheets() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const sheets = useGetSheetsInfinite(circle.id, undefined, { query: paged });
  const load = loadState(sheets);
  const list = rows(sheets.data);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.money.sheets.title} trailing={<RoundButton label={words.money.sheets.new} icon={(c) => <Plus size={20} color={c} />} onPress={() => router.push(newThingHref('sheet'))} />} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !list ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={4} />
        )
      ) : (
        <List<SheetBriefResponse>
          data={list}
          keyOf={(sheet) => sheet.id}
          row={(sheet) => <SheetRow sheet={sheet} mine={sheet.editedBy?.memberId === circle.myMemberId} />}
          header={
            <>
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.sheets.yours}</GroupLabel>
              {list.length === 0 ? (
                <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
                  {words.money.sheets.none}
                </Txt>
              ) : null}
            </>
          }
          footer={
            <View>
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.sheets.templates}</GroupLabel>
              <TemplateGrid onStarted={(sheet) => router.push(thingHref({ kind: 'sheet', id: sheet.id }))} />
            </View>
          }
          loadingMore={sheets.isFetchingNextPage}
          refreshing={sheets.isRefetching && !sheets.isFetchingNextPage}
          onRefresh={() => void sheets.refetch()}
          {...more(sheets)}
        />
      )}
    </SafeAreaView>
  );
}

/** A sheet in the list: its tile, its name, how many tabs it has and who changed it last. */
function SheetRow({ sheet, mine }: { sheet: SheetBriefResponse; mine: boolean }) {
  const open = useOpenThing();
  const changed = toISODate(new Date(sheet.updatedAt));
  const edited = sheet.editedBy ? words.money.sheets.edited(mine ? null : firstName(sheet.editedBy.name), words.money.sheets.when(daysBetween(changed, today()), formatDay(changed))) : null;
  // A budget with a tab for every month says so, which tells more than who touched it last.
  const line = words.common.join([words.money.sheets.tabs(sheet.tabs), sheet.template === 'monthly_budget' && sheet.tabs === 12 ? words.money.sheets.oneAMonth : edited]);
  const everyoneSees = sheet.chip.audience === 'circle' && !(sheet.chip.hiddenFrom ?? []).length;
  const headline = sheet.headline ? cellHeadline(sheet.headline, sheet.currency) : '';
  const title = sheet.title.trim() || words.money.sheet.untitled;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([title, line, everyoneSees ? headline : null])} onPress={() => open({ kind: 'sheet', id: sheet.id })} scaleTo={0.99} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
      <SheetTile />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      {everyoneSees ? headline ? <Amount>{headline}</Amount> : null : <AudienceChip thing={sheet} quiet />}
    </Tap>
  );
}
