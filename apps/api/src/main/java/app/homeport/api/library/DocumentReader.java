package app.homeport.api.library;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What can be found, by rule, in the words the phone read inside a scan or a PDF. The API never reads a
 * picture itself: the phone does, and sends the text. Here that text is searched for
 *
 * <ul>
 *   <li>the machine-readable lines of a passport or an ID card (the rows of capitals and {@code <} at the
 *       bottom), which carry the number, the birthday and the day it expires, each with a check digit. A line
 *       whose check digits don't add up is not believed;
 *   <li>a day after words such as "expires", "valid until", "renews", "due" or "warranty";
 *   <li>the total of a receipt.
 * </ul>
 *
 * It is right for the common cases and silent otherwise; whatever it finds is shown to the person, who can
 * correct it.
 */
public final class DocumentReader {

    private DocumentReader() {}

    /** What a passport's or an ID card's machine-readable lines say. */
    public record Mrz(String number, String nationality, LocalDate born, String sex, LocalDate expires) {}

    /** A day found after a word that says what it means. */
    public record FoundDate(DateLabel label, LocalDate date) {}

    public record Amount(long cents, String currency) {}

    /** Everything found in one document. */
    public record Reading(Mrz mrz, List<FoundDate> dates, Amount amount) {

        /**
         * The day that matters: a travel document's last day; otherwise the next day still to come, and when
         * every day found has passed, the latest of them.
         */
        public FoundDate key(LocalDate today) {
            if (mrz != null) {
                return new FoundDate(DateLabel.EXPIRES, mrz.expires());
            }
            return dates.stream()
                    .filter(d -> !d.date().isBefore(today))
                    .min(Comparator.comparing(FoundDate::date))
                    .or(() -> dates.stream().max(Comparator.comparing(FoundDate::date)))
                    .orElse(null);
        }
    }

    public static Reading read(String text, LocalDate today) {
        String words = text == null ? "" : text;
        return new Reading(
                mrz(words, today).orElse(null), dates(words), amount(words).orElse(null));
    }

    // ---------- the machine-readable lines ----------

    /** A passport (two lines of 44) or a visa-sized card (two lines of 36): number, nationality, born, sex, expires. */
    private static final Pattern PASSPORT_LINE =
            Pattern.compile("([A-Z0-9<]{9})([0-9])([A-Z<]{3})([0-9]{6})([0-9])([MFX<])([0-9]{6})([0-9])");

    /** An ID card (three lines of 30): the number is in the first line, the days in the second. */
    private static final Pattern CARD_FIRST_LINE = Pattern.compile("[ACI][A-Z0-9<][A-Z<]{3}([A-Z0-9<]{9})([0-9])");

    private static final Pattern CARD_SECOND_LINE =
            Pattern.compile("([0-9]{6})([0-9])([MFX<])([0-9]{6})([0-9])([A-Z<]{3})");

    public static Optional<Mrz> mrz(String text, LocalDate today) {
        // A scan often puts spaces between the letters of these lines: read each line without them.
        List<String> lines = text.lines()
                .map(line -> line.replaceAll("\\s+", "").toUpperCase(Locale.ROOT))
                .filter(line -> line.length() >= 28)
                .toList();
        for (String line : lines) {
            Matcher m = PASSPORT_LINE.matcher(line);
            while (m.find()) {
                Optional<Mrz> read = checked(
                        m.group(1),
                        m.group(2),
                        m.group(3),
                        m.group(4),
                        m.group(5),
                        m.group(6),
                        m.group(7),
                        m.group(8),
                        today);
                if (read.isPresent()) {
                    return read;
                }
            }
        }
        for (int i = 0; i + 1 < lines.size(); i++) {
            Matcher first = CARD_FIRST_LINE.matcher(lines.get(i));
            Matcher second = CARD_SECOND_LINE.matcher(lines.get(i + 1));
            if (first.lookingAt() && second.lookingAt()) {
                Optional<Mrz> read = checked(
                        first.group(1),
                        first.group(2),
                        second.group(6),
                        second.group(1),
                        second.group(2),
                        second.group(3),
                        second.group(4),
                        second.group(5),
                        today);
                if (read.isPresent()) {
                    return read;
                }
            }
        }
        return Optional.empty();
    }

