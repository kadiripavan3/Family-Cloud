package app.homeport.api.notify;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** When a bill is due, as its push says it. */
class MoneyNewsTest {

    @ParameterizedTest
    @CsvSource({
        "2026-11-11, today",
        "2026-11-12, tomorrow",
        "2026-11-13, on Friday 13 Nov",
        "2026-12-01, on Tuesday 1 Dec",
    })
    void theDayIsSaidFromTheDayThePushGoesOut(String dueOn, String words) {
        assertThat(MoneyNews.when(LocalDate.parse(dueOn), LocalDate.parse("2026-11-11")))
                .isEqualTo(words);
    }
}
