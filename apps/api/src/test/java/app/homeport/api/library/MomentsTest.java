package app.homeport.api.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import app.homeport.api.library.Moments.Moment;
import app.homeport.api.library.Moments.Shot;
import app.homeport.api.thing.Audience;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The rule that puts photos and videos into moments, case by case. Saturday is 7 November 2026. */
class MomentsTest {

    private static final UUID NORA = UUID.randomUUID();
    private static final UUID ALEX = UUID.randomUUID();
    private static final UUID MIA = UUID.randomUUID();
    private static final LocalDate SATURDAY = LocalDate.of(2026, 11, 7);

    /** Lake Bled, and points a known distance east of it (a degree of longitude is about 77 km up there). */
    private static final double LAT = 46.3625;

    private static final double LNG = 14.0938;

    private int next;

    private Shot at(String time, UUID by, Double kmEast, String place) {
        return at(SATURDAY, time, by, kmEast, place);
    }

    private Shot at(LocalDate day, String time, UUID by, Double kmEast, String place) {
        return new Shot(
                new UUID(0, ++next),
                LocalDateTime.parse(day + "T" + time),
                kmEast == null ? null : LAT,
                kmEast == null ? null : LNG + kmEast / 77.0,
                place,
                by,
                false,
                Audience.CIRCLE);
    }

    @Test
    void threePhonesAtOneLakeOnOneSaturdayAreOneMomentNamedForThePlace() {
        List<Shot> shots = List.of(
                at("09:12", NORA, 0.0, "Lake Bled"),
                at("09:40", ALEX, 0.4, "Lake Bled"),
                at("10:05", MIA, 0.9, "Lake Bled"),
                at("11:42", ALEX, 0.2, "Lake Bled"),
                new Shot(
                        new UUID(0, 99),
                        LocalDateTime.parse("2026-11-07T11:20"),
                        LAT,
                        LNG,
                        "Lake Bled",
                        NORA,
                        true,
                        Audience.CIRCLE));

        List<Moment> moments = Moments.group(shots);

        assertThat(moments).hasSize(1);
        Moment lake = moments.get(0);
        assertThat(lake.title()).isEqualTo("Saturday at Lake Bled");
        assertThat(lake.day()).isEqualTo(SATURDAY);
        assertThat(lake.place()).isEqualTo("Lake Bled");
        assertThat(lake.shots()).hasSize(5);
        assertThat(lake.photos()).isEqualTo(4);
        assertThat(lake.videos()).isEqualTo(1);
        assertThat(lake.shared()).isTrue();
        assertThat(lake.people())
                .containsExactly(
                        java.util.Map.entry(NORA, 2), java.util.Map.entry(ALEX, 2), java.util.Map.entry(MIA, 1));
        // It is asked for by its newest shot.
        assertThat(lake.id()).isEqualTo(shots.get(3).id());
    }

    @Test
    void onePersonsDayIsNamedByItsDayEvenWhenThePlaceIsKnown() {
        Moment home = Moments.group(List.of(
                        at(SATURDAY.minusDays(2), "08:20", NORA, 0.0, "Home"),
                        at(SATURDAY.minusDays(2), "19:40", NORA, 0.0, "Home")))
                .get(0);

        assertThat(home.title()).isEqualTo("Thursday");
        assertThat(home.place()).isEqualTo("Home");
        assertThat(home.shared()).isFalse();
    }

    @Test
    void severalPeopleWithNoPlaceAreNamedByTheDay() {
        Moment moment = Moments.group(List.of(at("10:00", NORA, null, null), at("10:30", ALEX, null, null)))
                .get(0);

        assertThat(moment.shared()).isTrue();
        assertThat(moment.title()).isEqualTo("Saturday");
        assertThat(moment.place()).isNull();
    }

    @Test
    void aDriveToTheNextTownStartsANewMoment() {
        List<Moment> moments =
                Moments.group(List.of(at("10:00", NORA, 0.0, "Lake Bled"), at("10:20", NORA, 6.0, "Radovljica")));

        assertThat(moments).hasSize(2);
        assertThat(moments.get(0).place()).isEqualTo("Radovljica"); // the newest moment comes first
        assertThat(moments.get(1).place()).isEqualTo("Lake Bled");
    }