    private static Optional<Mrz> checked(
            String number,
            String numberCheck,
            String nationality,
            String born,
            String bornCheck,
            String sex,
            String expires,
            String expiresCheck,
            LocalDate today) {
        if (checkDigit(number) != numberCheck.charAt(0) - '0'
                || checkDigit(born) != bornCheck.charAt(0) - '0'
                || checkDigit(expires) != expiresCheck.charAt(0) - '0') {
            return Optional.empty();
        }
        LocalDate bornOn = sixDigits(born, today, true);
        LocalDate expiresOn = sixDigits(expires, today, false);
        if (bornOn == null || expiresOn == null || !expiresOn.isAfter(bornOn)) {
            return Optional.empty();
        }
        return Optional.of(new Mrz(
                number.replace("<", ""), nationality.replace("<", ""), bornOn, sex.equals("<") ? "" : sex, expiresOn));
    }

    /**
     * The check digit of a field of the machine-readable lines: each character has a value (a digit itself,
     * A to Z 10 to 35, the filler 0), the values are multiplied by 7, 3, 1, 7, 3, 1… and the sum's last digit
     * is the check.
     */
    public static int checkDigit(String field) {
        int[] weights = {7, 3, 1};
        int sum = 0;
        for (int i = 0; i < field.length(); i++) {
            char c = field.charAt(i);
            int value = c >= '0' && c <= '9' ? c - '0' : c >= 'A' && c <= 'Z' ? c - 'A' + 10 : 0;
            sum += value * weights[i % 3];
        }
        return sum % 10;
    }

    /**
     * YYMMDD as a day. The lines give two digits for the year: a birthday is the latest such day that isn't in
     * the future; any other day is the one nearest to today.
     */
    private static LocalDate sixDigits(String digits, LocalDate today, boolean past) {
        try {
            int year = Integer.parseInt(digits.substring(0, 2));
            int month = Integer.parseInt(digits.substring(2, 4));
            int day = Integer.parseInt(digits.substring(4, 6));
            LocalDate thisCentury = LocalDate.of(2000 + year, month, day);
            LocalDate lastCentury = LocalDate.of(1900 + year, month, day);
            if (past) {
                return thisCentury.isAfter(today) ? lastCentury : thisCentury;
            }
            return Math.abs(ChronoUnit.DAYS.between(today, thisCentury))
                            <= Math.abs(ChronoUnit.DAYS.between(today, lastCentury))
                    ? thisCentury
                    : lastCentury;
        } catch (DateTimeException | NumberFormatException notADay) {
            return null;
        }
    }

    // ---------- days after words ----------

    private static final Map<DateLabel, Pattern> WORDS = new LinkedHashMap<>();

    static {
        // The more particular words first: "warranty valid until" is a warranty.
        WORDS.put(DateLabel.WARRANTY, words("warranty|guarantee|guaranteed"));
        WORDS.put(DateLabel.RENEWS, words("renews|renewal|renew by|renew before"));
        WORDS.put(DateLabel.DUE, words("due|pay by|payable by"));
        WORDS.put(DateLabel.VALID_UNTIL, words("valid until|valid till|valid to|valid thru|valid through"));
        WORDS.put(DateLabel.EXPIRES, words("expires|expiry|expiration|expire on|runs out"));
    }

    private static Pattern words(String alternatives) {
        return Pattern.compile("\\b(?:" + alternatives + ")\\b", Pattern.CASE_INSENSITIVE);
    }

    private static final String MONTH =
            "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?"
                    + "|nov(?:ember)?|dec(?:ember)?)";

    /** 2 Aug 2027, 02 AUG 2027, 2nd August 2027, 02-Aug-2027. */
    private static final Pattern DAY_MONTH_YEAR = Pattern.compile(
            "\\b(\\d{1,2})(?:st|nd|rd|th)?[ .\\-/]{1,3}" + MONTH + "\\b[ .,\\-/]{1,3}(\\d{4})\\b",
            Pattern.CASE_INSENSITIVE);

    /** August 2, 2027. */
    private static final Pattern MONTH_DAY_YEAR = Pattern.compile(
            "\\b" + MONTH + "\\b[ .]{1,2}(\\d{1,2})(?:st|nd|rd|th)?,?[ ]{1,2}(\\d{4})\\b", Pattern.CASE_INSENSITIVE);

    /** 2027-08-02. */
    private static final Pattern ISO = Pattern.compile("\\b(\\d{4})-(\\d{2})-(\\d{2})\\b");

