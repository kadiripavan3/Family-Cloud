package app.homeport.api.board.templates;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.board.templates.FairerSplit.Part;
import app.homeport.api.board.templates.FairerSplit.Proposal;
import app.homeport.api.board.templates.HeadsUp.Stay;
import app.homeport.api.board.templates.Kitty.Move;
import app.homeport.api.board.templates.Kitty.Sums;
import app.homeport.api.board.templates.SecretSanta.Pair;
import app.homeport.api.common.ApiProblem;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/**
 * The sums and small rules inside the flat's and the crew's templates, on plain values: the draw, the best
 * day, the kitty, shares to the cent, nights away.
 */
class KindsSumsTest {

    private static LocalDate day(String iso) {
        return LocalDate.parse(iso);
    }

    private static List<String> names(int count) {
        return IntStream.range(0, count).mapToObj(i -> "Person " + i).toList();
    }

    // ---------- Secret Santa: the draw ----------

    @Test
    void inADrawOfAnySizeNobodyDrawsThemselvesAndEveryoneIsDrawnExactlyOnce() {
        Random random = new Random(7);
        for (int size = 3; size <= 30; size++) {
            for (int round = 0; round < 40; round++) {
                int[] to = SecretSanta.draw(size, List.of(), names(size), random);
                assertThat(to).hasSize(size);
                Set<Integer> receivers = new HashSet<>();
                for (int giver = 0; giver < size; giver++) {
                    assertThat(to[giver]).as("nobody draws themselves").isNotEqualTo(giver);
                    receivers.add(to[giver]);
                }
                assertThat(receivers).as("everyone receives once").hasSize(size);
            }
        }
    }

    @Test
    void peopleWhoAreKeptApartNeverDrawEachOtherInEitherDirection() {
        Random random = new Random(11);
        // Ten people, three couples: 0-1, 2-3, 4-5.
        List<Pair> couples = List.of(new Pair(0, 1), new Pair(2, 3), new Pair(5, 4));
        for (int round = 0; round < 500; round++) {
            int[] to = SecretSanta.draw(10, couples, names(10), random);
            for (Pair couple : couples) {
                assertThat(to[couple.a()]).isNotEqualTo(couple.b());
                assertThat(to[couple.b()]).isNotEqualTo(couple.a());
            }
            assertThat(IntStream.of(to).distinct().count()).isEqualTo(10);
        }
        // Five friends, one couple: the sample crew.
        for (int round = 0; round < 500; round++) {
            int[] to = SecretSanta.draw(5, List.of(new Pair(0, 2)), names(5), random);
            assertThat(to[0]).isNotIn(0, 2);
            assertThat(to[2]).isNotIn(2, 0);
        }
    }

    @Test
    void everyWayTheRulesAllowComesUpAndNoneMuchMoreOftenThanAnother() {
        // Four people have nine ways to draw. Over many draws each comes up about one time in nine.
        Random random = new Random(3);
        Map<String, Integer> seen = new java.util.TreeMap<>();
        int draws = 18_000;
        for (int round = 0; round < draws; round++) {
            seen.merge(java.util.Arrays.toString(SecretSanta.draw(4, List.of(), names(4), random)), 1, Integer::sum);
        }
        assertThat(seen).hasSize(9);
        assertThat(seen.values()).allSatisfy(times -> assertThat(times).isBetween(1700, 2300));
        // With a couple in four, each of the others can still be drawn by each of the two.
        Set<Integer> zeroDrew = new HashSet<>();
        for (int round = 0; round < 200; round++) {
            zeroDrew.add(SecretSanta.draw(4, List.of(new Pair(0, 1)), names(4), random)[0]);
        }
        assertThat(zeroDrew).containsExactlyInAnyOrder(2, 3);
    }

    @Test
    void rulesThatLeaveNoWayToDrawAreAnsweredWithASentence() {
        Random random = new Random(1);
        // Two names: each would know who has them.
        assertThatThrownBy(() -> SecretSanta.draw(2, List.of(), names(2), random))
                .isInstanceOf(ApiProblem.class)
                .hasMessageContaining("at least three names");
        // Three people, two of them a couple: both would have to draw the third.
        assertThatThrownBy(() -> SecretSanta.draw(3, List.of(new Pair(0, 1)), names(3), random))
                .isInstanceOf(ApiProblem.class)
                .hasMessageContaining("can't be drawn")
                .hasMessageContaining("Take a rule away, or add a name");
        // Someone kept apart from everyone.
        assertThatThrownBy(() ->
                        SecretSanta.draw(4, List.of(new Pair(0, 1), new Pair(0, 2), new Pair(0, 3)), names(4), random))
                .isInstanceOf(ApiProblem.class)
                .hasMessageContaining("can't be drawn");
    }

