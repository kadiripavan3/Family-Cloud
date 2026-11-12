package app.homeport.api.board;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** The few ready-made words templates put into a glance, a line on Today or a sentence under a number. */
public final class Words {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter SHORT_DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH);

    private Words() {}

    /** 4 Dec 2034 */
    public static String day(LocalDate day) {
        return DAY.format(day);
    }

    /** 4 Dec */
    public static String shortDay(LocalDate day) {
        return SHORT_DAY.format(day);
    }

    /** Wed */
    public static String weekday(LocalDate day) {
        return WEEKDAY.format(day);
    }

    /** "1 letter", "3 letters": a number with its word, in the singular for one. */
    public static String count(long number, String one, String many) {
        return number + " " + (number == 1 ? one : many);
    }

    /** "1 letter", "3 letters" for words that only add an s. */
    public static String count(long number, String one) {
        return count(number, one, one + "s");
    }

    /** 10th, 21st, 2nd, 13th */
    public static String ordinal(int number) {
        int lastTwo = Math.floorMod(number, 100);
        String ending = lastTwo >= 11 && lastTwo <= 13
                ? "th"
                : switch (Math.floorMod(number, 10)) {
                    case 1 -> "st";
                    case 2 -> "nd";
                    case 3 -> "rd";
                    default -> "th";
                };
        return number + ending;
    }

    /** 3:12 for 192 seconds; 0:06 for six. */
    public static String clock(int seconds) {
        return (seconds / 60) + ":" + "%02d".formatted(seconds % 60);
    }

    /** "Nora's", "Alex's", "Lars'" */
    public static String of(String name) {
        return name.endsWith("s") ? name + "'" : name + "'s";
    }
}
