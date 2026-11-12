package app.homeport.api.money;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Comparator;

/**
 * Dividing an amount between people so that the parts add up to the whole, to the cent.
 *
 * <p>The rule, written down once: everyone gets their exact share rounded down to the cent. The cents left
 * over (always fewer than there are people) are handed out one each, first to whoever lost the largest
 * fraction of a cent by the rounding. Among people who lost the same (an equal split), the first cent goes to
 * the one named as {@code first}, which is the person who paid, and the rest in the order the people are
 * given. So €10 between three, paid by the second, is 3.33, 3.34, 3.33.
 */
public final class Shares {

    private Shares() {}

    /**
     * @param amountCents what is divided, zero or more
     * @param weights each person's part of the whole: 1 each for an equal split, 2 and 1 for two thirds and
     *     one third, the cents themselves for exact amounts. All above zero.
     * @param first the place in {@code weights} of the person who gets an odd cent first, or -1 for none
     * @return each person's cents, in the order of {@code weights}; they add up to {@code amountCents}
     */
    public static long[] split(long amountCents, long[] weights, int first) {
        if (amountCents < 0) {
            throw new IllegalArgumentException("An amount to divide can't be below zero.");
        }
        int n = weights.length;
        long[] parts = new long[n];
        if (n == 0) {
            return parts;
        }
        BigInteger whole = BigInteger.ZERO;
        for (long weight : weights) {
            if (weight <= 0) {
                throw new IllegalArgumentException("Each part must be above zero.");
            }
            whole = whole.add(BigInteger.valueOf(weight));
        }
        BigInteger amount = BigInteger.valueOf(amountCents);
        BigInteger[] lost = new BigInteger[n];
        long given = 0;
        for (int i = 0; i < n; i++) {
            BigInteger[] exact = amount.multiply(BigInteger.valueOf(weights[i])).divideAndRemainder(whole);
            parts[i] = exact[0].longValueExact();
            lost[i] = exact[1];
            given += parts[i];
        }
        Integer[] order = new Integer[n];
        Arrays.setAll(order, i -> i);
        Arrays.sort(
                order,
                Comparator.<Integer, BigInteger>comparing(i -> lost[i])
                        .reversed()
                        .thenComparing(i -> i == first ? 0 : 1)
                        .thenComparing(i -> i));
        for (int k = 0; k < amountCents - given; k++) {
            parts[order[k]]++;
        }
        return parts;
    }

    /** An equal split between this many people. */
    public static long[] equally(long amountCents, int people, int first) {
        long[] weights = new long[people];
        Arrays.fill(weights, 1);
        return split(amountCents, weights, first);
    }
}
