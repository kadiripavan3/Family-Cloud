package app.homeport.api.money.sheet;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Ask in words": turns a small set of known questions into a formula, by rule. No service reads the
 * question; it is matched against the shapes below, using the tab's own column names and the first names of
 * the people in the circle. Anything else gets no formula, and the app is told how to write one.
 *
 * <p>The questions it knows (the words in braces are found in the tab):
 *
 * <ul>
 *   <li>How much has {Alex} paid? · What has {Alex} still to pay? · {Alex}'s share
 *   <li>How much is left to pay? · How much is paid? · What part is paid?
 *   <li>Total of {Price} times {Qty} · Total {Cost} · Average {Cost} · Average per month
 *   <li>The biggest {Cost} · The smallest {Cost}
 *   <li>How many rows? · How many are {Paid}? · How many are not {Paid}?
 *   <li>How much for {Food}? (a choice of a choice column)
 *   <li>{Price} times {Qty} · {A} plus {B} · {A} minus {B} · {A} divided by {B} (a formula for each row)
 *   <li>Days until {Due}
 *   <li>Monthly payment on 240000 at 3.4% over 25 years
 * </ul>
 */
public final class Ask {

    private Ask() {}

    /** A column as the questions see it. */
    public record Col(String name, ColumnKind kind, List<String> options) {}

