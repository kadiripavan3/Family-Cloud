package app.homeport.api.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.money.LoanPlan.Plan;
import app.homeport.api.money.LoanPlan.WhatIf;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The loan planner's sums, checked against worked examples, and the numbers of its screen. */
class LoanPlanTest {

    private static BigDecimal rate(String percent) {
        return new BigDecimal(percent);
    }

    /** The monthly payments any loan table or bank calculator gives for these loans. */
    @ParameterizedTest(name = "{0} at {1}% over {2} months is {3} a month")
    @CsvSource({
        "200000.00, 6,   360, 1199.10",
        "100000.00, 6,   360,  599.55",
        "100000.00, 5,   180,  790.79",
        "250000.00, 4.5, 360, 1266.71",
        "300000.00, 3,   360, 1264.81",
        " 20000.00, 7.5,  60,  400.76",
        " 12000.00, 12,   12, 1066.19",
        "  1000.00, 5,    12,   85.61",
        "  5000.00, 9.9,  36,  161.10",
        " 10000.00, 0,    10, 1000.00",
    })
    void theMonthlyPaymentIsTheOneTheBooksGive(BigDecimal borrowed, String percent, int months, BigDecimal payment) {
        assertThat(LoanPlan.payment(borrowed.movePointRight(2).longValueExact(), rate(percent), months))
                .isEqualTo(payment.movePointRight(2).longValueExact());
    }

    @Test
    void aSmallLoanWorkedOutByHandMonthByMonth() {
        // €1,000 at 12% a year over 3 months: 1% a month, €340.02 a month.
        //   month 1: interest 10.00, pays off 330.02, leaves 669.98
        //   month 2: interest  6.70, pays off 333.32, leaves 336.66
        //   month 3: interest  3.37, and the last payment settles what is left: 336.66 + 3.37 = 340.03
        Plan plan = LoanPlan.plan(100_000, rate("12"), 3, 0);

        assertThat(plan.paymentCents()).isEqualTo(34_002);
        assertThat(plan.payments()).isEqualTo(3);
        assertThat(plan.lastPaymentCents()).isEqualTo(34_003);
        assertThat(plan.interestCents()).isEqualTo(1000 + 670 + 337);
        assertThat(plan.totalCents()).isEqualTo(100_000 + 2007);
        assertThat(plan.years()).containsExactly(new LoanPlan.Year(1, 102_007, 2007, 0));
    }

    @Test
    void theScheduleAddsUpYearByYearAndEndsAtNothing() {
        Plan plan = LoanPlan.plan(24_000_000, rate("3.4"), 300, 0);

        assertThat(plan.years()).hasSize(25);
        assertThat(plan.years().get(0)).isEqualTo(new LoanPlan.Year(1, 1_426_392, 806_397, 23_380_005));
        assertThat(plan.years().get(24).owedCents()).isZero();
        // Everything paid is what was borrowed and the interest; what is owed only ever goes down.
        assertThat(plan.years().stream().mapToLong(LoanPlan.Year::paidCents).sum())
                .isEqualTo(plan.totalCents());
        assertThat(plan.years().stream().mapToLong(LoanPlan.Year::interestCents).sum())
                .isEqualTo(plan.interestCents());
        for (int year = 1; year < plan.years().size(); year++) {
            assertThat(plan.years().get(year).owedCents())
                    .isLessThan(plan.years().get(year - 1).owedCents());
        }
    }

    /**
     * The loan planner's screen: €240,000 at 3.4% over 25 years is "€1,189 a month" and "€116,600 of interest";
     * €100 more a month is "done 2 years 11 months sooner, with about €15,000 less interest".
     */
    @Test
    void theNumbersOfTheScreenComeOutOfItsOwnSliders() {
        WhatIf whatIf = LoanPlan.whatIf(24_000_000, rate("3.4"), 25 * 12, 10_000);

        // €1,188.66 a month: €1,189.
        assertThat(whatIf.plan().paymentCents()).isEqualTo(118_866);
        assertThat(Cash.round(whatIf.plan().paymentCents(), "EUR")).isEqualTo("€1,189");
        // €116,599.63 of interest: €116,600.
        assertThat(whatIf.plan().interestCents()).isEqualTo(11_659_963);
        assertThat(Cash.round(whatIf.plan().interestCents(), "EUR")).isEqualTo("€116,600");
        assertThat(whatIf.plan().payments()).isEqualTo(300);

        // With €100 more: 265 payments of €1,288.66 and a last one of €149.06, which is 265.1 months.
        Plan faster = whatIf.withExtra();
        assertThat(faster.paymentCents()).isEqualTo(128_866);
        assertThat(faster.payments()).isEqualTo(266);
        assertThat(faster.lastPaymentCents()).isEqualTo(14_906);
        assertThat(faster.months()).isEqualByComparingTo("265.1");
        // 300 − 265.1 = 34.9 months: 35 to the nearest month, which is 2 years 11 months.
        assertThat(whatIf.monthsSooner()).isEqualTo(35);
        assertThat(whatIf.monthsSooner() / 12).isEqualTo(2);
        assertThat(whatIf.monthsSooner() % 12).isEqualTo(11);
        // €14,955.67 less interest: about €15,000.
        assertThat(whatIf.interestSavedCents()).isEqualTo(1_495_567);
        assertThat(Math.round(whatIf.interestSavedCents() / 100_000.0) * 1000).isEqualTo(15_000);
    }

