package app.homeport.api.money.sheet;

import app.homeport.api.circle.CircleService;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaService.MediaResponse;
import app.homeport.api.media.MediaStore;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.money.Cash;
import app.homeport.api.money.MoneyPeople;
import app.homeport.api.money.MoneyPeople.Person;
import app.homeport.api.money.sheet.Cells.CellResponse;
import app.homeport.api.money.sheet.FormulaWords.PartResponse;
import app.homeport.api.money.sheet.SheetStore.ColumnRow;
import app.homeport.api.money.sheet.SheetStore.Home;
import app.homeport.api.money.sheet.SheetStore.RowRow;
import app.homeport.api.money.sheet.SheetStore.SheetRow;
import app.homeport.api.money.sheet.SheetStore.TabRow;
import app.homeport.api.money.sheet.SheetStore.TileRow;
import app.homeport.api.money.sheet.SheetTemplate.ColumnDef;
import app.homeport.api.money.sheet.SheetTemplate.RowDef;
import app.homeport.api.money.sheet.SheetTemplate.TabDef;
import app.homeport.api.money.sheet.SheetTemplate.TileDef;
import app.homeport.api.money.sheet.Worked.ColumnResponse;
import app.homeport.api.money.sheet.Worked.Lookup;
import app.homeport.api.money.sheet.Worked.RowResponse;
import app.homeport.api.money.sheet.Worked.TileResponse;
import app.homeport.api.money.sheet.Worked.TotalResponse;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sheets: a spreadsheet made for a phone. A sheet has tabs; a tab has typed columns, rows that open as cards,
 * and tiles on top. Everything a formula works out is worked out here (by {@link Calc}) and sent with the
 * rows; the app never calculates.
 *
 * <p>Every change is to one thing: one row, some cells of one row, one column, one tile. Adding carries a
 * clientId. So two people working in a sheet at the same moment both keep what they did.
 */
@Service
public class SheetService {

    static final int MAX_TABS = 24;
    static final int MAX_COLUMNS = 40;
    static final int MAX_ROWS = 2000;
    static final int MAX_TILES = 12;
    static final int MAX_PAPERS = 20;

    // ---------- what the app is sent ----------

    public record TabBriefResponse(UUID id, String name, int rows) {}

    public record TabResponse(
            UUID id,
            String name,
            List<ColumnResponse> columns,
            List<TileResponse> tiles,
            int rowCount,

            @Schema(description = "The first rows. The rest come from the rows route, a page at a time.")
            List<RowResponse> rows,

            @Schema(
                    nullable = true,
                    description =
                            "Send this as `cursor` to the rows route for the rows that follow. Null when these are all.")
            String nextRows) {}

