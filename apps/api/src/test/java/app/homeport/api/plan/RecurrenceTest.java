package app.homeport.api.plan;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.plan.Recurrence.Unit;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** How things come round again. Plain sums on dates: no database, no Spring. */
class RecurrenceTest {

    private static LocalDate day(String iso) {
        return LocalDate.parse(iso);
    }

    private static List<String> between(Recurrence rule, String start, String from, String to) {
        return rule.between(day(start), day(from), day(to)).stream()
                .map(LocalDate::toString)
                .toList();
    }

    @Test
    void everyDayAndEveryFewDays() {
        assertThat(between(Recurrence.every(Unit.DAY), "2026-11-11", "2026-11-10", "2026-11-13"))
                .containsExactly("2026-11-11", "2026-11-12", "2026-11-13");
        Recurrence everyThird = new Recurrence(Unit.DAY, 3, Set.of(), null);
        assertThat(between(everyThird, "2026-11-11", "2026-11-12", "2026-11-20"))
                .containsExactly("2026-11-14", "2026-11-17", "2026-11-20");
        assertThat(everyThird.occursOn(day("2026-11-11"), day("2026-11-11"))).isTrue();
        assertThat(everyThird.occursOn(day("2026-11-11"), day("2026-11-12"))).isFalse();
    }

    @Test
    void nothingHappensBeforeItStartsOrAfterItEnds() {
        Recurrence untilFriday = new Recurrence(Unit.DAY, 1, Set.of(), day("2026-11-13"));
        assertThat(between(untilFriday, "2026-11-11", "2026-11-01", "2026-11-30"))
                .containsExactly("2026-11-11", "2026-11-12", "2026-11-13");
        assertThat(untilFriday.nextAfter(day("2026-11-11"), day("2026-11-13"))).isEmpty();
        assertThat(untilFriday.occursOn(day("2026-11-11"), day("2026-11-10"))).isFalse();
    }

    @Test
    void weeklyOnChosenDaysAndOnTheDayItStartsWhenNoneAreChosen() {
        // 11 Nov 2026 is a Wednesday.
        assertThat(between(Recurrence.weekly(Weekday.TUE, Weekday.FRI), "2026-11-11", "2026-11-11", "2026-11-24"))
                .containsExactly("2026-11-13", "2026-11-17", "2026-11-20", "2026-11-24");
        assertThat(between(Recurrence.every(Unit.WEEK), "2026-11-11", "2026-11-01", "2026-12-02"))
                .containsExactly("2026-11-11", "2026-11-18", "2026-11-25", "2026-12-02");
        assertThat(Recurrence.every(Unit.WEEK).startingOn(day("2026-11-12")).label())
                .isEqualTo("Thursdays");
    }

    @Test
    void everyOtherWeekKeepsBothDaysInTheSameWeeksCountedFromTheMondayItStartsIn() {
        Recurrence rule = new Recurrence(Unit.WEEK, 2, Set.of(Weekday.TUE, Weekday.FRI), null);
        // It starts on Wednesday 11 Nov: that week's Friday counts, next week nothing, then Tuesday and Friday.
        assertThat(between(rule, "2026-11-11", "2026-11-09", "2026-12-12"))
                .containsExactly("2026-11-13", "2026-11-24", "2026-11-27", "2026-12-08", "2026-12-11");
        assertThat(rule.nextAfter(day("2026-11-11"), day("2026-11-13"))).contains(day("2026-11-24"));
    }

    @Test
    void monthlyOnTheSameDayAndOnTheLastDayOfAShorterMonth() {
        assertThat(between(Recurrence.every(Unit.MONTH), "2026-01-31", "2026-01-01", "2026-05-31"))
                .containsExactly("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31");
        Recurrence everyThird = new Recurrence(Unit.MONTH, 3, Set.of(), null);
        assertThat(between(everyThird, "2026-11-15", "2026-11-16", "2027-08-31"))
                .containsExactly("2027-02-15", "2027-05-15", "2027-08-15");
        assertThat(Recurrence.every(Unit.MONTH).occursOn(day("2026-01-31"), day("2026-02-27")))
                .isFalse();
    }

    @Test
    void yearlyOnTheSameDateAndThe29thOfFebruaryOnThe28thInOtherYears() {
        assertThat(between(Recurrence.every(Unit.YEAR), "2026-12-04", "2026-01-01", "2029-12-31"))
                .containsExactly("2026-12-04", "2027-12-04", "2028-12-04", "2029-12-04");
        assertThat(between(Recurrence.every(Unit.YEAR), "2024-02-29", "2024-01-01", "2028-12-31"))
                .containsExactly("2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29");
        assertThat(new Recurrence(Unit.YEAR, 2, Set.of(), null).nextAfter(day("2026-12-04"), day("2026-12-04")))
                .contains(day("2028-12-04"));
    }

    @Test
    void theNextTimeIsFoundFromAnyDay() {
        Recurrence thursdays = Recurrence.weekly(Weekday.THU);
        assertThat(thursdays.nextOnOrAfter(day("2026-09-03"), day("2026-11-11")))
                .contains(day("2026-11-12"));
        assertThat(thursdays.nextOnOrAfter(day("2026-09-03"), day("2026-11-12")))
                .contains(day("2026-11-12"));
        assertThat(thursdays.nextAfter(day("2026-09-03"), day("2026-11-12"))).contains(day("2026-11-19"));
        assertThat(thursdays.nextOnOrAfter(day("2026-12-03"), day("2026-11-12")))
                .as("not before it starts")
                .contains(day("2026-12-03"));
        assertThat(thursdays.timesBetween(day("2026-11-12"), day("2026-11-12"), day("2026-12-03")))
                .isEqualTo(3);
    }

    @Test
    void aRuleSaysItselfInAFewWords() {
        assertThat(Recurrence.every(Unit.DAY).label()).isEqualTo("Every day");
        assertThat(Recurrence.weekly(Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI)
                        .label())
                .isEqualTo("Weekdays");
        assertThat(Recurrence.weekly(Weekday.SAT, Weekday.SUN).label()).isEqualTo("Weekends");
        assertThat(Recurrence.weekly(Weekday.THU).label()).isEqualTo("Thursdays");
        assertThat(Recurrence.weekly(Weekday.FRI, Weekday.TUE).label()).isEqualTo("Tue and Fri");
        assertThat(Recurrence.weekly(Weekday.MON, Weekday.WED, Weekday.FRI).label())
                .isEqualTo("Mon, Wed and Fri");
        assertThat(new Recurrence(Unit.WEEK, 2, Set.of(Weekday.WED), null).label())
                .isEqualTo("Every other Wednesday");
        assertThat(new Recurrence(Unit.WEEK, 3, Set.of(Weekday.TUE, Weekday.FRI), null).label())
                .isEqualTo("Every 3 weeks on Tue and Fri");
        assertThat(Recurrence.every(Unit.WEEK).label()).isEqualTo("Every week");
        assertThat(Recurrence.every(Unit.MONTH).label()).isEqualTo("Every month");
        assertThat(new Recurrence(Unit.MONTH, 2, Set.of(), null).label()).isEqualTo("Every other month");
        assertThat(Recurrence.every(Unit.YEAR).label()).isEqualTo("Every year");
        assertThat(new Recurrence(Unit.DAY, 0, null, null).every())
                .as("left out means every one")
                .isEqualTo(1);
    }

    @Test
    void neverMoreThanAYearOfDaysAtOnce() {
        assertThat(Recurrence.every(Unit.DAY).between(day("2020-01-01"), day("2020-01-01"), day("2030-01-01")))
                .hasSize(Recurrence.MOST);
    }
}