    @Test
    void payingMoreIsSoonerAndCheaperAndPayingNothingMoreChangesNothing() {
        WhatIf none = LoanPlan.whatIf(24_000_000, rate("3.4"), 300, 0);
        assertThat(none.monthsSooner()).isZero();
        assertThat(none.interestSavedCents()).isZero();

        WhatIf some = LoanPlan.whatIf(24_000_000, rate("3.4"), 300, 10_000);
        WhatIf more = LoanPlan.whatIf(24_000_000, rate("3.4"), 300, 20_000);
        assertThat(more.withExtra().payments()).isEqualTo(238);
        assertThat(more.monthsSooner()).isGreaterThan(some.monthsSooner());
        assertThat(more.interestSavedCents()).isGreaterThan(some.interestSavedCents());
        // Paying it all off at once: one payment, and almost no interest.
        WhatIf atOnce = LoanPlan.whatIf(24_000_000, rate("3.4"), 300, 24_000_000);
        assertThat(atOnce.withExtra().payments()).isEqualTo(1);
        assertThat(atOnce.withExtra().interestCents()).isEqualTo(68_000);
    }

    @Test
    void aLoanWithoutInterestIsDividedEvenlyAndCostsNothingExtra() {
        Plan plan = LoanPlan.plan(1_000_000, BigDecimal.ZERO, 12, 0);

        assertThat(plan.paymentCents()).isEqualTo(83_333);
        // Eleven payments of 833.33 and a last one of 833.37 that makes it come out.
        assertThat(plan.lastPaymentCents()).isEqualTo(83_337);
        assertThat(plan.interestCents()).isZero();
        assertThat(plan.totalCents()).isEqualTo(1_000_000);
    }

    @Test
    void numbersThatAreNoLoanAreRefused() {
        assertThatThrownBy(() -> LoanPlan.payment(0, rate("3"), 12)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LoanPlan.payment(100_000, rate("-1"), 12))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LoanPlan.payment(100_000, rate("101"), 12))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LoanPlan.payment(100_000, rate("3"), 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LoanPlan.payment(100_000, rate("3"), 601))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LoanPlan.plan(100_000, rate("3"), 12, -1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ---------- the savings plan ----------

    @Test
    void aSavingsGoalIsReachedWhenWhatIsPutAsideAddsUpToIt() {
        // The Norway goal: €5,600 saved of €8,000, €480 a month: five months.
        SavingsPlan.Plan plan = SavingsPlan.plan(800_000, 560_000, 48_000, BigDecimal.ZERO);

        assertThat(plan.months()).isEqualTo(5);
        assertThat(plan.putInCents()).isEqualTo(800_000);
        assertThat(plan.interestCents()).isZero();
        assertThat(plan.years()).containsExactly(new SavingsPlan.Year(1, 800_000));
    }

    @Test
    void interestIsAddedEachMonthOnWhatIsThere() {
        // €500 a month at 3% a year from nothing reaches €10,000 in 20 months, €241.10 of it interest.
        SavingsPlan.Plan plan = SavingsPlan.plan(1_000_000, 0, 50_000, rate("3"));

        assertThat(plan.months()).isEqualTo(20);
        assertThat(plan.putInCents()).isEqualTo(1_000_000);
        assertThat(plan.interestCents()).isEqualTo(24_110);
        assertThat(plan.years()).containsExactly(new SavingsPlan.Year(1, 608_319), new SavingsPlan.Year(2, 1_024_110));
    }

    @Test
    void aGoalThatIsAlreadyReachedTakesNoTimeAndOneThatNeverIsSaysSo() {
        assertThat(SavingsPlan.plan(100_000, 100_000, 0, BigDecimal.ZERO).months())
                .isZero();
        assertThat(SavingsPlan.plan(1_000_000, 0, 0, BigDecimal.ZERO).months()).isEqualTo(-1);
        assertThatThrownBy(() -> SavingsPlan.plan(0, 0, 100, BigDecimal.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
