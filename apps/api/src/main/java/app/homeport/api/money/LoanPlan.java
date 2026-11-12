package app.homeport.api.money;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * The sums of a loan paid back in equal monthly payments: the payment, the schedule, and what paying a bit
 * more each month changes. Nothing here knows about the API or the database; it is checked against worked
 * examples in {@code LoanPlanTest}.
 *
 * <p>How it counts:
 *
 * <ul>
 *   <li>The yearly rate is divided by twelve for the month's rate (the usual way banks quote a loan).
 *   <li>The payment is {@code P·r / (1 − (1 + r)^−n)}, rounded to the cent. With no interest it is {@code P / n}.
 *   <li>Each month's interest is the rate times what is still owed, rounded to the cent; the rest of the
 *       payment pays the loan down. The last payment is whatever is left, so it can be a little smaller or
 *       larger than the others.
 *   <li>How long a plan takes is counted in payments. When paying extra, the last payment is usually a small
 *       one; "how much sooner" counts it as the part of a month it is of a full payment, to the nearest month.
 *       265 full payments and a last one of a tenth of the size is 265.1 months: 35 months sooner than 300.
 * </ul>
 */
public final class LoanPlan {

    private static final MathContext PRECISE = MathContext.DECIMAL128;

    public static final int MAX_MONTHS = 50 * 12;

    private LoanPlan() {}

    /** Where a loan stands at the end of one year of it. */
    public record Year(int year, long paidCents, long interestCents, long owedCents) {}

    /**
     * @param paymentCents what is paid each month (the extra included)
     * @param payments how many payments it takes, the last one included
     * @param lastPaymentCents the last payment, which settles what is left
     * @param interestCents all the interest paid
     * @param totalCents everything paid: what was borrowed and the interest
     * @param years where it stands at the end of each year, until it is paid off
     * @param months how long it takes, with a small last payment counted as part of a month
     */
    public record Plan(
            long paymentCents,
            int payments,
            long lastPaymentCents,
            long interestCents,
            long totalCents,
            List<Year> years,
            BigDecimal months) {}

    /** A plan, and the same loan with something extra paid each month. */
    public record WhatIf(Plan plan, Plan withExtra, int monthsSooner, long interestSavedCents) {}

    /** The rate for one month, as a fraction: 3.4 (percent a year) is 0.0028333… */
    static BigDecimal monthly(BigDecimal yearlyPercent) {
        return yearlyPercent.divide(BigDecimal.valueOf(1200), PRECISE);
    }

    /** The equal monthly payment that pays a loan off in this many months. */
    public static long payment(long principalCents, BigDecimal yearlyPercent, int months) {
        check(principalCents, yearlyPercent, months);
        BigDecimal principal = BigDecimal.valueOf(principalCents);
        if (yearlyPercent.signum() == 0) {
            return principal
                    .divide(BigDecimal.valueOf(months), 0, RoundingMode.HALF_UP)
                    .longValueExact();
        }
        BigDecimal rate = monthly(yearlyPercent);
        BigDecimal growth = BigDecimal.ONE.add(rate).pow(months, PRECISE);
        return principal
                .multiply(rate)
                .multiply(growth)
                .divide(growth.subtract(BigDecimal.ONE), PRECISE)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }

    /** The plan for a loan, month by month, with this much paid on top of the payment each month (zero for none). */
    public static Plan plan(long principalCents, BigDecimal yearlyPercent, int months, long extraCents) {
        if (extraCents < 0) {
            throw new IllegalArgumentException("Extra can't be below zero.");
        }
        long payment = payment(principalCents, yearlyPercent, months) + extraCents;
        BigDecimal rate = monthly(yearlyPercent);
        long owed = principalCents;
        long interestInAll = 0;
        long last = 0;
        int count = 0;
        List<Year> years = new ArrayList<>();
        long yearPaid = 0;
        long yearInterest = 0;
        while (owed > 0) {
            count++;
            long interest = BigDecimal.valueOf(owed)
                    .multiply(rate)
                    .setScale(0, RoundingMode.HALF_UP)
                    .longValueExact();
            // The last payment settles what is left: when it is less than a payment, or when the term is up.
            long paid = owed + interest <= payment || count == months ? owed + interest : payment;
            owed = owed + interest - paid;
            interestInAll += interest;
            yearPaid += paid;
            yearInterest += interest;
            last = paid;
            if (count % 12 == 0 || owed == 0) {
                years.add(new Year((count + 11) / 12, yearPaid, yearInterest, owed));
                yearPaid = 0;
                yearInterest = 0;
            }
        }
        BigDecimal time = BigDecimal.valueOf(count - 1)
                .add(BigDecimal.valueOf(Math.min(last, payment)).divide(BigDecimal.valueOf(payment), PRECISE))
                .setScale(1, RoundingMode.HALF_UP);
        return new Plan(payment, count, last, interestInAll, principalCents + interestInAll, List.copyOf(years), time);
    }

    /** What paying this much more each month changes: how much sooner it is done, and the interest saved. */
    public static WhatIf whatIf(long principalCents, BigDecimal yearlyPercent, int months, long extraCents) {
        Plan plan = plan(principalCents, yearlyPercent, months, 0);
        if (extraCents == 0) {
            return new WhatIf(plan, plan, 0, 0);
        }
        Plan faster = plan(principalCents, yearlyPercent, months, extraCents);
        BigDecimal exact = BigDecimal.valueOf(faster.payments() - 1L)
                .add(BigDecimal.valueOf(Math.min(faster.lastPaymentCents(), faster.paymentCents()))
                        .divide(BigDecimal.valueOf(faster.paymentCents()), PRECISE));
        int sooner = BigDecimal.valueOf(months)
                .subtract(exact)
                .setScale(0, RoundingMode.HALF_UP)
                .intValueExact();
        return new WhatIf(plan, faster, Math.max(sooner, 0), plan.interestCents() - faster.interestCents());
    }

    private static void check(long principalCents, BigDecimal yearlyPercent, int months) {
        if (principalCents <= 0 || principalCents > Cash.MAX_CENTS) {
            throw new IllegalArgumentException("A loan is for more than nothing, and a billion at most.");
        }
        if (yearlyPercent == null
                || yearlyPercent.signum() < 0
                || yearlyPercent.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("A yearly rate is between 0 and 100 percent.");
        }
        if (months < 1 || months > MAX_MONTHS) {
            throw new IllegalArgumentException("A loan runs for 1 month to 50 years.");
        }
    }
}
