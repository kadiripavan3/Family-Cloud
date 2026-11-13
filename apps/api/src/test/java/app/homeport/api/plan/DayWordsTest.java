package app.homeport.api.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** How days are said where there is nothing next to them to say which year: a glance, a link, a person's page. */
class DayWordsTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    @Test
    void aDayOfAnotherYearSaysItsYear() {
        assertThat(Words.dateInYear(LocalDate.of(2026, 11, 20), TODAY)).isEqualTo("20 Nov");
        assertThat(Words.dateInYear(LocalDate.of(2026, 1, 2), TODAY)).isEqualTo("2 Jan");
        assertThat(Words.dateInYear(LocalDate.of(2026, 12, 31), TODAY)).isEqualTo("31 Dec");
        assertThat(Words.dateInYear(LocalDate.of(2027, 1, 2), TODAY)).isEqualTo("2 Jan 2027");
        assertThat(Words.dateInYear(LocalDate.of(2025, 12, 31), TODAY)).isEqualTo("31 Dec 2025");
        assertThat(Words.dateInYear(LocalDate.of(2031, 3, 14), TODAY)).isEqualTo("14 Mar 2031");
    }

    @Test
    void severalDaysAreSaidOnceWithTheMonthAndTheYearOnlyWhereTheyAreNeeded() {
        assertThat(Words.days(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 22), TODAY))
                .isEqualTo("20 to 22 November");
        assertThat(Words.days(LocalDate.of(2026, 11, 28), LocalDate.of(2026, 12, 4), TODAY))
                .isEqualTo("28 November to 4 December");
        assertThat(Words.days(LocalDate.of(2027, 4, 3), LocalDate.of(2027, 4, 17), TODAY))
                .isEqualTo("3 to 17 April 2027");
        assertThat(Words.days(LocalDate.of(2027, 3, 28), LocalDate.of(2027, 4, 4), TODAY))
                .isEqualTo("28 March to 4 April 2027");
        assertThat(Words.days(LocalDate.of(2026, 12, 27), LocalDate.of(2027, 1, 3), TODAY))
                .isEqualTo("27 December 2026 to 3 January 2027");
    }
}
