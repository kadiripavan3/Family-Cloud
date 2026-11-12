package app.homeport.api.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** How the summary says an event that names who it is for. */
class PlanDigestTest {

    @ParameterizedTest
    @CsvSource({
        "Dentist · Mia, Dentist for Mia",
        "Haircut · Leo, Haircut for Leo",
        "Dinner at Grandma Astrid's, Dinner at Grandma Astrid's",
        "Football · away game, Football · away game",
        "Parents' evening · 4B · Mia, Parents' evening · 4B for Mia",
        "Mia, Mia",
    })
    void whatFollowsTheDotIsSaidWithForWhenItIsSomeoneOfTheCircle(String title, String said) {
        assertThat(PlanDigest.forWhom(title, Set.of("Mia", "Leo", "Nora", "Alex")))
                .isEqualTo(said);
    }
}
