package app.homeport.api.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Dividing an amount so the parts add up to the whole, and when a bill comes round again. */
class SharesTest {

    @Test
    void anEqualSplitThatComesOutEvenGivesEveryoneTheSame() {
        assertThat(Shares.equally(18_600, 5, -1)).containsExactly(3720, 3720, 3720, 3720, 3720);
        assertThat(Shares.equally(8420, 2, -1)).containsExactly(4210, 4210);
    }

    @Test
    void theOddCentGoesToWhoeverPaidThenInTheOrderGiven() {
        // €10 between three is 3.33 each and a cent over. It goes to the one who paid.
        assertThat(Shares.equally(1000, 3, 0)).containsExactly(334, 333, 333);
        assertThat(Shares.equally(1000, 3, 1)).containsExactly(333, 334, 333);
        assertThat(Shares.equally(1000, 3, 2)).containsExactly(333, 333, 334);
        // With nobody named, to the first.
        assertThat(Shares.equally(1000, 3, -1)).containsExactly(334, 333, 333);
        // Two cents over: the payer first, then the first of the others.
        assertThat(Shares.equally(1001, 3, 2)).containsExactly(334, 333, 334);
        assertThat(Shares.equally(1, 3, 1)).containsExactly(0, 1, 0);
        assertThat(Shares.equally(2, 5, 4)).containsExactly(1, 0, 0, 0, 1);
    }

    @Test
    void byShareTheCentsLeftOverGoToWhoeverLostTheMostByRounding() {
        // €100 in parts of 1, 1 and 4: exactly 16.666…, 16.666… and 66.666…: all lost two thirds of a cent, so the
        // two cents over go to the payer and then the first in order.
        assertThat(Shares.split(10_000, new long[] {1, 1, 4}, 2)).containsExactly(1667, 1666, 6667);
        // €1 in parts of 1 and 2: 33.33… and 66.66…: the second lost more, so it gets the cent whoever paid.
        assertThat(Shares.split(100, new long[] {1, 2}, 0)).containsExactly(33, 67);
        assertThat(Shares.split(100, new long[] {2, 1}, 1)).containsExactly(67, 33);
        // 60/40 of €84.20.
        assertThat(Shares.split(8420, new long[] {60, 40}, -1)).containsExactly(5052, 3368);
    }

    @Test
    void exactAmountsThatAddUpComeBackAsTheyAre() {
        assertThat(Shares.split(8420, new long[] {5000, 3420}, -1)).containsExactly(5000, 3420);
        assertThat(Shares.split(12_345, new long[] {1, 12_344}, 0)).containsExactly(1, 12_344);
        // And when the amount changes they keep their proportions: twice the bill, twice each share.
        assertThat(Shares.split(16_840, new long[] {5000, 3420}, -1)).containsExactly(10_000, 6840);
    }

    @Test
    void thePartsAlwaysAddUpToTheWholeToTheCent() {
        Random random = new Random(20261111);
        for (int round = 0; round < 5000; round++) {
            long amount = round % 7 == 0 ? random.nextLong(Cash.MAX_CENTS) : random.nextLong(500_000);
            long[] weights = new long[1 + random.nextInt(12)];
            for (int i = 0; i < weights.length; i++) {
                weights[i] = 1 + (round % 5 == 0 ? random.nextLong(Cash.MAX_CENTS) : random.nextLong(10));
            }
            long[] parts = Shares.split(amount, weights, random.nextInt(weights.length + 1) - 1);

            assertThat(Arrays.stream(parts).sum())
                    .as("%d by %s", amount, Arrays.toString(weights))
                    .isEqualTo(amount);
            long whole = Arrays.stream(weights).sum();
            for (int i = 0; i < parts.length; i++) {
                // Nobody is more than a cent away from their exact share.
                double exact = (double) amount * weights[i] / whole;
                assertThat((double) parts[i]).isBetween(Math.floor(exact) - 0.5, Math.floor(exact) + 1.5);
            }
        }
    }

