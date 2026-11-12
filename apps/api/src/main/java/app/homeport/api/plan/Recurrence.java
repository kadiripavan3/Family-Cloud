package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * How something comes round again: every so many days, weeks (on chosen days of the week), months (on the
 * same day of the month) or years (on the same date). Written here rather than taken from a library, because
 * these four are all the app offers and every rule fits on one screen:
 *
 * <ul>
 *   <li>the first time is the day it starts; nothing happens before that, or after {@code until};
 *   <li>weeks are counted from the Monday of the week it starts in, so "every 2 weeks on Tue and Fri" keeps
 *       both days in the same weeks;
 *   <li>a monthly thing that starts on the 31st happens on the last day of a shorter month, and a yearly
 *       thing that starts on 29 February happens on the 28th in other years.
 * </ul>
 *
 * It only knows days. What time of day something happens is kept by whatever repeats.
 */
public record Recurrence(
        @NotNull(message = "Choose how often it repeats.") Unit unit,

        @Schema(description = "Every how many days, weeks, months or years. Left out: every one.")
        Integer every,

        @Schema(description = "For weeks: on which days. Left out: the day of the week it starts on.")
        Set<Weekday> days,

        @Schema(nullable = true, description = "The last day it may happen on. Left out: it goes on.")
        LocalDate until) {

    /** What is counted between two times. */
    public enum Unit {
        DAY,
        WEEK,
        MONTH,
        YEAR;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }

        @JsonCreator
        public static Unit of(String code) {
            return Codes.parse(
                    Unit.class,
                    code,
                    () -> ApiProblem.badRequest("invalid_repeat", "Choose every day, week, month or year."));
        }

        /** From a database column. */
        public static Unit read(String code) {
            return Codes.read(Unit.class, code);
        }
    }

    /** The most times {@link #between} hands back: more than a year of days. */
    static final int MOST = 400;

    public Recurrence {
        every = every == null ? 1 : Math.clamp(every, 1, 99);
        days = days == null || days.isEmpty() ? Set.of() : Collections.unmodifiableSet(EnumSet.copyOf(days));
    }

    public static Recurrence every(Unit unit) {
        return new Recurrence(unit, 1, Set.of(), null);
    }

    public static Recurrence weekly(Weekday... days) {
        return new Recurrence(Unit.WEEK, 1, Set.of(days), null);
    }

    /** The same rule with its days of the week filled in from the day it starts, so "weekly" says "Thursdays". */
    public Recurrence startingOn(LocalDate start) {
        return unit == Unit.WEEK && days.isEmpty()
                ? new Recurrence(unit, every, Set.of(Weekday.of(start.getDayOfWeek())), until)
                : this;
    }

    /** True when something that started on {@code start} happens on {@code day}. */
    public boolean occursOn(LocalDate start, LocalDate day) {
        if (day.isBefore(start) || (until != null && day.isAfter(until))) {
            return false;
        }
        return switch (unit) {
            case DAY -> ChronoUnit.DAYS.between(start, day) % every == 0;
            case WEEK ->
                onDay(start, day.getDayOfWeek()) && ChronoUnit.WEEKS.between(monday(start), monday(day)) % every == 0;
            case MONTH ->
                ChronoUnit.MONTHS.between(YearMonth.from(start), YearMonth.from(day)) % every == 0
                        && day.getDayOfMonth() == Math.min(start.getDayOfMonth(), day.lengthOfMonth());
            case YEAR ->
                (day.getYear() - start.getYear()) % every == 0
                        && day.getMonth() == start.getMonth()
                        && day.getDayOfMonth() == Math.min(start.getDayOfMonth(), day.lengthOfMonth());
        };
    }

    /** The first time on or after {@code from}, or nothing when it is over by then. */
    public Optional<LocalDate> nextOnOrAfter(LocalDate start, LocalDate from) {
        LocalDate first = from.isBefore(start) ? start : from;
        LocalDate found = switch (unit) {
            case DAY -> {
                long since = ChronoUnit.DAYS.between(start, first);
                yield start.plusDays((since + every - 1) / every * every);
            }
            case WEEK -> {
                // At most one whole round of weeks away, and a round is "every" weeks long.
                LocalDate day = first;
                while (!occursOnIgnoringUntil(start, day)) {
                    day = day.plusDays(1);
                }
                yield day;
            }
            case MONTH -> {
                YearMonth month = YearMonth.from(first);
                LocalDate day = inMonth(start, month);
                while (day.isBefore(first) || ChronoUnit.MONTHS.between(YearMonth.from(start), month) % every != 0) {
                    month = month.plusMonths(1);
                    day = inMonth(start, month);
                }
                yield day;
            }
            case YEAR -> {
                int year = first.getYear();
                LocalDate day = inMonth(start, YearMonth.of(year, start.getMonth()));
                while (day.isBefore(first) || (year - start.getYear()) % every != 0) {
                    year++;
                    day = inMonth(start, YearMonth.of(year, start.getMonth()));
                }
                yield day;
            }
        };
        return until != null && found.isAfter(until) ? Optional.empty() : Optional.of(found);
    }

    /** The first time after {@code after}. */
    public Optional<LocalDate> nextAfter(LocalDate start, LocalDate after) {
        return nextOnOrAfter(start, after.plusDays(1));
    }

    /** Every time from {@code from} to {@code to}, both counted, in order. Never more than {@link #MOST}. */
    public List<LocalDate> between(LocalDate start, LocalDate from, LocalDate to) {
        List<LocalDate> times = new ArrayList<>();
        Optional<LocalDate> next = nextOnOrAfter(start, from);
        while (next.isPresent() && !next.get().isAfter(to) && times.size() < MOST) {
            times.add(next.get());
            next = nextAfter(start, next.get());
        }
        return times;
    }

    /** How many times it happens after {@code after} up to and including {@code day}. */
    public int timesBetween(LocalDate start, LocalDate after, LocalDate day) {
        return between(start, after.plusDays(1), day).size();
    }

    private boolean occursOnIgnoringUntil(LocalDate start, LocalDate day) {
        return new Recurrence(unit, every, days, null).occursOn(start, day);
    }

    private boolean onDay(LocalDate start, DayOfWeek day) {
        return days.isEmpty() ? day == start.getDayOfWeek() : days.contains(Weekday.of(day));
    }

    private static LocalDate monday(LocalDate day) {
        return day.minusDays(day.getDayOfWeek().getValue() - 1L);
    }

    private static LocalDate inMonth(LocalDate start, YearMonth month) {
        return month.atDay(Math.min(start.getDayOfMonth(), month.lengthOfMonth()));
    }

    /** In a few words: "Every day", "Weekdays", "Thursdays", "Tue and Fri", "Every other Thursday", "Every month". */
    public String label() {
        return switch (unit) {
            case DAY -> every == 1 ? "Every day" : every == 2 ? "Every other day" : "Every " + every + " days";
            case WEEK -> weekLabel();
            case MONTH -> every == 1 ? "Every month" : every == 2 ? "Every other month" : "Every " + every + " months";
            case YEAR -> every == 1 ? "Every year" : every == 2 ? "Every other year" : "Every " + every + " years";
        };
    }

    private String weekLabel() {
        String each = every == 2 ? "Every other week" : "Every " + every + " weeks";
        if (days.isEmpty()) {
            return every == 1 ? "Every week" : each;
        }
        List<Weekday> on = days.stream().sorted().toList();
        if (every == 1) {
            if (on.size() == 7) {
                return "Every day";
            }
            if (on.equals(List.of(Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI))) {
                return "Weekdays";
            }
            if (on.equals(List.of(Weekday.SAT, Weekday.SUN))) {
                return "Weekends";
            }
            return on.size() == 1
                    ? on.get(0).full() + "s"
                    : Words.list(on.stream().map(Weekday::brief).toList());
        }
        return on.size() == 1
                ? (every == 2 ? "Every other " : "Every " + every + " weeks on ")
                        + on.get(0).full()
                : each + " on " + Words.list(on.stream().map(Weekday::brief).toList());
    }
}
