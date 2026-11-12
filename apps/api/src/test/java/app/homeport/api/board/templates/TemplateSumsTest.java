package app.homeport.api.board.templates;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.board.templates.Doorframe.Growth;
import app.homeport.api.board.templates.Doorframe.Growth.Point;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The sums and small rules inside the templates, on plain values: the wheel, ages, growth, the weekly question. */
class TemplateSumsTest {

    private static LocalDate day(String iso) {
        return LocalDate.parse(iso);
    }

    // ---------- the chore wheel ----------

    @Test
    void theWheelMovesEveryJobOnOnePersonEveryMonday() {
        List<String> four = List.of("Nora", "Alex", "Mia", "Leo");
        // The starting week: job j is person j's.
        assertThat(List.of(0, 1, 2, 3).stream().map(j -> ChoreWheel.turn(four, j, 0)))
                .containsExactly("Nora", "Alex", "Mia", "Leo");
        // A week on, everything has moved one place; after four weeks it stands as it started.
        assertThat(List.of(0, 1, 2, 3).stream().map(j -> ChoreWheel.turn(four, j, 1)))
                .containsExactly("Alex", "Mia", "Leo", "Nora");
        assertThat(List.of(0, 1, 2, 3).stream().map(j -> ChoreWheel.turn(four, j, 4)))
                .containsExactly("Nora", "Alex", "Mia", "Leo");
        assertThat(ChoreWheel.turn(four, 0, 46)).isEqualTo("Mia");
        // Nobody keeps a job two weeks running, and over four weeks everyone has had each job once.
        for (int job = 0; job < 4; job++) {
            int j = job;
            assertThat(List.of(0, 1, 2, 3).stream().map(w -> ChoreWheel.turn(four, j, w)))
                    .containsExactlyInAnyOrderElementsOf(four);
        }
        // More jobs than people: someone has two. More people than jobs: someone has a week off.
        List<String> two = List.of("Kai", "Lea");
        assertThat(List.of(0, 1, 2).stream().map(j -> ChoreWheel.turn(two, j, 0)))
                .containsExactly("Kai", "Lea", "Kai");
        assertThat(List.of(0, 1, 2).stream().map(j -> ChoreWheel.turn(two, j, 1)))
                .containsExactly("Lea", "Kai", "Lea");
        // A week before the wheel was started is counted backwards, not as an error; an empty wheel has nobody.
        assertThat(ChoreWheel.turn(four, 0, -1)).isEqualTo("Leo");
        String nobody = ChoreWheel.turn(List.<String>of(), 2, 5);
        assertThat(nobody).isNull();
    }

    @Test
    void weeksAreCountedFromTheMondayTheWheelWasStarted() {
        LocalDate started = day("2026-09-14"); // a Monday
        assertThat(ChoreWheel.weekIndex(started, day("2026-09-14"))).isZero();
        assertThat(ChoreWheel.weekIndex(started, day("2026-09-20"))).isZero(); // the Sunday of that week
        assertThat(ChoreWheel.weekIndex(started, day("2026-09-21"))).isEqualTo(1);
        assertThat(ChoreWheel.weekIndex(started, day("2026-11-11"))).isEqualTo(8);
        assertThat(ChoreWheel.weekIndex(started, day("2026-09-13"))).isEqualTo(-1);
        assertThat(ChoreWheel.weekIndex(started, day("2027-01-04"))).isEqualTo(16); // across New Year
        // Started mid-week: the count still turns on Mondays.
        assertThat(ChoreWheel.weekIndex(day("2026-09-17"), day("2026-09-20"))).isZero();
        assertThat(ChoreWheel.weekIndex(day("2026-09-17"), day("2026-09-21"))).isEqualTo(1);
        assertThat(MealPlan.monday(day("2026-11-11"))).isEqualTo(day("2026-11-09"));
        assertThat(MealPlan.monday(day("2026-11-09"))).isEqualTo(day("2026-11-09"));
        assertThat(MealPlan.monday(day("2026-11-15"))).isEqualTo(day("2026-11-09"));
    }

    // ---------- ages ----------

    @Test
    void theAgeIsSaidInYearsAndMonthsOnTheDaySomethingWasSaid() {
        LocalDate leo = day("2020-03-14");
        assertThat(Said.age(leo, day("2026-05-20"))).isEqualTo("6 years and 2 months");
        assertThat(Said.age(leo, day("2024-12-17"))).isEqualTo("4 years and 9 months");
        assertThat(Said.age(leo, day("2027-03-14"))).isEqualTo("7 years");
        assertThat(Said.age(leo, day("2027-03-13"))).isEqualTo("6 years and 11 months");
        assertThat(Said.age(leo, day("2021-04-14"))).isEqualTo("1 year and 1 month");
        assertThat(Said.age(leo, day("2020-11-20"))).isEqualTo("8 months");
        assertThat(Said.age(leo, day("2020-04-14"))).isEqualTo("1 month");
        assertThat(Said.age(leo, day("2020-03-20"))).isEqualTo("under a month");
        // No birthday, or a day before they were born: no age rather than a wrong one.
        assertThat(Said.age(null, day("2026-05-20"))).isNull();
        assertThat(Said.age(leo, day("2019-01-01"))).isNull();
        assertThat(Said.age(leo, null)).isNull();
    }

