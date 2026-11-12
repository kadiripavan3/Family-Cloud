package app.homeport.api.money.split;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.money.split.Settle.Payment;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Settling up: the fewest payments that bring everyone to zero, to the cent. */
class SettleTest {

    /** Where everyone stands after these payments are made: it has to be zero for all. */
    private static long[] after(long[] balances, List<Payment> payments) {
        long[] left = balances.clone();
        for (Payment payment : payments) {
            assertThat(payment.cents()).as("a payment is of something").isPositive();
            assertThat(payment.from()).as("nobody pays themselves").isNotEqualTo(payment.to());
            left[payment.from()] += payment.cents();
            left[payment.to()] -= payment.cents();
        }
        return left;
    }

    @Test
    void theLisbonWeekendSettlesInThreePayments() {
        // Lea −44, Nora +64, Kai −20, Lena −31, Ana +31: the screen's "fewest payments to settle up".
        long[] balances = {-4400, 6400, -2000, -3100, 3100};

        List<Payment> payments = Settle.fewest(balances);

        assertThat(payments).containsExactly(new Payment(0, 1, 4400), new Payment(3, 4, 3100), new Payment(2, 1, 2000));
        assertThat(after(balances, payments)).containsOnly(0);
    }

    @Test
    void twoPeopleNeedOnePaymentAndPeopleWhoAreEvenNeedNone() {
        assertThat(Settle.fewest(new long[] {4200, -4200})).containsExactly(new Payment(1, 0, 4200));
        assertThat(Settle.fewest(new long[] {0, 0, 0})).isEmpty();
        assertThat(Settle.fewest(new long[0])).isEmpty();
        assertThat(Settle.fewest(new long[] {0, 500, 0, -500})).containsExactly(new Payment(3, 1, 500));
    }

    @Test
    void pairsThatCancelOutAreSettledBetweenThemselves() {
        // Six people in three pairs: three payments, where settling them as one group would take five.
        long[] balances = {1000, -1000, 2500, -2500, 730, -730};

        List<Payment> payments = Settle.fewest(balances);

        assertThat(payments).hasSize(3);
        assertThat(after(balances, payments)).containsOnly(0);
    }

    @Test
    void itFindsTheGroupingThatPayingTheLargestFirstMisses() {
        // Owing 6, 5 and 4; owed 9, 4 and 2. "Whoever owes most pays whoever is owed most" takes five payments.
        // But the six fall into two groups that each cancel out (6 against 4 and 2; 5 and 4 against 9), so four do.
        long[] balances = {-600, -500, -400, 900, 400, 200};
        List<Payment> payments = Settle.fewest(balances);
        assertThat(payments).hasSize(4);
        assertThat(after(balances, payments)).containsOnly(0);

        // Nothing cancels out among these five, so four payments it is.
        assertThat(Settle.fewest(new long[] {-600, -400, 500, 300, 200})).hasSize(4);

        // A group of three hidden among seven: {900, −400, −500} and {250, 750, −300, −700}: five payments, not six.
        long[] seven = {900, 250, 750, -400, -500, -300, -700};
        payments = Settle.fewest(seven);
        assertThat(payments).hasSize(5);
        assertThat(after(seven, payments)).containsOnly(0);
    }

    @Test
    void thePaymentsAlwaysBringEveryoneToZeroAndAreNeverMoreThanPeopleLessOne() {
        Random random = new Random(64);
        for (int round = 0; round < 3000; round++) {
            int people = 2 + random.nextInt(11);
            long[] balances = new long[people];
            long sum = 0;
            for (int i = 0; i < people - 1; i++) {
                // Small round numbers, so that groups which cancel out really occur.
                balances[i] = round % 3 == 0 ? (random.nextInt(9) - 4) * 500L : random.nextInt(200_001) - 100_000;
                sum += balances[i];
            }
            balances[people - 1] = -sum;

            List<Payment> payments = Settle.fewest(balances);

            assertThat(after(balances, payments)).as("round %d", round).containsOnly(0);
            long uneven = java.util.Arrays.stream(balances).filter(b -> b != 0).count();
            assertThat((long) payments.size()).isLessThanOrEqualTo(Math.max(uneven - 1, 0));
            // Nobody who is owed money pays, and nobody who owes is paid.
            for (Payment payment : payments) {
                assertThat(balances[payment.from()]).isNegative();
                assertThat(balances[payment.to()]).isPositive();
            }
        }
    }

    @Test
    void neverMorePaymentsThanSettlingEveryoneAsOneGroupAndFewerWheneverGroupsCancelOut() {
        Random random = new Random(31);
        for (int round = 0; round < 500; round++) {
            // Three groups that each cancel out, shuffled together: at most (people − 3) payments.
            long[] balances = new long[9];
            for (int group = 0; group < 3; group++) {
                long a = 100 * (1 + random.nextInt(50));
                long b = 100 * (1 + random.nextInt(50));
                balances[group * 3] = a;
                balances[group * 3 + 1] = b;
                balances[group * 3 + 2] = -(a + b);
            }
            for (int i = balances.length - 1; i > 0; i--) {
                int j = random.nextInt(i + 1);
                long swap = balances[i];
                balances[i] = balances[j];
                balances[j] = swap;
            }

            List<Payment> payments = Settle.fewest(balances);

            assertThat(payments.size()).isLessThanOrEqualTo(6);
            assertThat(after(balances, payments)).containsOnly(0);
        }
    }

    @Test
    void aLargeCircleIsStillSettledToTheCent() {
        // More people than it weighs every grouping for: one group, at most people − 1 payments.
        long[] balances = new long[24];
        long sum = 0;
        for (int i = 0; i < 23; i++) {
            balances[i] = (i % 2 == 0 ? 1 : -1) * (1000L + 37 * i);
            sum += balances[i];
        }
        balances[23] = -sum;

        List<Payment> payments = Settle.fewest(balances);

        assertThat(payments.size()).isLessThanOrEqualTo(23);
        assertThat(after(balances, payments)).containsOnly(0);
    }

    @Test
    void balancesThatDoNotAddUpToZeroAreAMistakeSomewhereElse() {
        assertThatThrownBy(() -> Settle.fewest(new long[] {100, -99})).isInstanceOf(IllegalArgumentException.class);
    }
}
