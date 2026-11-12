package app.homeport.api.plan;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;

/** The few words Plan and Jot say about days, times and people, in one place so they read the same everywhere. */
public final class Words {

    private Words() {}

    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("H:mm", Locale.ENGLISH);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter DAY_AND_YEAR = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter DATE_AND_YEAR = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH_AND_YEAR = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH);

    private static final String[] NUMBERS = {
        "no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"
    };

    /** "9:00", "15:30". */
    public static String time(LocalTime time) {
        return CLOCK.format(time);
    }

    /** "Sat 14 Nov". */
    public static String day(LocalDate day) {
        return DAY.format(day);
    }

    /** "Sat 14 Nov", with the year when that isn't the year of today: "Sat 2 Jan 2027". */
    public static String day(LocalDate day, LocalDate today) {
        return day.getYear() == today.getYear() ? DAY.format(day) : DAY_AND_YEAR.format(day);
    }

    /** "2 Jan", with the year when it is more than eleven months from today. */
    public static String date(LocalDate day, LocalDate today) {
        return Math.abs(ChronoUnit.MONTHS.between(today, day)) >= 11 ? DATE_AND_YEAR.format(day) : DATE.format(day);
    }

    /** "today", "tomorrow", "yesterday", or "Sat 14 Nov". */
    public static String near(LocalDate day, LocalDate today) {
        long away = ChronoUnit.DAYS.between(today, day);
        return away == 0 ? "today" : away == 1 ? "tomorrow" : away == -1 ? "yesterday" : day(day, today);
    }

    /** "today", "tomorrow", "Friday" for the six days after today, "Monday" for the six before, else "2 Jan". */
    public static String weekdayNear(LocalDate day, LocalDate today) {
        long away = ChronoUnit.DAYS.between(today, day);
        if (away == 0) {
            return "today";
        }
        if (away == 1) {
            return "tomorrow";
        }
        if (away == -1) {
            return "yesterday";
        }
        return Math.abs(away) <= 6 ? WEEKDAY.format(day) : date(day, today);
    }

    /** "today 18:00", "tomorrow 9:00", "Sat 14 Nov, 10:00", or only the day when there is no time. */
    public static String when(LocalDate day, LocalTime time, LocalDate today) {
        String on = near(day, today);
        if (time == null) {
            return on;
        }
        return Character.isLowerCase(on.charAt(0)) ? on + " " + time(time) : on + ", " + time(time);
    }

    /** "Sat 14 Nov, 10:00": what stands next to a thing in a list of mixed kinds. */
    public static String stamp(LocalDate day, LocalTime time, LocalDate today) {
        return time == null ? day(day, today) : day(day, today) + ", " + time(time);
    }

    /** "March". */
    public static String month(LocalDate day) {
        return MONTH.format(day);
    }

    /** "March 2027". */
    public static String monthAndYear(LocalDate day) {
        return MONTH_AND_YEAR.format(day);
    }

    /** "This morning", "This afternoon" or "Tonight" for a time of day; "Today" for none. */
    public static String partOfDay(LocalTime time) {
        if (time == null) {
            return "Today";
        }
        return time.getHour() < 12 ? "This morning" : time.getHour() < 17 ? "This afternoon" : "Tonight";
    }

    /** "1 hour before", "30 minutes before", "1 day before"; "at the time" for nothing. */
    public static String before(int minutes) {
        return minutes <= 0 ? "at the time" : span(minutes) + " before";
    }

    /** The way it is said: "an hour before", "a day before", "30 minutes before"; "when it starts" for nothing. */
    public static String beforeSpoken(int minutes) {
        if (minutes <= 0) {
            return "when it starts";
        }
        return switch (minutes) {
            case 60 -> "an hour before";
            case 1440 -> "a day before";
            case 10080 -> "a week before";
            default -> before(minutes);
        };
    }

    /** "1 hour", "90 minutes", "2 days", "1 week". */
    public static String span(int minutes) {
        if (minutes % 10080 == 0) {
            return count(minutes / 10080, "week");
        }
        if (minutes % 1440 == 0) {
            return count(minutes / 1440, "day");
        }
        if (minutes % 60 == 0) {
            return count(minutes / 60, "hour");
        }
        return count(minutes, "minute");
    }

    /** "1 star", "3 stars". */
    public static String count(long number, String thing) {
        return number + " " + (number == 1 ? thing : thing + "s");
    }

    /** "two", "twelve"; digits from thirteen on. */
    public static String number(int number) {
        return number >= 0 && number < NUMBERS.length ? NUMBERS[number] : String.valueOf(number);
    }

    /** "Alex", "Alex and Mia", "Alex, Mia and Leo". */
    public static String list(List<String> names) {
        if (names.isEmpty()) {
            return "";
        }
        if (names.size() == 1) {
            return names.get(0);
        }
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    /** The same words with a capital first letter. */
    public static String capital(String words) {
        return words.isEmpty() ? words : Character.toUpperCase(words.charAt(0)) + words.substring(1);
    }

    /** Pieces joined with a middle dot, leaving out the empty ones: "19:00 · Tue and Fri · takes turns". */
    public static String dots(String... pieces) {
        StringBuilder all = new StringBuilder();
        for (String piece : pieces) {
            if (piece != null && !piece.isBlank()) {
                if (all.length() > 0) {
                    all.append(" · ");
                }
                all.append(piece);
            }
        }
        return all.toString();
    }
}