    @Test
    void theBirthdayInterviewCountsAnAnswerForTheBirthdayThatIsNear() {
        LocalDate mia = day("2016-12-04");
        assertThat(BirthdayInterview.ageOn(mia, day("2026-11-11"))).isEqualTo(9);
        assertThat(BirthdayInterview.ageOn(mia, day("2026-12-04"))).isEqualTo(10);
        assertThat(BirthdayInterview.nextBirthday(mia, day("2026-11-11"))).isEqualTo(day("2026-12-04"));
        assertThat(BirthdayInterview.nextBirthday(mia, day("2026-12-04"))).isEqualTo(day("2026-12-04"));
        assertThat(BirthdayInterview.nextBirthday(mia, day("2026-12-05"))).isEqualTo(day("2027-12-04"));
        // Born on 29 February: in other years the birthday is kept on the 28th.
        assertThat(BirthdayInterview.nextBirthday(day("2020-02-29"), day("2026-01-10")))
                .isEqualTo(day("2026-02-28"));
        // On the day and for eleven months after, it is this year's interview; in the last month, the next one's.
        assertThat(BirthdayInterview.roundOn(mia, day("2026-12-04"))).isEqualTo(10);
        assertThat(BirthdayInterview.roundOn(mia, day("2027-06-01"))).isEqualTo(10);
        assertThat(BirthdayInterview.roundOn(mia, day("2026-11-03"))).isEqualTo(9);
        assertThat(BirthdayInterview.roundOn(mia, day("2026-11-04"))).isEqualTo(10);
        assertThat(BirthdayInterview.roundOn(mia, day("2026-11-11"))).isEqualTo(10);
        assertThat(BirthdayInterview.line("Mia", 10, 23)).isEqualTo("Mia's 10th is in 23 days");
        assertThat(BirthdayInterview.line("Mia", 10, 1)).isEqualTo("Mia's 10th is tomorrow");
        assertThat(BirthdayInterview.line("Lars", 3, 0)).isEqualTo("Lars' 3rd birthday is today");
        assertThat(BirthdayInterview.TEN_QUESTIONS).hasSize(10).doesNotHaveDuplicates();
    }

    // ---------- the doorframe ----------

    private static final List<Point> MIA = List.of(
            new Point(day("2022-12-06"), 1175),
            new Point(day("2023-12-06"), 1215),
            new Point(day("2024-12-06"), 1260),
            new Point(day("2025-12-06"), 1320),
            new Point(day("2026-11-01"), 1380));

    private static final List<Point> LEO = List.of(
            new Point(day("2024-09-15"), 1050), new Point(day("2025-09-15"), 1120), new Point(day("2026-11-01"), 1190));

    @Test
    void growthIsWorkedOutFromTheMarks() {
        assertThat(Growth.sinceLast(MIA)).isEqualTo(60);
        assertThat(Growth.sinceLast(LEO)).isEqualTo(70);
        assertThat(Growth.sinceLast(List.of(new Point(day("2026-01-01"), 900)))).isNull();
        assertThat(Growth.sinceLast(List.of())).isNull();

        // "6 cm since her last birthday": against the mark two days after it.
        assertThat(Growth.lastBirthday(day("2016-12-04"), day("2026-11-11"))).isEqualTo(day("2025-12-04"));
        assertThat(Growth.lastBirthday(day("2016-12-04"), day("2026-12-04"))).isEqualTo(day("2026-12-04"));
        assertThat(Growth.sinceBirthday(MIA, day("2016-12-04"), day("2026-11-11")))
                .isEqualTo(60);
        // No mark within sixty days of the birthday, no birthday, or only one mark: nothing to say.
        assertThat(Growth.sinceBirthday(LEO, day("2020-03-14"), day("2026-11-11")))
                .isNull();
        assertThat(Growth.sinceBirthday(MIA, null, day("2026-11-11"))).isNull();
        assertThat(Growth.sinceBirthday(MIA.subList(0, 1), day("2016-12-04"), day("2026-11-11")))
                .isNull();
        // The newest mark itself is never the one it is compared with.
        assertThat(Growth.sinceBirthday(MIA.subList(0, 4), day("2016-12-04"), day("2025-12-20")))
                .isNull();

        // Each step counts for the year of the later mark. "7 cm this year, his most yet" (a tie counts).
        assertThat(Growth.perYear(MIA)).isEqualTo(Map.of(2023, 40L, 2024, 45L, 2025, 60L, 2026, 60L));
        assertThat(Growth.perYear(LEO)).isEqualTo(Map.of(2025, 70L, 2026, 70L));
        assertThat(Growth.mostYet(Growth.perYear(LEO), 2026)).isTrue();
        assertThat(Growth.mostYet(Growth.perYear(MIA), 2026)).isTrue();
        assertThat(Growth.mostYet(Growth.perYear(MIA), 2024)).isFalse();
        assertThat(Growth.mostYet(Growth.perYear(MIA), 2027)).isFalse(); // no mark that year
        assertThat(Growth.mostYet(Map.of(2026, 70L), 2026)).isFalse(); // nothing to compare with
        assertThat(Growth.mostYet(Map.of(2025, 30L, 2026, 0L), 2026)).isFalse();
    }

