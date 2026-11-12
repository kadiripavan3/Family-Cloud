package app.homeport.api.money.sheet;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The functions a formula can call. Each has the name it is typed with, the label its chip shows, how many
 * things go in its brackets, and the sentence a person gets when they put in the wrong number of them.
 */
public enum Fn {
    SUM("SUM", 1, 1, true, "SUM needs one thing to add up, like SUM([Cost])."),
    SUMIF("SUM IF", 2, 2, true, "SUMIF needs two things: which rows, and what to add up. Like SUMIF([Paid], [Cost])."),
    AVG("AVERAGE", 1, 1, true, "AVERAGE needs one thing, like AVERAGE([Cost])."),
    AVGIF(
            "AVERAGE IF",
            2,
            2,
            true,
            "AVGIF needs two things: which rows, and what to take the average of. Like AVGIF([Paid], [Cost])."),
    COUNT("COUNT", 0, 1, true, "COUNT takes one thing, or nothing to count every row."),
    COUNTIF("COUNT IF", 1, 1, true, "COUNTIF needs one thing: which rows to count, like COUNTIF([Paid])."),
    MIN("MIN", 1, 20, false, "MIN needs at least one thing in its brackets."),
    MAX("MAX", 1, 20, false, "MAX needs at least one thing in its brackets."),
    IF(
            "IF",
            3,
            3,
            false,
            "IF needs three things: a question, what to give when the answer is yes, and what to give when it is no."),
    ROUND("ROUND", 1, 2, false, "ROUND needs a number, and how many decimals if you want any."),
    ABS("ABS", 1, 1, false, "ABS needs one number."),
    AND("AND", 1, 20, false, "AND needs at least one question."),
    OR("OR", 1, 20, false, "OR needs at least one question."),
    NOT("NOT", 1, 1, false, "NOT needs one question."),
    DAYS("DAYS", 2, 2, false, "DAYS needs two dates: the later one first, like DAYS([Due], TODAY())."),
    TODAY("TODAY", 0, 0, false, "TODAY takes nothing: write TODAY()."),
    JOIN("JOIN", 1, 20, false, "JOIN needs at least one thing to join."),
    ISEMPTY("IS EMPTY", 1, 1, false, "ISEMPTY needs one thing to look at."),
    PAYMENT(
            "PAYMENT",
            3,
            3,
            false,
            "PAYMENT needs three things: what is borrowed, the yearly rate and the years. Like PAYMENT(€240000, 3.4, 25).");

    private final String label;
    private final int least;
    private final int most;
    private final boolean total;
    private final String needs;

    Fn(String label, int least, int most, boolean total, String needs) {
        this.label = label;
        this.least = least;
        this.most = most;
        this.total = total;
        this.needs = needs;
    }

    /** What its chip says: SUM IF. */
    public String label() {
        return label;
    }

    public int least() {
        return least;
    }

    public int most() {
        return most;
    }

    /** True for a function that always looks at every row and gives one answer. */
    public boolean total() {
        return total;
    }

    /** The sentence for the wrong number of things in its brackets. */
    public String needs() {
        return needs;
    }

    /** The function typed as this word, in any case; AVERAGE and CONCAT are other names for AVG and JOIN. */
    public static Optional<Fn> named(String word) {
        String upper = word.toUpperCase(Locale.ROOT);
        String name = switch (upper) {
            case "AVERAGE", "MEAN" -> "AVG";
            case "AVERAGEIF" -> "AVGIF";
            case "CONCAT", "CONCATENATE" -> "JOIN";
            case "PMT" -> "PAYMENT";
            default -> upper;
        };
        return Arrays.stream(values()).filter(fn -> fn.name().equals(name)).findFirst();
    }

    /** The ones to suggest when a name isn't known. */
    static List<Fn> common() {
        return List.of(SUM, AVG, COUNT, MIN, MAX, IF, ROUND, ABS);
    }
}