    @Test
    void twoKilometresIsStillTheSamePlaceAndALittleMoreIsNot() {
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, null), at("10:05", ALEX, 1.9, null))))
                .hasSize(1);
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, null), at("10:05", ALEX, 2.2, null))))
                .hasSize(2);
    }

    @Test
    void aWalkRoundTheLakeStaysTogetherBecauseEachShotIsNearTheOneBefore() {
        List<Shot> walk = new ArrayList<>();
        for (int n = 0; n < 6; n++) {
            walk.add(at("10:%02d".formatted(n * 9), NORA, n * 1.5, "Lake Bled"));
        }

        // The last shot is 7.5 km from the first, and never more than 1.5 km from the one before.
        assertThat(Moments.group(walk)).hasSize(1);
    }

    @Test
    void coordinatesDecideBeforeNamesDo() {
        // Two phones name the same shore differently.
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, "Lake Bled"), at("10:05", ALEX, 0.3, "Bled"))))
                .hasSize(1);
        // And the same name far apart is two places.
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, "Home"), at("10:05", ALEX, 40.0, "Home"))))
                .hasSize(2);
    }

    @Test
    void withoutCoordinatesTheNameDecidesWhateverTheCapitals() {
        assertThat(Moments.group(List.of(at("10:00", NORA, null, "Lake Bled"), at("16:00", ALEX, null, " lake bled "))))
                .hasSize(1);
        assertThat(Moments.group(List.of(at("10:00", NORA, null, "Lake Bled"), at("10:05", ALEX, null, "Home"))))
                .hasSize(2);
        // A name on one side and coordinates on the other can't be compared: the name of the shot with both does it.
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, "Lake Bled"), at("15:00", ALEX, null, "Lake Bled"))))
                .hasSize(1);
    }

    @Test
    void aShotThatDoesNotSayWhereJoinsWhenItIsWithinThreeHoursOfTheOneBefore() {
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, "Lake Bled"), at("13:00", ALEX, null, null))))
                .hasSize(1);
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, "Lake Bled"), at("13:01", ALEX, null, null))))
                .hasSize(2);
        assertThat(Moments.group(List.of(at("10:00", NORA, null, null), at("12:59", NORA, null, null))))
                .hasSize(1);
        assertThat(Moments.group(List.of(at("10:00", NORA, null, null), at("14:00", NORA, null, null))))
                .hasSize(2);
        // Only coordinates here, only a name there: time decides too.
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, null), at("10:30", ALEX, null, "Lake Bled"))))
                .hasSize(1);
        assertThat(Moments.group(List.of(at("10:00", NORA, 0.0, null), at("15:30", ALEX, null, "Lake Bled"))))
                .hasSize(2);
    }

    @Test
    void aShotWithNoPlaceInBetweenDoesNotMakeThePlaceForgotten() {
        // Lake, then one without a fix, then far away: the far one is compared with the lake, not with nothing.
        List<Moment> moments = Moments.group(List.of(
                at("10:00", NORA, 0.0, "Lake Bled"), at("10:10", ALEX, null, null), at("10:20", NORA, 30.0, "Kranj")));

        assertThat(moments).hasSize(2);
        assertThat(moments.get(1).shots()).hasSize(2);
    }

    @Test
    void theSamePlaceLaterTheSameDayIsOneMomentUnlessSomethingWasTakenElsewhereInBetween() {
        assertThat(Moments.group(List.of(at("08:00", NORA, 0.0, "Home"), at("19:00", NORA, 0.0, "Home"))))
                .hasSize(1);

        List<Moment> thereAndBack = Moments.group(List.of(
                at("08:00", NORA, 0.0, "Home"), at("12:00", NORA, 30.0, "Lake Bled"), at("19:00", NORA, 0.0, "Home")));
        assertThat(thereAndBack).hasSize(3);
        assertThat(thereAndBack.stream().map(Moment::place)).containsExactly("Home", "Lake Bled", "Home");
    }

    @Test
    void aDayTurnsAtFourInTheMorningSoAPartyPastMidnightStaysOneEvening() {
        List<Moment> party = Moments.group(List.of(
                at(SATURDAY, "23:50", NORA, 0.0, "Home"), at(SATURDAY.plusDays(1), "01:30", ALEX, 0.0, "Home")));
        assertThat(party).hasSize(1);
        assertThat(party.get(0).day()).isEqualTo(SATURDAY);
        assertThat(party.get(0).title()).isEqualTo("Saturday at Home");

        // But the same place before and after four in the morning is two days.
        assertThat(Moments.group(List.of(
                        at(SATURDAY.plusDays(1), "03:59", NORA, 0.0, "Home"),
                        at(SATURDAY.plusDays(1), "04:00", NORA, 0.0, "Home"))))
                .hasSize(2);
        assertThat(Moments.dayOf(LocalDateTime.parse("2026-11-08T03:59:59"))).isEqualTo(SATURDAY);
        assertThat(Moments.dayOf(LocalDateTime.parse("2026-11-08T04:00"))).isEqualTo(SATURDAY.plusDays(1));
        assertThat(Moments.dayOf(LocalDateTime.parse("2026-01-01T00:10"))).isEqualTo(LocalDate.of(2025, 12, 31));
    }

    @Test
    void theOrderTheyArriveInDoesNotMatterAndAnyShotLeadsToItsMoment() {
        Shot first = at("09:00", NORA, 0.0, "Lake Bled");
        Shot second = at("09:30", ALEX, 0.1, "Lake Bled");
        Shot elsewhere = at("15:00", ALEX, 50.0, "Ljubljana");

        List<Moment> moments = Moments.group(List.of(elsewhere, second, first));

        assertThat(moments).hasSize(2);
        assertThat(Moments.of(first.id(), moments).shots()).containsExactly(first, second);
        assertThat(Moments.of(second.id(), moments).id()).isEqualTo(second.id());
        assertThat(Moments.of(elsewhere.id(), moments).shots()).containsExactly(elsewhere);
        assertThat(Moments.of(UUID.randomUUID(), moments)).isNull();
        assertThat(Moments.group(List.of())).isEmpty();
    }

    @Test
    void theNameMostShotsCarryNamesTheMomentAndTheOneWhoAddedMostComesFirst() {
        Moment moment = Moments.group(List.of(
                        at("10:00", MIA, 0.0, "Bled"),
                        at("10:05", ALEX, 0.1, "Lake Bled"),
                        at("10:10", ALEX, 0.2, "lake bled"),
                        at("10:15", ALEX, 0.2, null),
                        at("10:20", NORA, 0.3, "Bled castle")))
                .get(0);

        assertThat(moment.place()).isEqualTo("Lake Bled");
        assertThat(moment.people().keySet()).containsExactly(ALEX, MIA, NORA);
    }

    @Test
    void aMomentIsForEveryoneOnlyWhenAllOfItIs() {
        Shot shared = at("10:00", NORA, 0.0, "Lake Bled");
        Shot mine = new Shot(
                UUID.randomUUID(), shared.taken().plusMinutes(5), LAT, LNG, "Lake Bled", NORA, false, Audience.ME);
        Shot some = new Shot(
                UUID.randomUUID(), shared.taken().plusMinutes(9), LAT, LNG, "Lake Bled", NORA, false, Audience.SOME);

        assertThat(Moments.group(List.of(shared)).get(0).audience()).isEqualTo(Audience.CIRCLE);
        assertThat(Moments.group(List.of(mine)).get(0).audience()).isEqualTo(Audience.ME);
        assertThat(Moments.group(List.of(shared, mine)).get(0).audience()).isEqualTo(Audience.SOME);
        assertThat(Moments.group(List.of(some)).get(0).audience()).isEqualTo(Audience.SOME);
    }

    @Test
    void twoShotsInTheSameInstantAreOrderedAsTheDatabaseOrdersTheirIds() {
        // As numbers Java calls the second id smaller (its first bit makes it negative); as letters, 8 comes after 7.
        UUID low = UUID.fromString("7fffffff-0000-0000-0000-000000000001");
        UUID high = UUID.fromString("80000000-0000-0000-0000-000000000001");
        LocalDateTime instant = LocalDateTime.parse("2026-11-07T10:00:00");
        Shot first = new Shot(low, instant, LAT, LNG, "Lake Bled", NORA, false, Audience.CIRCLE);
        Shot second = new Shot(high, instant, LAT, LNG, "Lake Bled", ALEX, false, Audience.CIRCLE);

        Moment moment = Moments.group(List.of(second, first)).get(0);

        assertThat(moment.shots()).containsExactly(first, second);
        assertThat(moment.id()).isEqualTo(high);
    }

    @Test
    void distancesAreMeasuredOverTheGround() {
        // Ljubljana to Lake Bled is about 47 km as the crow flies.
        assertThat(Moments.km(46.0569, 14.5058, 46.3625, 14.0938)).isCloseTo(46.5, within(1.5));
        assertThat(Moments.km(LAT, LNG, LAT, LNG)).isZero();
    }
}
