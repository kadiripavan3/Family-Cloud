package app.homeport.api.journey;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.BookLayout.DaySize;
import app.homeport.api.journey.BookLayout.Plan;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/** How a journey of any length is made to fit one page of 500 blocks. */
class BookLayoutTest {

    private static List<DaySize> days(int days, int entriesADay, int shotsADay) {
        return IntStream.range(0, days)
                .mapToObj(n -> new DaySize(LocalDate.of(2026, 4, 1).plusDays(n), entriesADay, shotsADay))
                .toList();
    }

    @Test
    void aTwoWeekTripKeepsEveryEntryAndSixPhotosADay() {
        // The trip the screens draw: 14 days, 62 entries, 214 photos.
        Plan plan = BookLayout.plan(days(14, 4, 15));
        assertThat(plan).isEqualTo(new Plan(6, false, 14));
        assertThat(BookLayout.blocks(days(14, 4, 15), 6, false)).isEqualTo(14 * (1 + 4 + 6));
    }

    @Test
    void aLongerJourneyGivesUpPhotosBeforeWords() {
        // 60 days with two entries and eight photos each: 6 photos a day would take 540 blocks, 4 take 420.
        assertThat(BookLayout.plan(days(60, 2, 8))).isEqualTo(new Plan(4, false, 60));
        // 100 days with three entries each: only the words fit.
        assertThat(BookLayout.plan(days(100, 3, 10))).isEqualTo(new Plan(0, false, 100));
        // A hundred-day challenge with one line and one photo a day fits whole: 300 blocks.
        assertThat(BookLayout.plan(days(100, 1, 1))).isEqualTo(new Plan(6, false, 100));
    }

    @Test
    void aVeryLongJourneyGivesEachDayOneBlockOfWords() {
        assertThat(BookLayout.plan(days(200, 3, 2))).isEqualTo(new Plan(0, true, 200));
        // A year of days: the first 240 fit, a heading and its words each.
        assertThat(BookLayout.plan(days(365, 2, 1))).isEqualTo(new Plan(0, true, 240));
    }

    @Test
    void aDayWithNothingToSayStillHasItsHeadingAndAJourneyWithNoDaysIsFine() {
        assertThat(BookLayout.blocks(days(3, 0, 0), 6, false)).isEqualTo(3);
        assertThat(BookLayout.blocks(days(3, 0, 2), 6, true)).isEqualTo(9);
        assertThat(BookLayout.plan(List.of())).isEqualTo(new Plan(6, false, 0));
    }
}
