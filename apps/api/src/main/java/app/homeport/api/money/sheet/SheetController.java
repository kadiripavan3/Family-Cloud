package app.homeport.api.money.sheet;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.money.sheet.SheetService.ColumnChange;
import app.homeport.api.money.sheet.SheetService.FormulaResponse;
import app.homeport.api.money.sheet.SheetService.LoanInput;
import app.homeport.api.money.sheet.SheetService.NamedTotalResponse;
import app.homeport.api.money.sheet.SheetService.NewColumn;
import app.homeport.api.money.sheet.SheetService.RowCardResponse;
import app.homeport.api.money.sheet.SheetService.RowChange;
import app.homeport.api.money.sheet.SheetService.RowChangedResponse;
import app.homeport.api.money.sheet.SheetService.SheetBriefResponse;
import app.homeport.api.money.sheet.SheetService.SheetResponse;
import app.homeport.api.money.sheet.SheetService.TemplateResponse;
import app.homeport.api.money.sheet.SheetService.TileChange;
import app.homeport.api.money.sheet.Worked.ColumnResponse;
import app.homeport.api.money.sheet.Worked.RowResponse;
import app.homeport.api.money.sheet.Worked.TileResponse;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "sheets", description = "Sheets: typed columns, rows that open as cards, formulas you can read")
class SheetController {

    private static final String DAY =
            "The day on the person's phone, for TODAY() in a formula. The API's own day when left out.";

    private final SheetService sheets;
    private final CircleService circles;

    SheetController(SheetService sheets, CircleService circles) {
        this.sheets = sheets;
        this.circles = circles;
    }

    record LoanRequest(
            @NotNull(message = "Say how much is borrowed.")
            @Min(value = 1, message = "Say how much is borrowed.")
            @Max(value = 100000000000L, message = "That amount is too large.")
            Long principalCents,

            @NotNull(message = "Say what the interest is.")
            @DecimalMin(value = "0", message = "Interest can't be below zero.")
            @DecimalMax(value = "100", message = "Interest above 100% a year isn't a loan to plan.")
            BigDecimal ratePercent,

            @NotNull(message = "Say over how many years.")
            @Min(value = 1, message = "A loan runs for at least a year here.")
            @Max(value = 50, message = "A loan runs for 50 years at most.")
            Integer years,

            @Min(0) @Max(100000000000L) Long extraCents) {}

    record NewSheetRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @Schema(description = "Left out with a template: the template's own name")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Schema(description = "Three letters. Left out: EUR.") @Size(max = 3)
            String currency,

            @Schema(
                    description =
                            "Start from a template, with its columns, formulas and sample rows. Left out: a blank sheet.")
            SheetTemplate template,

