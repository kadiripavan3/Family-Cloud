package app.homeport.api.money.sheet;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.money.LoanPlan;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The sheets a person can start from: each already has its columns, its formulas, its tiles and a few rows to
 * show how it is meant. They are built in; a sheet made from one is an ordinary sheet from then on.
 */
public enum SheetTemplate {
    MONTHLY_BUDGET("Monthly budget", "💰", "Money in, bills out, what's left", "Monthly", false),
    TRIP_BUDGET("Trip budget", "🧳", "Costs, who paid, who owes", "Trip", false),
    PARTY_BUDGET("Party budget", "🎈", "What it costs, against what you set aside", "Party", false),
    LOAN("Loan planner", "🏦", "Slide the rate, watch the payment", "Loan", true),
    SAVINGS("Savings plan", "📈", "How long until the goal", "Savings", true),
    TAX_CHECKLIST("Tax checklist", "🧾", "Papers to find, with totals", "Tax", false),
    CAR_COSTS("Car costs", "🚗", "Fuel, service, cost per km", "Car", false);

    private final String title;
    private final String emoji;
    private final String says;
    private final String tag;
    private final boolean live;

    SheetTemplate(String title, String emoji, String says, String tag, boolean live) {
        this.title = title;
        this.emoji = emoji;
        this.says = says;
        this.tag = tag;
        this.live = live;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static SheetTemplate of(String code) {
        return Codes.parse(
                SheetTemplate.class,
                code,
                () -> ApiProblem.badRequest("invalid_template", "That isn't one of the templates."));
    }

    /** From a database column. Empty for a sheet that started blank. */
    public static SheetTemplate read(String code) {
        return code == null || code.isEmpty() ? null : Codes.read(SheetTemplate.class, code);
    }

    public String title() {
        return title;
    }

    public String emoji() {
        return emoji;
    }

    /** The line under its name on the card. */
    public String says() {
        return says;
    }

    /** One word for a sheet made from it, shown above its name in a list: Trip, Monthly. */
    public String tag() {
        return tag;
    }

    /** True for the ones with sliders to play with before keeping them as a sheet: the loan and the savings plan. */
    public boolean live() {
        return live;
    }

    // ---------- what a template is made of ----------

    /** A column of a tab to build. A formula is written with column names, as a person would. */
    public record ColumnDef(String name, ColumnKind kind, List<String> options, String formula, Summary summary) {

        public static ColumnDef of(String name, ColumnKind kind) {
            return new ColumnDef(name, kind, List.of(), "", Summary.NONE);
        }

        public static ColumnDef of(String name, ColumnKind kind, Summary summary) {
            return new ColumnDef(name, kind, List.of(), "", summary);
        }

        public static ColumnDef choice(String name, String... options) {
            return new ColumnDef(name, ColumnKind.CHOICE, List.of(options), "", Summary.NONE);
        }

        public static ColumnDef formula(String name, String formula, Summary summary) {
            return new ColumnDef(name, ColumnKind.FORMULA, List.of(), formula, summary);
        }
    }

    /** A tile to build. {@code of} names another tile of the tab to show it against, or is null. */
    public record TileDef(String name, String formula, String of) {}

    /**
     * A row to build: a value for each column, in the columns' order. Text is a String, money is cents in a
     * Long, a number is a BigDecimal or an Integer, a date a LocalDate, a tick a Boolean, people a list of
     * member ids; null leaves a cell empty.
     */
    public record RowDef(List<Object> cells, String note) {

        public static RowDef of(Object... cells) {
            return new RowDef(Arrays.asList(cells), "");
        }
    }

    public record TabDef(String name, List<ColumnDef> columns, List<TileDef> tiles, List<RowDef> rows) {}

    /** Whole euros (or dollars, or whatever the sheet counts in) as cents. */
    public static Long units(long whole) {
        return whole * 100;
    }

    /** The tabs a sheet made from this template starts with. Dates in its sample rows are counted from {@code today}. */
    public List<TabDef> tabs(LocalDate today) {
        return switch (this) {
            case MONTHLY_BUDGET -> List.of(monthlyBudget("This month", true));
            case TRIP_BUDGET ->
                List.of(new TabDef(
                        "Budget",
                        List.of(
                                ColumnDef.of("Item", ColumnKind.TEXT),
                                ColumnDef.of("Who", ColumnKind.PERSON),
                                ColumnDef.of("Cost", ColumnKind.MONEY, Summary.SUM),
                                ColumnDef.of("Paid", ColumnKind.TICK, Summary.TICKED),
                                ColumnDef.of("Due", ColumnKind.DATE)),
                        List.of(
                                new TileDef("Planned", "SUM([Cost])", null),
                                new TileDef("Paid", "SUMIF([Paid], [Cost])", "Planned"),
                                new TileDef("Still to pay", "SUM([Cost]) - SUMIF([Paid], [Cost])", null)),
                        List.of(
                                RowDef.of("Getting there", null, units(600), true, null),
                                RowDef.of("Somewhere to stay", null, units(900), false, today.plusDays(30)),
                                RowDef.of("Getting around", null, units(150), false, null),
                                RowDef.of("Food", null, units(400), false, null),
                                RowDef.of("Fun money", null, units(200), false, null))));
            case PARTY_BUDGET ->
                List.of(partyBudget(
                        250,
                        List.of(
                                RowDef.of("Cake", units(30), 1, false),
                                RowDef.of("Food and drink", units(6), 10, false),
                                RowDef.of("Decorations", units(15), 1, false),
                                RowDef.of("Party bags", units(4), 10, false))));
            case LOAN -> List.of(loan(24_000_000, new BigDecimal("3.4"), 25, 0));
            case SAVINGS ->
                List.of(savings(
                        8000,
                        List.of(
                                RowDef.of(
                                        today.minusMonths(2).withDayOfMonth(1), null, units(200), "To get it started"),
                                RowDef.of(today.minusMonths(1).withDayOfMonth(1), null, units(150), ""),
                                RowDef.of(today.withDayOfMonth(1), null, units(150), ""))));
            case TAX_CHECKLIST ->
                List.of(new TabDef(
                        "Papers",
                        List.of(
                                ColumnDef.of("Paper", ColumnKind.TEXT, Summary.COUNT),
                                ColumnDef.of("Found", ColumnKind.TICK, Summary.TICKED),
                                ColumnDef.of("Amount", ColumnKind.MONEY, Summary.SUM),
                                ColumnDef.of("Where it is", ColumnKind.TEXT)),
                        List.of(
                                new TileDef("Found", "COUNTIF([Found])", "Papers"),
                                new TileDef("Papers", "COUNT([Paper])", null),
                                new TileDef("Adds up to", "SUM([Amount])", null)),
                        List.of(
                                RowDef.of("Yearly statement from work", true, null, "In the Library"),
                                RowDef.of("Interest paid on the loan", false, null, ""),
                                RowDef.of("Donations", false, units(120), ""),
                                RowDef.of("Childcare receipts", false, null, ""),
                                RowDef.of("Health costs", false, null, ""))));
            case CAR_COSTS ->
                List.of(new TabDef(
                        "Costs",
                        List.of(
                                ColumnDef.of("When", ColumnKind.DATE),
                                ColumnDef.choice("What", "Fuel", "Service", "Insurance", "Tax", "Tyres", "Other"),
                                ColumnDef.of("Cost", ColumnKind.MONEY, Summary.SUM),
                                ColumnDef.of("Km", ColumnKind.NUMBER, Summary.MAX)),
                        List.of(
                                new TileDef("Spent", "SUM([Cost])", null),
                                new TileDef("Driven", "MAX([Km]) - MIN([Km])", null),
                                new TileDef("Cost per km", "SUM([Cost]) / (MAX([Km]) - MIN([Km]))", null)),
                        List.of(
                                RowDef.of(today.minusDays(60), "Fuel", units(62), 48200),
                                RowDef.of(today.minusDays(41), "Service", units(240), 48950),
                                RowDef.of(today.minusDays(20), "Fuel", units(58), 49700),
                                RowDef.of(today.minusDays(3), "Fuel", units(65), 50400))));
        };
    }

    /** One month of a budget: what comes in, what goes out, what is left. */
    public static TabDef monthlyBudget(String name, boolean withRows) {
        return new TabDef(
                name,
                List.of(
                        ColumnDef.of("Item", ColumnKind.TEXT),
                        ColumnDef.choice("Kind", "Money in", "Bill", "Spending", "Saving"),
                        ColumnDef.of("Amount", ColumnKind.MONEY, Summary.SUM),
                        ColumnDef.of("Done", ColumnKind.TICK, Summary.TICKED)),
                List.of(
                        new TileDef("Money in", "SUMIF([Kind] = \"Money in\", [Amount])", null),
                        new TileDef("Going out", "SUMIF([Kind] <> \"Money in\", [Amount])", null),
                        new TileDef(
                                "What's left",
                                "SUMIF([Kind] = \"Money in\", [Amount]) - SUMIF([Kind] <> \"Money in\", [Amount])",
                                null)),
                withRows
                        ? List.of(
                                RowDef.of("Pay", "Money in", units(2400), true),
                                RowDef.of("Rent", "Bill", units(980), true),
                                RowDef.of("Electricity", "Bill", units(80), false),
                                RowDef.of("Food", "Spending", units(450), false),
                                RowDef.of("Put aside", "Saving", units(200), false))
                        : List.of());
    }

    /** What a party costs, against what was set aside for it. */
    public static TabDef partyBudget(long budgetUnits, List<RowDef> rows) {
        return new TabDef(
                "Budget",
                List.of(
                        ColumnDef.of("Item", ColumnKind.TEXT),
                        ColumnDef.of("Price", ColumnKind.MONEY),
                        ColumnDef.of("Qty", ColumnKind.NUMBER),
                        ColumnDef.formula("Total", "[Price] * [Qty]", Summary.SUM),
                        ColumnDef.of("Bought", ColumnKind.TICK, Summary.TICKED)),
                List.of(
                        new TileDef("Planned", "SUM([Total])", "Budget"),
                        new TileDef("Budget", "€" + budgetUnits, null),
                        new TileDef("Left", "€" + budgetUnits + " - SUM([Total])", null)),
                rows);
    }

    /** Putting money aside towards a goal. */
    public static TabDef savings(long goalUnits, List<RowDef> rows) {
        return new TabDef(
                "Savings",
                List.of(
                        ColumnDef.of("When", ColumnKind.DATE),
                        ColumnDef.of("Who", ColumnKind.PERSON),
                        ColumnDef.of("Put in", ColumnKind.MONEY, Summary.SUM),
                        ColumnDef.of("Note", ColumnKind.TEXT)),
                List.of(
                        new TileDef("Saved", "SUM([Put in])", "Goal"),
                        new TileDef("Goal", "€" + goalUnits, null),
                        new TileDef("To go", "€" + goalUnits + " - SUM([Put in])", null)),
                rows);
    }

    /** A loan plan kept as a sheet: a row for each year, and the payment as a tile that works itself out. */
    public static TabDef loan(long principalCents, BigDecimal yearlyPercent, int years, long extraCents) {
        LoanPlan.Plan plan = LoanPlan.plan(principalCents, yearlyPercent, years * 12, extraCents);
        List<RowDef> rows = new ArrayList<>();
        for (LoanPlan.Year year : plan.years()) {
            rows.add(RowDef.of(year.year(), year.paidCents(), year.interestCents(), year.owedCents()));
        }
        String borrowed =
                "€" + BigDecimal.valueOf(principalCents, 2).stripTrailingZeros().toPlainString();
        String payment = "PAYMENT(" + borrowed + ", " + yearlyPercent.toPlainString() + ", " + years + ")";
        if (extraCents > 0) {
            payment += " + €"
                    + BigDecimal.valueOf(extraCents, 2).stripTrailingZeros().toPlainString();
        }
        return new TabDef(
                "Plan",
                List.of(
                        ColumnDef.of("Year", ColumnKind.NUMBER),
                        ColumnDef.of("Paid", ColumnKind.MONEY, Summary.SUM),
                        ColumnDef.of("Interest", ColumnKind.MONEY, Summary.SUM),
                        ColumnDef.of("Still owed", ColumnKind.MONEY)),
                List.of(
                        new TileDef("Each month", payment, null),
                        new TileDef("Interest in all", "SUM([Interest])", null),
                        new TileDef("Paid in all", "SUM([Paid])", null)),
                rows);
    }
}