    @Test
    void rulesThatWouldGiveAPairingAwayAreRefusedToo() {
        // Four people; the first is kept apart from two of the others, so everyone could tell who they draw.
        assertThatThrownBy(() -> SecretSanta.draw(4, List.of(new Pair(0, 1), new Pair(0, 2)), names(4), new Random(5)))
                .isInstanceOf(ApiProblem.class)
                .hasMessageContaining("everyone could work out who Person 0 draws");
        // The same rules among six leave everyone at least two names to draw: it goes ahead.
        int[] to = SecretSanta.draw(6, List.of(new Pair(0, 1), new Pair(0, 2)), names(6), new Random(5));
        assertThat(to[0]).isIn(3, 4, 5);
    }

    // ---------- When can everyone? ----------

    @Test
    void theBestDayIsTheOneMostPeopleCanDoAndTheEarliestWhenSeveralTie() {
        LocalDate today = day("2026-11-11");
        assertThat(FindDate.best(Map.of(), today)).isNull();
        assertThat(FindDate.best(Map.of(day("2026-11-20"), 0), today)).isNull();
        assertThat(FindDate.best(Map.of(day("2026-11-20"), 3, day("2026-11-28"), 4, day("2026-11-29"), 2), today))
                .isEqualTo(day("2026-11-28"));
        // A tie: the earlier day.
        assertThat(FindDate.best(Map.of(day("2026-11-27"), 3, day("2026-11-21"), 3, day("2026-12-04"), 3), today))
                .isEqualTo(day("2026-11-21"));
        // A day that has passed doesn't count, however many could have done it. Today still does.
        assertThat(FindDate.best(Map.of(day("2026-11-10"), 5, day("2026-11-11"), 2, day("2026-11-12"), 1), today))
                .isEqualTo(day("2026-11-11"));
        assertThat(FindDate.best(Map.of(day("2026-11-10"), 5), today)).isNull();
    }

    // ---------- the kitty ----------

    @Test
    void theKittyHoldsWhatWasPaidInLessWhatWasBoughtToTheCent() {
        LocalDate november = day("2026-11-01");
        List<Move> moves = List.of(
                new Move(true, 1000, day("2026-10-01")),
                new Move(true, 1000, day("2026-10-01")),
                new Move(true, 1000, day("2026-10-01")),
                new Move(false, 2000, day("2026-10-15")),
                new Move(true, 1000, day("2026-11-01")),
                new Move(true, 1000, day("2026-11-01")),
                new Move(false, 1470, day("2026-11-02")),
                new Move(false, 890, day("2026-11-10")));
        assertThat(Kitty.sums(moves, november)).isEqualTo(new Sums(1000, 2000, 2360, 640));
        // Seen from October, the same pot: nothing left over, and the same €6.40 at the end.
        assertThat(Kitty.sums(moves, day("2026-10-01"))).isEqualTo(new Sums(0, 5000, 4360, 640));
        // An empty pot, and one that is short because the shop cost more than it held.
        assertThat(Kitty.sums(List.of(), november)).isEqualTo(new Sums(0, 0, 0, 0));
        assertThat(Kitty.sums(
                                List.of(
                                        new Move(true, 500, day("2026-11-03")),
                                        new Move(false, 749, day("2026-11-04"))),
                                november)
                        .balance())
                .isEqualTo(-249);
        // A cent is a cent: three odd amounts add up exactly.
        assertThat(Kitty.sums(
                                List.of(
                                        new Move(true, 333, november),
                                        new Move(true, 333, november),
                                        new Move(true, 334, november),
                                        new Move(false, 999, november)),
                                november)
                        .balance())
                .isEqualTo(1);
    }