    public record SheetResponse(
            UUID id,
            UUID circleId,
            String title,
            String currency,

            @Schema(nullable = true, description = "The template it started from")
            SheetTemplate template,

            @Schema(
                    description =
                            "One word for the kind of sheet it is: Trip, Monthly. Empty for a sheet that started blank.")
            String tag,

            Instant updatedAt,

            @Schema(nullable = true, description = "Who changed it last")
            PersonBrief editedBy,

            @Schema(description = "Who else has it open right now")
            List<PersonBrief> here,

            List<TabBriefResponse> tabs,

            @Schema(description = "The tab that was asked for, or the first")
            TabResponse tab,

            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** A sheet in a list. */
    public record SheetBriefResponse(
            UUID id,
            UUID circleId,
            String title,
            String currency,
            @Schema(nullable = true) SheetTemplate template,
            String tag,
            int tabs,
            Instant updatedAt,
            @Schema(nullable = true) PersonBrief editedBy,

            @Schema(nullable = true, description = "Its first tile's name: Planned")
            String headlineName,

            @Schema(nullable = true, description = "Its first tile's number: €7,640")
            CellResponse headline,

            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    public record RowLinkResponse(UUID id, String label) {}

    /** A row opened as a card. */
    public record RowCardResponse(
            UUID sheetId,
            String sheetTitle,
            String currency,
            UUID tabId,
            String tabName,
            List<ColumnResponse> columns,
            RowResponse row,

            @Schema(description = "Receipts and papers kept with the row. Twenty at most.")
            List<MediaResponse> papers,

            @Schema(description = "How many rows the tab has: Row 3 of 6")
            int of,

            @Schema(nullable = true) RowLinkResponse previous,
            @Schema(nullable = true) RowLinkResponse next,
            boolean canEdit) {}

    /** What a change to a row changed: the row itself, and the totals that follow from it. */
    public record RowChangedResponse(
            RowResponse row,

            int rowCount,
            List<TileResponse> tiles,

            @Schema(description = "The row of totals, by column id")
            Map<UUID, TotalResponse> totals) {}

    /** A template to start a sheet from. */
    public record TemplateResponse(
            SheetTemplate code,
            String title,
            String emoji,
            String says,

            @Schema(
                    description =
                            "True for the ones with sliders to try before keeping them: the loan and the savings plan")
            boolean live) {}

    /** A function for the formula builder's "Maths" row. */
    public record FunctionResponse(
            @Schema(description = "How it is typed: SUMIF") String name,

            @Schema(description = "What its chip says: SUM IF")
            String label,

            String says,
            String example) {}

    public record ColumnBriefResponse(UUID id, String name, ColumnKind kind) {}

    /** A formula read back: as chips, as a sentence, and with its answer, before it is kept. */
    public record FormulaResponse(
            @Schema(description = "False when the formula couldn't be read or the question wasn't understood")
            boolean understood,

            @Schema(nullable = true, description = "The formula, written with column names, to save as it is")
            String formula,

            @Schema(
                    description =
                            "True when it gives one number for the whole tab (a tile); false when it is worked out for each row (a column)")
            boolean oneAnswer,

            List<PartResponse> parts,
            @Schema(nullable = true) String says,

            @Schema(nullable = true, description = "The answer: the number for a tile, the first row's for a column")
            CellResponse answer,

            int leftOut,
            @Schema(nullable = true) String leftOutSays,

            @Schema(nullable = true, description = "What is wrong with it, or how to ask instead, in a sentence")
            String problem,

            @Schema(description = "Questions this tab can answer, shown when one wasn't understood")
            List<String> examples,

            List<ColumnBriefResponse> columns,
            List<FunctionResponse> functions) {}

    /** A number a sheet works out that something else can show: a tile, or the total under a column. */
    public record NamedTotal(
            String name,
            CellKind kind,

            @Schema(nullable = true) Long cents,
            @Schema(nullable = true) BigDecimal number,
            String currency) {}

    // ---------- what the app sends ----------

    public record NewColumn(String name, ColumnKind kind, List<String> options, String formula, Summary summary) {}

    public record ColumnChange(
            String name,
            ColumnKind kind,
            List<String> options,
            String formula,
            Summary summary,
            UUID before,
            Boolean toEnd) {}

    public record RowChange(Map<UUID, Object> cells, String note, UUID before, Boolean toEnd) {}

    public record TileChange(
            String name, String formula, UUID ofTileId, Boolean removeOf, UUID before, Boolean toEnd) {}

    public record LoanInput(long principalCents, BigDecimal ratePercent, int years, long extraCents) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final SheetStore sheets;
    private final CircleService circles;
    private final MoneyPeople people;
    private final MediaService media;
    private final MediaStore mediaStore;

    SheetService(
            ThingService things,
            ThingStore thingStore,
            SheetStore sheets,
            CircleService circles,
            MoneyPeople people,
            MediaService media,
            MediaStore mediaStore) {
        this.things = things;
        this.thingStore = thingStore;
        this.sheets = sheets;
        this.circles = circles;
        this.people = people;
        this.media = media;
        this.mediaStore = mediaStore;
    }

    // ---------- a tab, worked out ----------

    /** Reads a tab and works it out. A tab holds 2,000 rows at most, and its sums need them all. */
    private Worked work(TabRow tab, Map<UUID, Person> circle, LocalDate today) {
        List<UUID> one = List.of(tab.id());
        return Worked.of(tab, sheets.columns(one), sheets.rows(tab.id()), sheets.tiles(one), circle, today);
    }

    private static LocalDate today(LocalDate day) {
        return day == null ? LocalDate.now() : day;
    }

    /** A page of a tab's rows, after the row a cursor names. */
    private Page<RowResponse> rowsPage(Worked worked, Keyset page) {
        int from = 0;
        if (!page.first()) {
            double position;
            try {
                position = Double.parseDouble(page.text(0));
            } catch (NumberFormatException notAPlace) {
                throw Keyset.badCursor();
            }
            UUID id = page.uuid(1);
            while (from < worked.rows().size()) {
                RowRow row = worked.rows().get(from);
                if (row.position() > position
                        || (row.position() == position && row.id().toString().compareTo(id.toString()) > 0)) {
                    break;
                }
                from++;
            }
        }
        int to = Math.min(from + page.limit(), worked.rows().size());
        List<RowRow> shown = worked.rows().subList(from, to);
        Map<UUID, Integer> papers =
                sheets.paperCounts(shown.stream().map(RowRow::id).toList());
        List<RowResponse> views = new ArrayList<>();
        for (int i = from; i < to; i++) {
            views.add(worked.rowView(i, papers.getOrDefault(worked.rows().get(i).id(), 0)));
        }
        RowRow last = shown.isEmpty() ? null : shown.get(shown.size() - 1);
        return new Page<>(
                views, to < worked.rows().size() && last != null ? Keyset.cursor(last.position(), last.id()) : null);
    }

    // ---------- reading ----------

    public List<TemplateResponse> templates() {
        return Arrays.stream(SheetTemplate.values())
                .map(t -> new TemplateResponse(t, t.title(), t.emoji(), t.says(), t.live()))
                .toList();
    }

    public SheetResponse get(UUID id, UUID me, UUID tabId, Integer limit, LocalDate day) {
        ThingRow row = things.require(id, me, ThingKind.SHEET);
        SheetRow sheet = sheets.find(id).orElseThrow(ThingService::notFound);
        List<TabRow> tabs = sheets.tabs(List.of(id));
        TabRow tab = tabId == null
                ? tabs.get(0)
                : tabs.stream().filter(t -> t.id().equals(tabId)).findFirst().orElseThrow(SheetService::tabGone);
        Map<UUID, Person> circle = people.of(row.circleId());
        Worked worked = work(tab, circle, today(day));
        Page<RowResponse> first = rowsPage(worked, Keyset.of(null, limit, 100));
        Map<UUID, Integer> counts =
                sheets.rowCounts(tabs.stream().map(TabRow::id).toList());
        UUID mine = circles.me(row.circleId(), me).id();
        SheetTemplate template = SheetTemplate.read(sheet.template());
        return new SheetResponse(
                row.id(),
                row.circleId(),
                row.title(),
                sheet.currency(),
                template,
                template == null ? "" : template.tag(),
                row.updatedAt(),
                brief(circle, sheet.editedBy()),
                sheets.seenBy(id, mine).stream()
                        .map(circle::get)
                        .filter(Objects::nonNull)
                        .map(Person::brief)
                        .toList(),
                tabs.stream()
                        .map(t -> new TabBriefResponse(t.id(), t.name(), counts.getOrDefault(t.id(), 0)))
                        .toList(),
                new TabResponse(
                        tab.id(),
                        tab.name(),
                        worked.columnViews(),
                        worked.tileViews(),
                        worked.rows().size(),
                        first.items(),
                        first.nextCursor()),
                row.mine(),
                row.canEdit(),
                things.chip(row));
    }

    public Page<RowResponse> rows(UUID id, UUID me, UUID tabId, Keyset page, LocalDate day) {
        ThingRow row = things.require(id, me, ThingKind.SHEET);
        List<TabRow> tabs = sheets.tabs(List.of(id));
        TabRow tab = tabId == null
                ? tabs.get(0)
                : tabs.stream().filter(t -> t.id().equals(tabId)).findFirst().orElseThrow(SheetService::tabGone);
        return rowsPage(work(tab, people.of(row.circleId()), today(day)), page);
    }

    private static PersonBrief brief(Map<UUID, Person> circle, UUID memberId) {
        Person person = memberId == null ? null : circle.get(memberId);
        return person == null ? null : person.brief();
    }

    public Page<SheetBriefResponse> list(UUID circleId, UUID me, Keyset page) {
        List<ThingRow> rows = thingStore.list(circleId, me, ThingKind.SHEET, null, null, page);
        return page.page(rows, row -> Keyset.cursor(row.updatedAt(), row.id())).map(shown -> briefs(shown, me));
    }

    /** Sheets as lines of a list, each with its first tile as a headline. The viewer may see every one of them. */
    public List<SheetBriefResponse> briefs(List<ThingRow> rows, UUID me) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = rows.stream().map(ThingRow::id).toList();
        Map<UUID, SheetRow> bySheet = sheets.findAll(ids).stream().collect(Collectors.toMap(SheetRow::thingId, s -> s));
        Map<UUID, List<TabRow>> tabs = sheets.tabs(ids).stream().collect(Collectors.groupingBy(TabRow::thingId));
        Map<UUID, Headline> headlines = headlines(rows);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        Map<UUID, Map<UUID, Person>> circles = new HashMap<>();
        return rows.stream()
                .map(row -> {
                    SheetRow sheet = bySheet.get(row.id());
                    SheetTemplate template = sheet == null ? null : SheetTemplate.read(sheet.template());
                    Headline headline = headlines.get(row.id());
                    // A sheet with no tiles has nothing to put on its line.
                    TileResponse first = headline == null ? null : headline.first();
                    Map<UUID, Person> circle = circles.computeIfAbsent(row.circleId(), people::of);
                    return new SheetBriefResponse(
                            row.id(),
                            row.circleId(),
                            row.title(),
                            sheet == null ? Cash.EUR : sheet.currency(),
                            template,
                            template == null ? "" : template.tag(),
                            tabs.getOrDefault(row.id(), List.of()).size(),
                            row.updatedAt(),
                            sheet == null ? null : brief(circle, sheet.editedBy()),
                            first == null ? null : first.name(),
                            first == null ? null : first.cell(),
                            row.mine(),
                            row.canEdit(),
                            chips.get(row.id()));
                })
                .toList();
    }

    /** What a sheet says about itself in a list: its first tile, and the first tile that is shown against another. */
    public record Headline(String currency, int rows, TileResponse first, TileResponse against) {}

    /**
     * The headline of each of these sheets, worked out from its first tab. Sheets whose first tab has no tiles
     * have a headline with no tile in it. The same handful of statements however many sheets are asked for.
     */
    public Map<UUID, Headline> headlines(List<ThingRow> rows) {
        List<UUID> ids = rows.stream().map(ThingRow::id).toList();
        Map<UUID, SheetRow> bySheet = sheets.findAll(ids).stream().collect(Collectors.toMap(SheetRow::thingId, s -> s));
        Map<UUID, TabRow> firstTabs = new LinkedHashMap<>();
        for (TabRow tab : sheets.tabs(ids)) {
            firstTabs.putIfAbsent(tab.thingId(), tab);
        }
        List<UUID> tabIds = firstTabs.values().stream().map(TabRow::id).toList();
        Map<UUID, List<ColumnRow>> columns =
                sheets.columns(tabIds).stream().collect(Collectors.groupingBy(ColumnRow::tabId));
        Map<UUID, List<TileRow>> tiles = sheets.tiles(tabIds).stream().collect(Collectors.groupingBy(TileRow::tabId));
        Map<UUID, Integer> counts = sheets.rowCounts(tabIds);
        // Only a tab with tiles has its rows read: a tile is worked out from all of them.
        Map<UUID, List<RowRow>> rowsOf =
                sheets.rowsOf(tabIds.stream().filter(tiles::containsKey).toList());
        Map<UUID, Map<UUID, Person>> circles = new HashMap<>();
        Map<UUID, Headline> headlines = new HashMap<>();
        for (ThingRow row : rows) {
            TabRow tab = firstTabs.get(row.id());
            SheetRow sheet = bySheet.get(row.id());
            if (tab == null || sheet == null) {
                continue;
            }
            List<TileRow> ofTab = tiles.getOrDefault(tab.id(), List.of());
            if (ofTab.isEmpty()) {
                headlines.put(row.id(), new Headline(sheet.currency(), counts.getOrDefault(tab.id(), 0), null, null));
                continue;
            }
            Worked worked = Worked.of(
                    tab,
                    columns.getOrDefault(tab.id(), List.of()),
                    rowsOf.getOrDefault(tab.id(), List.of()),
                    ofTab,
                    circles.computeIfAbsent(row.circleId(), people::of),
                    LocalDate.now());
            List<TileResponse> views = worked.tileViews();
            headlines.put(
                    row.id(),
                    new Headline(
                            sheet.currency(),
                            worked.rows().size(),
                            views.get(0),
                            views.stream()
                                    .filter(tile -> tile.ofCell() != null)
                                    .findFirst()
                                    .orElse(null)));
        }
        return headlines;
    }

    /** A cell as a few words, for a line the API writes itself: "€7,640", "12", "15 Jan 2027". */
    public static String words(CellResponse cell, String currency) {
        return switch (cell.kind()) {
            case MONEY -> Cash.round(cell.cents(), currency);
            case NUMBER -> cell.number().toPlainString();
            case TEXT -> cell.text();
            case DATE -> Calc.words(new Value.Day(cell.date()));
            case TICK -> Boolean.TRUE.equals(cell.ticked()) ? "yes" : "no";
            case PERSON ->
                MoneyPeople.names(cell.people().stream().map(PersonBrief::name).toList());
            case EMPTY, PROBLEM -> "";
        };
    }

    /**
     * A named number of a sheet, for a viewer who may see the sheet: the tile with this name (in any of its
     * tabs, the first tab first), or failing that the total under the column with this name. Empty when
     * there is no such sheet for this viewer, or no such number in it. A goal reads "Saved" this way, and a
     * page shows a sheet's total.
     */
    public Optional<NamedTotal> total(UUID sheetId, String name, UUID me) {
        return totals(sheetId, me).stream()
                .filter(total -> total.name().equalsIgnoreCase(name.strip()))
                .findFirst();
    }

    /** Every named number of a sheet, for a viewer who may see it: its tiles, then the totals under its columns. Empty otherwise. */
    public List<NamedTotal> totals(UUID sheetId, UUID me) {
        Optional<ThingRow> seen = thingStore.find(sheetId, me).filter(row -> row.kind() == ThingKind.SHEET);
        SheetRow sheet = seen.flatMap(row -> sheets.find(sheetId)).orElse(null);
        if (sheet == null) {
            return List.of();
        }
        Map<UUID, Person> circle = people.of(seen.get().circleId());
        List<NamedTotal> tiles = new ArrayList<>();
        List<NamedTotal> sums = new ArrayList<>();
        for (TabRow tab : sheets.tabs(List.of(sheetId))) {
            Worked worked = work(tab, circle, LocalDate.now());
            for (TileResponse tile : worked.tileViews()) {
                tiles.add(named(tile.name(), tile.cell(), sheet.currency()));
            }
            for (ColumnResponse column : worked.columnViews()) {
                if (column.total() != null) {
                    sums.add(named(column.name(), column.total().cell(), sheet.currency()));
                }
            }
        }
        tiles.addAll(sums);
        return tiles;
    }

    private static NamedTotal named(String name, CellResponse cell, String currency) {
        return new NamedTotal(name, cell.kind(), cell.cents(), cell.number(), currency);
    }

    // ---------- a named number that is the sum of one column ----------

    /**
     * The one column a named number adds up, when the number is nothing but that: a tile written
     * {@code SUM([Put in])}, or the total under a column that sums. With where a line's day, person and words
     * go in that table (its first date, person and text column), for whoever shows the rows as lines.
     *
     * @param canEdit true when the viewer may add and remove rows there
     */
    public record Summed(
            UUID sheetId,
            UUID tabId,
            UUID columnId,
            ColumnKind kind,
            UUID dayColumn,
            UUID whoColumn,
            UUID noteColumn,
            boolean canEdit) {}

    /** A row of such a table, as a line: how much it adds, and who, when and why when the row says. */
    public record SummedRow(UUID id, UUID memberId, long amount, String note, LocalDate day) {}

    /**
     * Which column a named number of a sheet adds up, for a viewer who may see the sheet. The name is found
     * exactly as {@link #total} finds it (a tile first, the first tab first, then a column's total), so this
     * always speaks of the same number. Empty when that number is anything but the sum of one column that
     * rows are typed into: a formula over several, a count, an average.
     */
    public Optional<Summed> summed(UUID sheetId, String name, UUID me) {
        ThingRow seen = thingStore
                .find(sheetId, me)
                .filter(row -> row.kind() == ThingKind.SHEET)
                .orElse(null);
        if (seen == null) {
            return Optional.empty();
        }
        List<TabRow> tabs = sheets.tabs(List.of(sheetId));
        List<UUID> tabIds = tabs.stream().map(TabRow::id).toList();
        Map<UUID, List<ColumnRow>> columns =
                sheets.columns(tabIds).stream().collect(Collectors.groupingBy(ColumnRow::tabId));
        Map<UUID, List<TileRow>> tiles = sheets.tiles(tabIds).stream().collect(Collectors.groupingBy(TileRow::tabId));
        String wanted = name.strip();
        for (TabRow tab : tabs) {
            List<ColumnRow> ofTab = columns.getOrDefault(tab.id(), List.of());
            for (TileRow tile : tiles.getOrDefault(tab.id(), List.of())) {
                if (tile.name().equalsIgnoreCase(wanted)) {
                    return plainSum(tile.formula(), ofTab).map(column -> summed(seen, column, ofTab));
                }
            }
        }
        for (TabRow tab : tabs) {
            List<ColumnRow> ofTab = columns.getOrDefault(tab.id(), List.of());
            for (ColumnRow column : ofTab) {
                if (column.name().equalsIgnoreCase(wanted) && column.summary() != Summary.NONE) {
                    return column.summary() == Summary.SUM && typedIn(column)
                            ? Optional.of(summed(seen, column, ofTab))
                            : Optional.empty();
                }
            }
        }
        return Optional.empty();
    }

    /** The column a formula adds up, when the formula is SUM of one column and nothing else. */
    private static Optional<ColumnRow> plainSum(String formula, List<ColumnRow> columns) {
        try {
            if (Formula.read(formula, new Worked.Lookup(columns)) instanceof Node.Call call
                    && call.fn() == Fn.SUM
                    && call.args().size() == 1
                    && call.args().get(0) instanceof Node.Column of) {
                return columns.stream()
                        .filter(column -> column.id().equals(of.id()) && typedIn(column))
                        .findFirst();
            }
        } catch (FormulaProblem unreadable) {
            // A formula that can't be read adds up nothing.
        }
        return Optional.empty();
    }

    private static boolean typedIn(ColumnRow column) {
        return column.kind() == ColumnKind.MONEY || column.kind() == ColumnKind.NUMBER;
    }

    private static Summed summed(ThingRow sheet, ColumnRow column, List<ColumnRow> ofTab) {
        return new Summed(
                sheet.id(),
                column.tabId(),
                column.id(),
                column.kind(),
                first(ofTab, ColumnKind.DATE),
                first(ofTab, ColumnKind.PERSON),
                first(ofTab, ColumnKind.TEXT),
                sheet.canEdit());
    }

    private static UUID first(List<ColumnRow> columns, ColumnKind kind) {
        return columns.stream()
                .filter(column -> column.kind() == kind)
                .map(ColumnRow::id)
                .findFirst()
                .orElse(null);
    }

    /** The rows that add something to such a number, the latest day first and, within a day, the lower row first. */
    public List<SummedRow> summedRows(Summed of) {
        List<SummedRow> lines = new ArrayList<>();
        for (RowRow row : sheets.rows(of.tabId())) {
            Long amount = amount(row.cells().get(of.columnId().toString()), of.kind());
            if (amount == null || amount == 0) {
                continue;
            }
            Object who = of.whoColumn() == null
                    ? null
                    : row.cells().get(of.whoColumn().toString());
            Object day = of.dayColumn() == null
                    ? null
                    : row.cells().get(of.dayColumn().toString());
            Object words = of.noteColumn() == null
                    ? null
                    : row.cells().get(of.noteColumn().toString());
            lines.add(new SummedRow(
                    row.id(),
                    who instanceof List<?> people && !people.isEmpty() ? readId(people.get(0)) : null,
                    amount,
                    words instanceof String text && !text.isBlank() ? text : row.note(),
                    readDay(day)));
        }
        // What was added last stands first among the lines of one day.
        Collections.reverse(lines);
        lines.sort(Comparator.comparing(SummedRow::day, Comparator.nullsLast(Comparator.reverseOrder())));
        return lines;
    }

    private static Long amount(Object kept, ColumnKind kind) {
        try {
            if (kept == null) {
                return null;
            }
            return kind == ColumnKind.MONEY
                    ? (kept instanceof Number cents ? cents.longValue() : null)
                    : Long.valueOf(new BigDecimal(kept.toString()).longValue());
        } catch (RuntimeException unreadable) {
            return null;
        }
    }

    private static UUID readId(Object kept) {
        try {
            return UUID.fromString(String.valueOf(kept));
        } catch (IllegalArgumentException notAnId) {
            return null;
        }
    }

    private static LocalDate readDay(Object kept) {
        try {
            return kept == null ? null : LocalDate.parse(kept.toString());
        } catch (RuntimeException notADay) {
            return null;
        }
    }

    /**
     * Adds a row to such a table as this person: the amount in the column that is summed, and the day, the
     * person and the words where the table has a column for them (words go to the row's note otherwise).
     * Whoever may not change the sheet is refused, as for any row. Returns the row's id.
     */
    @Transactional
    public UUID addSummedRow(
            Summed of, UUID me, UUID memberId, long amount, String note, LocalDate day, UUID clientId) {
        Map<UUID, Object> cells = new LinkedHashMap<>();
        cells.put(of.columnId(), of.kind() == ColumnKind.MONEY ? (Object) amount : String.valueOf(amount));
        if (of.dayColumn() != null && day != null) {
            cells.put(of.dayColumn(), day.toString());
        }
        if (of.whoColumn() != null && memberId != null) {
            cells.put(of.whoColumn(), List.of(memberId.toString()));
        }
        boolean words = note != null && !note.isBlank();
        if (words && of.noteColumn() != null) {
            cells.put(of.noteColumn(), note.strip());
        }
        return addRow(of.tabId(), me, cells, words && of.noteColumn() == null ? note : "", null, clientId, day)
                .row()
                .id();
    }

    /** True when this id is a row of a sheet. */
    public boolean isRow(UUID id) {
        return sheets.homeOfRow(id).isPresent();
    }

    // ---------- making a sheet ----------

    @Transactional
    public SheetResponse create(
            UUID me,
            UUID circleId,
            String title,
            String currency,
            SheetTemplate template,
            LoanInput loan,
            Audience audience,
            UUID clientId,
            LocalDate day) {
        SheetTemplate from = loan != null ? SheetTemplate.LOAN : template;
        String name = title == null || title.isBlank() ? from == null ? "" : from.title() : title.strip();
        if (name.isEmpty()) {
            throw ApiProblem.badRequest("no_name", "Give the sheet a name.");
        }
        UUID id = things.create(me, circleId, ThingKind.SHEET, name, audience, clientId);
        if (thingStore.isNew(id, "sheets")) {
            UUID mine = circles.me(circleId, me).id();
            sheets.insert(id, Cash.currency(currency), from == null ? "" : from.code(), mine);
            List<TabDef> tabs;
            if (loan != null) {
                try {
                    tabs = List.of(SheetTemplate.loan(
                            loan.principalCents(), loan.ratePercent(), loan.years(), loan.extraCents()));
                } catch (IllegalArgumentException outOfRange) {
                    throw ApiProblem.badRequest("invalid_loan", outOfRange.getMessage());
                }
            } else if (from != null) {
                tabs = from.tabs(today(day));
            } else {
                tabs = List.of(new TabDef(
                        "Sheet 1",
                        List.of(
                                ColumnDef.of("Item", ColumnKind.TEXT),
                                ColumnDef.of("Amount", ColumnKind.MONEY, Summary.SUM)),
                        List.of(),
                        List.of()));
            }
            build(id, tabs, mine);
        }
        return get(id, me, null, null, day);
    }

    /**
     * Fills a sheet with tabs, columns, tiles and rows from their definitions. Formulas are written with
     * column names and kept with column ids. Used for templates and for the sample data.
     *
     * @return the ids of the tabs made, in order
     */
    public List<UUID> build(UUID thingId, List<TabDef> tabs, UUID by) {
        List<UUID> made = new ArrayList<>();
        for (TabDef def : tabs) {
            UUID tabId = sheets.addTab(thingId, def.name(), null);
            made.add(tabId);
            List<UUID> columnIds = new ArrayList<>();
            for (ColumnDef column : def.columns()) {
                columnIds.add(sheets.addColumn(
                        tabId, column.name(), column.kind(), column.options(), "", column.summary(), null));
            }
            Lookup lookup = new Lookup(sheets.columns(List.of(tabId)));
            for (int c = 0; c < def.columns().size(); c++) {
                ColumnDef column = def.columns().get(c);
                if (column.kind() == ColumnKind.FORMULA) {
                    sheets.changeColumn(
                            columnIds.get(c),
                            column.name(),
                            column.kind(),
                            column.options(),
                            Formula.keep(Formula.read(column.formula(), lookup)),
                            column.summary());
                }
            }
            Map<String, UUID> tileIds = new HashMap<>();
            for (TileDef tile : def.tiles()) {
                tileIds.put(
                        tile.name(),
                        sheets.addTile(
                                tabId, tile.name(), Formula.keep(Formula.read(tile.formula(), lookup)), null, null));
            }
            for (TileDef tile : def.tiles()) {
                if (tile.of() != null) {
                    sheets.changeTile(
                            tileIds.get(tile.name()),
                            tile.name(),
                            Formula.keep(Formula.read(tile.formula(), lookup)),
                            tileIds.get(tile.of()));
                }
            }
            for (RowDef row : def.rows()) {
                Map<String, Object> cells = new LinkedHashMap<>();
                for (int c = 0; c < def.columns().size() && c < row.cells().size(); c++) {
                    Object kept = Cells.fromDefinition(
                            def.columns().get(c).kind(), row.cells().get(c));
                    if (kept != null) {
                        cells.put(columnIds.get(c).toString(), kept);
                    }
                }
                sheets.addRow(tabId, cells, row.note() == null ? "" : row.note(), by, null);
            }
        }
        return made;
    }

    @Transactional
    public SheetResponse change(UUID id, UUID me, String title, String currency, LocalDate day) {
        ThingRow row = things.requireEdit(id, me, ThingKind.SHEET);
        if (currency != null) {
            sheets.setCurrency(id, Cash.currency(currency));
        }
        if (title != null && !title.isBlank()) {
            thingStore.retitle(id, title.strip());
        }
        sheets.edited(id, circles.me(row.circleId(), me).id());
        return get(id, me, null, null, day);
    }

    // ---------- finding what a change is about ----------

    private static ApiProblem tabGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That tab isn't there any more.");
    }

