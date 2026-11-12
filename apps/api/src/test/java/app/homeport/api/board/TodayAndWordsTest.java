package app.homeport.api.board;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.circle.CircleKind;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The engine's small pure parts: which day it is, the words, and what the catalog adds up to. */
class TodayAndWordsTest {

    private static final Clock NOON = Clock.fixed(Instant.parse("2026-11-11T12:00:00Z"), ZoneOffset.UTC);

    private static LocalDate day(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void thePhonesDayIsBelievedOnlyAsFarAsItCanBeTrueSomewhereOnEarth() {
        assertThat(Today.of(null, NOON)).isEqualTo(day("2026-11-11"));
        assertThat(Today.of(day("2026-11-11"), NOON)).isEqualTo(day("2026-11-11"));
        // Auckland is already on the 12th; Honolulu was still on the 10th a few hours ago.
        assertThat(Today.of(day("2026-11-12"), NOON)).isEqualTo(day("2026-11-12"));
        assertThat(Today.of(day("2026-11-10"), NOON)).isEqualTo(day("2026-11-10"));
        // Anything further off is a wrong clock, or someone trying to open a capsule early.
        assertThat(Today.of(day("2026-11-13"), NOON)).isEqualTo(day("2026-11-12"));
        assertThat(Today.of(day("2034-12-04"), NOON)).isEqualTo(day("2026-11-12"));
        assertThat(Today.of(day("2026-12-31"), NOON)).isEqualTo(day("2026-11-12"));
        assertThat(Today.of(day("2026-11-09"), NOON)).isEqualTo(day("2026-11-10"));
        assertThat(Today.of(day("1999-01-01"), NOON)).isEqualTo(day("2026-11-10"));
    }

    @Test
    void wordsForCountsDatesAndNames() {
        assertThat(Words.day(day("2034-12-04"))).isEqualTo("4 Dec 2034");
        assertThat(Words.shortDay(day("2026-11-02"))).isEqualTo("2 Nov");
        assertThat(Words.weekday(day("2026-11-11"))).isEqualTo("Wed");
        assertThat(Words.count(1, "letter")).isEqualTo("1 letter");
        assertThat(Words.count(3, "letter")).isEqualTo("3 letters");
        assertThat(Words.count(0, "story", "stories")).isEqualTo("0 stories");
        assertThat(List.of(1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 101, 111, 112).stream()
                        .map(Words::ordinal)
                        .toList())
                .containsExactly(
                        "1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st",
                        "111th", "112th");
        assertThat(Words.clock(192)).isEqualTo("3:12");
        assertThat(Words.clock(6)).isEqualTo("0:06");
        assertThat(Words.clock(600)).isEqualTo("10:00");
        assertThat(Words.of("Mia")).isEqualTo("Mia's");
        assertThat(Words.of("Lars")).isEqualTo("Lars'");
    }

    private static long offered(CircleKind kind, boolean countFairAndFun) {
        return Arrays.stream(Template.values())
                .filter(t -> t.rankFor(kind) >= 0)
                .filter(t -> countFairAndFun == (t.group() == TemplateGroup.FAIR_AND_FUN))
                .count();
    }

    @Test
    void theCatalogAddsUpToTheNumbersOnTheScreens() {
        long templates = Arrays.stream(Template.values())
                .filter(t -> t.group() == TemplateGroup.TEMPLATES)
                .count();
        long keepsakes = Arrays.stream(Template.values())
                .filter(t -> t.group() == TemplateGroup.KEEPSAKES)
                .count();
        // "All 53", "53 ready to use": templates and keepsakes. Fair and fun is counted on its own.
        assertThat(templates + keepsakes).isEqualTo(53);
        assertThat(Template.values().length - templates - keepsakes).isEqualTo(14);
        // "16 templates for couples", "For a flat · 15", "17, from Secret Santa to splitting costs".
        assertThat(offered(CircleKind.COUPLE, false)).isEqualTo(16);
        assertThat(offered(CircleKind.FLAT, false)).isEqualTo(15);
        assertThat(offered(CircleKind.CREW, false)).isEqualTo(17);
        // The requirements' table: a family's eight keepsakes and seven fair-and-fun; three each for a couple and a
        // flat.
        assertThat(offered(CircleKind.FAMILY, true)).isEqualTo(7);
        assertThat(offered(CircleKind.COUPLE, true)).isEqualTo(3);
        assertThat(offered(CircleKind.FLAT, true)).isEqualTo(3);
        // Someone on their own is offered what a family is; every template is made for exactly one kind first.
        assertThat(offered(CircleKind.SOLO, false)).isEqualTo(offered(CircleKind.FAMILY, false));
        assertThat(Arrays.stream(Template.values()).map(Template::offeredTo)).allMatch(kinds -> !kinds.isEmpty());
        assertThat(Arrays.stream(Template.values()).map(Template::code)).doesNotHaveDuplicates();
        assertThat(Template.of("meal_plan")).isEqualTo(Template.MEAL_PLAN);
        assertThat(Template.MEAL_PLAN.rankFor(CircleKind.FLAT)).isEqualTo(1);
        assertThat(Template.MEAL_PLAN.rankFor(CircleKind.CREW)).isEqualTo(-1);
    }
}