    @Test
    void shoppingGoesRoundTheFlatInItsOwnOrder() {
        List<String> flat = List.of("Kai", "Lea", "Lena");
        assertThat(Kitty.nextShopper(flat, null)).isEqualTo("Kai");
        assertThat(Kitty.nextShopper(flat, "Kai")).isEqualTo("Lea");
        assertThat(Kitty.nextShopper(flat, "Lea")).isEqualTo("Lena");
        assertThat(Kitty.nextShopper(flat, "Lena")).isEqualTo("Kai");
        // Whoever shopped last has moved out: it starts with the first again.
        assertThat(Kitty.nextShopper(flat, "Ana")).isEqualTo("Kai");
        String nobody = Kitty.nextShopper(List.<String>of(), "Kai");
        assertThat(nobody).isNull();
    }

    // ---------- a fairer split ----------

    @Test
    void sharesAlwaysAddUpToTheTotalToTheCent() {
        // October's electricity by nights at home: 30, 26 and 12 of 31.
        assertThat(FairerSplit.shares(15900, new long[] {30, 26, 12})).containsExactly(7015, 6079, 2806);
        // €10 in three: the odd cent goes to the first.
        assertThat(FairerSplit.shares(1000, new long[] {1, 1, 1})).containsExactly(334, 333, 333);
        assertThat(FairerSplit.shares(1001, new long[] {1, 1, 1})).containsExactly(334, 334, 333);
        // Someone who was never at home pays nothing; with no weights at all it is split equally.
        assertThat(FairerSplit.shares(9000, new long[] {10, 0, 20})).containsExactly(3000, 0, 6000);
        assertThat(FairerSplit.shares(9000, new long[] {0, 0, 0})).containsExactly(3000, 3000, 3000);
        assertThat(FairerSplit.shares(5, new long[] {1, 1, 1, 1, 1, 1, 1})).containsExactly(1, 1, 1, 1, 1, 0, 0);
        assertThat(FairerSplit.shares(0, new long[] {3, 4})).containsExactly(0, 0);
        // Whatever the total and the weights: nothing is lost and nothing is made.
        Random random = new Random(42);
        for (int round = 0; round < 2000; round++) {
            long total = random.nextInt(2_000_000);
            long[] weights = new long[1 + random.nextInt(8)];
            for (int i = 0; i < weights.length; i++) {
                weights[i] = random.nextInt(400);
            }
            long[] shares = FairerSplit.shares(total, weights);
            assertThat(java.util.Arrays.stream(shares).sum()).isEqualTo(total);
            assertThat(java.util.Arrays.stream(shares).min().orElse(0)).isGreaterThanOrEqualTo(0);
        }
    }

    @Test
    void rentFollowsTheRoomWithTheSharedSpaceSplitEvenly() {
        // 18, 14 and 11 m² and 20 m² shared, €950: each pays for their room and a third of the rest.
        long[] weights = FairerSplit.roomWeights(new long[] {18, 14, 11}, 20);
        assertThat(weights).containsExactly(74, 62, 53);
        assertThat(FairerSplit.shares(95000, weights)).containsExactly(37196, 31164, 26640);
        // With no shared space it is the rooms alone; equal rooms pay the same.
        assertThat(FairerSplit.shares(90000, FairerSplit.roomWeights(new long[] {20, 10}, 0)))
                .containsExactly(60000, 30000);
        assertThat(FairerSplit.shares(90000, FairerSplit.roomWeights(new long[] {12, 12, 12}, 30)))
                .containsExactly(30000, 30000, 30000);
        // A proposal knows what the rule alone gives, also after someone moved the numbers by hand.
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        Proposal byHand = new Proposal(
                "room",
                95000,
                20L,
                List.of(new Part(a, 37200, 18L, null), new Part(b, 31000, 14L, null), new Part(c, 26800, 11L, null)));
        assertThat(FairerSplit.byRule(byHand)).containsExactly(37196, 31164, 26640);
        assertThat(FairerSplit.byRule(new Proposal("equal", 1000, null, byHand.parts())))
                .containsExactly(334, 333, 333);
        assertThat(FairerSplit.byRule(new Proposal("own", 95000, null, byHand.parts())))
                .containsExactly(37200, 31000, 26800);
    }

