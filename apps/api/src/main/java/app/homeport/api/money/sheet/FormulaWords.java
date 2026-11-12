package app.homeport.api.money.sheet;

import app.homeport.api.money.sheet.Formula.Columns;
import app.homeport.api.money.sheet.Node.Sign;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * A formula you can read: the same formula as chips for the app to draw (a function, a column, a sign), and
 * as one sentence. {@code SUM([Cost]) - SUMIF([Paid], [Cost])} is the chips SUM · Cost · − · SUM IF · Paid ·
 * is ticked · Cost, and the sentence "Everything in Cost, minus the Cost of rows where Paid is ticked."
 */
public final class FormulaWords {

    private FormulaWords() {}

    /** One chip. */
    public record PartResponse(
            PartKind kind,
            String text,

            @Schema(nullable = true, description = "For a column chip: which column")
            UUID columnId) {}

    // ---------- chips ----------

    public static List<PartResponse> parts(Node node, Columns columns) {
        List<PartResponse> parts = new ArrayList<>();
        parts(node, columns, 0, false, parts);
        return parts;
    }

    private static void parts(Node node, Columns columns, int around, boolean asQuestion, List<PartResponse> out) {
        switch (node) {
            case Node.Number number -> out.add(new PartResponse(PartKind.NUMBER, written(number), null));
            case Node.Words words -> out.add(new PartResponse(PartKind.TEXT, "“" + words.text() + "”", null));
            case Node.Yes yes -> out.add(new PartResponse(PartKind.WORDS, yes.on() ? "yes" : "no", null));
            case Node.Gone gone -> out.add(new PartResponse(PartKind.WORDS, "a column that was removed", null));
            case Node.Column column -> {
                out.add(new PartResponse(PartKind.COLUMN, name(column, columns), column.id()));
                if (asQuestion && isTick(column, columns)) {
                    out.add(new PartResponse(PartKind.WORDS, "is ticked", null));
                }
            }
            case Node.Negate negate -> {
                out.add(new PartResponse(PartKind.SIGN, Sign.SUB.shown(), null));
                parts(negate.of(), columns, 9, false, out);
            }
            case Node.Op op -> {
                boolean brackets = op.sign().binds() < around;
                if (brackets) {
                    out.add(new PartResponse(PartKind.BRACKET, "(", null));
                }
                parts(op.left(), columns, op.sign().binds(), false, out);
                out.add(new PartResponse(PartKind.SIGN, op.sign().shown(), null));
                parts(op.right(), columns, op.sign().binds() + 1, false, out);
                if (brackets) {
                    out.add(new PartResponse(PartKind.BRACKET, ")", null));
                }
            }
            case Node.Call call -> call(call, columns, around, out);
        }
    }

    private static void call(Node.Call call, Columns columns, int around, List<PartResponse> out) {
        Fn fn = call.fn();
        List<Node> args = call.args();
        if (fn == Fn.NOT && args.get(0) instanceof Node.Column column && isTick(column, columns)) {
            out.add(new PartResponse(PartKind.COLUMN, name(column, columns), column.id()));
            out.add(new PartResponse(PartKind.WORDS, "is not ticked", null));
            return;
        }
        if ((fn == Fn.AND || fn == Fn.OR) && args.size() > 1) {
            // "and" and "or" stand between their parts, in brackets when they are inside something else.
            if (around > 0) {
                out.add(new PartResponse(PartKind.BRACKET, "(", null));
            }
            for (int i = 0; i < args.size(); i++) {
                if (i > 0) {
                    out.add(new PartResponse(PartKind.WORDS, fn == Fn.AND ? "and" : "or", null));
                }
                parts(args.get(i), columns, 1, true, out);
            }
            if (around > 0) {
                out.add(new PartResponse(PartKind.BRACKET, ")", null));
            }
            return;
        }
        out.add(new PartResponse(PartKind.FUNCTION, fn.label(), null));
        if (fn == Fn.COUNT && args.isEmpty()) {
            out.add(new PartResponse(PartKind.WORDS, "rows", null));
            return;
        }
        // SUM · Cost reads well without brackets; anything with sums inside it keeps them.
        boolean plain = args.stream().allMatch(arg -> simple(arg, columns));
        if (!plain) {
            out.add(new PartResponse(PartKind.BRACKET, "(", null));
        }
        for (int i = 0; i < args.size(); i++) {
            if (i > 0 && !plain) {
                out.add(new PartResponse(PartKind.SIGN, ",", null));
            }
            parts(args.get(i), columns, 0, asksAQuestion(fn, i), out);
        }
        if (!plain) {
            out.add(new PartResponse(PartKind.BRACKET, ")", null));
        }
    }

    private static boolean simple(Node node, Columns columns) {
        return node instanceof Node.Column
                || node instanceof Node.Number
                || node instanceof Node.Words
                || node instanceof Node.Yes
                || (node instanceof Node.Call call
                        && call.fn() == Fn.NOT
                        && call.args().get(0) instanceof Node.Column column
                        && isTick(column, columns));
    }

    /** True where a function expects yes or no: the first thing in IF, SUMIF, COUNTIF and AVGIF, and everything in AND, OR and NOT. */
    private static boolean asksAQuestion(Fn fn, int place) {
        return switch (fn) {
            case IF, SUMIF, COUNTIF, AVGIF -> place == 0;
            case AND, OR, NOT -> true;
            default -> false;
        };
    }

    private static boolean isTick(Node.Column column, Columns columns) {
        return columns.kind(column.id()).orElse(null) == ColumnKind.TICK;
    }

    private static String name(Node.Column column, Columns columns) {
        return columns.name(column.id()).orElse("a column that was removed");
    }