    /** 02/08/2027 or 02.08.2027: the day first, as most of the world writes it, unless that can't be a month. */
    private static final Pattern NUMBERS = Pattern.compile("\\b(\\d{1,2})[./](\\d{1,2})[./](\\d{4})\\b");

    /** Nov 2028: a month, which ends on its last day. */
    private static final Pattern MONTH_YEAR =
            Pattern.compile("\\b" + MONTH + "\\b[ ,]{1,2}(\\d{4})\\b", Pattern.CASE_INSENSITIVE);

    /** How far after the word the day may start, and how much text is looked at for it. */
    private static final int REACH = 16;

    private static final int WINDOW = 60;

    /**
     * Every day that follows one of the words, in the order they stand in the text. The day has to start
     * within a few words of it ("Date of expiry: 02 AUG 2027", or the value on the next line), with no other
     * number in between. The same day is listed once, under the first word that named it.
     */
    public static List<FoundDate> dates(String text) {
        record At(int position, FoundDate found) {}
        List<At> all = new ArrayList<>();
        WORDS.forEach((label, words) -> {
            Matcher m = words.matcher(text);
            while (m.find()) {
                String after = text.substring(m.end(), Math.min(text.length(), m.end() + WINDOW))
                        .replace('\n', ' ')
                        .replace('\r', ' ');
                LocalDate date = firstDate(after);
                if (date != null) {
                    all.add(new At(m.start(), new FoundDate(label, date)));
                }
            }
        });
        List<FoundDate> found = new ArrayList<>();
        // In the order of the text; at the same place the more particular word (listed first) wins.
        all.stream().sorted(Comparator.comparingInt(At::position)).forEach(at -> {
            if (found.stream().noneMatch(f -> f.date().equals(at.found().date()))) {
                found.add(at.found());
            }
        });
        return found;
    }

    /** The day these words start with, give or take a few words and no digits before it; or null. */
    private static LocalDate firstDate(String after) {
        int best = Integer.MAX_VALUE;
        LocalDate date = null;
        for (Pattern form : List.of(DAY_MONTH_YEAR, MONTH_DAY_YEAR, ISO, NUMBERS, MONTH_YEAR)) {
            Matcher m = form.matcher(after);
            while (m.find() && m.start() < best) {
                LocalDate read = read(form, m);
                if (read != null) {
                    best = m.start();
                    date = read;
                    break;
                }
            }
        }
        if (date == null || best > REACH || after.substring(0, best).chars().anyMatch(Character::isDigit)) {
            return null;
        }
        return date;
    }

