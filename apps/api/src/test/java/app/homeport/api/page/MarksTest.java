package app.homeport.api.page;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.common.ApiProblem;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** The marks of a text block: ranges over plain words, checked against those words. */
class MarksTest {

    private static final String TEXT = "@Alex knows the boiler code.";
    private static final UUID ALEX = UUID.randomUUID();

    private static Mark mark(int start, int end, MarkKind kind) {
        return new Mark(start, end, kind, null, null);
    }

    @Test
    void noMarksAreNoMarks() {
        assertThat(Marks.clean(TEXT, null)).isEmpty();
        assertThat(Marks.clean(TEXT, List.of())).isEmpty();
        assertThat(Marks.clean("", List.of())).isEmpty();
    }

    @Test
    void marksComeBackInOrderWithOnlyWhatTheirKindCarries() {
        List<Mark> cleaned = Marks.clean(
                TEXT,
                List.of(
                        new Mark(16, 22, MarkKind.BOLD, "https://ignored.example", ALEX),
                        new Mark(0, 5, MarkKind.MENTION, "https://ignored.example", ALEX),
                        new Mark(16, 27, MarkKind.LINK, "  https://example.com/boiler  ", ALEX),
                        mark(0, 5, MarkKind.BOLD)));

        assertThat(cleaned)
                .containsExactly(
                        mark(0, 5, MarkKind.BOLD),
                        new Mark(0, 5, MarkKind.MENTION, null, ALEX),
                        mark(16, 22, MarkKind.BOLD),
                        new Mark(16, 27, MarkKind.LINK, "https://example.com/boiler", null));
        assertThat(Marks.named(cleaned)).containsExactly(ALEX);
    }

    @Test
    void aMarkMayCoverTheWholeTextAndMarksMayOverlap() {
        List<Mark> cleaned = Marks.clean(
                TEXT,
                List.of(
                        mark(0, TEXT.length(), MarkKind.ITALIC),
                        mark(3, 9, MarkKind.STRIKE),
                        mark(6, 12, MarkKind.BOLD)));
        assertThat(cleaned).hasSize(3);
        assertThat(cleaned.get(0).end()).isEqualTo(TEXT.length());
    }

    @ParameterizedTest
    @CsvSource({
        "-1, 3", // starts before the text
        "5, 5", // nothing in it
        "7, 3", // ends before it starts
        "0, 29", // ends after the text (28 characters)
        "28, 30", // starts at the very end
    })
    void aMarkThatIsNotInsideItsTextIsRefused(int start, int end) {
        assertThatThrownBy(() -> Marks.clean(TEXT, List.of(mark(start, end, MarkKind.BOLD))))
                .isInstanceOf(ApiProblem.class)
                .hasMessage("We couldn't read the formatting of that text.");
    }

    @Test
    void aMarkWithNoKindOrNoMarkAtAllIsRefused() {
        assertThatThrownBy(() -> Marks.clean(TEXT, List.of(new Mark(0, 3, null, null, null))))
                .isInstanceOf(ApiProblem.class);
        assertThatThrownBy(() -> Marks.clean(TEXT, Collections.singletonList(null)))
                .isInstanceOf(ApiProblem.class);
        assertThatThrownBy(() -> Marks.clean(TEXT, List.of(mark(0, 5, MarkKind.MENTION))))
                .isInstanceOf(ApiProblem.class);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "example.com",
                "javascript:alert(1)",
                "ftp://example.com/file",
                "https://",
                "https://exa mple.com",
                "mailto:nora@example.com"
            })
    void aLinkHasToOpenInABrowser(String url) {
        assertThatThrownBy(() -> Marks.clean(TEXT, List.of(new Mark(0, 5, MarkKind.LINK, url, null))))
                .isInstanceOf(ApiProblem.class)
                .hasMessage("A link starts with http:// or https://.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://example.com", "http://example.com/a?b=c#d", "HTTPS://EXAMPLE.COM/Boiler"})
    void aWebAddressIsALink(String url) {
        assertThat(Marks.clean(TEXT, List.of(new Mark(0, 5, MarkKind.LINK, url, null))))
                .containsExactly(new Mark(0, 5, MarkKind.LINK, url, null));
    }

    @Test
    void aBlockTakesTwoHundredMarksAndNoMore() {
        List<Mark> many = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            many.add(mark(0, 1 + i % 20, MarkKind.BOLD));
        }
        assertThat(Marks.clean(TEXT, many)).hasSize(200);
        many.add(mark(0, 1, MarkKind.BOLD));
        assertThatThrownBy(() -> Marks.clean(TEXT, many)).isInstanceOf(ApiProblem.class);
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "Short | Short",
                "'  Bedtimes  ' | Bedtimes",
                "The router is in the hallway cupboard. If the internet stops, switch it off, count to ten and switch it on. | The router is in the hallway cupboard. If the internet stops, switch it off,…",
            })
    void aPageSaysHowItStartsInAtMostEightyCharacters(String firstLine, String glance) {
        assertThat(PageSources.shortened(firstLine)).isEqualTo(glance);
        assertThat(PageSources.shortened(firstLine).length()).isLessThanOrEqualTo(81);
        // One long word is cut where the room ends.
        assertThat(PageSources.shortened("A".repeat(100))).isEqualTo("A".repeat(80) + "…");
    }
}
