package app.homeport.api.money.sheet;

import app.homeport.api.money.MoneyPeople.Person;
import app.homeport.api.money.sheet.Cells.CellResponse;
import app.homeport.api.money.sheet.FormulaWords.PartResponse;
import app.homeport.api.money.sheet.SheetStore.ColumnRow;
import app.homeport.api.money.sheet.SheetStore.RowRow;
import app.homeport.api.money.sheet.SheetStore.TabRow;
import app.homeport.api.money.sheet.SheetStore.TileRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * One tab of a sheet with everything worked out: its columns and rows as they are kept, the formulas read,
 * and the sums done. From it come the columns, tiles and rows as the app is sent them. Nothing here touches
 * the database: {@link SheetService} reads what is kept and hands it over.
 *
 * @param formulas the formula of each formula column that could be read, by column id
 * @param problems why the formula of a formula column couldn't be read, by column id
 * @param circle everyone of the sheet's circle, for the people in person cells
 */
public record Worked(
        TabRow tab,
        List<ColumnRow> columns,
        List<RowRow> rows,
        List<TileRow> tiles,
        Lookup lookup,
        Map<UUID, Node> formulas,
        Map<UUID, String> problems,
        Calc calc,
        Map<UUID, Person> circle) {

    /** What stands under a column in the row of totals. */
    public record TotalResponse(
            CellResponse cell,

            @Schema(nullable = true, description = "For a count of ticks: out of how many rows. 2 of 6.")
            Integer of,

            @Schema(description = "The same as chips: SUM, Cost")
            List<PartResponse> parts,

            @Schema(description = "What it does, as a sentence: Adds up every row in Cost.")
            String says,

            @Schema(description = "How many rows were left out because they couldn't be worked out")
            int leftOut,

            @Schema(nullable = true, description = "Said when rows were left out: 1 row left out: Price is empty")
            String leftOutSays) {}

    public record ColumnResponse(
            UUID id,
            String name,
            ColumnKind kind,

            @Schema(description = "For a choice: what can be chosen")
            List<String> options,

            @Schema(nullable = true, description = "For a formula column: the formula, written with column names")
            String formula,

            @Schema(description = "For a formula column: the formula as chips to draw")
            List<PartResponse> parts,

            @Schema(nullable = true, description = "For a formula column: the formula as a sentence")
            String says,

            @Schema(nullable = true, description = "For a formula column whose formula can't be used: why")
            String problem,

            Summary summary,
            @Schema(nullable = true) TotalResponse total) {}

    /** A tile on top of a tab: a named total. */
    public record TileResponse(
            UUID id,
            String name,
            String formula,
            List<PartResponse> parts,
            String says,
            CellResponse cell,
            int leftOut,
            @Schema(nullable = true) String leftOutSays,

            @Schema(nullable = true, description = "The tile it is shown against: Paid, of Planned")
            UUID ofTileId,

            @Schema(nullable = true) String ofName,
            @Schema(nullable = true) CellResponse ofCell) {}

    public record RowResponse(
            UUID id,

            @Schema(description = "Its place in the tab, counting from 1")
            int number,

            @Schema(description = "What each column holds in this row, by column id. Formula columns are worked out.")
            Map<UUID, CellResponse> cells,

            String note,

            @Schema(description = "How many receipts and papers are kept with it")
            int papers) {}

    /** The columns of a tab by name and id, for reading and writing formulas. */
    record Lookup(List<ColumnRow> columns) implements Formula.Columns {

        @Override
        public Optional<UUID> id(String name) {
            return columns.stream()
                    .filter(c -> c.name().equalsIgnoreCase(name.strip()))
                    .map(ColumnRow::id)
                    .findFirst();
        }

        @Override
        public Optional<String> name(UUID id) {
            return columns.stream()
                    .filter(c -> c.id().equals(id))
                    .map(ColumnRow::name)
                    .findFirst();
        }

        @Override
        public Optional<ColumnKind> kind(UUID id) {
            return columns.stream()
                    .filter(c -> c.id().equals(id))
                    .map(ColumnRow::kind)
                    .findFirst();
        }

        @Override
        public List<String> names() {
            return columns.stream().map(ColumnRow::name).toList();
        }
    }

    /** Works a tab out: reads every formula, turns what is kept into values, and lets {@link Calc} do the sums. */
    static Worked of(
            TabRow tab,
            List<ColumnRow> columns,
            List<RowRow> rows,
            List<TileRow> tiles,
            Map<UUID, Person> circle,
            LocalDate today) {
        Lookup lookup = new Lookup(columns);
        Map<UUID, Node> formulas = new HashMap<>();
        Map<UUID, String> problems = new HashMap<>();
        List<Calc.Col> cols = new ArrayList<>();
        for (ColumnRow column : columns) {
            if (column.kind() == ColumnKind.FORMULA) {
                try {
                    formulas.put(column.id(), Formula.read(column.formula(), lookup));
                } catch (FormulaProblem problem) {
                    problems.put(column.id(), problem.getMessage());
                }
            }
            cols.add(new Calc.Col(
                    column.id(), column.name(), column.kind(), formulas.get(column.id()), problems.get(column.id())));
        }
        List<Map<UUID, Value>> values = new ArrayList<>();
        for (RowRow row : rows) {
            Map<UUID, Value> cells = new HashMap<>();
            for (ColumnRow column : columns) {
                Value value = Cells.stored(column, row.cells().get(column.id().toString()), circle);
                if (value != null) {
                    cells.put(column.id(), value);
                }
            }
            values.add(cells);
        }
        return new Worked(tab, columns, rows, tiles, lookup, formulas, problems, new Calc(cols, values, today), circle);
    }

    /** "1 row left out: Price is empty", or null when none was. */
    static String leftOutSays(Calc.Total total) {
        if (total.leftOut() == 0) {
            return null;
        }
        return (total.leftOut() == 1 ? "1 row left out: " : total.leftOut() + " rows left out: ") + total.why();
    }

    private TotalResponse totalOf(ColumnRow column) {
        Node node = FormulaWords.summary(column.summary(), column.id());
        if (node == null) {
            return null;
        }
        Calc.Total total = calc.total(node);
        return new TotalResponse(
                Cells.view(total.value(), circle),
                column.summary() == Summary.TICKED ? rows.size() : null,
                FormulaWords.parts(node, lookup),
                FormulaWords.summarySays(column.summary(), column.name()),
                total.leftOut(),
                leftOutSays(total));
    }

    /** The tab's columns, each with its formula in words and what stands under it. */
    List<ColumnResponse> columnViews() {
        return columns.stream()
                .map(column -> {
                    Node formula = formulas.get(column.id());
                    return new ColumnResponse(
                            column.id(),
                            column.name(),
                            column.kind(),
                            column.options(),
                            formula == null
                                    ? column.kind() == ColumnKind.FORMULA ? "" : null
                                    : Formula.write(formula, lookup),
                            formula == null ? List.of() : FormulaWords.parts(formula, lookup),
                            formula == null ? null : FormulaWords.sentence(formula, lookup),
                            problems.get(column.id()),
                            column.summary(),
                            totalOf(column));
                })
                .toList();
    }

    /** The tab's tiles, each worked out, and with the tile it is shown against. */
    List<TileResponse> tileViews() {
        Map<UUID, TileResponse> made = new LinkedHashMap<>();
        for (TileRow tile : tiles) {
            try {
                Node node = Formula.read(tile.formula(), lookup);
                Calc.Total total = calc.total(node);
                made.put(
                        tile.id(),
                        new TileResponse(
                                tile.id(),
                                tile.name(),
                                Formula.write(node, lookup),
                                FormulaWords.parts(node, lookup),
                                FormulaWords.sentence(node, lookup),
                                Cells.view(total.value(), circle),
                                total.leftOut(),
                                leftOutSays(total),
                                tile.ofTile(),
                                null,
                                null));
            } catch (FormulaProblem unreadable) {
                made.put(
                        tile.id(),
                        new TileResponse(
                                tile.id(),
                                tile.name(),
                                "",
                                List.of(),
                                "",
                                Cells.problem(unreadable.getMessage()),
                                0,
                                null,
                                tile.ofTile(),
                                null,
                                null));
            }
        }
        return made.values().stream()
                .map(tile -> {
                    TileResponse of = tile.ofTileId() == null ? null : made.get(tile.ofTileId());
                    return of == null
                            ? tile
                            : new TileResponse(
                                    tile.id(),
                                    tile.name(),
                                    tile.formula(),
                                    tile.parts(),
                                    tile.says(),
                                    tile.cell(),
                                    tile.leftOut(),
                                    tile.leftOutSays(),
                                    of.id(),
                                    of.name(),
                                    of.cell());
                })
                .toList();
    }

    /** One row, with every column's cell worked out. */
    RowResponse rowView(int index, int papers) {
        RowRow row = rows.get(index);
        Map<UUID, CellResponse> cells = new LinkedHashMap<>();
        for (ColumnRow column : columns) {
            cells.put(column.id(), Cells.view(calc.cell(index, column.id()), circle));
        }
        return new RowResponse(row.id(), index + 1, cells, row.note(), papers);
    }
}