    /**
     * @param columns the tab's columns, in their order
     * @param people the first names of the people in the circle
     * @param asker the first name of the person asking, for "how much have I paid?"
     * @return the formula, written with column names, or empty when the question isn't one it knows
     */
    public static Optional<String> formula(String question, List<Col> columns, List<String> people, String asker) {
        String asked = " "
                + question.toLowerCase(Locale.ROOT)
                        .replaceAll("[?!.,;:“”\"']", " ")
                        .replaceAll("\\s+", " ")
                        .strip() + " ";
        if (asked.isBlank()) {
            return Optional.empty();
        }
        Tab tab = new Tab(columns, asked);
        String person = person(asked, people, asker);

        // The loan question is read with its dots and commas still in it: "240,000 at 3.4%".
        Matcher loan = LOAN.matcher(question.toLowerCase(Locale.ROOT));
        if (loan.find()) {
            return Optional.of("PAYMENT(€" + loan.group(1).replaceAll("[ ,]", "") + ", " + loan.group(2) + ", "
                    + loan.group(3) + ")");
        }

        // A sum for each row: "price times quantity", "total of price times quantity".
        for (String[] sign : SIGNS) {
            for (String word : sign[1].split("\\|")) {
                int at = asked.indexOf(" " + word + " ");
                if (at < 0) {
                    continue;
                }
                Named left = tab.named(asked.substring(0, at + 1), true);
                Named right = tab.named(asked.substring(at + word.length() + 1), false);
                if (left != null && right != null && left.column() != right.column()) {
                    String each = col(left.column()) + " " + sign[0] + " " + col(right.column());
                    // "Total of price times quantity" adds it up over every row; "price times quantity" is for each
                    // row.
                    boolean addedUp =
                            has(asked.substring(0, left.at() + 1), "total", "total of", "sum", "sum of", "add up");
                    return Optional.of(addedUp ? "SUM(" + each + ")" : each);
                }
            }
        }

        if (has(asked, "days until", "days to", "days left", "how long until", "days before")) {
            Col date = tab.mentioned(ColumnKind.DATE).orElse(tab.first(ColumnKind.DATE));
            if (date != null) {
                return Optional.of("DAYS(" + col(date) + ", TODAY())");
            }
        }

        Col money = tab.amount();
        Col tick = tab.tick();
        Col who = tab.first(ColumnKind.PERSON);

        // About one person: "How much has Alex paid?", "What does Alex still owe?", "Alex's share".
        if (person != null && who != null && money != null) {
            String theirs = col(who) + " = \"" + person + "\"";
            if (tick != null && has(asked, "owe", "left", "still", "not paid", "unpaid", "to pay")) {
                return Optional.of("SUMIF(AND(" + theirs + ", NOT " + col(tick) + "), " + col(money) + ")");
            }
            if (tick != null && has(asked, "paid", "pay", "spent", "bought", "done")) {
                return Optional.of("SUMIF(AND(" + theirs + ", " + col(tick) + "), " + col(money) + ")");
            }
            // A name alone isn't a question about money: "Alex's share" is, "is Alex nice" is not.
            if (has(asked, "how much", "share", "part", "total", "sum", "cost", "spend", "spending")) {
                return Optional.of("SUMIF(" + theirs + ", " + col(money) + ")");
            }
        }

        // About one choice: "How much for Food?".
        for (Col column : columns) {
            if (column.kind() == ColumnKind.CHOICE && money != null) {
                for (String option : column.options()) {
                    if (asked.contains(" " + option.toLowerCase(Locale.ROOT) + " ")) {
                        String chosen = col(column) + " = \"" + option + "\"";
                        return Optional.of(
                                has(asked, "how many", "count")
                                        ? "COUNTIF(" + chosen + ")"
                                        : "SUMIF(" + chosen + ", " + col(money) + ")");
                    }
                }
            }
        }

        if (money != null && tick != null && has(asked, "percent", "what part", "what share", "how far")) {
            return Optional.of("ROUND(SUMIF(" + col(tick) + ", " + col(money) + ") / SUM(" + col(money) + ") * 100)");
        }

        if (has(asked, "how many", "count", "number of")) {
            if (tick != null
                    && has(
                            asked,
                            "not " + tick.name().toLowerCase(Locale.ROOT),
                            "not paid",
                            "unpaid",
                            "left",
                            "still",
                            "open",
                            "not done",
                            "not ticked")) {
                return Optional.of("COUNTIF(NOT " + col(tick) + ")");
            }
            if (tick != null && has(asked, tick.name().toLowerCase(Locale.ROOT), "paid", "done", "ticked", "bought")) {
                return Optional.of("COUNTIF(" + col(tick) + ")");
            }
            return Optional.of("COUNT()");
        }

        if (money == null) {
            return Optional.empty();
        }
        if (tick != null
                && has(
                        asked,
                        "left to pay",
                        "still to pay",
                        "still owe",
                        "left",
                        "unpaid",
                        "not paid",
                        "to go",
                        "outstanding",
                        "remaining")) {
            return Optional.of("SUM(" + col(money) + ") - SUMIF(" + col(tick) + ", " + col(money) + ")");
        }
        if (has(asked, "average", "mean", "per month", "a month", "on average", "typical")) {
            return Optional.of("AVG(" + col(money) + ")");
        }
        if (has(asked, "biggest", "largest", "highest", "most expensive", "dearest", "maximum")) {
            return Optional.of("MAX(" + col(money) + ")");
        }
        if (has(asked, "smallest", "lowest", "cheapest", "least expensive", "minimum")) {
            return Optional.of("MIN(" + col(money) + ")");
        }
        if (tick != null && has(asked, "paid", "spent so far", "so far", "bought", "done")) {
            return Optional.of("SUMIF(" + col(tick) + ", " + col(money) + ")");
        }
        if (has(asked, "total", "sum", "add up", "altogether", "in all", "how much", "what does it cost", "cost")) {
            return Optional.of("SUM(" + col(money) + ")");
        }
        return Optional.empty();
    }

    /** A few questions this tab can answer, written with its own column names, to show when a question wasn't understood. */
    public static List<String> examples(List<Col> columns, List<String> people) {
        Tab tab = new Tab(columns, " ");
        List<String> examples = new ArrayList<>();
        Col money = tab.amount();
        Col tick = tab.tick();
        if (money != null) {
            examples.add("Total " + money.name());
            examples.add("Average " + money.name());
            if (tick != null) {
                examples.add("How much is left to pay?");
            }
            if (tab.first(ColumnKind.PERSON) != null && !people.isEmpty()) {
                examples.add("How much has " + people.get(0) + " paid?");
            }
        }
        Col number = tab.first(ColumnKind.NUMBER);
        if (money != null && number != null) {
            examples.add("Total of " + money.name() + " times " + number.name());
        }
        examples.add("How many rows?");
        return examples;
    }

