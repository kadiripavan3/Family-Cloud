package app.homeport.api.money.sheet;

import app.homeport.api.money.sheet.Node.Sign;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Reads a formula as a person writes it and turns it into a {@link Node} tree, and writes a tree back as
 * text. Written by hand, with no library.
 *
 * <p>What a formula is made of:
 *
 * <ul>
 *   <li>columns by name, in square brackets: {@code [Price]}
 *   <li>numbers ({@code 12}, {@code 0.5}, {@code 5%}), money ({@code €250}), words in quotes ({@code "Alex"}),
 *       TRUE and FALSE
 *   <li>{@code + - * /}, {@code &} to join text, and the comparisons {@code = <> < <= > >=}
 *   <li>AND, OR and NOT, between things ({@code [Paid] AND [Cost] > 100}) or as functions ({@code AND(a, b)})
 *   <li>the functions in {@link Fn}: IF, ROUND, MIN, MAX, ABS, DAYS, TODAY, JOIN, ISEMPTY, PAYMENT, and the ones
 *       that look at every row: SUM, AVERAGE, COUNT, SUMIF, COUNTIF, AVGIF
 * </ul>
 *
 * A formula is kept in the database with column ids in place of names ({@code [#3f2a…]}), so a renamed column
 * keeps working; {@link #keep} writes that form and {@link #read} reads both.
 */
public final class Formula {

    static final int MAX_LENGTH = 1000;
    private static final int MAX_DEPTH = 40;

    private Formula() {}

    /** The columns a formula may name. */
    public interface Columns {

        /** The id of the column with this name, compared without minding capitals. Empty when there is none. */
        Optional<UUID> id(String name);

        /** The name of the column with this id. Empty when it has been removed. */
        Optional<String> name(UUID id);

        /** The kind of the column with this id. */
        Optional<ColumnKind> kind(UUID id);

        /** Every column's name, in their order. */
        List<String> names();
    }

    // ---------- reading ----------

    private enum Kind {
        NUMBER,
        WORDS,
        COLUMN,
        NAME,
        SIGN,
        OPEN,
        CLOSE,
        COMMA,
        END
    }

    private record Token(Kind kind, String text, String sign) {}

    /**
     * Reads a formula.
     *
     * @throws FormulaProblem with a sentence for the person, when it can't be read
     */
    public static Node read(String text, Columns columns) {
        if (text == null || text.isBlank()) {
            throw new FormulaProblem("Write a formula first, like [Price] * [Qty].");
        }
        if (text.length() > MAX_LENGTH) {
            throw new FormulaProblem("That formula is too long. Keep it to 1,000 characters.");
        }
        String trimmed = text.strip();
        Reader reader = new Reader(tokens(trimmed.startsWith("=") ? trimmed.substring(1) : trimmed), columns);
        Node node = reader.either(0);
        if (reader.peek().kind() != Kind.END) {
            throw new FormulaProblem(
                    reader.peek().kind() == Kind.CLOSE
                            ? "There is a closing bracket too many."
                            : "I didn't expect \"" + reader.peek().text()
                                    + "\" there. Is a sign like + or * missing before it?");
        }
        return node;
    }

    private static List<Token> tokens(String text) {
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (Character.isWhitespace(c) || c == ' ') {
                i++;
            } else if (c == '[') {
                int close = text.indexOf(']', i);
                if (close < 0) {
                    throw new FormulaProblem(
                            "A column name was opened with [ and never closed. Write it like [Price].");
                }
                tokens.add(new Token(Kind.COLUMN, text.substring(i + 1, close).strip(), ""));
                i = close + 1;
            } else if (c == '"' || c == '“' || c == '”') {
                StringBuilder words = new StringBuilder();
                int j = i + 1;
                while (true) {
                    if (j >= text.length()) {
                        throw new FormulaProblem("Some words were opened with a quote and never closed.");
                    }
                    char d = text.charAt(j);
                    if (d == '"' || d == '“' || d == '”') {
                        if (d == '"' && j + 1 < text.length() && text.charAt(j + 1) == '"') {
                            words.append('"');
                            j += 2;
                            continue;
                        }
                        break;
                    }
                    words.append(d);
                    j++;
                }
                tokens.add(new Token(Kind.WORDS, words.toString(), ""));
                i = j + 1;
            } else if (Character.isDigit(c) || ((c == '€' || c == '$' || c == '£') && digitAt(text, i + 1))) {
                String sign = Character.isDigit(c) ? "" : String.valueOf(c);
                int j = sign.isEmpty() ? i : i + 1;
                int start = j;
                while (j < text.length() && Character.isDigit(text.charAt(j))) {
                    j++;
                }
                if (j < text.length() && text.charAt(j) == '.' && digitAt(text, j + 1)) {
                    j++;
                    while (j < text.length() && Character.isDigit(text.charAt(j))) {
                        j++;
                    }
                }
                String digits = text.substring(start, j);
                if (j < text.length() && text.charAt(j) == '%') {
                    digits = new BigDecimal(digits).movePointLeft(2).toPlainString();
                    j++;
                } else if (sign.isEmpty() && j < text.length() && text.charAt(j) == '€') {
                    sign = "€";
                    j++;
                }
                tokens.add(new Token(Kind.NUMBER, digits, sign));
                i = j;
            } else if (Character.isLetter(c) || c == '_') {
                int j = i;
                while (j < text.length() && (Character.isLetterOrDigit(text.charAt(j)) || text.charAt(j) == '_')) {
                    j++;
                }
                tokens.add(new Token(Kind.NAME, text.substring(i, j), ""));
                i = j;
            } else if (c == '(') {
                tokens.add(new Token(Kind.OPEN, "(", ""));
                i++;
            } else if (c == ')') {
                tokens.add(new Token(Kind.CLOSE, ")", ""));
                i++;
            } else if (c == ',' || c == ';') {
                tokens.add(new Token(Kind.COMMA, ",", ""));
                i++;
            } else {
                String two = i + 1 < text.length() ? text.substring(i, i + 2) : "";
                String sign = switch (two) {
                    case "<>", "!=" -> "<>";
                    case "<=", "=<" -> "<=";
                    case ">=", "=>" -> ">=";
                    case "==" -> "=";
                    default -> null;
                };
                if (sign != null) {
                    i += 2;
                } else {
                    sign = switch (c) {
                        case '+' -> "+";
                        case '-', '−', '–' -> "-";
                        case '*', '×', '·' -> "*";
                        case '/', '÷' -> "/";
                        case '&' -> "&";
                        case '=' -> "=";
                        case '≠' -> "<>";
                        case '<' -> "<";
                        case '≤' -> "<=";
                        case '>' -> ">";
                        case '≥' -> ">=";
                        default -> throw new FormulaProblem("I can't read \"" + c + "\" in a formula.");
                    };
                    i++;
                }
                tokens.add(new Token(Kind.SIGN, sign, ""));
            }
        }
        tokens.add(new Token(Kind.END, "the end", ""));
        return tokens;
    }

    private static boolean digitAt(String text, int at) {
        return at < text.length() && Character.isDigit(text.charAt(at));
    }

    /** Reads the tokens from the loosest sign to the tightest: OR, AND, comparisons, &, + and -, * and /. */
    private static final class Reader {

        private final List<Token> tokens;
        private final Columns columns;
        private int at;

        Reader(List<Token> tokens, Columns columns) {
            this.tokens = tokens;
            this.columns = columns;
        }

        Token peek() {
            return tokens.get(at);
        }

        private Token take() {
            return tokens.get(at++);
        }

        private boolean word(String word) {
            return peek().kind() == Kind.NAME && peek().text().equalsIgnoreCase(word);
        }

        private Node either(int depth) {
            Node left = both(depth);
            while (word("OR")) {
                take();
                left = new Node.Call(Fn.OR, List.of(left, both(depth)));
            }
            return left;
        }

        private Node both(int depth) {
            Node left = negated(depth);
            while (word("AND")) {
                take();
                left = new Node.Call(Fn.AND, List.of(left, negated(depth)));
            }
            return left;
        }

        /** NOT in front of a question takes all of it: NOT [Cost] > 100 is NOT ([Cost] > 100). */
        private Node negated(int depth) {
            if (word("NOT") && tokens.get(at + 1).kind() != Kind.OPEN) {
                take();
                return new Node.Call(Fn.NOT, List.of(negated(depth + 1)));
            }
            return compared(depth);
        }

        private Node compared(int depth) {
            Node left = joined(depth);
            Sign sign = sign(Sign.EQ, Sign.NE, Sign.LT, Sign.LE, Sign.GT, Sign.GE);
            if (sign == null) {
                return left;
            }
            take();
            return new Node.Op(sign, left, joined(depth));
        }

        private Node joined(int depth) {
            Node left = added(depth);
            while (sign(Sign.JOIN) != null) {
                take();
                left = new Node.Op(Sign.JOIN, left, added(depth));
            }
            return left;
        }

        private Node added(int depth) {
            Node left = multiplied(depth);
            for (Sign sign = sign(Sign.ADD, Sign.SUB); sign != null; sign = sign(Sign.ADD, Sign.SUB)) {
                take();
                left = new Node.Op(sign, left, multiplied(depth));
            }
            return left;
        }

        private Node multiplied(int depth) {
            Node left = single(depth);
            for (Sign sign = sign(Sign.MUL, Sign.DIV); sign != null; sign = sign(Sign.MUL, Sign.DIV)) {
                take();
                left = new Node.Op(sign, left, single(depth));
            }
            return left;
        }

        private Sign sign(Sign... wanted) {
            if (peek().kind() != Kind.SIGN) {
                return null;
            }
            for (Sign sign : wanted) {
                if (sign.written().equals(peek().text())) {
                    return sign;
                }
            }
            return null;
        }

        private Node single(int depth) {
            if (depth > MAX_DEPTH) {
                throw new FormulaProblem("That formula has too many brackets inside brackets.");
            }
            Token token = take();
            switch (token.kind()) {
                case NUMBER:
                    return new Node.Number(new BigDecimal(token.text()), token.sign());
                case WORDS:
                    return new Node.Words(token.text());
                case COLUMN:
                    return column(token.text());
                case OPEN:
                    Node inside = either(depth + 1);
                    if (take().kind() != Kind.CLOSE) {
                        throw new FormulaProblem("A bracket was opened and never closed.");
                    }
                    return inside;
                case SIGN:
                    if (token.text().equals("-")) {
                        Node of = single(depth + 1);
                        return of instanceof Node.Number number
                                ? new Node.Number(number.value().negate(), number.sign())
                                : new Node.Negate(of);
                    }
                    if (token.text().equals("+")) {
                        return single(depth + 1);
                    }
                    throw new FormulaProblem("Something is missing before \"" + shown(token.text()) + "\".");
                case NAME:
                    return named(token.text(), depth);
                case END:
                    throw new FormulaProblem(
                            at >= 2
                                    ? "The formula stops too early: something is missing after \""
                                            + shown(tokens.get(at - 2).text()) + "\"."
                                    : "Write a formula first, like [Price] * [Qty].");
                default:
                    throw new FormulaProblem("I didn't expect \"" + token.text() + "\" there.");
            }
        }

        private static String shown(String sign) {
            for (Sign known : Sign.values()) {
                if (known.written().equals(sign)) {
                    return known.shown();
                }
            }
            return sign;
        }

        private Node named(String word, int depth) {
            String upper = word.toUpperCase(Locale.ROOT);
            if (peek().kind() != Kind.OPEN) {
                switch (upper) {
                    case "TRUE", "YES":
                        return new Node.Yes(true);
                    case "FALSE", "NO":
                        return new Node.Yes(false);
                    case "NOT":
                        return new Node.Call(Fn.NOT, List.of(single(depth + 1)));
                    case "TODAY":
                        return new Node.Call(Fn.TODAY, List.of());
                    default:
                        break;
                }
                if (columns.id(word).isPresent()) {
                    throw new FormulaProblem("Write column names in square brackets: [" + word + "].");
                }
                if (Fn.named(word).isPresent()) {
                    throw new FormulaProblem(upper + " needs brackets after it, like " + upper + "(…).");
                }
                throw new FormulaProblem("I don't know what \"" + word
                        + "\" is. Column names go in square brackets, like [Cost], and words in \"quotes\".");
            }
            Fn fn = Fn.named(word)
                    .orElseThrow(() -> new FormulaProblem("I don't know \"" + upper + "\". Try "
                            + Fn.common().stream().map(Fn::name).collect(Collectors.joining(", ")) + "."));
            take();
            List<Node> args = new ArrayList<>();
            if (peek().kind() == Kind.CLOSE) {
                take();
            } else {
                while (true) {
                    args.add(either(depth + 1));
                    Token next = take();
                    if (next.kind() == Kind.CLOSE) {
                        break;
                    }
                    if (next.kind() != Kind.COMMA) {
                        throw new FormulaProblem(
                                next.kind() == Kind.END
                                        ? "A bracket was opened after " + upper + " and never closed."
                                        : "I didn't expect \"" + next.text() + "\" inside " + upper
                                                + "(…). Put a comma between its parts.");
                    }
                }
            }
            if (args.size() < fn.least() || args.size() > fn.most()) {
                throw new FormulaProblem(fn.needs());
            }
            return new Node.Call(fn, List.copyOf(args));
        }

        private Node column(String name) {
            if (name.startsWith("#")) {
                try {
                    UUID id = UUID.fromString(name.substring(1));
                    return columns.name(id).isPresent() ? new Node.Column(id) : new Node.Gone();
                } catch (IllegalArgumentException notAnId) {
                    // falls through: a column may really be called "#1"
                }
            }
            return columns.id(name)
                    .<Node>map(Node.Column::new)
                    .orElseThrow(() -> new FormulaProblem(
                            columns.names().isEmpty()
                                    ? "There is no column called \"" + name + "\". This tab has no columns yet."
                                    : "There is no column called \"" + name + "\". This tab has: "
                                            + String.join(", ", columns.names()) + "."));
        }
    }

    // ---------- writing ----------

    /** The formula as a person reads it, with column names: {@code SUM([Cost]) - SUMIF([Paid], [Cost])}. */
    public static String write(Node node, Columns columns) {
        return write(node, id -> "[" + columns.name(id).orElse("a column that was removed") + "]", 0);
    }

    /** The formula as it is kept, with column ids in place of names. */
    public static String keep(Node node) {
        return write(node, id -> "[#" + id + "]", 0);
    }

    private static String write(Node node, java.util.function.Function<UUID, String> column, int around) {
        return switch (node) {
            case Node.Number number ->
                (number.value().signum() < 0 ? "-" : "")
                        + number.sign()
                        + number.value().abs().toPlainString();
            case Node.Words words -> "\"" + words.text().replace("\"", "\"\"") + "\"";
            case Node.Yes yes -> yes.on() ? "TRUE" : "FALSE";
            case Node.Column c -> column.apply(c.id());
            case Node.Gone gone -> "[a column that was removed]";
            case Node.Negate negate -> "-" + write(negate.of(), column, 9);
            case Node.Op op -> {
                // The right side of - and / needs its brackets even at the same tightness: a - (b - c).
                String text = write(op.left(), column, op.sign().binds()) + " "
                        + op.sign().written() + " "
                        + write(op.right(), column, op.sign().binds() + 1);
                yield op.sign().binds() < around ? "(" + text + ")" : text;
            }
            case Node.Call call ->
                call.fn().name() + "("
                        + call.args().stream().map(arg -> write(arg, column, 0)).collect(Collectors.joining(", "))
                        + ")";
        };
    }

    // ---------- looking at a formula ----------

    /** Every column a formula uses, anywhere in it. */
    public static Set<UUID> columns(Node node) {
        Set<UUID> found = new LinkedHashSet<>();
        collect(node, found, true);
        return found;
    }

    /** The columns a formula reads from its own row: the ones outside SUM, COUNT and the other totals. */
    public static Set<UUID> columnsOfTheRow(Node node) {
        Set<UUID> found = new LinkedHashSet<>();
        collect(node, found, false);
        return found;
    }

    private static void collect(Node node, Set<UUID> found, boolean insideTotals) {
        switch (node) {
            case Node.Column column -> found.add(column.id());
            case Node.Negate negate -> collect(negate.of(), found, insideTotals);
            case Node.Op op -> {
                collect(op.left(), found, insideTotals);
                collect(op.right(), found, insideTotals);
            }
            case Node.Call call -> {
                if (insideTotals || !call.total()) {
                    call.args().forEach(arg -> collect(arg, found, insideTotals));
                }
            }
            default -> {}
        }
    }

    /** True when the formula is the same for every row: it reads no column outside a total. */
    public static boolean oneAnswer(Node node) {
        return columnsOfTheRow(node).isEmpty() && !hasGone(node);
    }

    private static boolean hasGone(Node node) {
        return switch (node) {
            case Node.Gone gone -> true;
            case Node.Negate negate -> hasGone(negate.of());
            case Node.Op op -> hasGone(op.left()) || hasGone(op.right());
            case Node.Call call -> call.args().stream().anyMatch(Formula::hasGone);
            default -> false;
        };
    }

    /**
     * Refuses what can never be worked out, before it is saved: a total inside a total, and, for a tile (which
     * is one number for the whole tab), a column that isn't inside a total.
     */
    public static void check(Node node, boolean forTile, Columns columns) {
        check(node, forTile, false, columns);
    }

    private static void check(Node node, boolean forTile, boolean insideTotal, Columns columns) {
        switch (node) {
            case Node.Column column -> {
                if (forTile && !insideTotal) {
                    String name = columns.name(column.id()).orElse("That column");
                    throw new FormulaProblem("[" + name
                            + "] is a whole column, and a tile shows one number. Wrap it: SUM(["
                            + name + "]), AVERAGE([" + name + "]), COUNT([" + name + "]), MIN([" + name + "]) or MAX(["
                            + name + "]).");
                }
            }
            case Node.Gone gone -> throw new FormulaProblem("This formula uses a column that was removed.");
            case Node.Negate negate -> check(negate.of(), forTile, insideTotal, columns);
            case Node.Op op -> {
                check(op.left(), forTile, insideTotal, columns);
                check(op.right(), forTile, insideTotal, columns);
            }
            case Node.Call call -> {
                if (call.total() && insideTotal) {
                    throw new FormulaProblem(
                            call.fn().name()
                                    + " is inside another total. A total is already one number, so there is nothing left to add up.");
                }
                call.args().forEach(arg -> check(arg, forTile, insideTotal || call.total(), columns));
            }
            default -> {}
        }
    }
}