    private static ApiProblem gone(String what) {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That " + what + " isn't there any more.");
    }

    /** The sheet a tab belongs to, for someone who may change it. A tab of a sheet they may not see isn't there for them. */
    private ThingRow editing(Optional<Home> home, UUID me, String what) {
        Home found = home.orElseThrow(() -> gone(what));
        try {
            return things.requireEdit(found.thingId(), me, ThingKind.SHEET);
        } catch (ApiProblem problem) {
            throw problem.status() == HttpStatus.NOT_FOUND ? gone(what) : problem;
        }
    }

    private ThingRow seeing(Optional<Home> home, UUID me, String what) {
        Home found = home.orElseThrow(() -> gone(what));
        try {
            return things.require(found.thingId(), me, ThingKind.SHEET);
        } catch (ApiProblem problem) {
            throw gone(what);
        }
    }

    private Optional<Home> homeOfTab(UUID tabId) {
        return sheets.tab(tabId).map(tab -> new Home(tab.id(), tab.thingId()));
    }

    private void edited(ThingRow row, UUID me) {
        sheets.edited(row.id(), circles.me(row.circleId(), me).id());
    }

    // ---------- tabs ----------

    @Transactional
    public SheetResponse addTab(UUID id, UUID me, String name, UUID copyColumnsOf, UUID clientId, LocalDate day) {
        ThingRow row = things.requireEdit(id, me, ThingKind.SHEET);
        List<TabRow> tabs = sheets.tabs(List.of(id));
        if (tabs.size() >= MAX_TABS) {
            throw ApiProblem.conflict("sheet_full", "A sheet holds 24 tabs at most. Start another sheet for the rest.");
        }
        int before = tabs.size();
        UUID tabId = sheets.addTab(id, name.strip(), clientId);
        boolean added = sheets.tabs(List.of(id)).size() > before;
        if (added && copyColumnsOf != null) {
            TabRow source = tabs.stream()
                    .filter(tab -> tab.id().equals(copyColumnsOf))
                    .findFirst()
                    .orElseThrow(SheetService::tabGone);
            copyShape(source.id(), tabId);
        } else if (added) {
            sheets.addColumn(tabId, "Item", ColumnKind.TEXT, List.of(), "", Summary.NONE, null);
        }
        edited(row, me);
        return get(id, me, tabId, null, day);
    }