    @Test
    void nightsAwayAreCountedOnceEachWithinTheDaysOfTheBill() {
        LocalDate first = day("2026-10-01");
        LocalDate last = day("2026-10-31");
        assertThat(HeadsUp.nightsAway(List.of(), first, last)).isZero();
        // Away on the 20th, back on the 27th: seven nights.
        assertThat(HeadsUp.nightsAway(List.of(new Stay(day("2026-10-20"), day("2026-10-27"))), first, last))
                .isEqualTo(7);
        // Only the nights inside the bill's days count: two before it starts, and the last night of the month.
        assertThat(HeadsUp.nightsAway(List.of(new Stay(day("2026-09-28"), day("2026-10-03"))), first, last))
                .isEqualTo(2);
        assertThat(HeadsUp.nightsAway(List.of(new Stay(day("2026-10-31"), day("2026-11-05"))), first, last))
                .isEqualTo(1);
        assertThat(HeadsUp.nightsAway(List.of(new Stay(day("2026-11-01"), day("2026-11-05"))), first, last))
                .isZero();
        // Two notices over the same nights count them once; a whole month away is every night of it.
        assertThat(HeadsUp.nightsAway(
                        List.of(
                                new Stay(day("2026-10-10"), day("2026-10-15")),
                                new Stay(day("2026-10-13"), day("2026-10-17"))),
                        first,
                        last))
                .isEqualTo(7);
        assertThat(HeadsUp.nightsAway(List.of(new Stay(day("2026-09-01"), day("2026-12-01"))), first, last))
                .isEqualTo(31);
    }

    // ---------- where next, the walk, and words ----------

    @Test
    void theWinnerHasTheMostVotesAndOfTwoWithTheSameTheOneAddedFirst() {
        List<String> ideas = List.of("Porto", "Soča", "Sicily");
        assertThat(WhereNext.winner(ideas, Map.of("Porto", 3, "Soča", 1, "Sicily", 1)))
                .isEqualTo("Porto");
        assertThat(WhereNext.winner(ideas, Map.of("Soča", 2, "Sicily", 2))).isEqualTo("Soča");
        assertThat(WhereNext.winner(ideas, Map.of("Sicily", 1))).isEqualTo("Sicily");
        String nobody = WhereNext.winner(ideas, Map.of());
        assertThat(nobody).isNull();
    }

    @Test
    void theWalkIsCountedInWholeMetresAndSaidInKilometres() {
        assertThat(WalkTogether.percent(1_240_000, 2_100_000)).isEqualTo(59);
        assertThat(WalkTogether.percent(2_099_999, 2_100_000)).isEqualTo(99);
        assertThat(WalkTogether.percent(2_100_000, 2_100_000)).isEqualTo(100);
        assertThat(WalkTogether.percent(9_000_000, 2_100_000)).isEqualTo(100);
        assertThat(WalkTogether.percent(0, 2_100_000)).isZero();
        assertThat(WalkTogether.percent(5, 0)).isZero();
        assertThat(WalkTogether.words(1_240_000, "km")).isEqualTo("1,240 km");
        assertThat(WalkTogether.words(31_400, "km")).isEqualTo("31 km");
        assertThat(WalkTogether.words(84_000, "steps")).isEqualTo("84,000 steps");
    }

    @Test
    void numbersAndNamesAreSaidTheWayAPersonWould() {
        assertThat(Say.number(1240)).isEqualTo("1,240");
        assertThat(Say.number(7)).isEqualTo("7");
        assertThat(Say.spell(4)).isEqualTo("four");
        assertThat(Say.spell(12)).isEqualTo("twelve");
        assertThat(Say.spell(13)).isEqualTo("13");
        assertThat(Say.list(List.of())).isEmpty();
        assertThat(Say.list(List.of("Lea"))).isEqualTo("Lea");
        assertThat(Say.list(List.of("you", "Lea"))).isEqualTo("you and Lea");
        assertThat(Say.list(List.of("Lea", "Lena", "Ana", "you"))).isEqualTo("Lea, Lena, Ana and you");
        assertThat(Say.lowerFirst("Electricity")).isEqualTo("electricity");
        assertThat(Say.lowerFirst("TV licence")).isEqualTo("TV licence");
        assertThat(FairerSplit.title(new FairerSplit.Split(
                        "Electricity", "bills", false, day("2026-10-01"), day("2026-10-31"), null, "EUR")))
                .isEqualTo("October's electricity");
        assertThat(FairerSplit.title(new FairerSplit.Split("Rent", "rent", true, null, null, null, "EUR")))
                .isEqualTo("Rent");
    }
}
