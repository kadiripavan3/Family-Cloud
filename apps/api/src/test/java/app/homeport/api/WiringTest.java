package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.library.DatedThings;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * What one place asked of another through a small interface, now answered: bills on the calendar, the days of
 * an event for the Library, dinners from the calendar in the meal plan, a search that knows who is looking,
 * and Today's buttons.
 */
class WiringTest extends TiesTestBase {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    @Autowired
    List<DatedThings> dated;

    @Test
    void aBillThatIsDueStandsOnTheCalendarOnItsDayForWhoeverMaySeeIt() throws Exception {
        theLinds();
        LocalDate due = TODAY.plusDays(3);
        bill(
                nora,
                "Electricity",
                8420,
                due.toString(),
                ",\"audience\":\"circle\",\"shares\":[{\"memberId\":\"%s\",\"parts\":1},{\"memberId\":\"%s\",\"parts\":1}]"
                        .formatted(noraId, alexId));
        bill(nora, "Nora's phone", 1900, due.toString(), ",\"audience\":\"me\"");

        String hers = fetch("/v1/circles/" + circle + "/plan?day=" + TODAY + "&days=7", nora);
        String his = fetch("/v1/circles/" + circle + "/plan?day=" + TODAY + "&days=7", alex);

        assertThat(JsonPath.<List<String>>read(hers, "$.days[?(@.day == '" + due + "')].entries[*].title"))
                .containsExactlyInAnyOrder("Electricity", "Nora's phone");
        assertThat(JsonPath.<List<String>>read(
                        hers, "$.days[?(@.day == '" + due + "')].entries[?(@.title == 'Electricity')].lead"))
                .containsExactly("€84");
        assertThat(JsonPath.<List<String>>read(his, "$.days[*].entries[*].title"))
                .containsExactly("Electricity");
        // The month has a day with something on it for both of them.
        String month =
                fetch("/v1/circles/" + circle + "/month?month=" + due.toString().substring(0, 7), alex);
        assertThat(JsonPath.<List<Object>>read(month, "$.days[?(@.day == '" + due + "')].dots[*]"))
                .isNotEmpty();
        // Today still brings the bill once: Money brings it there itself.
        String soon = bill(nora, "Water", 3100, TODAY.toString(), ",\"audience\":\"circle\"");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + TODAY, alex),
                        "$.items[?(@.kind == 'bill')].thingId"))
                .containsExactly(soon);
    }

    @Test
    void todaysLinesSayWhatTheDrawingHasAButtonARepeatMarkAndWhenSomethingIsDue() throws Exception {
        theLinds();
        bill(
                nora,
                "Electricity",
                8420,
                TODAY.plusDays(1).toString(),
                ",\"audience\":\"circle\",\"repeat\":\"monthly\",\"shares\":[{\"memberId\":\"%s\",\"parts\":1},{\"memberId\":\"%s\",\"parts\":1}]"
                        .formatted(noraId, alexId));
        bill(nora, "Rent", 98000, TODAY.toString(), ",\"audience\":\"circle\",\"pays\":\"standing_order\"");
        reminder(
                nora,
                "Take the bins out",
                ",\"dueOn\":\"%s\",\"dueTime\":\"19:00\",\"repeat\":{\"unit\":\"day\"}".formatted(TODAY));
        event(nora, "Dentist", TODAY.toString(), "15:30", "");

        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);

        String electricity = "$.items[?(@.title == 'Electricity')]";
        assertThat(JsonPath.<List<String>>read(today, electricity + ".action.label"))
                .containsExactly("Pay");
        assertThat(JsonPath.<List<String>>read(today, electricity + ".action.act"))
                .containsExactly("pay");
        assertThat(JsonPath.<List<Boolean>>read(today, electricity + ".repeats"))
                .containsExactly(true);
        assertThat(JsonPath.<List<String>>read(today, electricity + ".due.amount"))
                .containsExactly("€84.20");
        assertThat(JsonPath.<List<String>>read(today, electricity + ".due.note"))
                .containsExactly("Your half is €42.10");
        assertThat(JsonPath.<List<String>>read(today, electricity + ".due.on"))
                .containsExactly(TODAY.plusDays(1).toString());
        // A bill the bank pays by itself has no button; a reminder that comes round has the mark; an event neither.
        assertThat(JsonPath.<List<Object>>read(today, "$.items[?(@.title == 'Rent')].action"))
                .containsOnlyNulls();
        assertThat(JsonPath.<List<String>>read(today, "$.items[?(@.title == 'Rent')].due.note"))
                .containsExactly("Standing order");
        assertThat(JsonPath.<List<Boolean>>read(today, "$.items[?(@.title == 'Take the bins out')].repeats"))
                .containsExactly(true);
        assertThat(JsonPath.<List<String>>read(today, "$.items[?(@.title == 'Take the bins out')].due.on"))
                .containsExactly(TODAY.toString());
        assertThat(JsonPath.<List<Boolean>>read(today, "$.items[?(@.title == 'Dentist')].repeats"))
                .containsExactly(false);
        assertThat(JsonPath.<List<Object>>read(today, "$.items[?(@.title == 'Dentist')].due"))
                .containsOnlyNulls();
    }

    @Test
    void theMealPlanShowsADinnerThatIsInTheCalendarAndTheLibraryLearnsAnEventsDays() throws Exception {
        theLinds();
        LocalDate saturday = TODAY.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
        String dinner =
                event(nora, "Dinner at Grandma Astrid's", saturday.toString(), "18:30", ",\"audience\":\"circle\"");
        event(nora, "Haircut", saturday.toString(), "10:00", ",\"audience\":\"circle\"");
        event(nora, "Surprise dinner for Alex", saturday.toString(), "20:00", ",\"audience\":\"me\"");
        String plan = make(
                nora,
                "/v1/boards",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"meal_plan\",\"audience\":\"circle\"}"
                        .formatted(id(), circle));

        String hers = fetch("/v1/boards/" + plan + "?day=" + TODAY, nora);
        String his = fetch("/v1/boards/" + plan + "?day=" + TODAY, alex);

        // Dinners only (not the haircut), each for whoever may see the event: the surprise is Nora's alone.
        assertThat(JsonPath.<List<String>>read(hers, "$.view.days[*].meals[?(@.fromCalendar == true)].name"))
                .containsExactlyInAnyOrder("Dinner at Grandma Astrid's", "Surprise dinner for Alex");
        assertThat(JsonPath.<List<String>>read(his, "$.view.days[*].meals[?(@.fromCalendar == true)].name"))
                .containsExactly("Dinner at Grandma Astrid's");

        // The Library asks on which days a thing happens: Plan answers for its events.
        var days = dated.stream()
                .map(source -> source.daysOf(List.of(UUID.fromString(dinner), UUID.fromString(plan))))
                .filter(found -> !found.isEmpty())
                .findFirst()
                .orElseThrow();
        assertThat(days).containsOnlyKeys(UUID.fromString(dinner));
        assertThat(days.get(UUID.fromString(dinner)).from()).isEqualTo(saturday);
    }

    @Test
    void aSearchFindsInsideAThingOnlyWhatThePersonLookingMayReadThere() throws Exception {
        theLinds();
        String list = checklist(alex, "Party prep", "circle", "Balloons");
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/items",
                alex,
                "{\"clientId\":\"%s\",\"text\":\"Candles for Nora\",\"hideFrom\":[\"%s\"]}".formatted(id(), noraId),
                201);

        // Alex finds the line he wrote; to Nora, whom it is kept from, the list holds no such word.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=candles", alex), "$.hits[*].snippet"))
                .containsExactly("Candles for Nora");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/search?q=candles", nora), "$.hits"))
                .isEmpty();
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=balloons", nora), "$.hits[*].thing.title"))
                .containsExactly("Party prep");
    }

    @Test
    void theCircleSwitcherHasOneShortLineForEachCircle() throws Exception {
        theLinds();
        addMember(nora, circle, "Biscuit", "pet");
        circle(nora, "couple", "Nora and Alex");
        page(nora, circle, "Diary", "me");

        String sheet = fetch("/v1/home/circles", nora);

        assertThat(JsonPath.<List<String>>read(sheet, "$.circles[*].name"))
                .containsExactly("The Linds", "Nora and Alex");
        assertThat(JsonPath.<List<String>>read(sheet, "$.circles[*].line"))
                .containsExactly("Family · 4 people and Biscuit", "Couple · 1 person");
        assertThat(JsonPath.<Integer>read(sheet, "$.onlyYou")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/home/circles", alex), "$.circles[*].name"))
                .containsExactly("The Linds");
    }
}