    /** Gives a new tab the columns and tiles of another, with their formulas pointing at its own columns. Rows aren't copied. */
    private void copyShape(UUID from, UUID to) {
        Map<String, String> renamed = new LinkedHashMap<>();
        List<ColumnRow> columns = sheets.columns(List.of(from));
        Map<UUID, UUID> made = new HashMap<>();
        for (ColumnRow column : columns) {
            UUID id = sheets.addColumn(to, column.name(), column.kind(), column.options(), "", column.summary(), null);
            made.put(column.id(), id);
            renamed.put("[#" + column.id() + "]", "[#" + id + "]");
        }
        for (ColumnRow column : columns) {
            if (column.kind() == ColumnKind.FORMULA) {
                sheets.changeColumn(
                        made.get(column.id()),
                        column.name(),
                        column.kind(),
                        column.options(),
                        replaced(column.formula(), renamed),
                        column.summary());
            }
        }
        List<TileRow> tiles = sheets.tiles(List.of(from));
        Map<UUID, UUID> madeTiles = new HashMap<>();
        for (TileRow tile : tiles) {
            madeTiles.put(tile.id(), sheets.addTile(to, tile.name(), replaced(tile.formula(), renamed), null, null));
        }
        for (TileRow tile : tiles) {
            if (tile.ofTile() != null && madeTiles.containsKey(tile.ofTile())) {
                sheets.changeTile(
                        madeTiles.get(tile.id()),
                        tile.name(),
                        replaced(tile.formula(), renamed),
                        madeTiles.get(tile.ofTile()));
            }
        }
    }

