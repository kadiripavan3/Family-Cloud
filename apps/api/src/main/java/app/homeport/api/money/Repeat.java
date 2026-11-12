package app.homeport.api.money;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;

/** How a bill comes round: once, every month, every so many months, or every year. */
public enum Repeat {
    ONCE,
    MONTHLY,
    MONTHS,
    YEARLY;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Repeat of(String code) {
        return Codes.parse(
                Repeat.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_repeat", "Choose once, every month, every few months or every year."));
    }

    /** From a database column. */
    public static Repeat read(String code) {
        return Codes.read(Repeat.class, code);
    }

    /** How many months lie between two times it is due. Zero for a bill that comes once. */
    public int months(int everyMonths) {
        return switch (this) {
            case ONCE -> 0;
            case MONTHLY -> 1;
            case MONTHS -> everyMonths;
            case YEARLY -> 12;
        };
    }

    /**
     * The next time it is due after {@code due}, or null for a bill that comes once. It falls on the bill's
     * own day of the month, or on the last day of a month that is too short for it: a bill of the 31st is
     * due on 28 February and on 31 March again.
     */
    public LocalDate next(LocalDate due, int dueDay, int everyMonths) {
        int step = months(everyMonths);
        if (step == 0) {
            return null;
        }
        YearMonth month = YearMonth.from(due).plusMonths(step);
        return month.atDay(Math.min(dueDay, month.lengthOfMonth()));
    }

    /** What it costs in a year, or null for a bill that comes once. */
    public Long yearly(long amountCents, int everyMonths) {
        int step = months(everyMonths);
        if (step == 0) {
            return null;
        }
        return BigDecimal.valueOf(amountCents)
                .multiply(BigDecimal.valueOf(12))
                .divide(BigDecimal.valueOf(step), 0, RoundingMode.HALF_UP)
                .longValueExact();
    }
}