    @Test
    void nothingToDivideAndNobodyToDivideItBetween() {
        assertThat(Shares.equally(0, 3, 0)).containsExactly(0, 0, 0);
        assertThat(Shares.split(500, new long[0], -1)).isEmpty();
        assertThatThrownBy(() -> Shares.split(-1, new long[] {1}, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Shares.split(100, new long[] {1, 0}, 0)).isInstanceOf(IllegalArgumentException.class);
    }

    // ---------- when a bill comes round again ----------

    @Test
    void aMonthlyBillIsDueOnItsOwnDayAgainAndOnTheLastDayOfAShorterMonth() {
        assertThat(Repeat.MONTHLY.next(LocalDate.of(2026, 11, 12), 12, 1)).isEqualTo(LocalDate.of(2026, 12, 12));
        assertThat(Repeat.MONTHLY.next(LocalDate.of(2026, 12, 12), 12, 1)).isEqualTo(LocalDate.of(2027, 1, 12));
        // The 31st: 28 February, and the 31st again in March.
        assertThat(Repeat.MONTHLY.next(LocalDate.of(2027, 1, 31), 31, 1)).isEqualTo(LocalDate.of(2027, 2, 28));
        assertThat(Repeat.MONTHLY.next(LocalDate.of(2027, 2, 28), 31, 1)).isEqualTo(LocalDate.of(2027, 3, 31));
        assertThat(Repeat.MONTHLY.next(LocalDate.of(2027, 3, 31), 31, 1)).isEqualTo(LocalDate.of(2027, 4, 30));
        // A leap year's February has its 29th.
        assertThat(Repeat.MONTHLY.next(LocalDate.of(2028, 1, 30), 30, 1)).isEqualTo(LocalDate.of(2028, 2, 29));
    }

    @Test
    void everyFewMonthsEveryYearAndOnce() {
        assertThat(Repeat.MONTHS.next(LocalDate.of(2026, 11, 12), 12, 3)).isEqualTo(LocalDate.of(2027, 2, 12));
        assertThat(Repeat.MONTHS.next(LocalDate.of(2026, 11, 30), 30, 3)).isEqualTo(LocalDate.of(2027, 2, 28));
        assertThat(Repeat.YEARLY.next(LocalDate.of(2026, 11, 12), 12, 1)).isEqualTo(LocalDate.of(2027, 11, 12));
        assertThat(Repeat.YEARLY.next(LocalDate.of(2028, 2, 29), 29, 1)).isEqualTo(LocalDate.of(2029, 2, 28));
        assertThat(Repeat.ONCE.next(LocalDate.of(2026, 11, 12), 12, 1)).isNull();
    }

    @Test
    void whatASubscriptionCostsInAYear() {
        assertThat(Repeat.MONTHLY.yearly(1399, 1)).isEqualTo(16_788);
        assertThat(Repeat.MONTHS.yearly(3000, 3)).isEqualTo(12_000);
        assertThat(Repeat.MONTHS.yearly(1000, 5)).isEqualTo(2400);
        assertThat(Repeat.YEARLY.yearly(11_988, 1)).isEqualTo(11_988);
        assertThat(Repeat.ONCE.yearly(5000, 1)).isNull();
    }

    @Test
    void moneyIsWrittenWithItsSignAndCommasForThousands() {
        assertThat(Cash.round(8420, "EUR")).isEqualTo("€84");
        assertThat(Cash.round(8450, "EUR")).isEqualTo("€85");
        assertThat(Cash.exact(8420, "EUR")).isEqualTo("€84.20");
        assertThat(Cash.round(764_000, "EUR")).isEqualTo("€7,640");
        assertThat(Cash.exact(124_000, "EUR")).isEqualTo("€1,240.00");
        assertThat(Cash.round(6140, "GBP")).isEqualTo("£61");
        assertThat(Cash.exact(12_960, "USD")).isEqualTo("$129.60");
        assertThat(Cash.exact(120_450, "CHF")).isEqualTo("CHF 1,204.50");
        assertThat(Cash.exact(-4200, "EUR")).isEqualTo("-€42.00");
        assertThat(Cash.round(0, "EUR")).isEqualTo("€0");
    }
}
