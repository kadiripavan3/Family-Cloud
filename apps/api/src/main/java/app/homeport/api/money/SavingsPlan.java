package app.homeport.api.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * How long until a savings goal is reached, putting the same amount aside at the end of every month. Interest,
 * when there is any, is added each month on what is already there (the yearly rate divided by twelve) and
 * rounded to the cent. Checked against worked examples in {@code LoanPlanTest}.
 */
public final class SavingsPlan {

    /** After a hundred years it is "not at this pace". */
    public static final int MAX_MONTHS = 1200;

    private SavingsPlan() {}

    /** What has been saved at the end of one year. */
    public record Year(int year, long savedCents) {}

    /**
     * @param months how many months until the goal is reached; -1 when it isn't reached in a hundred years
     * @param putInCents what was put aside in that time, the start included
     * @param interestCents what the interest added
     * @param years what is saved at the end of each year, until the goal
     */
    public record Plan(int months, long putInCents, long interestCents, List<Year> years) {}

    public static Plan plan(long goalCents, long savedCents, long monthlyCents, BigDecimal yearlyPercent) {
        if (goalCents <= 0 || savedCents < 0 || monthlyCents < 0) {
            throw new IllegalArgumentException("A goal is above zero; what is saved and put aside can't be below it.");
        }
        if (yearlyPercent == null
                || yearlyPercent.signum() < 0
                || yearlyPercent.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("A yearly rate is between 0 and 100 percent.");
        }
        BigDecimal rate = LoanPlan.monthly(yearlyPercent);
        long saved = savedCents;
        long putIn = savedCents;
        long interestInAll = 0;
        int month = 0;
        List<Year> years = new ArrayList<>();
        while (saved < goalCents && month < MAX_MONTHS) {
            month++;
            long interest = BigDecimal.valueOf(saved)
                    .multiply(rate)
                    .setScale(0, RoundingMode.HALF_UP)
                    .longValueExact();
            saved += interest + monthlyCents;
            interestInAll += interest;
            putIn += monthlyCents;
            if (month % 12 == 0 || saved >= goalCents) {
                years.add(new Year((month + 11) / 12, saved));
            }
        }
        return new Plan(saved >= goalCents ? month : -1, putIn, interestInAll, List.copyOf(years));
    }
}
