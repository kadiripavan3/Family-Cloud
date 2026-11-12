package app.homeport.api.money.sheet;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * A formula after it has been read: a small tree. {@code [Price] * [Qty]} is a {@link Op} with a column on
 * each side. A column is kept by its id, so renaming it changes nothing here.
 */
public sealed interface Node {

    /**
     * A number written into the formula.
     *
     * @param sign the currency sign it was written with ("€250"), which makes it money, or empty for a plain number
     */
    record Number(BigDecimal value, String sign) implements Node {
        public boolean money() {
            return !sign.isEmpty();
        }
    }

    /** Words in quotes. */
    record Words(String text) implements Node {}

    /** TRUE or FALSE. */
    record Yes(boolean on) implements Node {}

    record Column(UUID id) implements Node {}

    /** A column that was there when the formula was written and has been removed since. */
    record Gone() implements Node {}

    record Negate(Node of) implements Node {}

    record Op(Sign sign, Node left, Node right) implements Node {}

    record Call(Fn fn, List<Node> args) implements Node {

        /** True for a call that looks at every row and gives one number: SUM, AVERAGE, COUNT, and MIN or MAX of one thing. */
        public boolean total() {
            return fn.total() || ((fn == Fn.MIN || fn == Fn.MAX) && args.size() == 1);
        }
    }

    /** The signs between two things. */
    enum Sign {
        ADD("+", "+", 4),
        SUB("-", "−", 4),
        MUL("*", "×", 5),
        DIV("/", "÷", 5),
        JOIN("&", "&", 3),
        EQ("=", "=", 2),
        NE("<>", "≠", 2),
        LT("<", "<", 2),
        LE("<=", "≤", 2),
        GT(">", ">", 2),
        GE(">=", "≥", 2);

        private final String written;
        private final String shown;
        private final int binds;

        Sign(String written, String shown, int binds) {
            this.written = written;
            this.shown = shown;
            this.binds = binds;
        }

        /** How it is typed. */
        public String written() {
            return written;
        }

        /** How it is drawn on a chip. */
        public String shown() {
            return shown;
        }

        /** How tightly it holds its two sides: × before +. */
        public int binds() {
            return binds;
        }
    }
}