    private static String replaced(String formula, Map<String, String> renamed) {
        String text = formula;
        for (Map.Entry<String, String> one : renamed.entrySet()) {
            text = text.replace(one.getKey(), one.getValue());
        }
        return text;
    }

    @Transactional
    public SheetResponse changeTab(UUID tabId, UUID me, String name, UUID before, Boolean toEnd, LocalDate day) {
        ThingRow row = editing(homeOfTab(tabId), me, "tab");
        if (name != null && !name.isBlank()) {
            sheets.renameTab(tabId, name.strip());
        }
        if (before != null || Boolean.TRUE.equals(toEnd)) {
            if (before != null
                    && sheets.tab(before)
                            .filter(t -> t.thingId().equals(row.id()))
                            .isEmpty()) {
                throw ApiProblem.badRequest("not_in_sheet", "That tab isn't in this sheet.");
            }
            sheets.moveTab(tabId, row.id(), before);
        }
        edited(row, me);
        return get(row.id(), me, tabId, null, day);
    }

    @Transactional
    public void removeTab(UUID tabId, UUID me) {
        Optional<Home> home = homeOfTab(tabId);
        if (home.isEmpty()) {
            return; // removing what is gone is fine
        }
        ThingRow row = editing(home, me, "tab");
        if (sheets.tabs(List.of(row.id())).size() <= 1) {
            throw ApiProblem.conflict("last_tab", "A sheet keeps at least one tab. Delete the sheet instead.");
        }
        sheets.removeTab(tabId);
        edited(row, me);
    }

    // ---------- columns ----------

    private static String columnName(String name, List<ColumnRow> others) {
        String clean = name.strip().replaceAll("\\s+", " ");
        if (clean.contains("[") || clean.contains("]") || clean.startsWith("#")) {
            throw ApiProblem.badRequest(
                    "invalid_name", "A column's name can't have square brackets in it or start with #.");
        }
        if (others.stream().anyMatch(other -> other.name().equalsIgnoreCase(clean))) {
            throw ApiProblem.conflict(
                    "name_taken",
                    "There is already a column called " + clean + ". Formulas tell columns apart by name.");
        }
        return clean;
    }

    private static List<String> options(ColumnKind kind, List<String> options) {
        if (kind != ColumnKind.CHOICE) {
            return List.of();
        }
        List<String> clean = options == null
                ? List.of()
                : options.stream()
                        .filter(Objects::nonNull)
                        .map(String::strip)
                        .filter(option -> !option.isEmpty())
                        .distinct()
                        .toList();
        if (clean.isEmpty()) {
            throw ApiProblem.badRequest("no_options", "Give the choice something to choose from.");
        }
        return clean;
    }

    private static Summary summary(ColumnKind kind, Summary asked) {
        Summary summary = asked == null ? Summary.NONE : asked;
        boolean fits = switch (summary) {
            case NONE, COUNT -> true;
            case SUM, AVG -> kind == ColumnKind.NUMBER || kind == ColumnKind.MONEY || kind == ColumnKind.FORMULA;
            case MIN, MAX ->
                kind == ColumnKind.NUMBER
                        || kind == ColumnKind.MONEY
                        || kind == ColumnKind.DATE
                        || kind == ColumnKind.FORMULA;
            case TICKED -> kind == ColumnKind.TICK || kind == ColumnKind.FORMULA;
        };
        if (!fits) {
            throw ApiProblem.badRequest(
                    "invalid_summary",
                    summary == Summary.TICKED
                            ? "Only a column of ticks can count the ticked ones."
                            : "That total needs a column of numbers, money or dates.");
        }
        return summary;
    }

    /**
     * Reads a formula for a column of this tab and refuses what can't be kept: a formula that can't be read,
     * and one that would make columns need each other in a circle.
     *
     * @param self the column the formula is for; its id may be one that isn't saved yet
     * @return the formula as it is kept, with column ids
     */
    private static String columnFormula(String formula, ColumnRow self, List<ColumnRow> columns) {
        List<ColumnRow> all = new ArrayList<>(
                columns.stream().filter(c -> !c.id().equals(self.id())).toList());
        all.add(self);
        Lookup lookup = new Lookup(all);
        try {
            Node node = Formula.read(formula, lookup);
            Formula.check(node, false, lookup);
            if (Formula.columns(node).contains(self.id())) {
                throw new FormulaProblem(self.name() + " can't use itself in its own formula.");
            }
            List<Calc.Col> cols = new ArrayList<>();
            for (ColumnRow column : all) {
                Node of = column.id().equals(self.id()) ? node : null;
                if (of == null && column.kind() == ColumnKind.FORMULA) {
                    try {
                        of = Formula.read(column.formula(), lookup);
                    } catch (FormulaProblem broken) {
                        of = null;
                    }
                }
                cols.add(new Calc.Col(
                        column.id(),
                        column.name(),
                        column.id().equals(self.id()) ? ColumnKind.FORMULA : column.kind(),
                        of,
                        null));
            }
            List<String> loop = Calc.loop(cols);
            if (!loop.isEmpty()) {
                List<String> steps = new ArrayList<>();
                for (int i = 0; i + 1 < loop.size(); i++) {
                    steps.add(loop.get(i) + " uses " + loop.get(i + 1));
                }
                throw new FormulaProblem("That would go round in a circle: " + MoneyPeople.names(steps)
                        + ". One of them has to stand on its own.");
            }
            return Formula.keep(node);
        } catch (FormulaProblem problem) {
            throw ApiProblem.badRequest("bad_formula", problem.getMessage());
        }
    }

