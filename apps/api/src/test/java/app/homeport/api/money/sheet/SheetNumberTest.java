package app.homeport.api.money.sheet;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** A goal can name the sheet it reads by its title written small. */
class SheetNumberTest {

    @ParameterizedTest
    @CsvSource({
        "Norway budget, norway-budget",
        "norway-budget, norway-budget",
        "  Budget 2026  , budget-2026",
        "Café & bar, cafe-bar",
        "Mia's skates!, mia-s-skates",
    })
    void aTitleAndItsSmallSpellingAreTheSameSheet(String title, String slug) {
        assertThat(SheetNumber.slug(title)).isEqualTo(slug);
    }
}
