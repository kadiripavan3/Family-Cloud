package app.homeport.api.money.sheet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.money.sheet.FormulaWords.PartResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * The sheet engine: formulas read, worked out for every row, added up, and said in words. No database and no
 * API here; a small tab is built in memory for each test.
 */
class FormulaTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    /** A tab in memory: columns by name, rows of values, and the sums over them. */
    private static final class Tab implements Formula.Columns {

        private final Map<String, UUID> ids = new LinkedHashMap<>();
        private final Map<UUID, ColumnKind> kinds = new HashMap<>();
        private final Map<UUID, String> formulas = new HashMap<>();
        private final List<Map<UUID, Value>> rows = new ArrayList<>();
        private Calc calc;

        Tab column(String name, ColumnKind kind) {
            UUID id = UUID.nameUUIDFromBytes(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            ids.put(name, id);
            kinds.put(id, kind);
            return this;
        }

        Tab formula(String name, String formula) {
            column(name, ColumnKind.FORMULA);
            formulas.put(ids.get(name), formula);
            return this;
        }

        /** A row: a value for each column that isn't a formula, in their order. Null leaves a cell empty. */
        Tab row(Object... values) {
            Map<UUID, Value> cells = new HashMap<>();
            int i = 0;
            for (UUID id : ids.values()) {
                if (kinds.get(id) == ColumnKind.FORMULA || i >= values.length) {
                    continue;
                }
                Object value = values[i++];
                if (value != null) {
                    cells.put(id, value(value));
                }
            }
            rows.add(cells);
            return this;
        }

        private static Value value(Object value) {
            return switch (value) {
                case Value already -> already;
                case String text -> new Value.Text(text);
                case Boolean ticked -> new Value.Tick(ticked);
                case LocalDate date -> new Value.Day(date);
                case Integer whole -> Value.number(whole);
                case BigDecimal number -> new Value.Num(number, false);
                default -> throw new IllegalArgumentException("What is " + value + "?");
            };
        }

        Calc calc() {
            if (calc == null) {
                List<Calc.Col> cols = new ArrayList<>();
                ids.forEach((name, id) -> cols.add(new Calc.Col(
                        id,
                        name,
                        kinds.get(id),
                        formulas.containsKey(id) ? Formula.read(formulas.get(id), this) : null,
                        null)));
                calc = new Calc(cols, rows, TODAY);
            }
            return calc;
        }

        Value cell(int row, String column) {
            return calc().cell(row, ids.get(column));
        }

        Calc.Total total(String formula) {
            return calc().total(Formula.read(formula, this));
        }

        /** The answer of a formula that needs no row: 2 + 3 * 4. */
        Value answer(String formula) {
            return total(formula).value();
        }

        Node read(String formula) {
            return Formula.read(formula, this);
        }

        @Override
        public Optional<UUID> id(String name) {
            return ids.entrySet().stream()
                    .filter(e -> e.getKey().equalsIgnoreCase(name))
                    .map(Map.Entry::getValue)
                    .findFirst();
        }

        @Override
        public Optional<String> name(UUID id) {
            return ids.entrySet().stream()
                    .filter(e -> e.getValue().equals(id))
                    .map(Map.Entry::getKey)
                    .findFirst();
        }

        @Override
        public Optional<ColumnKind> kind(UUID id) {
            return Optional.ofNullable(kinds.get(id));
        }

        @Override
        public List<String> names() {
            return List.copyOf(ids.keySet());
        }
    }

    private static Value eur(String amount) {
        return new Value.Num(new BigDecimal(amount), true);
    }

    private static Value number(String number) {
        return new Value.Num(new BigDecimal(number), false);
    }

    private static Value people(String... names) {
        List<UUID> ids = new ArrayList<>();
        for (String name : names) {
            ids.add(UUID.nameUUIDFromBytes(name.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }
        return new Value.People(ids, List.of(names));
    }

    /** A value as a test reads it: "€84.20", "12.5", "yes", "2027-01-15", "!Price is empty", "" for nothing. */
    private static String show(Value value) {
        return switch (value) {
            case Value.Num num ->
                num.money()
                        ? "€"
                                + num.amount()
                                        .setScale(2, java.math.RoundingMode.HALF_UP)
                                        .toPlainString()
                        : Calc.plain(num.amount());
            case Value.Text text -> text.text();
            case Value.Tick tick -> tick.on() ? "yes" : "no";
            case Value.Day day -> day.date().toString();
            case Value.People who -> String.join("+", who.names());
            case Value.Empty empty -> "";
            case Value.Problem problem -> "!" + problem.says();
        };
    }

    private static List<String> column(Tab tab, String column) {
        List<String> shown = new ArrayList<>();
        for (int row = 0; row < tab.calc().rows(); row++) {
            shown.add(show(tab.cell(row, column)));
        }
        return shown;
    }

    private static List<String> chips(List<PartResponse> parts) {
        return parts.stream().map(PartResponse::text).toList();
    }

    /** The Norway budget of the screens. */
    private static Tab norway() {
        return new Tab()
                .column("Item", ColumnKind.TEXT)
                .column("Who", ColumnKind.PERSON)
                .column("Cost", ColumnKind.MONEY)
                .column("Paid", ColumnKind.TICK)
                .column("Due", ColumnKind.DATE)
                .row("Flights", people("Alex"), eur("1480"), true)
                .row("Rail passes", people("Nora"), eur("1020"), true)
                .row("Cabins, 9 nights", people("Alex"), eur("2350"), false, LocalDate.of(2027, 1, 15))
                .row("Ferries", people("Nora"), eur("640"), false)
                .row("Food", people("Nora", "Alex"), eur("1400"), false)
                .row("Fun money", people("Mia", "Leo"), eur("750"), false);
    }

    private static Tab party() {
        return new Tab()
                .column("Item", ColumnKind.TEXT)
                .column("Price", ColumnKind.MONEY)
                .column("Qty", ColumnKind.NUMBER)
                .formula("Total", "[Price] * [Qty]")
                .column("Bought", ColumnKind.TICK);
    }

    // ---------- a formula for each row ----------

    @Test
    void aFormulaColumnIsWorkedOutForEveryRow() {
        Tab tab = party().row("Cake", eur("38"), 1, true)
                .row("Pizza for eight", eur("6.50"), 8, false)
                .row("Party bags", eur("4.50"), 8, false);

        assertThat(column(tab, "Total")).containsExactly("€38.00", "€52.00", "€36.00");
        assertThat(show(tab.answer("SUM([Total])"))).isEqualTo("€126.00");
    }

    @ParameterizedTest(name = "{0} = {1}")
    @CsvSource(
            delimiter = '|',
            value = {
                "2 + 3 * 4 | 14",
                "(2 + 3) * 4 | 20",
                "10 - 4 - 3 | 3",
                "10 - (4 - 3) | 9",
                "2 * -3 | -6",
                "-(2 + 3) | -5",
                "10 / 4 | 2.5",
                "1 / 3 | 0.333333",
                "0.1 + 0.2 | 0.3",
                "50% | 0.5",
                "200 * 5% | 10",
                "7 × 6 | 42",
                "8 ÷ 2 | 4",
                "9 − 4 | 5",
                "=1+1 | 2",
                "ROUND(2.5) | 3",
                "ROUND(-2.5) | -3",
                "ROUND(3.14159, 2) | 3.14",
                "ROUND(1234.5, -2) | 1200",
                "ABS(-7) | 7",
                "MIN(4, 2, 9) | 2",
                "MAX(4, 2, 9) | 9",
                "IF(2 > 1, 10, 20) | 10",
                "IF(2 < 1, 10, 20) | 20",
                "IF(AND(2 > 1, 3 > 2), 1, 0) | 1",
                "IF(2 > 1 AND 3 > 4, 1, 0) | 0",
                "IF(2 > 1 OR 3 > 4, 1, 0) | 1",
                "IF(NOT 2 > 1, 1, 0) | 0",
                "IF(NOT(1 = 2), 1, 0) | 1",
                "IF(1 <> 2, 1, 0) | 1",
                "IF(2 >= 2, 1, 0) | 1",
                "IF(2 <= 1, 1, 0) | 0",
                "IF(3 ≥ 3, 1, 0) | 1",
                "IF(3 != 3, 1, 0) | 0",
                "IF(TRUE, 1, 0) | 1",
                "IF(\"abc\" = \"ABC\", 1, 0) | 1",
                "\"a\" & \"b\" & 3 | ab3",
                "JOIN(\"Row \", 2 + 2) | Row 4",
                "€250 - €180 | €70.00",
                "€10 / 4 | €2.50",
                "€10 * 3 | €30.00",
                "€10 / €4 | 2.5",
                "€250 + 5 | €255.00",
                "250€ | €250.00",
                "DAYS(TODAY() + 30, TODAY()) | 30",
                "PAYMENT(€240000, 3.4, 25) | €1188.66",
                "PAYMENT(240000, 3.4, 25) + €100 | €1288.66",
            })
    void sumsComeOutAsOnPaper(String formula, String answer) {
        assertThat(show(new Tab().answer(formula))).isEqualTo(answer);
    }

    @Test
    void ifGivesOneThingOrAnotherAndANumberInAMoneyFormulaIsAnAmount() {
        Tab tab = norway().formula("Open", "IF([Paid], 0, [Cost])").formula("Big", "[Cost] > 1000");

        // €0, not a bare 0 next to the others' euros.
        assertThat(column(tab, "Open")).containsExactly("€0.00", "€0.00", "€2350.00", "€640.00", "€1400.00", "€750.00");
        assertThat(column(tab, "Big")).containsExactly("yes", "yes", "yes", "no", "yes", "no");
        assertThat(show(tab.answer("SUM(IF([Paid], 0, [Cost]))"))).isEqualTo("€5140.00");
    }

    @Test
    void aPersonCellIsComparedWithANameAndTextWithoutMindingCapitals() {
        Tab tab = norway().formula("Alex's", "[Who] = \"alex\"")
                .formula("Not Nora's", "[Who] <> \"Nora\"")
                .formula("Flights?", "[Item] = \"FLIGHTS\"");

        assertThat(column(tab, "Alex's")).containsExactly("yes", "no", "yes", "no", "yes", "no");
        assertThat(column(tab, "Not Nora's")).containsExactly("yes", "no", "yes", "no", "no", "yes");
        assertThat(column(tab, "Flights?")).containsExactly("yes", "no", "no", "no", "no", "no");
    }

    @Test
    void datesCanBeTakenFromEachOtherAndMovedByDays() {
        Tab tab = new Tab()
                .column("Start", ColumnKind.DATE)
                .column("End", ColumnKind.DATE)
                .formula("Nights", "[End] - [Start]")
                .formula("Days left", "DAYS([Start], TODAY())")
                .formula("Pay by", "[Start] - 42")
                .formula("Soon", "[Start] < TODAY() + 30")
                .row(LocalDate.of(2027, 7, 11), LocalDate.of(2027, 7, 20))
                .row(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 22));

        assertThat(column(tab, "Nights")).containsExactly("9", "2");
        assertThat(column(tab, "Days left")).containsExactly("242", "9");
        assertThat(column(tab, "Pay by")).containsExactly("2027-05-30", "2026-10-09");
        assertThat(column(tab, "Soon")).containsExactly("no", "yes");
        assertThat(show(tab.answer("MIN([Start])"))).isEqualTo("2026-11-20");
        assertThat(show(tab.answer("MAX([End])"))).isEqualTo("2027-07-20");
    }

    @Test
    void textIsJoinedAndNumbersAndDatesBecomeWordsInIt() {
        Tab tab = norway().formula("Line", "[Item] & \": \" & [Cost]").formula("By", "JOIN([Who], \" by \", [Due])");

        assertThat(tab.cell(2, "Line")).isEqualTo(new Value.Text("Cabins, 9 nights: 2350.00"));
        assertThat(tab.cell(2, "By")).isEqualTo(new Value.Text("Alex by 15 Jan 2027"));
        // An empty cell joins as nothing.
        assertThat(tab.cell(4, "By")).isEqualTo(new Value.Text("Nora, Alex by "));
    }

    // ---------- when it can't be worked out ----------

    @Test
    void aCellThatCantBeWorkedOutSaysWhyInPlainWords() {
        Tab tab = party().formula("Each", "[Price] / [Qty]")
                .formula("Odd", "[Item] * 2")
                .formula("Odder", "[Bought] + 1")
                .row("Cake", eur("38"), 1, true)
                .row("Balloons", null, 20, false)
                .row("Plates", eur("9"), 0, false)
                .row("Candles", eur("3"), null, false);

        assertThat(column(tab, "Total")).containsExactly("€38.00", "!Price is empty", "€0.00", "!Qty is empty");
        assertThat(column(tab, "Each"))
                .containsExactly(
                        "€38.00", "!Price is empty", "!Qty is 0, and nothing can be divided by 0", "!Qty is empty");
        assertThat(show(tab.cell(0, "Odd"))).isEqualTo("!Item holds words, not a number");
        assertThat(show(tab.cell(0, "Odder"))).isEqualTo("!Bought is a tick, not a number");
        assertThat(show(tab.answer("1 / 0"))).isEqualTo("!PartResponse of this is 0, and nothing can be divided by 0");
        assertThat(show(tab.answer("IF(3, 1, 2)")))
                .isEqualTo("!IF starts with a question that is yes or no, like [Paid] or [Cost] > 100");
        assertThat(show(tab.answer("TODAY() * 2")))
                .isEqualTo("!A date can be moved by a number of days, or taken away from another date");
    }

    @Test
    void aRowWithNothingInItYetIsQuiet() {
        Tab tab = party().formula("Left", "IF([Bought], 0, [Total])")
                .row("Cake", eur("38"), 1, false)
                .row()
                .row("Balloons");

        // Nothing to go on: empty, not "Price is empty".
        assertThat(column(tab, "Total")).containsExactly("€38.00", "", "");
        assertThat(column(tab, "Left")).containsExactly("€38.00", "", "");
        assertThat(show(tab.answer("SUM([Total])"))).isEqualTo("€38.00");
    }

    @Test
    void anEmptyCellIsNotEqualToAnythingButCanBeAskedAbout() {
        Tab tab = norway().formula("No date", "ISEMPTY([Due])").formula("In January", "[Due] = TODAY()");

        assertThat(column(tab, "No date")).containsExactly("yes", "yes", "no", "yes", "yes", "yes");
        assertThat(column(tab, "In January")).containsExactly("no", "no", "no", "no", "no", "no");
        // Before or after an empty date can't be said. Where it is the only thing the formula reads, the cell
        // stays quiet; where the row has something else to go on, it says what is missing.
        Tab late = norway().formula("Late", "[Due] < TODAY()")
                .formula("Late and dear", "AND([Cost] > 1000, [Due] < TODAY())");
        assertThat(column(late, "Late")).containsExactly("", "", "no", "", "", "");
        assertThat(column(late, "Late and dear"))
                .containsExactly("!Due is empty", "!Due is empty", "no", "no", "!Due is empty", "no");
    }

    // ---------- columns that use each other ----------

    @Test
    void formulaColumnsAreWorkedOutInTheOrderTheyNeedEachOther() {
        // Written in the "wrong" order: With tax needs Total, which comes after it.
        Tab tab = new Tab()
                .column("Price", ColumnKind.MONEY)
                .formula("Share", "[With tax] / SUM([With tax]) * 100")
                .formula("With tax", "ROUND([Total] * 1.22, 2)")
                .column("Qty", ColumnKind.NUMBER)
                .formula("Total", "[Price] * [Qty]")
                .row(eur("10"), 3)
                .row(eur("5"), 2);

        assertThat(column(tab, "Total")).containsExactly("€30.00", "€10.00");
        assertThat(column(tab, "With tax")).containsExactly("€36.60", "€12.20");
        assertThat(column(tab, "Share")).containsExactly("75", "25");
    }

    @Test
    void columnsThatWouldNeedEachOtherInACircleAreFound() {
        Tab tab = new Tab()
                .column("Price", ColumnKind.MONEY)
                .formula("A", "[B] + 1")
                .formula("B", "[C] * 2")
                .formula("C", "[A] - [Price]")
                .formula("Fine", "[Price] * 2")
                .row(eur("10"));
        List<Calc.Col> cols = new ArrayList<>();
        for (String name : tab.names()) {
            UUID id = tab.id(name).orElseThrow();
            cols.add(new Calc.Col(
                    id,
                    name,
                    tab.kind(id).orElseThrow(),
                    tab.formulas.containsKey(id) ? tab.read(tab.formulas.get(id)) : null,
                    null));
        }

        assertThat(Calc.loop(cols)).containsExactly("A", "B", "C", "A");
        // Should one be kept all the same, its cells say so and the rest of the tab still works.
        assertThat(show(tab.cell(0, "A"))).isEqualTo("!This formula goes round in a circle");
        assertThat(show(tab.cell(0, "B"))).isEqualTo("!This formula goes round in a circle");
        assertThat(show(tab.cell(0, "Fine"))).isEqualTo("€20.00");

        assertThat(Calc.loop(cols.subList(0, 1))).isEmpty();
        // A total over another column is using it too: SUM([B]) inside A, and A inside B.
        Tab totals = new Tab().formula("A", "SUM([B])").formula("B", "[A] + 1").row();
        assertThat(show(totals.cell(0, "A"))).isEqualTo("!This formula goes round in a circle");
    }

    // ---------- totals ----------

    @Test
    void theNorwayBudgetAddsUpAsOnTheScreen() {
        Tab tab = norway();

        assertThat(show(tab.answer("SUM([Cost])"))).isEqualTo("€7640.00");
        assertThat(show(tab.answer("SUMIF([Paid], [Cost])"))).isEqualTo("€2500.00");
        assertThat(show(tab.answer("SUM([Cost]) - SUMIF([Paid], [Cost])"))).isEqualTo("€5140.00");
        assertThat(show(tab.answer("COUNTIF([Paid])"))).isEqualTo("2");
        assertThat(show(tab.answer("COUNT()"))).isEqualTo("6");
        assertThat(show(tab.answer("COUNT([Due])"))).isEqualTo("1");
        assertThat(show(tab.answer("AVG([Cost])"))).isEqualTo("€1273.33");
        assertThat(show(tab.answer("MIN([Cost])"))).isEqualTo("€640.00");
        assertThat(show(tab.answer("MAX([Cost])"))).isEqualTo("€2350.00");
        assertThat(show(tab.answer("AVGIF(NOT [Paid], [Cost])"))).isEqualTo("€1285.00");
        // "How much has Alex paid?"
        assertThat(show(tab.answer("SUMIF(AND([Who] = \"Alex\", [Paid]), [Cost])")))
                .isEqualTo("€1480.00");
        assertThat(show(tab.answer("SUMIF([Who] = \"Nora\", [Cost])"))).isEqualTo("€3060.00");
        assertThat(show(tab.answer("ROUND(SUMIF([Paid], [Cost]) / SUM([Cost]) * 100)")))
                .isEqualTo("33");
        assertThat(show(tab.answer("COUNTIF([Cost] > 1000)"))).isEqualTo("4");
    }

    @Test
    void aTotalSkipsEmptyCellsAndSaysHowManyRowsItHadToLeaveOut() {
        Tab tab = party().row("Cake", eur("38"), 1, true)
                .row("Balloons", null, 20, false)
                .row("Plates", eur("9"), 2, false)
                .row();

        Calc.Total total = tab.total("SUM([Total])");
        assertThat(show(total.value())).isEqualTo("€56.00");
        assertThat(total.leftOut()).isEqualTo(1);
        assertThat(total.why()).isEqualTo("Price is empty");
        // A column people fill in simply has gaps: nothing is left out, the empty ones don't count.
        Calc.Total prices = tab.total("AVG([Price])");
        assertThat(show(prices.value())).isEqualTo("€23.50");
        assertThat(prices.leftOut()).isZero();
        assertThat(show(tab.answer("COUNT([Price])"))).isEqualTo("2");
    }

    @Test
    void theSumOfNoRowsIsNothingInTheRightKind() {
        Tab empty = party();

        assertThat(show(empty.answer("SUM([Price])"))).isEqualTo("€0.00");
        assertThat(show(empty.answer("SUM([Total])"))).isEqualTo("€0.00");
        assertThat(show(empty.answer("SUM([Qty])"))).isEqualTo("0");
        assertThat(show(empty.answer("COUNT()"))).isEqualTo("0");
        assertThat(show(empty.answer("AVG([Price])"))).isEmpty();
        assertThat(show(empty.answer("MAX([Price])"))).isEmpty();
        assertThat(show(empty.answer("€250 - SUM([Total])"))).isEqualTo("€250.00");
    }

    @Test
    void aTotalOverWordsSaysSo() {
        Tab tab = norway();

        assertThat(show(tab.answer("SUM([Item])")))
                .isEqualTo("!A sum is made of numbers, and Item holds something else");
        assertThat(show(tab.answer("AVG([Paid])")))
                .isEqualTo("!An average is made of numbers, and Paid holds something else");
        assertThat(show(tab.answer("SUMIF([Cost], [Cost])")))
                .isEqualTo("!SUMIF needs a yes-or-no answer for each row, like [Paid] or [Cost] > 100");
    }

    @Test
    void moneyIsExactToTheCent() {
        Tab tab = new Tab().column("Cost", ColumnKind.MONEY).formula("Third", "[Cost] / 3");
        for (int i = 0; i < 300; i++) {
            tab.row(eur("0.10"));
        }

        // Three hundred times ten cents is thirty euros, not 29.999999.
        assertThat(tab.answer("SUM([Cost])")).isEqualTo(new Value.Num(new BigDecimal("30.00"), true));
        // A third of ten cents is shown as 3 cents, but the sum of all the thirds is the whole again.
        assertThat(show(tab.cell(0, "Third"))).isEqualTo("€0.03");
        assertThat(show(tab.answer("SUM([Third])"))).isEqualTo("€10.00");
    }

    // ---------- reading and writing ----------

    @ParameterizedTest(name = "{0}")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '`',
            value = {
                " | Write a formula first, like [Price] * [Qty].",
                "[Prise] * 2 | There is no column called \"Prise\". This tab has: Item, Price, Qty, Total, Bought.",
                "[Price * 2 | A column name was opened with [ and never closed. Write it like [Price].",
                "[Price] * | The formula stops too early: something is missing after \"×\".",
                "([Price] + 2 | A bracket was opened and never closed.",
                "[Price] + 2) | There is a closing bracket too many.",
                "[Price] [Qty] | I didn't expect \"Qty\" there. Is a sign like + or * missing before it?",
                "SUMM([Price]) | I don't know \"SUMM\". Try SUM, AVG, COUNT, MIN, MAX, IF, ROUND, ABS.",
                "IF([Bought], 1) | IF needs three things: a question, what to give when the answer is yes, and what to give when it is no.",
                "ROUND() | ROUND needs a number, and how many decimals if you want any.",
                "Price * 2 | Write column names in square brackets: [Price].",
                "banana + 1 | I don't know what \"banana\" is. Column names go in square brackets, like [Cost], and words in \"quotes\".",
                "SUM | SUM needs brackets after it, like SUM(…).",
                "\"abc | Some words were opened with a quote and never closed.",
                "[Price] # 2 | I can't read \"#\" in a formula.",
                "* 2 | Something is missing before \"×\".",
                "SUM([Price] | A bracket was opened after SUM and never closed.",
                "IF([Bought] 1, 2) | I didn't expect \"1\" inside IF(…). Put a comma between its parts.",
            })
    void aFormulaThatCantBeReadSaysWhatIsWrongWithIt(String formula, String sentence) {
        assertThatThrownBy(() -> party().read(formula))
                .isInstanceOf(FormulaProblem.class)
                .hasMessage(sentence);
    }

    @Test
    void whatCanNeverBeWorkedOutIsRefusedBeforeItIsKept() {
        Tab tab = party();

        // A tile is one number, so a column in it has to be inside a total.
        assertThatThrownBy(() -> Formula.check(tab.read("[Price] * 2"), true, tab))
                .isInstanceOf(FormulaProblem.class)
                .hasMessageStartingWith(
                        "[Price] is a whole column, and a tile shows one number. Wrap it: SUM([Price])");
        Formula.check(tab.read("[Price] * 2"), false, tab);
        Formula.check(tab.read("SUM([Price]) * 2"), true, tab);
        Formula.check(tab.read("€250"), true, tab);
        assertThatThrownBy(() -> Formula.check(tab.read("SUM(MAX([Price]))"), true, tab))
                .isInstanceOf(FormulaProblem.class)
                .hasMessageStartingWith("MAX is inside another total.");
        assertThatThrownBy(() -> Formula.check(tab.read("SUMIF([Bought], SUM([Price]))"), false, tab))
                .isInstanceOf(FormulaProblem.class);
        // MIN and MAX of several things are for one row; of one thing they look at every row.
        Formula.check(tab.read("SUM(MAX([Price], 10))"), true, tab);
    }

    @ParameterizedTest(name = "{0} is kept as {1}")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '`',
            value = {
                "[price]*[qty] | [Price] * [Qty]",
                "= [Price] × [Qty] | [Price] * [Qty]",
                "sum( [Total] ) - sumif([Bought],[Total]) | SUM([Total]) - SUMIF([Bought], [Total])",
                "average([Price]) | AVG([Price])",
                "([Price] + 2) * [Qty] | ([Price] + 2) * [Qty]",
                "[Price] + (2 * [Qty]) | [Price] + 2 * [Qty]",
                "[Price] - ([Qty] - 1) | [Price] - ([Qty] - 1)",
                "-([Price] + 1) | -([Price] + 1)",
                "[Bought] and [Price] > 10 | AND([Bought], [Price] > 10)",
                "not [Bought] | NOT([Bought])",
                "if([Bought];0;[Total]) | IF([Bought], 0, [Total])",
                "[Item] & “ x” | [Item] & \" x\"",
                "€250 - sum([Total]) | €250 - SUM([Total])",
                "today | TODAY()",
                "yes | TRUE",
                "[Qty] ≥ 2 | [Qty] >= 2",
                "[Qty] != 2 | [Qty] <> 2",
                "25% | 0.25",
            })
    void aFormulaIsWrittenBackTidily(String typed, String kept) {
        Tab tab = party();

        assertThat(Formula.write(tab.read(typed), tab)).isEqualTo(kept);
        // And what is written back reads as the same formula again.
        assertThat(Formula.write(tab.read(kept), tab)).isEqualTo(kept);
    }

    @Test
    void aFormulaIsKeptByColumnIdSoARenamedColumnKeepsWorking() {
        Tab tab = party();
        String kept = Formula.keep(tab.read("[Price] * [Qty]"));

        assertThat(kept)
                .isEqualTo("[#" + tab.id("Price").orElseThrow() + "] * [#"
                        + tab.id("Qty").orElseThrow() + "]");

        // The same columns under new names.
        Tab renamed = new Tab();
        renamed.ids.put("Cost each", tab.id("Price").orElseThrow());
        renamed.ids.put("How many", tab.id("Qty").orElseThrow());
        renamed.kinds.putAll(tab.kinds);
        assertThat(Formula.write(renamed.read(kept), renamed)).isEqualTo("[Cost each] * [How many]");

        // A column that has been removed since: the formula still reads, and says what is missing.
        Tab without = new Tab();
        without.ids.put("Price", tab.id("Price").orElseThrow());
        without.kinds.putAll(tab.kinds);
        Node node = without.read(kept);
        assertThat(Formula.write(node, without)).isEqualTo("[Price] * [a column that was removed]");
        assertThatThrownBy(() -> Formula.check(node, false, without))
                .isInstanceOf(FormulaProblem.class)
                .hasMessage("This formula uses a column that was removed.");
    }

    @Test
    void whichColumnsAFormulaUses() {
        Tab tab = party();
        UUID price = tab.id("Price").orElseThrow();
        UUID qty = tab.id("Qty").orElseThrow();
        UUID total = tab.id("Total").orElseThrow();
        Node node = tab.read("[Price] * [Qty] / SUM([Total])");

        assertThat(Formula.columns(node)).containsExactly(price, qty, total);
        assertThat(Formula.columnsOfTheRow(node)).containsExactly(price, qty);
        assertThat(Formula.oneAnswer(node)).isFalse();
        assertThat(Formula.oneAnswer(tab.read("SUM([Total]) / COUNT()"))).isTrue();
        assertThat(Formula.oneAnswer(tab.read("€250"))).isTrue();
    }

    // ---------- a formula you can read ----------

    @Test
    void theFormulaOfTheScreenIsTheChipsAndTheSentenceItDraws() {
        Tab tab = norway();
        Node node = tab.read("SUM([Cost]) - SUMIF([Paid], [Cost])");

        assertThat(chips(FormulaWords.parts(node, tab)))
                .containsExactly("SUM", "Cost", "−", "SUM IF", "Paid", "is ticked", "Cost");
        assertThat(FormulaWords.parts(node, tab).stream().map(PartResponse::kind))
                .containsExactly(
                        PartKind.FUNCTION,
                        PartKind.COLUMN,
                        PartKind.SIGN,
                        PartKind.FUNCTION,
                        PartKind.COLUMN,
                        PartKind.WORDS,
                        PartKind.COLUMN);
        assertThat(FormulaWords.parts(node, tab).get(1).columnId())
                .isEqualTo(tab.id("Cost").orElseThrow());
        assertThat(FormulaWords.sentence(node, tab))
                .isEqualTo("Everything in Cost, minus the Cost of rows where Paid is ticked.");
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '`',
            value = {
                "[Cost] * 2 | Cost × 2 | Cost times 2.",
                "[Cost] / 3 | Cost ÷ 3 | Cost divided by 3.",
                "([Cost] + 5) * 2 | ( Cost + 5 ) × 2 | Cost plus 5 times 2.",
                "IF([Paid], 0, [Cost]) | IF Paid is ticked 0 Cost | 0 if Paid is ticked, otherwise Cost.",
                "NOT [Paid] | Paid is not ticked | Paid is not ticked.",
                "SUM([Cost]) | SUM Cost | Everything in Cost.",
                "AVG([Cost]) | AVERAGE Cost | The average of Cost.",
                "COUNT() | COUNT rows | The number of rows.",
                "COUNT([Due]) | COUNT Due | The number of rows that have Due.",
                "COUNTIF(NOT [Paid]) | COUNT IF Paid is not ticked | The number of rows where Paid is not ticked.",
                "MAX([Cost]) | MAX Cost | The largest Cost.",
                "MIN([Cost], 100) | MIN Cost 100 | The smallest of Cost and 100.",
                "SUM([Cost] * 2) | SUM ( Cost × 2 ) | The total of Cost times 2 over every row.",
                "SUMIF([Who] = \"Alex\", [Cost]) | SUM IF ( Who = “Alex” , Cost ) | The Cost of rows where Who is “Alex”.",
                "SUMIF(AND([Who] = \"Alex\", [Paid]), [Cost]) | SUM IF ( Who = “Alex” and Paid is ticked , Cost ) | The Cost of rows where Who is “Alex” and Paid is ticked.",
                "[Paid] OR [Cost] < 100 | Paid is ticked or Cost < 100 | Paid is ticked or Cost is less than 100.",
                "[Cost] >= 100 | Cost ≥ 100 | Cost is at least 100.",
                "[Item] & \"!\" | Item & “!” | Item followed by “!”.",
                "DAYS([Due], TODAY()) | DAYS ( Due , TODAY ) | The days from today to Due.",
                "ROUND([Cost] / 3, 2) | ROUND ( Cost ÷ 3 , 2 ) | Cost divided by 3, rounded to 2 decimals.",
                "ROUND([Cost]) | ROUND Cost | Cost, rounded to a whole number.",
                "ABS([Cost] - €100) | ABS ( Cost − €100 ) | Cost minus €100 without its sign.",
                "ISEMPTY([Due]) | IS EMPTY Due | Due is empty.",
                "PAYMENT(€240000, 3.4, 25) | PAYMENT €240000 3.4 25 | The monthly payment on €240000 at 3.4% a year over 25 years.",
                "€250 - SUM([Cost]) | €250 − SUM Cost | €250, minus everything in Cost.",
                "-[Cost] | − Cost | Minus Cost.",
            })
    void aFormulaAsChipsAndAsASentence(String formula, String chips, String sentence) {
        Tab tab = norway();
        Node node = tab.read(formula);

        assertThat(String.join(" ", chips(FormulaWords.parts(node, tab)))).isEqualTo(chips);
        assertThat(FormulaWords.sentence(node, tab)).isEqualTo(sentence);
    }

    @Test
    void whatStandsUnderAColumn() {
        Tab tab = norway();
        UUID cost = tab.id("Cost").orElseThrow();
        UUID paid = tab.id("Paid").orElseThrow();

        assertThat(show(tab.calc()
                        .total(FormulaWords.summary(Summary.SUM, cost))
                        .value()))
                .isEqualTo("€7640.00");
        assertThat(show(tab.calc()
                        .total(FormulaWords.summary(Summary.AVG, cost))
                        .value()))
                .isEqualTo("€1273.33");
        assertThat(show(tab.calc()
                        .total(FormulaWords.summary(Summary.MIN, cost))
                        .value()))
                .isEqualTo("€640.00");
        assertThat(show(tab.calc()
                        .total(FormulaWords.summary(Summary.MAX, cost))
                        .value()))
                .isEqualTo("€2350.00");
        assertThat(show(tab.calc()
                        .total(FormulaWords.summary(Summary.COUNT, cost))
                        .value()))
                .isEqualTo("6");
        assertThat(show(tab.calc()
                        .total(FormulaWords.summary(Summary.TICKED, paid))
                        .value()))
                .isEqualTo("2");
        assertThat(FormulaWords.summary(Summary.NONE, cost)).isNull();
        assertThat(chips(FormulaWords.parts(FormulaWords.summary(Summary.SUM, cost), tab)))
                .containsExactly("SUM", "Cost");
        assertThat(FormulaWords.summarySays(Summary.SUM, "Cost")).isEqualTo("Adds up every row in Cost.");
        assertThat(FormulaWords.summarySays(Summary.TICKED, "Paid")).isEqualTo("Counts the rows where Paid is ticked.");
    }
}
