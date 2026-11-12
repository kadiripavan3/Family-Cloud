package app.homeport.api.journey;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.Days.DayOf;
import app.homeport.api.journey.Days.Sorted;
import app.homeport.api.journey.Days.Taken;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Photos sorted into the days of a journey, and the title and first lines suggested for them. */
class DaysTest {

    private static final LocalDate FRIDAY = LocalDate.of(2026, 11, 6);

    private final List<Taken> taken = new ArrayList<>();

    private UUID shot(LocalDate day, int hour, String place, String country, boolean video) {
        UUID id = UUID.randomUUID();
        taken.add(new Taken(id, day, day.atTime(hour, 0), place, country, video));
        return id;
    }

    @Test
    void theDrawnWeekendIsThreeDaysInOrderWithItsPhotosInTheOrderTheyWereTaken() {
        UUID lunch = shot(FRIDAY.plusDays(1), 13, "Lake Bled", "Slovenia", false);
        UUID drive = shot(FRIDAY, 16, "Radovljica", "Slovenia", false);
        UUID morning = shot(FRIDAY.plusDays(1), 9, "Lake Bled", "Slovenia", false);
        UUID canoe = shot(FRIDAY.plusDays(1), 11, "Lake Bled", "Slovenia", true);
        UUID walk = shot(FRIDAY.plusDays(2), 10, null, null, false);

        Sorted sorted = Days.sort(taken);

        assertThat(sorted.days())
                .extracting(DayOf::day)
                .containsExactly(FRIDAY, FRIDAY.plusDays(1), FRIDAY.plusDays(2));
        assertThat(sorted.days().get(1).items()).containsExactly(morning, canoe, lunch);
        assertThat(sorted.days().get(0).items()).containsExactly(drive);
        assertThat(sorted.days().get(2).items()).containsExactly(walk);
        assertThat(sorted.days().get(1).photos()).isEqualTo(2);
        assertThat(sorted.days().get(1).clips()).isEqualTo(1);
        assertThat(sorted.days())
                .extracting(DayOf::line)
                .containsExactly("Friday at Radovljica", "Saturday at Lake Bled", "Sunday");
        // Two places in one country, over a weekend.
        assertThat(sorted.title()).isEqualTo("A weekend in Slovenia");
    }

    @Test
    void aDaysPlaceIsTheOneMostOfItsPhotosNameAndTheEarlierOfTwoEquallyCommonOnes() {
        shot(FRIDAY, 9, "Bohinj", "Slovenia", false);
        shot(FRIDAY, 10, "Lake Bled", "Slovenia", false);
        shot(FRIDAY, 11, "Lake Bled", "Slovenia", false);
        shot(FRIDAY, 12, null, null, false);
        assertThat(Days.sort(taken).days().get(0).place()).isEqualTo("Lake Bled");

        assertThat(Days.mostNamed(List.of("Bohinj", "Lake Bled"))).isEqualTo("Bohinj");
        assertThat(Days.mostNamed(java.util.Arrays.asList(null, " ", null))).isNull();
    }

    @Test
    void theTitleFollowsHowLongItWasAndWhere() {
        shot(FRIDAY.plusDays(1), 9, "Lake Bled", "Slovenia", false);
        assertThat(Days.sort(taken).title()).isEqualTo("A day at Lake Bled");

        shot(FRIDAY.plusDays(2), 9, "Lake Bled", "Slovenia", false);
        assertThat(Days.sort(taken).title()).isEqualTo("A weekend at Lake Bled");

        // Tuesday to Thursday is three days, and not a weekend.
        taken.clear();
        shot(FRIDAY.minusDays(3), 9, "Piran", "Slovenia", false);
        shot(FRIDAY.minusDays(1), 9, "Piran", "Slovenia", false);
        assertThat(Days.sort(taken).title()).isEqualTo("3 days at Piran");

        // Nine days across a country.
        taken.clear();
        shot(LocalDate.of(2026, 4, 1), 9, "Reykjavík", "Iceland", false);
        shot(LocalDate.of(2026, 4, 9), 9, "Akureyri", "Iceland", false);
        assertThat(Days.sort(taken).title()).isEqualTo("9 days in Iceland");

        // Longer than ten days: the month and the country.
        shot(LocalDate.of(2026, 4, 14), 9, "Vík", "Iceland", false);
        assertThat(Days.sort(taken).title()).isEqualTo("April in Iceland");
    }

    @Test
    void withoutAnyPlaceTheMonthStandsIn() {
        shot(FRIDAY.plusDays(1), 9, null, null, false);
        assertThat(Days.sort(taken).title()).isEqualTo("A day in November");
        shot(FRIDAY.plusDays(2), 9, " ", null, false);
        assertThat(Days.sort(taken).title()).isEqualTo("A weekend in November");
        assertThat(Days.sort(taken).days().get(0).line()).isEqualTo("Saturday");
        assertThat(Days.sort(List.of()).title()).isEqualTo("A journey");
        assertThat(Days.sort(List.of()).days()).isEmpty();
    }
}
