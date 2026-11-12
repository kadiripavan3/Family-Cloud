package app.homeport.api.money.split;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Settling up: from what each person is owed or owes, the fewest payments that bring everyone to zero.
 *
 * <p>How: people who are even need nothing. The rest are sorted into as many groups as possible that each
 * add up to zero on their own (a group of n people settles in n − 1 payments, so more groups means fewer
 * payments). Up to sixteen people who aren't even, that sorting is exact: every way of grouping them is
 * weighed, so no shorter list of payments exists. Beyond sixteen, which no circle of friends reaches in
 * practice, everyone is treated as one group. Inside a group, whoever owes the most pays whoever is owed
 * the most, until the group is even.
 *
 * <p>The payments always add up: what someone pays in all is exactly what they owed, to the cent.
 */
public final class Settle {

    static final int EXACT_UP_TO = 16;

    private Settle() {}

    /** One payment: the person at place {@code from} of the balances pays the one at place {@code to}. */
    public record Payment(int from, int to, long cents) {}

    /**
     * @param balances what each person is owed (above zero) or owes (below zero), in cents. They must add up
     *     to zero.
     * @return the payments, the largest first
     */
    public static List<Payment> fewest(long[] balances) {
        long sum = 0;
        List<Integer> uneven = new ArrayList<>();
        for (int i = 0; i < balances.length; i++) {
            sum += balances[i];
            if (balances[i] != 0) {
                uneven.add(i);
            }
        }
        if (sum != 0) {
            throw new IllegalArgumentException("What people owe and are owed must add up to zero.");
        }
        List<Payment> payments = new ArrayList<>();
        for (List<Integer> group : uneven.size() <= EXACT_UP_TO ? groups(balances, uneven) : List.of(uneven)) {
            settle(balances, group, payments);
        }
        payments.sort(Comparator.comparingLong(Payment::cents)
                .reversed()
                .thenComparingInt(Payment::from)
                .thenComparingInt(Payment::to));
        return payments;
    }

    /**
     * Sorts the people who aren't even into the largest number of groups that each add up to zero.
     *
     * <p>Every set of people is a number whose bits say who is in it. {@code most[set]} is the largest number
     * of zero-sum groups the set can be cut into along one chain of taking people out one at a time; it is
     * the best of the set without each one of its people, plus one when the set itself adds up to zero.
     * Walking that chain back from everyone gives the groups: the people between one zero-sum set and the
     * next smaller one.
     */
    private static List<List<Integer>> groups(long[] balances, List<Integer> people) {
        int n = people.size();
        int all = (1 << n) - 1;
        long[] sum = new long[all + 1];
        int[] most = new int[all + 1];
        for (int set = 1; set <= all; set++) {
            int low = Integer.numberOfTrailingZeros(set);
            sum[set] = sum[set & (set - 1)] + balances[people.get(low)];
            int best = 0;
            for (int i = 0; i < n; i++) {
                if ((set & (1 << i)) != 0) {
                    best = Math.max(best, most[set & ~(1 << i)]);
                }
            }
            most[set] = best + (sum[set] == 0 ? 1 : 0);
        }
        List<List<Integer>> groups = new ArrayList<>();
        int set = all;
        int closed = all;
        while (set != 0) {
            int wanted = most[set] - (sum[set] == 0 ? 1 : 0);
            for (int i = 0; i < n; i++) {
                if ((set & (1 << i)) != 0 && most[set & ~(1 << i)] == wanted) {
                    set &= ~(1 << i);
                    break;
                }
            }
            if (sum[set] == 0) {
                List<Integer> group = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    if (((closed & ~set) & (1 << i)) != 0) {
                        group.add(people.get(i));
                    }
                }
                groups.add(group);
                closed = set;
            }
        }
        return groups;
    }

    /** Inside one group that adds up to zero: whoever owes the most pays whoever is owed the most, until all are even. */
    private static void settle(long[] balances, List<Integer> group, List<Payment> payments) {
        long[] left = new long[balances.length];
        for (int person : group) {
            left[person] = balances[person];
        }
        while (true) {
            int owes = -1;
            int owed = -1;
            for (int person : group) {
                if (left[person] < 0 && (owes < 0 || left[person] < left[owes])) {
                    owes = person;
                }
                if (left[person] > 0 && (owed < 0 || left[person] > left[owed])) {
                    owed = person;
                }
            }
            if (owes < 0 || owed < 0) {
                return;
            }
            long cents = Math.min(-left[owes], left[owed]);
            payments.add(new Payment(owes, owed, cents));
            left[owes] += cents;
            left[owed] -= cents;
        }
    }
}
