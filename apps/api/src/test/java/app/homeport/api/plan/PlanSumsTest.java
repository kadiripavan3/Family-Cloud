package app.homeport.api.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.function.LongFunction;
import org.junit.jupiter.api.Test;

/** The sums and the words of Plan that need no database: a goal's pace, whose turn it is, how days and money read. */
class PlanSumsTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);
    private static final LongFunction<String> EUROS = cents -> Amounts.money(cents, "EUR");

    @Test
    void theNorwayGoalReadsAsOnTheScreen() {
        GoalPace pace = GoalPace.work(800_000, 560_000, TODAY.minusWeeks(36), TODAY.plusWeeks(20), TODAY, 100, EUROS);

        assertThat(pace.percent()).isEqualTo(70);
        assertThat(pace.toGoLine()).isEqualTo("€2,400 to go");
        assertThat(pace.timeLine()).isEqualTo("20 weeks left");
        assertThat(pace.paceLine()).isEqualTo("On track: €120 a week gets there");
        assertThat(pace.onTrack()).isTrue();
    }

    @Test
    void aGoalIsBehindWhenThePaceSoFarWouldNotGetThereInTime() {
        // €1,000 in 36 weeks is €28 a week; €7,000 in 20 weeks needs €350.
        GoalPace pace = GoalPace.work(800_000, 100_000, TODAY.minusWeeks(36), TODAY.plusWeeks(20), TODAY, 100, EUROS);

        assertThat(pace.onTrack()).isFalse();
        assertThat(pace.paceLine()).isEqualTo("Behind: €350 a week gets there");
    }

    @Test
    void whatGetsThereIsRoundedUpAndTheLastDaysAreCountedInDays() {
        GoalPace odd = GoalPace.work(100_000, 0, TODAY, TODAY.plusDays(21), TODAY, 100, EUROS);
        assertThat(odd.paceLine())
                .as("€333.33 a week, said as whole euros that are enough")
                .endsWith("€334 a week gets there");
        assertThat(odd.timeLine()).isEqualTo("3 weeks left");
        assertThat(GoalPace.work(100, 10, TODAY, TODAY.plusDays(9), TODAY, 1, Amounts::count)
                        .timeLine())
                .isEqualTo("9 days left");
        assertThat(GoalPace.work(100, 10, TODAY, TODAY.plusDays(1), TODAY, 1, Amounts::count)
                        .timeLine())
                .isEqualTo("1 day left");
        assertThat(GoalPace.work(100, 10, TODAY, TODAY, TODAY, 1, Amounts::count)
                        .timeLine())
                .isEqualTo("Today is the day");
    }

    @Test
    void theRingIsNeverFullBeforeTheTargetAndNeverMoreThanFull() {
        assertThat(GoalPace.work(1000, 999, TODAY, null, TODAY, 1, Amounts::count)
                        .percent())
                .isEqualTo(99);
        assertThat(GoalPace.work(1000, 1000, TODAY, null, TODAY, 1, Amounts::count)
                        .percent())
                .isEqualTo(100);
        GoalPace over = GoalPace.work(1000, 1500, TODAY, TODAY.plusDays(5), TODAY, 1, Amounts::count);
        assertThat(over.percent()).isEqualTo(100);
        assertThat(over.reached()).isTrue();
        assertThat(over.toGo()).isZero();
        assertThat(over.toGoLine()).isEqualTo("Reached");
        assertThat(GoalPace.work(1_460_000, 1_050_000, TODAY, null, TODAY, 100, EUROS)
                        .percent())
                .as("71.9 rounds to 72, as the car's ring shows")
                .isEqualTo(72);
        assertThat(GoalPace.work(20, -3, TODAY, null, TODAY, 1, Amounts::count).percent())
                .isZero();
    }

    @Test
    void withoutADayThePaceSoFarSaysHowLongItStillTakesAndAPassedDaySaysSo() {
        GoalPace open = GoalPace.work(20, 13, TODAY.minusWeeks(26), null, TODAY, 1, Amounts::count);
        assertThat(open.onTrack()).isNull();
        assertThat(open.timeLine()).isNull();
        assertThat(open.paceLine()).isEqualTo("At this pace: about 14 weeks to go");
        assertThat(GoalPace.work(20, 0, TODAY.minusWeeks(26), null, TODAY, 1, Amounts::count)
                        .paceLine())
                .as("nothing yet, nothing to say")
                .isEmpty();
        GoalPace late = GoalPace.work(20, 13, TODAY.minusWeeks(26), TODAY.minusDays(1), TODAY, 1, Amounts::count);
        assertThat(late.onTrack()).isFalse();
        assertThat(late.timeLine()).isEqualTo("Past its day");
        assertThat(late.paceLine()).isEqualTo("Past its day: 7 to go");
    }

    @Test
    void turnsGoRoundInOrderAndSomeoneWhoLeftDropsOut() {
        UUID nora = UUID.randomUUID();
        UUID alex = UUID.randomUUID();
        UUID mia = UUID.randomUUID();
        List<UUID> order = List.of(nora, alex, mia);

        assertThat(Turns.now(alex, order)).isEqualTo(alex);
        assertThat(Turns.after(alex, order, 1)).isEqualTo(mia);
        assertThat(Turns.after(mia, order, 1)).as("round again").isEqualTo(nora);
        assertThat(Turns.after(nora, order, 5)).isEqualTo(mia);
        assertThat(Turns.before(nora, order)).isEqualTo(mia);
        assertThat(Turns.now(null, order)).as("nobody yet: the first").isEqualTo(nora);
        assertThat(Turns.now(UUID.randomUUID(), order))
                .as("whoever had it left")
                .isEqualTo(nora);
        assertThat(Turns.now(alex, List.of())).isNull();
        assertThat(Turns.after(alex, List.of(), 1)).isNull();
    }

    @Test
    void daysTimesAndMoneyReadTheWayThePeopleOnTheScreensSayThem() {
        assertThat(Words.time(LocalTime.of(9, 0))).isEqualTo("9:00");
        assertThat(Words.time(LocalTime.of(15, 30))).isEqualTo("15:30");
        assertThat(Words.day(LocalDate.of(2026, 11, 14))).isEqualTo("Sat 14 Nov");
        assertThat(Words.day(LocalDate.of(2027, 1, 2), TODAY)).isEqualTo("Sat 2 Jan 2027");
        assertThat(Words.when(TODAY, LocalTime.of(18, 0), TODAY)).isEqualTo("today 18:00");
        assertThat(Words.when(TODAY.plusDays(1), LocalTime.of(9, 0), TODAY)).isEqualTo("tomorrow 9:00");
        assertThat(Words.when(TODAY.plusDays(3), LocalTime.of(10, 0), TODAY)).isEqualTo("Sat 14 Nov, 10:00");
        assertThat(Words.when(TODAY.plusDays(3), null, TODAY)).isEqualTo("Sat 14 Nov");
        assertThat(Words.weekdayNear(TODAY.plusDays(2), TODAY)).isEqualTo("Friday");
        assertThat(Words.weekdayNear(TODAY.minusDays(2), TODAY)).isEqualTo("Monday");
        assertThat(Words.weekdayNear(LocalDate.of(2027, 1, 2), TODAY)).isEqualTo("2 Jan");
        assertThat(Words.partOfDay(LocalTime.of(19, 0))).isEqualTo("Tonight");
        assertThat(Words.partOfDay(LocalTime.of(8, 0))).isEqualTo("This morning");
        assertThat(Words.partOfDay(null)).isEqualTo("Today");
        assertThat(Words.before(60)).isEqualTo("1 hour before");
        assertThat(Words.before(90)).isEqualTo("90 minutes before");
        assertThat(Words.before(2880)).isEqualTo("2 days before");
        assertThat(Words.beforeSpoken(60)).isEqualTo("an hour before");
        assertThat(Words.list(List.of("Alex", "Mia", "Leo"))).isEqualTo("Alex, Mia and Leo");
        assertThat(Words.dots("19:00", null, "", "takes turns")).isEqualTo("19:00 · takes turns");
        assertThat(Amounts.money(560_000, "EUR")).isEqualTo("€5,600");
        assertThat(Amounts.money(1250, "EUR")).isEqualTo("€12.50");
        assertThat(Amounts.money(-500, "GBP")).isEqualTo("-£5");
        assertThat(Amounts.money(8400, "CHF")).isEqualTo("CHF 84");
        assertThat(Amounts.count(1284)).isEqualTo("1,284");
    }
}
