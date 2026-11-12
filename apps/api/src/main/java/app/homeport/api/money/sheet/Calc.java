package app.homeport.api.money.sheet;

import app.homeport.api.money.LoanPlan;
import app.homeport.api.money.sheet.Node.Sign;
import app.homeport.api.money.sheet.Value.Day;
import app.homeport.api.money.sheet.Value.Empty;
import app.homeport.api.money.sheet.Value.Num;
import app.homeport.api.money.sheet.Value.People;
import app.homeport.api.money.sheet.Value.Problem;
import app.homeport.api.money.sheet.Value.Text;
import app.homeport.api.money.sheet.Value.Tick;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Works out one tab of a sheet: every formula column for every row, and the totals asked of it (tiles and the
 * row of sums). The whole engine is here and in {@link Formula}; there is no library behind it.
 *
 * <p>How it counts:
 *
 * <ul>
 *   <li>Formula columns are worked out one after the other, each after the columns it uses. Columns that
 *       would need each other in a circle are refused when the formula is saved ({@link #loop}); should one
 *       be found here all the same, its cells say so.
 *   <li>A cell that can't be worked out holds a sentence saying why ("Price is empty"), never a code. When
 *       every cell a formula reads in a row is empty, there is nothing to complain about yet: a new row is
 *       quiet.
 *   <li>A total (SUM, AVERAGE, COUNT, MIN, MAX) skips empty cells. Rows whose value can't be worked out are
 *       left out and counted, so a tile can say "1 row left out: Price is empty".
 *   <li>Money stays exact: amounts are decimals, never floating-point numbers, and are rounded to the cent
 *       only when they are shown.
 * </ul>
 */
public final class Calc {

    private static final MathContext DIVIDING = MathContext.DECIMAL64;
    private static final DateTimeFormatter DAY_IN_WORDS = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    static final String CIRCLE = "This formula goes round in a circle";

    /**
     * A column as the sums need it.
     *
     * @param formula what a formula column works out, or null for a column people fill in
     * @param problem why a formula column's formula can't be used, or null
     */
    public record Col(UUID id, String name, ColumnKind kind, Node formula, String problem) {}

    /** A total, how many rows were left out of it because they couldn't be worked out, and the first reason. */
    public record Total(Value value, int leftOut, String why) {}

    private final List<Col> columns;
    private final Map<UUID, Integer> index = new HashMap<>();
    private final Value[][] cells;
    private final LocalDate today;
    private final Map<Node, Value> totals = new IdentityHashMap<>();
    private int leftOut;
    private String why;

    /**
     * @param columns the tab's columns, in their order
     * @param rows each row's cells by column id; a formula column's entry is ignored, a missing entry is an
     *     empty cell
     * @param today the day TODAY() gives
     */
    public Calc(List<Col> columns, List<Map<UUID, Value>> rows, LocalDate today) {
        this.columns = List.copyOf(columns);
        this.today = today;
        for (int c = 0; c < columns.size(); c++) {
            index.put(columns.get(c).id(), c);
        }
        cells = new Value[rows.size()][columns.size()];
        for (int r = 0; r < rows.size(); r++) {
            for (int c = 0; c < columns.size(); c++) {
                Col column = columns.get(c);
                if (column.kind() != ColumnKind.FORMULA) {
                    Value value = rows.get(r).get(column.id());
                    cells[r][c] = value != null
                            ? value
                            : column.kind() == ColumnKind.TICK ? new Tick(false) : new Empty(column.name());
                }
            }
        }
        for (Col column : inOrder(this.columns)) {
            workOut(column);
        }
        // Whatever is left has no order to be worked out in: it is part of a circle.
        for (Col column : this.columns) {
            int c = index.get(column.id());
            for (Value[] row : cells) {
                if (row[c] == null) {
                    row[c] = new Problem(CIRCLE);
                }
            }
        }
    }

    public int rows() {
        return cells.length;
    }

    /** What a cell holds, worked out when its column is a formula. */
    public Value cell(int row, UUID column) {
        Integer c = index.get(column);
        return c == null ? Value.NOTHING : cells[row][c];
    }

    /** One number for the whole tab: a tile's formula, or the sum under a column. */
    public Total total(Node formula) {
        leftOut = 0;
        why = null;
        Value value = asMoney(value(formula, -1), formula);
        return new Total(value, leftOut, why);
    }

    // ---------- the order of the columns ----------

    /** The formula columns in an order in which each comes after the ones it uses. Those in a circle are left out. */
    static List<Col> inOrder(List<Col> columns) {
        Map<UUID, Col> formulas = new HashMap<>();
        for (Col column : columns) {
            if (column.kind() == ColumnKind.FORMULA) {
                formulas.put(column.id(), column);
            }
        }
        List<Col> order = new ArrayList<>();
        Set<UUID> done = new java.util.HashSet<>();
        boolean moved = true;
        while (moved) {
            moved = false;
            for (Col column : columns) {
                if (!formulas.containsKey(column.id()) || done.contains(column.id())) {
                    continue;
                }
                boolean ready = column.formula() == null
                        || Formula.columns(column.formula()).stream()
                                .allMatch(used -> !formulas.containsKey(used) || done.contains(used));
                if (ready) {
                    order.add(column);
                    done.add(column.id());
                    moved = true;
                }
            }
        }
        return order;
    }

    /**
     * The names of formula columns that need each other in a circle, in the order they lead round ("Total",
     * "Share", "Total"), or an empty list when there is none.
     */
    public static List<String> loop(List<Col> columns) {
        Map<UUID, Col> formulas = new HashMap<>();
        for (Col column : columns) {
            if (column.kind() == ColumnKind.FORMULA && column.formula() != null) {
                formulas.put(column.id(), column);
            }
        }
        Set<UUID> safe = new java.util.HashSet<>();
        for (Col start : columns) {
            List<UUID> path = new ArrayList<>();
            if (formulas.containsKey(start.id()) && roundFrom(start.id(), formulas, safe, path)) {
                List<String> names = new ArrayList<>();
                for (UUID id : path.subList(path.indexOf(path.get(path.size() - 1)), path.size())) {
                    names.add(formulas.get(id).name());
                }
                return names;
            }
        }
        return List.of();
    }

    private static boolean roundFrom(UUID id, Map<UUID, Col> formulas, Set<UUID> safe, List<UUID> path) {
        if (path.contains(id)) {
            path.add(id);
            return true;
        }
        if (safe.contains(id)) {
            return false;
        }
        path.add(id);
        for (UUID used : Formula.columns(formulas.get(id).formula())) {
            if (formulas.containsKey(used) && roundFrom(used, formulas, safe, path)) {
                return true;
            }
        }
        path.remove(path.size() - 1);
        safe.add(id);
        return false;
    }

    // ---------- working a column out ----------

    private void workOut(Col column) {
        int c = index.get(column.id());
        Set<UUID> read = column.formula() == null ? Set.of() : Formula.columnsOfTheRow(column.formula());
        for (int r = 0; r < cells.length; r++) {
            if (column.formula() == null) {
                cells[r][c] =
                        new Problem(column.problem() == null ? "This column has no formula yet" : column.problem());
                continue;
            }
            int row = r;
            Value value = asMoney(value(column.formula(), r), column.formula());
            // A row with nothing in the cells the formula reads has nothing to complain about yet.
            boolean nothingToGoOn = !read.isEmpty() && read.stream().allMatch(used -> cell(row, used) instanceof Empty);
            if (value instanceof Problem && nothingToGoOn) {
                value = Value.NOTHING;
            }
            cells[r][c] = value instanceof Empty ? new Empty(column.name()) : value;
        }
    }

    /**
     * In a formula about money, a plain number is an amount: IF([Paid], 0, [Cost]) gives €0 for a paid row, not
     * a bare 0 next to the other rows' euros.
     */
    private Value asMoney(Value value, Node formula) {
        return value instanceof Num num && !num.money() && moneyish(formula, 0) ? new Num(num.amount(), true) : value;
    }

    /** What a formula works out to for one row, or for the whole tab when {@code row} is -1. */
    private Value value(Node node, int row) {
        return switch (node) {
            case Node.Number number -> new Num(number.value(), number.money());
            case Node.Words words -> new Text(words.text());
            case Node.Yes yes -> new Tick(yes.on());
            case Node.Gone gone -> new Problem("This uses a column that was removed");
            case Node.Column column -> inRow(column.id(), row);
            case Node.Negate negate -> {
                Value of = value(negate.of(), row);
                yield of instanceof Num num ? new Num(num.amount().negate(), num.money()) : notANumber(of, negate.of());
            }
            case Node.Op op -> op(op, row);
            case Node.Call call -> call.total() ? overEveryRow(call) : call(call, row);
        };
    }

    private Value inRow(UUID column, int row) {
        Integer c = index.get(column);
        if (c == null) {
            return new Problem("This uses a column that was removed");
        }
        if (row < 0) {
            return new Problem(name(column) + " is a whole column: wrap it in SUM, AVERAGE, COUNT, MIN or MAX");
        }
        // A formula column that hasn't been worked out by now can only be waiting for itself.
        return cells[row][c] == null ? new Problem(CIRCLE) : cells[row][c];
    }

    private String name(UUID column) {
        Integer c = index.get(column);
        return c == null ? "A column" : columns.get(c).name();
    }

    /** What to call a part of a formula in a sentence: the column's name, or "that part". */
    private String called(Node node) {
        return node instanceof Node.Column column ? name(column.id()) : "PartResponse of this";
    }

    private Problem notANumber(Value value, Node node) {
        return switch (value) {
            case Problem problem -> problem;
            case Empty empty -> new Problem((empty.column().isEmpty() ? called(node) : empty.column()) + " is empty");
            case Text text -> new Problem(called(node) + " holds words, not a number");
            case Tick tick -> new Problem(called(node) + " is a tick, not a number");
            case People people -> new Problem(called(node) + " holds people, not a number");
            case Day day -> new Problem(called(node) + " is a date, not a number");
            case Num num -> new Problem(called(node) + " can't be used here");
        };
    }

    // ---------- signs ----------

    private Value op(Node.Op op, int row) {
        Value left = value(op.left(), row);
        Value right = value(op.right(), row);
        if (left instanceof Problem) {
            return left;
        }
        if (right instanceof Problem) {
            return right;
        }
        return switch (op.sign()) {
            case JOIN -> new Text(words(left) + words(right));
            case EQ -> new Tick(same(left, right));
            case NE -> new Tick(!same(left, right));
            case LT, LE, GT, GE -> compared(op, left, right);
            case ADD, SUB, MUL, DIV -> sum(op, left, right);
        };
    }

    private Value sum(Node.Op op, Value left, Value right) {
        Sign sign = op.sign();
        if (left instanceof Day a && right instanceof Day b && sign == Sign.SUB) {
            return Value.number(ChronoUnit.DAYS.between(b.date(), a.date()));
        }
        if (left instanceof Day day && right instanceof Num days && (sign == Sign.ADD || sign == Sign.SUB)) {
            long whole = days.amount().setScale(0, RoundingMode.HALF_UP).longValue();
            return new Day(day.date().plusDays(sign == Sign.ADD ? whole : -whole));
        }
        if (left instanceof Day || right instanceof Day) {
            return new Problem("A date can be moved by a number of days, or taken away from another date");
        }
        if (!(left instanceof Num a)) {
            return notANumber(left, op.left());
        }
        if (!(right instanceof Num b)) {
            return notANumber(right, op.right());
        }
        return switch (sign) {
            case ADD -> new Num(a.amount().add(b.amount()), a.money() || b.money());
            case SUB -> new Num(a.amount().subtract(b.amount()), a.money() || b.money());
            case MUL -> new Num(a.amount().multiply(b.amount()), a.money() || b.money());
            default ->
                b.amount().signum() == 0
                        ? new Problem(called(op.right()) + " is 0, and nothing can be divided by 0")
                        // Money divided by money is how many times one goes into the other: a plain number.
                        : new Num(a.amount().divide(b.amount(), DIVIDING), a.money() && !b.money());
        };
    }

    /** Whether two values are the same. An empty cell is the same as nothing but another empty cell; "Alex" is the same as a person cell that holds Alex. */
    private static boolean same(Value left, Value right) {
        if (left instanceof Empty || right instanceof Empty) {
            boolean leftBlank = left instanceof Empty
                    || (left instanceof Text text && text.text().isBlank());
            boolean rightBlank = right instanceof Empty
                    || (right instanceof Text text && text.text().isBlank());
            return leftBlank && rightBlank;
        }
        if (left instanceof Num a && right instanceof Num b) {
            return a.amount().compareTo(b.amount()) == 0;
        }
        if (left instanceof Text a && right instanceof Text b) {
            return a.text().strip().equalsIgnoreCase(b.text().strip());
        }
        if (left instanceof Tick a && right instanceof Tick b) {
            return a.on() == b.on();
        }
        if (left instanceof Day a && right instanceof Day b) {
            return a.date().equals(b.date());
        }
        if (left instanceof People people && right instanceof Text name) {
            return people.names().stream()
                    .anyMatch(n -> n.equalsIgnoreCase(name.text().strip()));
        }
        if (left instanceof Text && right instanceof People) {
            return same(right, left);
        }
        if (left instanceof People a && right instanceof People b) {
            return Set.copyOf(a.ids()).equals(Set.copyOf(b.ids()));
        }
        return false;
    }

    private Value compared(Node.Op op, Value left, Value right) {
        int order;
        if (left instanceof Num a && right instanceof Num b) {
            order = a.amount().compareTo(b.amount());
        } else if (left instanceof Day a && right instanceof Day b) {
            order = a.date().compareTo(b.date());
        } else if (left instanceof Text a && right instanceof Text b) {
            order = a.text().strip().compareToIgnoreCase(b.text().strip());
        } else if (left instanceof Empty empty) {
            return new Problem((empty.column().isEmpty() ? called(op.left()) : empty.column()) + " is empty");
        } else if (right instanceof Empty empty) {
            return new Problem((empty.column().isEmpty() ? called(op.right()) : empty.column()) + " is empty");
        } else {
            return new Problem(called(op.left()) + " and " + lower(called(op.right()))
                    + " can't be compared: they aren't the same kind of thing");
        }
        return new Tick(
                switch (op.sign()) {
                    case LT -> order < 0;
                    case LE -> order <= 0;
                    case GT -> order > 0;
                    default -> order >= 0;
                });
    }

    private static String lower(String phrase) {
        return phrase.equals("PartResponse of this") ? "the other part" : phrase;
    }

    /** A value as words, for joining text. */
    static String words(Value value) {
        return switch (value) {
            case Text text -> text.text();
            case Num num ->
                num.money() ? num.amount().setScale(2, RoundingMode.HALF_UP).toPlainString() : plain(num.amount());
            case Tick tick -> tick.on() ? "yes" : "no";
            case Day day -> DAY_IN_WORDS.format(day.date());
            case People people -> String.join(", ", people.names());
            case Empty empty -> "";
            case Problem problem -> "";
        };
    }

    /** A number without a tail of zeros, and never in the "1E+3" form. */
    static String plain(BigDecimal number) {
        BigDecimal tidy = number.setScale(Math.min(Math.max(number.scale(), 0), 6), RoundingMode.HALF_UP)
                .stripTrailingZeros();
        return (tidy.scale() < 0 ? tidy.setScale(0) : tidy).toPlainString();
    }

    // ---------- functions for one row ----------

    private Value call(Node.Call call, int row) {
        List<Node> args = call.args();
        switch (call.fn()) {
            case IF: {
                Value asked = value(args.get(0), row);
                if (asked instanceof Problem) {
                    return asked;
                }
                if (asked instanceof Empty) {
                    return notANumber(asked, args.get(0));
                }
                if (!(asked instanceof Tick answer)) {
                    return new Problem("IF starts with a question that is yes or no, like [Paid] or [Cost] > 100");
                }
                return value(args.get(answer.on() ? 1 : 2), row);
            }
            case AND:
            case OR: {
                boolean all = call.fn() == Fn.AND;
                for (Node arg : args) {
                    Value value = value(arg, row);
                    if (value instanceof Problem) {
                        return value;
                    }
                    if (!(value instanceof Tick answer)) {
                        return value instanceof Empty
                                ? notANumber(value, arg)
                                : new Problem(
                                        call.fn().name() + " needs yes-or-no answers, like [Paid] or [Cost] > 100");
                    }
                    if (answer.on() != all) {
                        return new Tick(!all);
                    }
                }
                return new Tick(all);
            }
            case NOT: {
                Value value = value(args.get(0), row);
                if (value instanceof Tick answer) {
                    return new Tick(!answer.on());
                }
                return value instanceof Problem || value instanceof Empty
                        ? notANumber(value, args.get(0))
                        : new Problem("NOT needs a yes-or-no answer, like [Paid] or [Cost] > 100");
            }
            case ISEMPTY: {
                Value value = value(args.get(0), row);
                return value instanceof Problem
                        ? value
                        : new Tick(value instanceof Empty
                                || (value instanceof Text text && text.text().isBlank()));
            }
            case TODAY:
                return new Day(today);
            case JOIN: {
                StringBuilder joined = new StringBuilder();
                for (Node arg : args) {
                    Value value = value(arg, row);
                    if (value instanceof Problem) {
                        return value;
                    }
                    joined.append(words(value));
                }
                return new Text(joined.toString());
            }
            case DAYS: {
                Value later = value(args.get(0), row);
                Value earlier = value(args.get(1), row);
                if (later instanceof Day a && earlier instanceof Day b) {
                    return Value.number(ChronoUnit.DAYS.between(b.date(), a.date()));
                }
                for (int i = 0; i < 2; i++) {
                    Value value = i == 0 ? later : earlier;
                    if (value instanceof Problem || value instanceof Empty) {
                        return notANumber(value, args.get(i));
                    }
                }
                return new Problem("DAYS needs two dates, the later one first");
            }
            case ROUND: {
                Value value = value(args.get(0), row);
                if (!(value instanceof Num num)) {
                    return notANumber(value, args.get(0));
                }
                int decimals = 0;
                if (args.size() == 2) {
                    Value places = value(args.get(1), row);
                    if (!(places instanceof Num wanted)) {
                        return notANumber(places, args.get(1));
                    }
                    decimals = wanted.amount().setScale(0, RoundingMode.HALF_UP).intValue();
                    if (decimals < -9 || decimals > 9) {
                        return new Problem("ROUND keeps between 0 and 9 decimals");
                    }
                }
                return new Num(num.amount().setScale(decimals, RoundingMode.HALF_UP), num.money());
            }
            case ABS: {
                Value value = value(args.get(0), row);
                return value instanceof Num num
                        ? new Num(num.amount().abs(), num.money())
                        : notANumber(value, args.get(0));
            }
            case MIN:
            case MAX: {
                Value best = null;
                for (Node arg : args) {
                    Value value = value(arg, row);
                    if (!(value instanceof Num) && !(value instanceof Day)) {
                        return notANumber(value, arg);
                    }
                    Value kept = best == null ? value : pick(call.fn() == Fn.MIN, best, value);
                    if (kept == null) {
                        return new Problem(call.fn().name() + " needs numbers, or dates, but not both");
                    }
                    best = kept;
                }
                return best;
            }
            case PAYMENT: {
                Value borrowed = value(args.get(0), row);
                Value rate = value(args.get(1), row);
                Value years = value(args.get(2), row);
                for (int i = 0; i < 3; i++) {
                    Value value = i == 0 ? borrowed : i == 1 ? rate : years;
                    if (!(value instanceof Num)) {
                        return notANumber(value, args.get(i));
                    }
                }
                try {
                    long cents = ((Num) borrowed)
                            .amount()
                            .movePointRight(2)
                            .setScale(0, RoundingMode.HALF_UP)
                            .longValueExact();
                    int months = ((Num) years)
                            .amount()
                            .multiply(BigDecimal.valueOf(12))
                            .setScale(0, RoundingMode.HALF_UP)
                            .intValueExact();
                    return Value.money(LoanPlan.payment(cents, ((Num) rate).amount(), months));
                } catch (ArithmeticException | IllegalArgumentException outOfRange) {
                    return new Problem("PAYMENT needs an amount, a yearly rate like 3.4, and up to 50 years");
                }
            }
            default:
                return new Problem(call.fn().name() + " can't be used here");
        }
    }

    /** The smaller or the larger of two numbers or two dates; null when they aren't the same kind. */
    private static Value pick(boolean smaller, Value a, Value b) {
        int order;
        if (a instanceof Num x && b instanceof Num y) {
            order = x.amount().compareTo(y.amount());
        } else if (a instanceof Day x && b instanceof Day y) {
            order = x.date().compareTo(y.date());
        } else {
            return null;
        }
        return (order <= 0) == smaller ? a : b;
    }

    // ---------- totals over every row ----------

    /** One answer from every row. Worked out once per formula, however many rows ask for it. */
    private Value overEveryRow(Node.Call call) {
        Value known = totals.get(call);
        if (known == null) {
            known = overRows(call);
            totals.put(call, known);
        }
        return known;
    }

    private Value overRows(Node.Call call) {
        Fn fn = call.fn();
        List<Node> args = call.args();
        if (fn == Fn.COUNT && args.isEmpty()) {
            return Value.number(cells.length);
        }
        boolean hasQuestion = fn == Fn.SUMIF || fn == Fn.AVGIF || fn == Fn.COUNTIF;
        Node question = hasQuestion ? args.get(0) : null;
        Node counted = fn == Fn.COUNTIF ? null : args.get(hasQuestion ? 1 : 0);
        BigDecimal sum = BigDecimal.ZERO;
        boolean money = counted != null && moneyish(counted, 0);
        int count = 0;
        Value best = null;
        for (int row = 0; row < cells.length; row++) {
            if (question != null) {
                Value asked = value(question, row);
                if (asked instanceof Problem problem) {
                    leaveOut(problem);
                    continue;
                }
                if (asked instanceof Empty) {
                    continue;
                }
                if (!(asked instanceof Tick answer)) {
                    return new Problem(
                            fn.name() + " needs a yes-or-no answer for each row, like [Paid] or [Cost] > 100");
                }
                if (!answer.on()) {
                    continue;
                }
            }
            if (counted == null) {
                count++;
                continue;
            }
            Value value = value(counted, row);
            if (value instanceof Problem problem) {
                leaveOut(problem);
                continue;
            }
            if (value instanceof Empty
                    || (value instanceof Text text && text.text().isBlank())) {
                continue;
            }
            count++;
            switch (fn) {
                case COUNT -> {}
                case MIN, MAX -> {
                    if (!(value instanceof Num) && !(value instanceof Day)) {
                        return new Problem(fn.name() + " looks for the smallest or largest number or date, and "
                                + lowerCalled(counted) + " holds something else");
                    }
                    Value kept = best == null ? value : pick(fn == Fn.MIN, best, value);
                    if (kept == null) {
                        return new Problem(fn.name() + " needs numbers, or dates, but not both");
                    }
                    best = kept;
                }
                default -> {
                    if (!(value instanceof Num num)) {
                        return new Problem((fn == Fn.AVG || fn == Fn.AVGIF ? "An average is" : "A sum is")
                                + " made of numbers, and " + lowerCalled(counted) + " holds something else");
                    }
                    sum = sum.add(num.amount());
                    money = money || num.money();
                }
            }
        }
        return switch (fn) {
            case COUNT, COUNTIF -> Value.number(count);
            case MIN, MAX -> best == null ? Value.NOTHING : best;
            case AVG, AVGIF ->
                count == 0 ? Value.NOTHING : new Num(sum.divide(BigDecimal.valueOf(count), DIVIDING), money);
            default -> new Num(sum, money);
        };
    }

    private String lowerCalled(Node node) {
        return node instanceof Node.Column column ? name(column.id()) : "part of it";
    }

    private void leaveOut(Problem problem) {
        leftOut++;
        if (why == null) {
            why = problem.says();
        }
    }

    /** Whether a part of a formula is money by the look of it, so that the sum of no rows at all is "€0" and not "0". */
    private boolean moneyish(Node node, int depth) {
        if (depth > 20) {
            return false;
        }
        return switch (node) {
            case Node.Number number -> number.money();
            case Node.Column column -> {
                Integer c = index.get(column.id());
                Col col = c == null ? null : columns.get(c);
                yield col != null
                        && (col.kind() == ColumnKind.MONEY
                                || (col.kind() == ColumnKind.FORMULA
                                        && col.formula() != null
                                        && moneyish(col.formula(), depth + 1)));
            }
            case Node.Negate negate -> moneyish(negate.of(), depth + 1);
            case Node.Op op ->
                switch (op.sign()) {
                    case ADD, SUB, MUL -> moneyish(op.left(), depth + 1) || moneyish(op.right(), depth + 1);
                    case DIV -> moneyish(op.left(), depth + 1) && !moneyish(op.right(), depth + 1);
                    default -> false;
                };
            case Node.Call call ->
                switch (call.fn()) {
                    case PAYMENT -> true;
                    case IF ->
                        moneyish(call.args().get(1), depth + 1)
                                || moneyish(call.args().get(2), depth + 1);
                    case SUMIF, AVGIF -> moneyish(call.args().get(1), depth + 1);
                    case SUM, AVG, MIN, MAX, ROUND, ABS ->
                        call.args().stream().anyMatch(arg -> moneyish(arg, depth + 1));
                    default -> false;
                };
            default -> false;
        };
    }
}