    private static LocalDate read(Pattern form, Matcher m) {
        try {
            if (form == DAY_MONTH_YEAR) {
                return LocalDate.of(Integer.parseInt(m.group(3)), month(m.group(2)), Integer.parseInt(m.group(1)));
            }
            if (form == MONTH_DAY_YEAR) {
                return LocalDate.of(Integer.parseInt(m.group(3)), month(m.group(1)), Integer.parseInt(m.group(2)));
            }
            if (form == ISO) {
                return LocalDate.of(
                        Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
            }
            if (form == NUMBERS) {
                int first = Integer.parseInt(m.group(1));
                int second = Integer.parseInt(m.group(2));
                int year = Integer.parseInt(m.group(3));
                return second > 12 ? LocalDate.of(year, first, second) : LocalDate.of(year, second, first);
            }
            return YearMonth.of(Integer.parseInt(m.group(2)), month(m.group(1))).atEndOfMonth();
        } catch (DateTimeException notADay) {
            return null;
        }
    }

    private static int month(String name) {
        return List.of("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
                        .indexOf(name.substring(0, 3).toLowerCase(Locale.ROOT))
                + 1;
    }

    // ---------- the total of a receipt ----------

    private static final Pattern MONEY = Pattern.compile(
            "(€|\\$|£|EUR|USD|GBP)?\\s?(\\d{1,3}(?:[ .,]\\d{3})+|\\d+)(?:[.,](\\d{2}))?(?!\\d)\\s?(€|\\$|£|EUR|USD|GBP)?");

    private static final Pattern TOTAL =
            Pattern.compile("\\b(total|amount due|balance due|to pay|sum)\\b", Pattern.CASE_INSENSITIVE);

    /**
     * The amount after "total" (the last one: a receipt lists a subtotal first), or after "amount due" and its
     * cousins. Only an amount that names its currency counts, so a page total or a quantity isn't taken for
     * money.
     */
    public static Optional<Amount> amount(String text) {
        Amount afterTotal = null;
        Amount other = null;
        Matcher m = TOTAL.matcher(text);
        while (m.find()) {
            String line = text.substring(m.end(), Math.min(text.length(), m.end() + 40));
            int end = line.indexOf('\n');
            Amount found = money(end < 0 ? line : line.substring(0, end));
            if (found != null) {
                if (m.group(1).equalsIgnoreCase("total")) {
                    afterTotal = found;
                } else if (other == null) {
                    other = found;
                }
            }
        }
        return Optional.ofNullable(afterTotal != null ? afterTotal : other);
    }

    private static Amount money(String words) {
        Matcher m = MONEY.matcher(words);
        while (m.find()) {
            String sign = m.group(1) != null ? m.group(1) : m.group(4);
            if (sign == null) {
                continue;
            }
            try {
                long whole = Long.parseLong(m.group(2).replaceAll("[ .,]", ""));
                long cents = m.group(3) == null ? 0 : Long.parseLong(m.group(3));
                if (whole > 1_000_000_000L) {
                    continue;
                }
                return new Amount(
                        whole * 100 + cents,
                        switch (sign) {
                            case "€", "EUR" -> "EUR";
                            case "$", "USD" -> "USD";
                            default -> "GBP";
                        });
            } catch (NumberFormatException tooLong) {
                // Not an amount anyone pays.
            }
        }
        return null;
    }

    // ---------- what kind of document it is ----------

    private static final Map<DocumentCategory, Pattern> KINDS = new LinkedHashMap<>();

    static {
        KINDS.put(
                DocumentCategory.ID,
                words("passport|identity card|id card|driving licence|driver'?s license|residence permit"));
        KINDS.put(DocumentCategory.INSURANCE, words("insurance|insurer|policy number|policyholder"));
        KINDS.put(DocumentCategory.SCHOOL, words("school|report card|teacher|grades|semester"));
        KINDS.put(DocumentCategory.RECIPE, words("recipe|ingredients"));
        KINDS.put(DocumentCategory.RECEIPT, words("receipt|invoice|warranty|vat"));
        KINDS.put(DocumentCategory.TAX, words("tax|taxes"));
        KINDS.put(DocumentCategory.MANUAL, words("manual|instructions|user guide"));
        KINDS.put(DocumentCategory.HEALTH, words("doctor|vaccination|prescription|clinic|hospital"));
        KINDS.put(DocumentCategory.HOME, words("lease|tenancy|mortgage|landlord"));
    }

    /** A guess at what a document is, from its name and its words. The person can always choose another. */
    public static DocumentCategory category(String title, String text, boolean travelDocument) {
        if (travelDocument) {
            return DocumentCategory.ID;
        }
        // The name says more than the words inside: a school report mentions many things.
        for (String words : new String[] {title == null ? "" : title, text == null ? "" : text}) {
            for (Map.Entry<DocumentCategory, Pattern> kind : KINDS.entrySet()) {
                if (kind.getValue().matcher(words).find()) {
                    return kind.getKey();
                }
            }
        }
        return DocumentCategory.OTHER;
    }

    // ---------- reminders ----------

    /**
     * The day to be reminded of a day that is coming, or null when it has passed: seven months before a
     * passport or an ID card runs out (many countries want six months left, and a new one takes a few weeks),
     * three days before something is due, a month before anything else. Never earlier than tomorrow.
     */
    public static LocalDate remindOn(DateLabel label, LocalDate date, boolean travelDocument, LocalDate today) {
        if (date == null || !date.isAfter(today)) {
            return null;
        }
        LocalDate on =
                travelDocument ? date.minusMonths(7) : label == DateLabel.DUE ? date.minusDays(3) : date.minusMonths(1);
        return on.isAfter(today) ? on : today.plusDays(1);
    }

    /** Many countries want a passport to be good for this long after a trip. */
    static final int MONTHS_WANTED_AFTER_A_TRIP = 6;

    /**
     * How many months a travel document still has after a trip ends, when that is fewer than the six many
     * countries want; null when there is room enough. Zero or less: it runs out before the trip is over.
     */
    public static Integer monthsLeftAfter(LocalDate tripEnds, LocalDate expires) {
        if (!expires.isBefore(tripEnds.plusMonths(MONTHS_WANTED_AFTER_A_TRIP))) {
            return null;
        }
        return (int) Math.round(ChronoUnit.DAYS.between(tripEnds, expires) / 30.44);
    }
}