    @Test
    void whenSomeoneWasAHeightIsReadOffTheLineBetweenTwoMarks() {
        // Leo is 119 cm. Mia was 117.5 in December 2022 and 121.5 a year later: 119 falls in April 2023.
        LocalDate when = Growth.whenAt(MIA, 1190);
        assertThat(when).isBetween(day("2023-04-15"), day("2023-04-30"));
        assertThat(Growth.season(when)).isEqualTo("the spring of 2023");
        // Exactly at a mark; below the first mark and above the last one there is no telling.
        assertThat(Growth.whenAt(MIA, 1260)).isEqualTo(day("2024-12-06"));
        assertThat(Growth.whenAt(MIA, 1100)).isNull();
        assertThat(Growth.whenAt(MIA, 1500)).isNull();
        assertThat(Growth.whenAt(List.of(), 1200)).isNull();
        // Two marks at the same height can't be read between.
        assertThat(Growth.whenAt(List.of(new Point(day("2025-01-01"), 1000), new Point(day("2025-06-01"), 1000)), 1000))
                .isNull();

        assertThat(Growth.season(day("2026-03-01"))).isEqualTo("the spring of 2026");
        assertThat(Growth.season(day("2026-08-31"))).isEqualTo("the summer of 2026");
        assertThat(Growth.season(day("2026-11-11"))).isEqualTo("the autumn of 2026");
        assertThat(Growth.season(day("2026-12-25"))).isEqualTo("the winter of 2026");
        assertThat(Growth.season(day("2027-02-10"))).isEqualTo("the winter of 2027");
        assertThat(Growth.cm(60)).isEqualTo("6");
        assertThat(Growth.cm(65)).isEqualTo("6.5");
        assertThat(Growth.cm(1380)).isEqualTo("138");
        assertThat(Growth.cm(1335)).isEqualTo("133.5");
    }

    // ---------- stories, the capsule, the jar ----------

    @Test
    void oneQuestionAWeekGoesOut() {
        LocalDate wednesday = day("2026-11-11");
        // The first one goes out the day it is asked.
        assertThat(Stories.goesOut(wednesday, null, DayOfWeek.SUNDAY)).isEqualTo(wednesday);
        // One went out last Sunday: the next goes out this Sunday.
        assertThat(Stories.goesOut(wednesday, day("2026-11-08"), DayOfWeek.SUNDAY))
                .isEqualTo(day("2026-11-15"));
        // One is already waiting for this Sunday: the next waits a week longer, and so on down the queue.
        assertThat(Stories.goesOut(wednesday, day("2026-11-15"), DayOfWeek.SUNDAY))
                .isEqualTo(day("2026-11-22"));
        assertThat(Stories.goesOut(wednesday, day("2026-11-22"), DayOfWeek.SUNDAY))
                .isEqualTo(day("2026-11-29"));
        // Nothing was asked for months: it goes out on the next sending day, today if that is today.
        assertThat(Stories.goesOut(wednesday, day("2026-06-07"), DayOfWeek.SUNDAY))
                .isEqualTo(day("2026-11-15"));
        assertThat(Stories.goesOut(day("2026-11-15"), day("2026-06-07"), DayOfWeek.SUNDAY))
                .isEqualTo(day("2026-11-15"));
        // One went out today, mid-week: the next is a week on, not three days later.
        assertThat(Stories.goesOut(wednesday, wednesday, DayOfWeek.SUNDAY)).isEqualTo(day("2026-11-18"));
        assertThat(Stories.goesOut(wednesday, day("2026-11-10"), DayOfWeek.FRIDAY))
                .isEqualTo(day("2026-11-17"));
        assertThat(Stories.initials("Astrid Lind")).isEqualTo("AL");
        assertThat(Stories.initials("  astrid  ")).isEqualTo("A");
        assertThat(Stories.initials("Ana Maria de la Cruz")).isEqualTo("AM");
    }

    @Test
    void aLetterIsSoManyPagesAndAJarOpensOnTheLastDayOfItsYear() {
        assertThat(TimeCapsule.pages(null)).isEqualTo(1);
        assertThat(TimeCapsule.pages("")).isEqualTo(1);
        assertThat(TimeCapsule.pages("x".repeat(1800))).isEqualTo(1);
        assertThat(TimeCapsule.pages("x".repeat(1801))).isEqualTo(2);
        assertThat(TimeCapsule.pages("x".repeat(3601))).isEqualTo(3);
        assertThat(GoodJar.opens(2026)).isEqualTo(day("2026-12-31"));
    }
}
