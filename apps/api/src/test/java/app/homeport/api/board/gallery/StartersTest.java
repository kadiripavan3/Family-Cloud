package app.homeport.api.board.gallery;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.board.Template;
import app.homeport.api.board.gallery.Starter.Piece;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The ready-made content of the plain templates: all there, within what a page and a list can hold. */
class StartersTest {

    @Test
    void everyPlainTemplateHasContentAndEveryTemplateThatDoesWorkHasNone() {
        for (Template template : Template.values()) {
            if (template.live()) {
                assertThat(Starters.of(template)).as(template.title()).isNull();
            } else {
                assertThat(Starters.of(template)).as(template.title()).isNotNull();
                assertThat(Starters.of(template).pieces()).as(template.title()).isNotEmpty();
            }
        }
        assertThat(Arrays.stream(Template.values()).filter(t -> !t.live())).hasSize(25);
    }

    @Test
    void whatAStarterMakesFitsAPageAndAChecklistAndAsksNothingAboutAnyonesHealth() {
        for (Template template : Template.values()) {
            Starter starter = Starters.of(template);
            if (starter == null) {
                continue;
            }
            for (Piece piece : starter.pieces()) {
                String what = template.title() + " · " + piece.title();
                assertThat(piece.title()).as(what).isNotBlank().hasSizeLessThanOrEqualTo(200);
                if (piece.page()) {
                    assertThat(piece.body()).as(what).isNotBlank().hasSizeLessThan(100000);
                    assertThat(piece.body().lines().count()).as(what).isGreaterThanOrEqualTo(4);
                } else {
                    assertThat(piece.lines()).as(what).isNotEmpty().hasSizeLessThanOrEqualTo(100);
                    piece.lines().forEach(line -> {
                        assertThat(line.text()).as(what).isNotBlank().hasSizeLessThanOrEqualTo(300);
                        assertThat(line.section()).as(what).hasSizeLessThanOrEqualTo(60);
                    });
                }
                String words = (piece.body() + " "
                                + String.join(
                                        " ",
                                        piece.lines().stream()
                                                .map(Starter.Line::text)
                                                .toList()))
                        .toLowerCase(java.util.Locale.ROOT);
                assertThat(List.of("allerg", "medicine", "medication", "illness", "diagnos", "blood", "doctor"))
                        .as(what)
                        .noneMatch(words::contains);
            }
        }
    }

    @Test
    void aLineUnderAHeadingKnowsItsHeadingAndAGiftListStartsAsYoursAlone() {
        Starter planner = Starters.of(Template.BIRTHDAY_PLANNER);
        Piece prep = planner.pieces().get(1);
        assertThat(prep.lines().get(0)).isEqualTo(new Starter.Line("Three weeks before", "Pick the day and the place"));
        assertThat(prep.lines().get(prep.lines().size() - 1).section()).isEqualTo("On the day");
        assertThat(planner.pieces().stream().map(Piece::onlyYou)).containsExactly(false, false, true);
        assertThat(Starters.of(Template.THEY_MENTIONED_IT).pieces().get(0).onlyYou())
                .isTrue();
    }
}
