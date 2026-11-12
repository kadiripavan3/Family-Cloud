package app.homeport.api.digest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The week in words, as the top of the summary says it. */
class DigestWordsTest {

    @ParameterizedTest
    @CsvSource({
        "2026-11-02, 2 to 8 Nov",
        "2026-11-09, 9 to 15 Nov",
        "2026-11-30, 30 Nov to 6 Dec",
        "2026-12-28, 28 Dec to 3 Jan",
        "2027-02-22, 22 to 28 Feb",
    })
    void aWeekIsSaidShortAndWithBothMonthsWhenItRunsOverTheEndOfOne(String monday, String words) {
        LocalDate from = LocalDate.parse(monday);
        assertThat(DigestService.range(from, from.plusDays(6))).isEqualTo(words);
    }
}