    private static String written(Node.Number number) {
        return (number.value().signum() < 0 ? "−" : "")
                + number.sign()
                + Calc.plain(number.value().abs());
    }

    // ---------- the sentence ----------

    /** The formula as one sentence, starting with a capital and ending with a full stop. */
    public static String sentence(Node node, Columns columns) {
        String said = say(node, columns, false);
        return Character.toUpperCase(said.charAt(0)) + said.substring(1) + ".";
    }

    private static String say(Node node, Columns columns, boolean asQuestion) {
        return switch (node) {
            case Node.Number number -> written(number);
            case Node.Words words -> "“" + words.text() + "”";
            case Node.Yes yes -> yes.on() ? "yes" : "no";
            case Node.Gone gone -> "a column that was removed";
            case Node.Column column ->
                name(column, columns) + (asQuestion && isTick(column, columns) ? " is ticked" : "");
            case Node.Negate negate -> "minus " + say(negate.of(), columns, false);
            case Node.Op op -> {
                String left = say(op.left(), columns, false);
                String right = say(op.right(), columns, false);
                boolean long_ = isTotal(op.left()) || isTotal(op.right());
                yield switch (op.sign()) {
                    case ADD -> left + (long_ ? ", plus " : " plus ") + right;
                    case SUB -> left + (long_ ? ", minus " : " minus ") + right;
                    case MUL -> left + " times " + right;
                    case DIV -> left + (long_ ? ", divided by " : " divided by ") + right;
                    case JOIN -> left + " followed by " + right;
                    case EQ -> left + " is " + right;
                    case NE -> left + " is not " + right;
                    case LT -> left + " is less than " + right;
                    case LE -> left + " is at most " + right;
                    case GT -> left + " is more than " + right;
                    case GE -> left + " is at least " + right;
                };
            }
            case Node.Call call -> sayCall(call, columns);
        };
    }

    private static boolean isTotal(Node node) {
        return node instanceof Node.Call call && call.total();
    }

    private static String sayCall(Node.Call call, Columns columns) {
        List<Node> args = call.args();
        // "Cost" for a bare column, the whole phrase otherwise.
        String first = args.isEmpty() ? "" : say(args.get(0), columns, asksAQuestion(call.fn(), 0));
        String second = args.size() < 2 ? "" : say(args.get(1), columns, false);
        boolean column = !args.isEmpty() && args.get(args.size() - 1) instanceof Node.Column;
        return switch (call.fn()) {
            case SUM -> column ? "everything in " + first : "the total of " + first + " over every row";
            case SUMIF ->
                column
                        ? "the " + second + " of rows where " + first
                        : "the total of " + second + " over the rows where " + first;
            case AVG -> "the average of " + first;
            case AVGIF -> "the average " + second + " of rows where " + first;
            case COUNT -> args.isEmpty() ? "the number of rows" : "the number of rows that have " + first;
            case COUNTIF -> "the number of rows where " + first;
            case MIN ->
                args.size() == 1 ? "the smallest " + first : "the smallest of " + list(args, columns, false, "and");
            case MAX ->
                args.size() == 1 ? "the largest " + first : "the largest of " + list(args, columns, false, "and");
            case IF -> second + " if " + first + ", otherwise " + say(args.get(2), columns, false);
            case ROUND ->
                args.size() == 1 || second.equals("0")
                        ? first + ", rounded to a whole number"
                        : first + ", rounded to " + second + (second.equals("1") ? " decimal" : " decimals");
            case ABS -> first + " without its sign";
            case AND -> list(args, columns, true, "and");
            case OR -> list(args, columns, true, "or");
            case NOT ->
                args.get(0) instanceof Node.Column tick && isTick(tick, columns)
                        ? name(tick, columns) + " is not ticked"
                        : "it is not so that " + first;
            case DAYS -> "the days from " + second + " to " + first;
            case TODAY -> "today";
            case JOIN -> list(args, columns, false, "followed by");
            case ISEMPTY -> first + " is empty";
            case PAYMENT ->
                "the monthly payment on " + first + " at " + second + "% a year over "
                        + say(args.get(2), columns, false) + " years";
        };
    }

    private static String list(List<Node> args, Columns columns, boolean asQuestions, String last) {
        List<String> said =
                args.stream().map(arg -> say(arg, columns, asQuestions)).collect(Collectors.toList());
        if (said.size() == 1) {
            return said.get(0);
        }
        return String.join(", ", said.subList(0, said.size() - 1)) + " " + last + " " + said.get(said.size() - 1);
    }

    // ---------- the row of totals ----------

    /** The formula behind what stands under a column: SUM([Cost]) for a sum. Null for nothing. */
    public static Node summary(Summary summary, UUID column) {
        Node of = new Node.Column(column);
        return switch (summary) {
            case NONE -> null;
            case SUM -> new Node.Call(Fn.SUM, List.of(of));
            case AVG -> new Node.Call(Fn.AVG, List.of(of));
            case COUNT -> new Node.Call(Fn.COUNT, List.of(of));
            case MIN -> new Node.Call(Fn.MIN, List.of(of));
            case MAX -> new Node.Call(Fn.MAX, List.of(of));
            case TICKED -> new Node.Call(Fn.COUNTIF, List.of(of));
        };
    }

    /** What the bar under the grid says about a total: "Adds up every row in Cost." */
    public static String summarySays(Summary summary, String column) {
        return switch (summary) {
            case NONE -> "";
            case SUM -> "Adds up every row in " + column + ".";
            case AVG -> "The average of every row in " + column + ".";
            case COUNT -> "Counts the rows that have " + column + ".";
            case MIN -> "The smallest " + column + ".";
            case MAX -> "The largest " + column + ".";
            case TICKED -> "Counts the rows where " + column + " is ticked.";
        };
    }
}