            @Schema(description = "Keep a loan plan as a sheet: a row for each year, with these numbers") @Valid
            LoanRequest loan,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(description = "The day on the person's phone, for the dates in a template's sample rows")
            LocalDate day) {}

    record SheetChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 3) String currency) {}

    record NewTabRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Give the tab a name.")
            @Size(max = 40, message = "Keep the name to 40 characters or fewer.")
            String name,

            @Schema(
                    description =
                            "Give it the columns and tiles of this tab of the same sheet, without its rows: next month's budget")
            UUID copyColumnsOf) {}

    record TabChangeRequest(
            @Size(min = 1, max = 40, message = "Keep the name to 40 characters or fewer.")
            String name,

            @Schema(description = "Move it to just before this tab")
            UUID before,

            @Schema(description = "Move it to the end") Boolean toEnd) {}

    record NewColumnRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Give the column a name.")
            @Size(max = 40, message = "Keep the name to 40 characters or fewer.")
            String name,

            @Schema(description = "Left out: text") ColumnKind kind,

            @Schema(description = "For a choice: what can be chosen")
            @Size(max = 30, message = "A choice has 30 options at most.")
            List<@Size(max = 40) String> options,

            @Schema(description = "For a formula column: the formula, written with column names: [Price] * [Qty]")
            @Size(max = 1000, message = "Keep a formula to 1,000 characters or fewer.")
            String formula,

            @Schema(description = "What stands under it in the row of totals. Left out: nothing.")
            Summary summary) {}

    record ColumnChangeRequest(
            @Size(min = 1, max = 40, message = "Keep the name to 40 characters or fewer.")
            String name,

            @Schema(description = "A column that holds values keeps its kind, except between text and a choice")
            ColumnKind kind,

            @Size(max = 30, message = "A choice has 30 options at most.")
            List<@Size(max = 40) String> options,

            @Size(max = 1000, message = "Keep a formula to 1,000 characters or fewer.")
            String formula,

            Summary summary,

            @Schema(description = "Move it to just before this column")
            UUID before,

            @Schema(description = "Move it to the end") Boolean toEnd) {}

    record NewRowRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @Schema(
                    description =
                            "What to put in which column, by column id. Text and a choice: a string. A number: a number or a"
                                    + " string like \"12.5\". Money: whole cents. A date: \"2027-01-15\". A tick: true or false."
                                    + " A person: a member id, or a list of them.")
            @Size(max = 40)
            Map<UUID, Object> cells,

            @Size(max = 2000, message = "Keep the note to 2,000 characters or fewer.")
            String note,

            @Schema(description = "Put it just before this row. Left out: at the end.")
            UUID before) {}

    record RowChangeRequest(
            @Schema(
                    description =
                            "Only the cells that change, by column id; the others stay as they are. Null empties a cell.")
            @Size(max = 40)
            Map<UUID, Object> cells,

            @Size(max = 2000, message = "Keep the note to 2,000 characters or fewer.")
            String note,

            @Schema(description = "Move it to just before this row")
            UUID before,

            @Schema(description = "Move it to the end") Boolean toEnd) {}

    record NewPaperRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @Schema(description = "A photo or a document you uploaded")
            @NotNull(message = "Choose a photo or a document.")
            UUID mediaId) {}

    record NewTileRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Give the tile a name.")
            @Size(max = 40, message = "Keep the name to 40 characters or fewer.")
            String name,

            @Schema(description = "A formula that gives one number for the tab: SUM([Cost]) - SUMIF([Paid], [Cost])")
            @NotBlank(message = "Write a formula first, like SUM([Cost]).")
            @Size(max = 1000, message = "Keep a formula to 1,000 characters or fewer.")
            String formula,

            @Schema(description = "Show it against this other tile of the tab: Paid, of Planned")
            UUID ofTileId) {}

    record TileChangeRequest(
            @Size(min = 1, max = 40, message = "Keep the name to 40 characters or fewer.")
            String name,

            @Size(min = 1, max = 1000, message = "Keep a formula to 1,000 characters or fewer.")
            String formula,

            UUID ofTileId,

            @Schema(description = "True to show it on its own again")
            Boolean removeOf,

            @Schema(description = "Move it to just before this tile")
            UUID before,

            @Schema(description = "Move it to the end") Boolean toEnd) {}

    record FormulaRequest(
            @NotNull(message = "Write a formula first, like [Price] * [Qty].")
            @Size(max = 1000, message = "Keep a formula to 1,000 characters or fewer.")
            String formula,

            @Schema(description = "The formula column being changed, when it is one")
            UUID columnId,

            @Schema(description = "The day on the person's phone, for TODAY()")
            LocalDate day) {}

    record AskRequest(
            @NotBlank(message = "Ask something first, like \"How much is left to pay?\"")
            @Size(max = 300, message = "Keep the question to 300 characters or fewer.")
            String question,

            @Schema(description = "The day on the person's phone, for TODAY()")
            LocalDate day) {}

    // ---------- sheets ----------

    @GetMapping("/sheet-templates")
    @Operation(operationId = "getSheetTemplates", summary = "The templates a sheet can start from. Seven of them.")
    List<TemplateResponse> templates(@Me UUID me) {
        return sheets.templates();
    }

    @PostMapping("/sheets")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createSheet", summary = "Start a sheet: blank, from a template, or from a loan plan")
    SheetResponse create(@Me UUID me, @Valid @RequestBody NewSheetRequest request) {
        LoanRequest loan = request.loan();
        return sheets.create(
                me,
                request.circleId(),
                request.title(),
                request.currency(),
                request.template(),
                loan == null
                        ? null
                        : new LoanInput(
                                loan.principalCents(),
                                loan.ratePercent(),
                                loan.years(),
                                loan.extraCents() == null ? 0 : loan.extraCents()),
                request.audience(),
                request.clientId(),
                request.day());
    }

    @GetMapping("/sheets/{id}")
    @Operation(
            operationId = "getSheet",
            summary = "A sheet: its tabs, and one tab with its columns, tiles, totals and first rows, all worked out")
    SheetResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Which tab. Left out: the first.") @RequestParam(required = false) UUID tab,
            @Parameter(description = "How many rows to send with it. Left out: 100.") @RequestParam(required = false)
                    Integer limit,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.get(id, me, tab, limit, day);
    }

    @GetMapping("/sheets/{id}/totals")
    @Operation(
            operationId = "getSheetTotals",
            summary = "The numbers a sheet works out that something else can read by name: its tiles, then the"
                    + " totals under its columns, of every tab. A goal reads one of them: its source's ref is the"
                    + " sheet's id, a slash, and the name. A few dozen at most.")
    List<NamedTotalResponse> totals(@Me UUID me, @PathVariable UUID id) {
        return sheets.namedTotals(id, me);
    }

    @GetMapping("/sheets/{id}/rows")
    @Operation(operationId = "getSheetRows", summary = "The rows of a tab, in their order, a page at a time")
    Page<RowResponse> rows(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Which tab. Left out: the first.") @RequestParam(required = false) UUID tab,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.rows(id, me, tab, Keyset.of(cursor, limit, 100), day);
    }

    @PatchMapping("/sheets/{id}")
    @Operation(operationId = "changeSheet", summary = "Rename a sheet, or change the currency it counts in")
    SheetResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody SheetChangeRequest request) {
        return sheets.change(id, me, request.title(), request.currency(), null);
    }

    @GetMapping("/circles/{id}/sheets")
    @Operation(operationId = "getSheets", summary = "The sheets in a circle you can see, last changed first")
    Page<SheetBriefResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return sheets.list(id, me, Keyset.of(cursor, limit, 30));
    }

    // ---------- tabs ----------

    @PostMapping("/sheets/{id}/tabs")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addSheetTab", summary = "Add a tab to a sheet. A sheet holds 24.")
    SheetResponse addTab(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewTabRequest request) {
        return sheets.addTab(id, me, request.name(), request.copyColumnsOf(), request.clientId(), null);
    }

    @PatchMapping("/sheet-tabs/{tabId}")
    @Operation(operationId = "changeSheetTab", summary = "Rename a tab or move it")
    SheetResponse changeTab(@Me UUID me, @PathVariable UUID tabId, @Valid @RequestBody TabChangeRequest request) {
        return sheets.changeTab(tabId, me, request.name(), request.before(), request.toEnd(), null);
    }

    @DeleteMapping("/sheet-tabs/{tabId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeSheetTab",
            summary =
                    "Remove a tab with everything in it. A sheet keeps its last tab. Removing one that is gone is fine.")
    void removeTab(@Me UUID me, @PathVariable UUID tabId) {
        sheets.removeTab(tabId, me);
    }

    // ---------- columns ----------

    @PostMapping("/sheet-tabs/{tabId}/columns")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addSheetColumn", summary = "Add a column to the end of a tab. A tab holds 40.")
    ColumnResponse addColumn(
            @Me UUID me,
            @PathVariable UUID tabId,
            @Valid @RequestBody NewColumnRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.addColumn(
                tabId,
                me,
                new NewColumn(request.name(), request.kind(), request.options(), request.formula(), request.summary()),
                request.clientId(),
                day);
    }

    @PatchMapping("/sheet-columns/{columnId}")
    @Operation(
            operationId = "changeSheetColumn",
            summary = "Change one column: its name, its formula, its choices, its total, its place")
    ColumnResponse changeColumn(
            @Me UUID me,
            @PathVariable UUID columnId,
            @Valid @RequestBody ColumnChangeRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.changeColumn(
                columnId,
                me,
                new ColumnChange(
                        request.name(),
                        request.kind(),
                        request.options(),
                        request.formula(),
                        request.summary(),
                        request.before(),
                        request.toEnd()),
                day);
    }

    @DeleteMapping("/sheet-columns/{columnId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeSheetColumn",
            summary =
                    "Remove a column and what it held. One that a formula uses stays until the formula changes. Removing one that is gone is fine.")
    void removeColumn(@Me UUID me, @PathVariable UUID columnId) {
        sheets.removeColumn(columnId, me);
    }

    // ---------- rows ----------

    @PostMapping("/sheet-tabs/{tabId}/rows")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addSheetRow", summary = "Add a row to a tab. A tab holds 2,000.")
    RowChangedResponse addRow(
            @Me UUID me,
            @PathVariable UUID tabId,
            @Valid @RequestBody NewRowRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.addRow(tabId, me, request.cells(), request.note(), request.before(), request.clientId(), day);
    }

    @GetMapping("/sheet-rows/{rowId}")
    @Operation(
            operationId = "getSheetRow",
            summary =
                    "A row opened as a card: every column's value, its note, its papers, and the rows before and after")
    RowCardResponse row(
            @Me UUID me,
            @PathVariable UUID rowId,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.row(rowId, me, day);
    }

    @PatchMapping("/sheet-rows/{rowId}")
    @Operation(
            operationId = "changeSheetRow",
            summary = "Change some cells of a row, its note or its place. Cells that aren't sent stay as they are.")
    RowChangedResponse changeRow(
            @Me UUID me,
            @PathVariable UUID rowId,
            @Valid @RequestBody RowChangeRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.changeRow(
                rowId, me, new RowChange(request.cells(), request.note(), request.before(), request.toEnd()), day);
    }

    @DeleteMapping("/sheet-rows/{rowId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeSheetRow", summary = "Remove a row. Removing one that is gone is fine.")
    void removeRow(@Me UUID me, @PathVariable UUID rowId) {
        sheets.removeRow(rowId, me);
    }

    @PostMapping("/sheet-rows/{rowId}/papers")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addSheetRowPaper", summary = "Keep a receipt or a paper with a row. A row keeps 20.")
    RowCardResponse addPaper(@Me UUID me, @PathVariable UUID rowId, @Valid @RequestBody NewPaperRequest request) {
        return sheets.addPaper(rowId, me, request.mediaId(), request.clientId(), null);
    }

    @DeleteMapping("/sheet-rows/{rowId}/papers/{mediaId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeSheetRowPaper", summary = "Take a paper off a row. Its file is removed with it.")
    void removePaper(@Me UUID me, @PathVariable UUID rowId, @PathVariable UUID mediaId) {
        sheets.removePaper(rowId, me, mediaId);
    }

    // ---------- tiles ----------

    @PostMapping("/sheet-tabs/{tabId}/tiles")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addSheetTile", summary = "Add a tile on top of a tab: a named total. A tab holds 12.")
    TileResponse addTile(
            @Me UUID me,
            @PathVariable UUID tabId,
            @Valid @RequestBody NewTileRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.addTile(
                tabId, me, request.name(), request.formula(), request.ofTileId(), request.clientId(), day);
    }

    @PatchMapping("/sheet-tiles/{tileId}")
    @Operation(
            operationId = "changeSheetTile",
            summary = "Change a tile: its name, its formula, what it is shown against, its place")
    TileResponse changeTile(
            @Me UUID me,
            @PathVariable UUID tileId,
            @Valid @RequestBody TileChangeRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return sheets.changeTile(
                tileId,
                me,
                new TileChange(
                        request.name(),
                        request.formula(),
                        request.ofTileId(),
                        request.removeOf(),
                        request.before(),
                        request.toEnd()),
                day);
    }

    @DeleteMapping("/sheet-tiles/{tileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeSheetTile", summary = "Remove a tile. Removing one that is gone is fine.")
    void removeTile(@Me UUID me, @PathVariable UUID tileId) {
        sheets.removeTile(tileId, me);
    }

    // ---------- a formula you can read ----------

    @PostMapping("/sheet-tabs/{tabId}/formula")
    @Operation(
            operationId = "readFormula",
            summary =
                    "Read a formula without keeping it: as chips, as a sentence, and with its answer. Also lists the columns and functions to build one from.")
    FormulaResponse formula(@Me UUID me, @PathVariable UUID tabId, @Valid @RequestBody FormulaRequest request) {
        return sheets.read(tabId, me, request.formula(), request.columnId(), request.day());
    }

    @PostMapping("/sheet-tabs/{tabId}/ask")
    @Operation(
            operationId = "askFormula",
            summary =
                    "Ask in words: one of a set of known questions is answered with a formula, by rule. Anything else is told how to write one.")
    FormulaResponse ask(@Me UUID me, @PathVariable UUID tabId, @Valid @RequestBody AskRequest request) {
        return sheets.ask(tabId, me, request.question(), request.day());
    }
}
