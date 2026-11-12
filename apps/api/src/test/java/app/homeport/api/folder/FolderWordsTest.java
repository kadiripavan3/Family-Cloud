package app.homeport.api.folder;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.folder.FolderStore.Counts;
import app.homeport.api.folder.StarterSpaces.Starter;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

/** The few words a folder says about itself, and the spaces each kind of circle begins with. */
class FolderWordsTest {

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "0 | 0 | Empty",
                "0 | 1 | 1 page",
                "0 | 48 | 48 pages",
                "1 | 0 | 1 folder · 0 pages",
                "1 | 1 | 1 folder · 1 page",
                "6 | 48 | 6 folders · 48 pages",
                "2 | 1 | 2 folders · 1 page",
            })
    void aFolderSaysHowMuchIsInIt(int folders, int pages, String words) {
        assertThat(FolderSources.words(new Counts(folders, pages))).isEqualTo(words);
    }

    @Test
    void eachKindOfCircleBeginsWithItsOwnSpaces() {
        assertThat(names(CircleKind.FAMILY)).containsExactly("Home", "Kids", "Trips");
        assertThat(names(CircleKind.COUPLE)).containsExactly("Our place", "Money", "Trips", "Someday");
        assertThat(names(CircleKind.FLAT)).containsExactly("The flat", "Bills", "Landlord");
        assertThat(names(CircleKind.CREW)).containsExactly("Trips", "Plans", "The dictionary");
        assertThat(names(CircleKind.SOLO)).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(CircleKind.class)
    void everyStarterSpaceHasANameOfItsOwnAndAnEmoji(CircleKind kind) {
        List<Starter> starters = StarterSpaces.of(kind);
        assertThat(names(kind)).doesNotHaveDuplicates();
        assertThat(starters).allSatisfy(starter -> {
            assertThat(starter.name()).isNotBlank();
            assertThat(starter.emoji()).isNotBlank().hasSizeLessThanOrEqualTo(32);
        });
    }

    @Test
    void onlyAFamilyKeepsASpaceForTheAdults() {
        for (CircleKind kind : CircleKind.values()) {
            List<String> forAdults = StarterSpaces.of(kind).stream()
                    .filter(s -> s.audience() == StarterSpaces.For.GROWN_UPS)
                    .map(Starter::name)
                    .toList();
            if (kind == CircleKind.FAMILY) {
                assertThat(forAdults).containsExactly("Kids");
            } else {
                assertThat(forAdults).isEmpty();
            }
        }
    }

    private static List<String> names(CircleKind kind) {
        return StarterSpaces.of(kind).stream().map(Starter::name).toList();
    }
}