    private static final Pattern LOAN = Pattern.compile(
            "(?:payment|repayment|instal+ment|loan)\\D*?(\\d[\\d ,]*\\d)\\D+?(\\d+(?:\\.\\d+)?) ?(?:%|percent)\\D+?(\\d{1,2}) ?(?:years|year|yrs|y)\\b");

    /** A sign for each row and the words that mean it. */
    private static final String[][] SIGNS = {
        {"*", "times|multiplied by|x"},
        {"/", "divided by|per"},
        {"+", "plus"},
        {"-", "minus|less"}
    };

    private static boolean has(String asked, String... words) {
        for (String word : words) {
            if (asked.contains(" " + word + " ") || asked.contains(" " + word + "s ")) {
                return true;
            }
        }
        return false;
    }

    private static String col(Col column) {
        return "[" + column.name() + "]";
    }

    /** The person a question is about: a first name from the circle, or the asker for "I" and "my". */
    private static String person(String asked, List<String> people, String asker) {
        for (String name : people) {
            String lower = name.toLowerCase(Locale.ROOT);
            if (asked.contains(" " + lower + " ") || asked.contains(" " + lower + "s ")) {
                return name;
            }
        }
        boolean aboutMe = List.of(" i ", " my ", " me ", " mine ", " ive ", " i ve ").stream()
                .anyMatch(asked::contains);
        return asker != null && aboutMe ? asker : null;
    }

    /** A column a question names, and where in the question. */
    private record Named(Col column, int at) {}

    /** The tab's columns, and the ways a question points at one of them. */
    private record Tab(List<Col> columns, String asked) {

        Col first(ColumnKind kind) {
            return columns.stream().filter(c -> c.kind() == kind).findFirst().orElse(null);
        }

        /** A column of this kind whose name is in the question. */
        Optional<Col> mentioned(ColumnKind kind) {
            return columns.stream()
                    .filter(c ->
                            c.kind() == kind && asked.contains(" " + c.name().toLowerCase(Locale.ROOT) + " "))
                    .findFirst();
        }

        /** The column of amounts a question means: one it names, else the first money column, else a formula or number column. */
        Col amount() {
            for (Col column : columns) {
                boolean countable = column.kind() == ColumnKind.MONEY
                        || column.kind() == ColumnKind.NUMBER
                        || column.kind() == ColumnKind.FORMULA;
                if (countable && asked.contains(" " + column.name().toLowerCase(Locale.ROOT) + " ")) {
                    return column;
                }
            }
            Col money = first(ColumnKind.MONEY);
            if (money != null) {
                return money;
            }
            Col worked = first(ColumnKind.FORMULA);
            return worked != null ? worked : first(ColumnKind.NUMBER);
        }

        /** The tick column a question means: one it names, else one called Paid, else the first. */
        Col tick() {
            return mentioned(ColumnKind.TICK)
                    .or(() -> columns.stream()
                            .filter(c -> c.kind() == ColumnKind.TICK
                                    && c.name().toLowerCase(Locale.ROOT).contains("paid"))
                            .findFirst())
                    .orElse(first(ColumnKind.TICK));
        }

        /**
         * The column named in a piece of the question: by its whole name, or a well-known other word for it
         * ("quantity" for Qty). With several, the last one before a sign, the first one after it.
         */
        Named named(String piece, boolean last) {
            Named found = null;
            for (Col column : columns) {
                for (String word : words(column.name())) {
                    int at = last ? piece.lastIndexOf(" " + word + " ") : piece.indexOf(" " + word + " ");
                    if (at >= 0 && (found == null || (last ? at > found.at() : at < found.at()))) {
                        found = new Named(column, at);
                    }
                }
            }
            return found;
        }

        private static List<String> words(String name) {
            String lower = name.toLowerCase(Locale.ROOT);
            List<String> words = new ArrayList<>(List.of(lower));
            for (String[] same : SAME) {
                if (List.of(same).contains(lower)) {
                    words.addAll(List.of(same));
                }
            }
            return words;
        }

        private static final String[][] SAME = {
            {"qty", "quantity", "amount of", "pieces", "how many", "number"},
            {"price", "unit price", "price each"},
            {"cost", "costs"},
            {"km", "kilometres", "kilometers", "distance"},
            {"nights", "night"},
            {"days", "day"},
            {"hours", "hour"}
        };
    }
}