    @Transactional
    public ColumnResponse addColumn(UUID tabId, UUID me, NewColumn input, UUID clientId, LocalDate day) {
        ThingRow row = editing(homeOfTab(tabId), me, "tab");
        TabRow tab = sheets.tab(tabId).orElseThrow(SheetService::tabGone);
        List<ColumnRow> columns = sheets.columns(List.of(tabId));
        if (columns.size() >= MAX_COLUMNS) {
            throw ApiProblem.conflict("tab_full", "A tab holds 40 columns at most.");
        }
        // A second send of the same clientId finds the column made the first time and changes nothing.
        UUID id = sheets.madeBefore("sheet_columns", tabId, clientId).orElse(null);
        if (id == null) {
            ColumnKind kind = input.kind() == null ? ColumnKind.TEXT : input.kind();
            String name = columnName(input.name(), columns);
            List<String> options = options(kind, input.options());
            Summary summary = summary(kind, input.summary());
            id = sheets.addColumn(tabId, name, kind, options, "", summary, clientId);
            if (kind == ColumnKind.FORMULA) {
                ColumnRow self = new ColumnRow(id, tabId, name, kind, options, "", summary, 0);
                sheets.changeColumn(id, name, kind, options, columnFormula(input.formula(), self, columns), summary);
            }
            edited(row, me);
        }
        UUID made = id;
        Worked worked = work(tab, people.of(row.circleId()), today(day));
        return worked.columnViews().stream()
                .filter(c -> c.id().equals(made))
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    public ColumnResponse changeColumn(UUID columnId, UUID me, ColumnChange change, LocalDate day) {
        ThingRow row = editing(sheets.homeOfColumn(columnId), me, "column");
        ColumnRow column = sheets.column(columnId).orElseThrow(() -> gone("column"));
        TabRow tab = sheets.tab(column.tabId()).orElseThrow(SheetService::tabGone);
        List<ColumnRow> columns = sheets.columns(List.of(tab.id()));
        List<ColumnRow> others =
                columns.stream().filter(c -> !c.id().equals(columnId)).toList();
        ColumnKind kind = change.kind() == null ? column.kind() : change.kind();
        if (kind != column.kind()) {
            boolean wordsBothWays = (kind == ColumnKind.TEXT && column.kind() == ColumnKind.CHOICE)
                    || (kind == ColumnKind.CHOICE && column.kind() == ColumnKind.TEXT);
            if (!wordsBothWays && sheets.columnHolds(columnId, tab.id())) {
                throw ApiProblem.conflict(
                        "column_holds_values",
                        "%s already holds values that wouldn't fit. Add a new column of that kind instead."
                                .formatted(column.name()));
            }
        }
        String name = change.name() == null ? column.name() : columnName(change.name(), others);
        List<String> options = options(kind, change.options() == null ? column.options() : change.options());
        Summary summary =
                summary(kind, change.summary() == null ? keptSummary(kind, column.summary()) : change.summary());
        String formula = "";
        if (kind == ColumnKind.FORMULA) {
            ColumnRow self = new ColumnRow(columnId, tab.id(), name, kind, options, "", summary, column.position());
            formula = change.formula() != null || column.kind() != ColumnKind.FORMULA
                    ? columnFormula(change.formula(), self, columns)
                    : column.formula();
        }
        sheets.changeColumn(columnId, name, kind, options, formula, summary);
        if (before(change.before(), change.toEnd())) {
            if (change.before() != null && others.stream().noneMatch(c -> c.id().equals(change.before()))) {
                throw ApiProblem.badRequest("not_in_tab", "That column isn't in this tab.");
            }
            sheets.moveColumn(columnId, tab.id(), change.before());
        }
        edited(row, me);
        Worked worked = work(tab, people.of(row.circleId()), today(day));
        return worked.columnViews().stream()
                .filter(c -> c.id().equals(columnId))
                .findFirst()
                .orElseThrow();
    }

    /** A total that no longer fits a column's new kind is dropped rather than refused. */
    private static Summary keptSummary(ColumnKind kind, Summary summary) {
        try {
            return summary(kind, summary);
        } catch (ApiProblem noLongerFits) {
            return Summary.NONE;
        }
    }

    private static boolean before(UUID before, Boolean toEnd) {
        return before != null || Boolean.TRUE.equals(toEnd);
    }

    @Transactional
    public void removeColumn(UUID columnId, UUID me) {
        Optional<Home> home = sheets.homeOfColumn(columnId);
        if (home.isEmpty()) {
            return; // removing what is gone is fine
        }
        ThingRow row = editing(home, me, "column");
        UUID tabId = home.get().tabId();
        List<ColumnRow> columns = sheets.columns(List.of(tabId));
        ColumnRow column = columns.stream()
                .filter(c -> c.id().equals(columnId))
                .findFirst()
                .orElseThrow();
        Lookup lookup = new Lookup(columns);
        List<String> users = new ArrayList<>();
        for (ColumnRow other : columns) {
            if (other.kind() == ColumnKind.FORMULA
                    && !other.id().equals(columnId)
                    && uses(other.formula(), columnId, lookup)) {
                users.add(other.name());
            }
        }
        for (TileRow tile : sheets.tiles(List.of(tabId))) {
            if (uses(tile.formula(), columnId, lookup)) {
                users.add("the tile " + tile.name());
            }
        }
        if (!users.isEmpty()) {
            throw ApiProblem.conflict(
                    "column_in_use",
                    "%s %s %s. Change %s first."
                            .formatted(
                                    capital(MoneyPeople.names(users)),
                                    users.size() == 1 ? "uses" : "use",
                                    column.name(),
                                    users.size() == 1 ? "it" : "them"));
        }
        sheets.removeColumn(columnId, tabId);
        edited(row, me);
    }

    private static String capital(String text) {
        return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    private static boolean uses(String formula, UUID columnId, Lookup lookup) {
        try {
            return Formula.columns(Formula.read(formula, lookup)).contains(columnId);
        } catch (FormulaProblem unreadable) {
            return false;
        }
    }

    // ---------- rows ----------

    private RowChangedResponse changed(TabRow tab, ThingRow row, UUID rowId, LocalDate day) {
        Worked worked = work(tab, people.of(row.circleId()), today(day));
        RowResponse view = null;
        for (int i = 0; i < worked.rows().size(); i++) {
            if (worked.rows().get(i).id().equals(rowId)) {
                view = worked.rowView(i, sheets.paperCounts(List.of(rowId)).getOrDefault(rowId, 0));
            }
        }
        Map<UUID, TotalResponse> totals = new LinkedHashMap<>();
        for (ColumnResponse column : worked.columnViews()) {
            if (column.total() != null) {
                totals.put(column.id(), column.total());
            }
        }
        return new RowChangedResponse(view, worked.rows().size(), worked.tileViews(), totals);
    }

    @Transactional
    public RowChangedResponse addRow(
            UUID tabId, UUID me, Map<UUID, Object> cells, String note, UUID before, UUID clientId, LocalDate day) {
        ThingRow row = editing(homeOfTab(tabId), me, "tab");
        TabRow tab = sheets.tab(tabId).orElseThrow(SheetService::tabGone);
        int count = sheets.countRows(tabId);
        if (count >= MAX_ROWS) {
            throw ApiProblem.conflict("tab_full", "A tab holds 2,000 rows at most. Start another tab for the rest.");
        }
        Map<UUID, Person> circle = people.of(row.circleId());
        Map<String, Object> kept = Cells.kept(cells, sheets.columns(List.of(tabId)), circle);
        kept.values().removeIf(Objects::isNull);
        UUID mine = circles.me(row.circleId(), me).id();
        UUID id = sheets.addRow(tabId, kept, note == null ? "" : note.strip(), mine, clientId);
        if (before != null && sheets.countRows(tabId) > count) {
            if (sheets.homeOfRow(before)
                    .filter(home -> home.tabId().equals(tabId))
                    .isEmpty()) {
                throw ApiProblem.badRequest("not_in_tab", "That row isn't in this tab.");
            }
            sheets.moveRow(id, tabId, before);
        }
        sheets.edited(row.id(), mine);
        return changed(tab, row, id, day);
    }

    @Transactional
    public RowChangedResponse changeRow(UUID rowId, UUID me, RowChange change, LocalDate day) {
        Optional<Home> home = sheets.homeOfRow(rowId);
        ThingRow row = editing(home, me, "row");
        TabRow tab = sheets.tab(home.orElseThrow().tabId()).orElseThrow(SheetService::tabGone);
        if (change.cells() != null && !change.cells().isEmpty()) {
            Map<String, Object> kept =
                    Cells.kept(change.cells(), sheets.columns(List.of(tab.id())), people.of(row.circleId()));
            Map<String, Object> set = new LinkedHashMap<>();
            List<String> emptied = new ArrayList<>();
            kept.forEach((column, value) -> {
                if (value == null) {
                    emptied.add(column);
                } else {
                    set.put(column, value);
                }
            });
            sheets.setCells(rowId, set, emptied);
        }
        if (change.note() != null) {
            sheets.setNote(rowId, change.note().strip());
        }
        if (before(change.before(), change.toEnd())) {
            if (change.before() != null
                    && sheets.homeOfRow(change.before())
                            .filter(other -> other.tabId().equals(tab.id()))
                            .isEmpty()) {
                throw ApiProblem.badRequest("not_in_tab", "That row isn't in this tab.");
            }
            sheets.moveRow(rowId, tab.id(), change.before());
        }
        edited(row, me);
        return changed(tab, row, rowId, day);
    }

    @Transactional
    public void removeRow(UUID rowId, UUID me) {
        Optional<Home> home = sheets.homeOfRow(rowId);
        if (home.isEmpty()) {
            return; // removing what is gone is fine: two people may remove the same row
        }
        ThingRow row = editing(home, me, "row");
        sheets.removeRow(rowId);
        edited(row, me);
    }

    public RowCardResponse row(UUID rowId, UUID me, LocalDate day) {
        Optional<Home> home = sheets.homeOfRow(rowId);
        ThingRow row = seeing(home, me, "row");
        TabRow tab = sheets.tab(home.orElseThrow().tabId()).orElseThrow(SheetService::tabGone);
        SheetRow sheet = sheets.find(row.id()).orElseThrow(ThingService::notFound);
        Worked worked = work(tab, people.of(row.circleId()), today(day));
        int at = -1;
        for (int i = 0; i < worked.rows().size(); i++) {
            if (worked.rows().get(i).id().equals(rowId)) {
                at = i;
            }
        }
        if (at < 0) {
            throw gone("row");
        }
        List<UUID> paperIds =
                sheets.papers(rowId).stream().map(SheetStore.Paper::mediaId).toList();
        Map<UUID, MediaRow> files =
                mediaStore.findAll(paperIds).stream().collect(Collectors.toMap(MediaRow::id, m -> m));
        return new RowCardResponse(
                row.id(),
                row.title(),
                sheet.currency(),
                tab.id(),
                tab.name(),
                worked.columnViews(),
                worked.rowView(at, paperIds.size()),
                paperIds.stream()
                        .map(files::get)
                        .filter(Objects::nonNull)
                        .filter(MediaRow::ready)
                        .map(media::view)
                        .toList(),
                worked.rows().size(),
                at == 0 ? null : link(worked, at - 1),
                at == worked.rows().size() - 1 ? null : link(worked, at + 1),
                row.canEdit());
    }

    /** What to call a row on the buttons that lead to it: what its first text column holds, or "Row 4". */
    private static RowLinkResponse link(Worked worked, int index) {
        RowRow row = worked.rows().get(index);
        for (ColumnRow column : worked.columns()) {
            if (column.kind() == ColumnKind.TEXT && worked.calc().cell(index, column.id()) instanceof Value.Text text) {
                return new RowLinkResponse(row.id(), text.text());
            }
        }
        return new RowLinkResponse(row.id(), "Row " + (index + 1));
    }

    // ---------- receipts and papers ----------

    @Transactional
    public RowCardResponse addPaper(UUID rowId, UUID me, UUID mediaId, UUID clientId, LocalDate day) {
        ThingRow row = editing(sheets.homeOfRow(rowId), me, "row");
        MediaRow file = media.requireOwn(mediaId, me, null);
        if (file.kind() != MediaKind.PHOTO && file.kind() != MediaKind.FILE) {
            throw ApiProblem.badRequest("unsupported_media", "A receipt is a photo or a document.");
        }
        if (sheets.papers(rowId).size() >= MAX_PAPERS) {
            throw ApiProblem.conflict("row_full", "A row keeps 20 papers at most.");
        }
        sheets.addPaper(rowId, mediaId, circles.me(row.circleId(), me).id(), clientId);
        edited(row, me);
        return row(rowId, me, day);
    }

    @Transactional
    public void removePaper(UUID rowId, UUID me, UUID mediaId) {
        Optional<Home> home = sheets.homeOfRow(rowId);
        if (home.isEmpty()) {
            return; // removing what is gone is fine
        }
        ThingRow row = editing(home, me, "row");
        sheets.removePaper(rowId, mediaId);
        edited(row, me);
    }

    // ---------- tiles ----------

    private static String tileFormula(String formula, Lookup lookup) {
        try {
            Node node = Formula.read(formula, lookup);
            Formula.check(node, true, lookup);
            return Formula.keep(node);
        } catch (FormulaProblem problem) {
            throw ApiProblem.badRequest("bad_formula", problem.getMessage());
        }
    }

    private static String tileName(String name, List<TileRow> others) {
        String clean = name.strip().replaceAll("\\s+", " ");
        if (others.stream().anyMatch(other -> other.name().equalsIgnoreCase(clean))) {
            throw ApiProblem.conflict("name_taken", "There is already a tile called " + clean + ".");
        }
        return clean;
    }

    private static UUID ofTile(UUID asked, UUID self, List<TileRow> tiles) {
        if (asked == null) {
            return null;
        }
        if (asked.equals(self) || tiles.stream().noneMatch(tile -> tile.id().equals(asked))) {
            throw ApiProblem.badRequest("not_in_tab", "Choose another tile of this tab to show it against.");
        }
        return asked;
    }

    private TileResponse tileView(TabRow tab, ThingRow row, UUID tileId, LocalDate day) {
        return work(tab, people.of(row.circleId()), today(day)).tileViews().stream()
                .filter(tile -> tile.id().equals(tileId))
                .findFirst()
                .orElseThrow(() -> gone("tile"));
    }

    @Transactional
    public TileResponse addTile(
            UUID tabId, UUID me, String name, String formula, UUID ofTileId, UUID clientId, LocalDate day) {
        ThingRow row = editing(homeOfTab(tabId), me, "tab");
        TabRow tab = sheets.tab(tabId).orElseThrow(SheetService::tabGone);
        List<TileRow> tiles = sheets.tiles(List.of(tabId));
        if (tiles.size() >= MAX_TILES) {
            throw ApiProblem.conflict("tab_full", "A tab holds 12 tiles at most.");
        }
        // A second send of the same clientId finds the tile made the first time and changes nothing.
        UUID id = sheets.madeBefore("sheet_tiles", tabId, clientId).orElse(null);
        if (id == null) {
            Lookup lookup = new Lookup(sheets.columns(List.of(tabId)));
            id = sheets.addTile(
                    tabId,
                    tileName(name, tiles),
                    tileFormula(formula, lookup),
                    ofTile(ofTileId, null, tiles),
                    clientId);
            edited(row, me);
        }
        return tileView(tab, row, id, day);
    }

    @Transactional
    public TileResponse changeTile(UUID tileId, UUID me, TileChange change, LocalDate day) {
        Optional<Home> home = sheets.homeOfTile(tileId);
        ThingRow row = editing(home, me, "tile");
        TabRow tab = sheets.tab(home.orElseThrow().tabId()).orElseThrow(SheetService::tabGone);
        List<TileRow> tiles = sheets.tiles(List.of(tab.id()));
        TileRow tile =
                tiles.stream().filter(t -> t.id().equals(tileId)).findFirst().orElseThrow(() -> gone("tile"));
        List<TileRow> others =
                tiles.stream().filter(t -> !t.id().equals(tileId)).toList();
        Lookup lookup = new Lookup(sheets.columns(List.of(tab.id())));
        sheets.changeTile(
                tileId,
                change.name() == null ? tile.name() : tileName(change.name(), others),
                change.formula() == null ? tile.formula() : tileFormula(change.formula(), lookup),
                Boolean.TRUE.equals(change.removeOf())
                        ? null
                        : change.ofTileId() == null ? tile.ofTile() : ofTile(change.ofTileId(), tileId, tiles));
        if (before(change.before(), change.toEnd())) {
            if (change.before() != null && others.stream().noneMatch(t -> t.id().equals(change.before()))) {
                throw ApiProblem.badRequest("not_in_tab", "That tile isn't in this tab.");
            }
            sheets.moveTile(tileId, tab.id(), change.before());
        }
        edited(row, me);
        return tileView(tab, row, tileId, day);
    }

    @Transactional
    public void removeTile(UUID tileId, UUID me) {
        Optional<Home> home = sheets.homeOfTile(tileId);
        if (home.isEmpty()) {
            return; // removing what is gone is fine
        }
        ThingRow row = editing(home, me, "tile");
        sheets.removeTile(tileId);
        edited(row, me);
    }

    // ---------- a formula you can read ----------

    private static final List<FunctionResponse> FUNCTIONS = List.of(
            help(Fn.SUM, "Adds a column up", "SUM([Cost])"),
            help(Fn.SUMIF, "Adds up the rows that fit", "SUMIF([Paid], [Cost])"),
            help(Fn.AVG, "The average of a column", "AVERAGE([Cost])"),
            help(Fn.COUNT, "How many rows have something", "COUNT([Item])"),
            help(Fn.IF, "One thing or another, by a question", "IF([Paid], 0, [Cost])"),
            help(Fn.PAYMENT, "The monthly payment on a loan", "PAYMENT(€240000, 3.4, 25)"),
            help(Fn.COUNTIF, "How many rows fit", "COUNTIF([Paid])"),
            help(Fn.AVGIF, "The average of the rows that fit", "AVGIF([Paid], [Cost])"),
            help(Fn.MIN, "The smallest", "MIN([Cost])"),
            help(Fn.MAX, "The largest", "MAX([Cost])"),
            help(Fn.ROUND, "Rounds a number", "ROUND([Cost] / 3, 2)"),
            help(Fn.ABS, "A number without its sign", "ABS([Left])"),
            help(Fn.AND, "Both are so", "AND([Paid], [Cost] > 100)"),
            help(Fn.OR, "One of them is so", "OR([Paid], [Cost] < 10)"),
            help(Fn.NOT, "It isn't so", "NOT [Paid]"),
            help(Fn.DAYS, "The days between two dates", "DAYS([Due], TODAY())"),
            help(Fn.TODAY, "Today's date", "TODAY()"),
            help(Fn.JOIN, "Puts words together", "JOIN([Item], \" for \", [Who])"),
            help(Fn.ISEMPTY, "Whether a cell is empty", "ISEMPTY([Due])"));

    private static FunctionResponse help(Fn fn, String says, String example) {
        return new FunctionResponse(fn.name(), fn.label(), says, example);
    }

    private FormulaResponse reading(
            Worked worked,
            boolean understood,
            Node node,
            CellResponse answer,
            Calc.Total total,
            String problem,
            List<String> examples) {
        return new FormulaResponse(
                understood,
                node == null ? null : Formula.write(node, worked.lookup()),
                node == null || Formula.oneAnswer(node),
                node == null ? List.of() : FormulaWords.parts(node, worked.lookup()),
                node == null ? null : FormulaWords.sentence(node, worked.lookup()),
                answer,
                total == null ? 0 : total.leftOut(),
                total == null ? null : Worked.leftOutSays(total),
                problem,
                examples,
                worked.columns().stream()
                        .map(c -> new ColumnBriefResponse(c.id(), c.name(), c.kind()))
                        .toList(),
                FUNCTIONS);
    }

    /**
     * Reads a formula without keeping it: as chips, as a sentence, with its answer. A formula that gives one
     * number is answered as a tile would be; one that reads its own row is tried as a column, and answered
     * with the first row that has an answer.
     *
     * @param columnId the formula column being changed, when it is one, so it isn't tested against itself
     */
    public FormulaResponse read(UUID tabId, UUID me, String formula, UUID columnId, LocalDate day) {
        ThingRow row = seeing(homeOfTab(tabId), me, "tab");
        TabRow tab = sheets.tab(tabId).orElseThrow(SheetService::tabGone);
        Map<UUID, Person> circle = people.of(row.circleId());
        Worked worked = work(tab, circle, today(day));
        return read(worked, formula, columnId, circle, today(day));
    }

    private FormulaResponse read(
            Worked worked, String formula, UUID columnId, Map<UUID, Person> circle, LocalDate today) {
        Node node;
        try {
            node = Formula.read(formula, worked.lookup());
        } catch (FormulaProblem problem) {
            return reading(worked, false, null, null, null, problem.getMessage(), List.of());
        }
        if (Formula.oneAnswer(node)) {
            try {
                Formula.check(node, true, worked.lookup());
            } catch (FormulaProblem problem) {
                return reading(worked, false, node, null, null, problem.getMessage(), List.of());
            }
            Calc.Total total = worked.calc().total(node);
            return reading(worked, true, node, Cells.view(total.value(), circle), total, null, List.of());
        }
        // A formula for each row: try it as a column of this tab, in place of the one being changed if there is one.
        UUID id = columnId == null ? UUID.randomUUID() : columnId;
        ColumnRow self = worked.columns().stream()
                .filter(c -> c.id().equals(id))
                .findFirst()
                .map(c -> new ColumnRow(
                        c.id(), c.tabId(), c.name(), ColumnKind.FORMULA, List.of(), "", Summary.NONE, c.position()))
                .orElse(new ColumnRow(
                        id, worked.tab().id(), "This formula", ColumnKind.FORMULA, List.of(), "", Summary.NONE, 0));
        String kept;
        try {
            kept = columnFormula(formula, self, worked.columns());
        } catch (ApiProblem problem) {
            return reading(worked, false, node, null, null, problem.getMessage(), List.of());
        }
        List<ColumnRow> tried = new ArrayList<>(
                worked.columns().stream().filter(c -> !c.id().equals(id)).toList());
        tried.add(new ColumnRow(
                id, self.tabId(), self.name(), ColumnKind.FORMULA, List.of(), kept, Summary.NONE, self.position()));
        Worked with = Worked.of(worked.tab(), tried, worked.rows(), List.of(), circle, today);
        CellResponse answer = null;
        for (int i = 0; i < with.rows().size() && answer == null; i++) {
            CellResponse cell = Cells.view(with.calc().cell(i, id), circle);
            if (cell.kind() != CellKind.EMPTY) {
                answer = cell;
            }
        }
        return reading(worked, true, node, answer == null ? CellResponse.EMPTY : answer, null, null, List.of());
    }

    /**
     * "Ask in words": answers one of a set of known questions with a formula, by rule. Anything else gets no
     * formula, a sentence saying so, and a few questions this tab can answer.
     */
    public FormulaResponse ask(UUID tabId, UUID me, String question, LocalDate day) {
        ThingRow row = seeing(homeOfTab(tabId), me, "tab");
        TabRow tab = sheets.tab(tabId).orElseThrow(SheetService::tabGone);
        Map<UUID, Person> circle = people.of(row.circleId());
        Worked worked = work(tab, circle, today(day));
        List<Ask.Col> columns = worked.columns().stream()
                .map(c -> new Ask.Col(c.name(), c.kind(), c.options()))
                .toList();
        List<String> names = circle.values().stream().map(Person::name).toList();
        String asker = circle.values().stream()
                .filter(person -> me.equals(person.userId()))
                .map(Person::name)
                .findFirst()
                .orElse(null);
        Optional<String> formula = Ask.formula(question == null ? "" : question, columns, names, asker);
        if (formula.isPresent()) {
            FormulaResponse reading = read(worked, formula.get(), null, circle, today(day));
            if (reading.understood()) {
                return reading;
            }
        }
        return reading(
                worked,
                false,
                null,
                null,
                null,
                "I didn't understand that; here is how to write it: put column names in square brackets and use the"
                        + " functions below, like SUM([" + exampleColumn(worked) + "]). Or ask one of these.",
                Ask.examples(columns, names.stream().limit(1).toList()));
    }

    private static String exampleColumn(Worked worked) {
        return worked.columns().stream()
                .filter(c -> c.kind() == ColumnKind.MONEY || c.kind() == ColumnKind.NUMBER)
                .map(ColumnRow::name)
                .findFirst()
                .orElse("Cost");
    }
}
