package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * What a line of the day's list says about its tick, so the app needn't work it out: whether the signed-in
 * person may tick it or take its tick away, with which due day, and whether it comes round again. And what
 * the calendar tells the Saturday jar: who has something on today.
 */
class PlanLinesAndFreeDaysTest extends PlanTestBase {

    private String plan(String token, String day) throws Exception {
        return fetch("/v1/circles/" + circle + "/plan?day=" + day + "&days=1", token);
    }

    /** Ticks a reminder for a due day (or takes that tick away), as on the phone on a given day. */
    private void tick(String token, String reminder, boolean done, String dueOn, String phoneDay) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/reminders/" + reminder + "/done",
                token,
                "{\"done\":%s,\"dueOn\":%s,\"day\":\"%s\"}"
                        .formatted(done, dueOn == null ? "null" : "\"" + dueOn + "\"", phoneDay),
                200);
    }

    /** One field of the lines of a day with this title. */
    private static <T> List<T> lines(String plan, String title, String field) {
        return JsonPath.read(plan, "$.days[0].entries[?(@.title == \"" + title + "\")]." + field);
    }

    @Test
    void aLineThatIsDoneSaysWhetherItsTickCanBeTakenAwayAndWithWhichDueDay() throws Exception {
        theLinds();
        String fed = reminder(
                nora,
                "Feed Biscuit",
                ",\"dueOn\":\"2026-11-10\",\"audience\":\"circle\",\"repeat\":{\"unit\":\"day\"},\"givenTo\":[\"%s\"]"
                        .formatted(leoId));
        String form = reminder(nora, "Sign the form", ",\"dueOn\":\"%s\",\"audience\":\"circle\"".formatted(TODAY));
        String call = reminder(nora, "Call the school", ",\"audience\":\"circle\"");
        event(nora, "Swimming · Mia", TODAY, "17:00", ",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\"}");
        // Yesterday's round was ticked yesterday and today's today; the form and the call (which has no day) too.
        tick(nora, fed, true, "2026-11-10", "2026-11-10");
        tick(nora, fed, true, TODAY, TODAY);
        tick(nora, form, true, TODAY, TODAY);
        tick(nora, call, true, null, TODAY);

        String day = plan(nora, TODAY);
        // The job that repeats: today's tick is its last and can be taken away, with the day it was ticked for.
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(day, "Feed Biscuit", "done"))
                .containsExactly(true);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(day, "Feed Biscuit", "canTick"))
                .containsExactly(true);
        assertThat(PlanLinesAndFreeDaysTest.<String>lines(day, "Feed Biscuit", "dueOn"))
                .containsExactly(TODAY);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(day, "Feed Biscuit", "repeats"))
                .as("a done line of something that comes round again still says so")
                .containsExactly(true);
        // Yesterday's tick is not the last one any more: it stands there, and can't be taken away before today's.
        String yesterday = plan(nora, "2026-11-10");
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(yesterday, "Feed Biscuit", "canTick"))
                .containsExactly(false);
        assertThat(PlanLinesAndFreeDaysTest.<String>lines(yesterday, "Feed Biscuit", "dueOn"))
                .containsExactly("2026-11-10");
        // A job ticked that never had a day stands on the day it was really done, and has no due day to send.
        String doneOn = plan(nora, LocalDate.now(ZoneId.of(ZONE)).toString());
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(doneOn, "Call the school", "canTick"))
                .containsExactly(true);
        assertThat(PlanLinesAndFreeDaysTest.<Object>lines(doneOn, "Call the school", "dueOn"))
                .containsExactly((Object) null);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(day, "Sign the form", "repeats"))
                .containsExactly(false);
        // What is still open says the due day too; an event has none, and says when it comes round again.
        assertThat(PlanLinesAndFreeDaysTest.<String>lines(plan(nora, "2026-11-12"), "Feed Biscuit", "dueOn"))
                .containsExactly("2026-11-12");
        assertThat(PlanLinesAndFreeDaysTest.<Object>lines(day, "Swimming · Mia", "dueOn"))
                .containsExactly((Object) null);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(day, "Swimming · Mia", "repeats"))
                .containsExactly(true);

        // Alex may see these but not change them (and none is his to do): there is nothing for him to untick.
        for (String reminder : List.of(fed, form, call)) {
            share(nora, reminder, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        }
        assertThat(JsonPath.<List<Boolean>>read(plan(alex, TODAY), "$.days[0].entries[?(@.done == true)].canTick"))
                .isNotEmpty()
                .containsOnly(false);
        // Given to him, the form is his to tick and so to untick, though he still may not change it.
        send(HttpMethod.PATCH, "/v1/reminders/" + form, nora, "{\"givenTo\":[\"%s\"]}".formatted(alexId), 200);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(plan(alex, TODAY), "Sign the form", "canTick"))
                .containsExactly(true);

        // Sending a done line's dueOn back takes exactly that tick away: the job is open again on its day.
        tick(nora, fed, false, TODAY, TODAY);
        String after = plan(nora, TODAY);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(after, "Feed Biscuit", "done"))
                .containsExactly(false);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(plan(nora, "2026-11-10"), "Feed Biscuit", "canTick"))
                .as("now yesterday's tick is the last one")
                .containsExactly(true);
        tick(alex, form, false, TODAY, TODAY);
        assertThat(PlanLinesAndFreeDaysTest.<Boolean>lines(plan(nora, TODAY), "Sign the form", "done"))
                .containsExactly(false);
    }

    @Test
    void theSaturdayJarSaysEveryoneIsFreeWhenNobodyHasAnythingInTheCalendarThatDay() throws Exception {
        theLinds();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        String jar = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/boards",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"saturday_jar\",\"audience\":\"circle\",\"settings\":{}}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        String view = "/v1/boards/" + jar + "?day=" + today;
        // Yesterday's and tomorrow's events, a job and a bill keep nobody from an afternoon out today.
        event(nora, "Yesterday's thing", today.minusDays(1).toString(), "10:00", ",\"audience\":\"circle\"");
        event(nora, "Tomorrow's thing", today.plusDays(1).toString(), "10:00", ",\"audience\":\"circle\"");
        reminder(nora, "Take the bins out", ",\"dueOn\":\"%s\",\"audience\":\"circle\"".formatted(today));
        send(
                HttpMethod.POST,
                "/v1/bills",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"%s\",\"audience\":\"circle\"}"
                        .formatted(id(), circle, today),
                201);
        assertThat(JsonPath.<Boolean>read(fetch(view, nora), "$.view.everyoneFree"))
                .isTrue();
        assertThat(JsonPath.<Integer>read(fetch(view, nora), "$.view.people")).isEqualTo(4);

        // Something only Nora knows of today: she sees that not everyone is free, and the jar tells Alex nothing.
        String hers = event(nora, "A secret errand", today.toString(), "11:00", ",\"audience\":\"me\"");
        assertThat(JsonPath.<Boolean>read(fetch(view, nora), "$.view.everyoneFree"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fetch(view, alex), "$.view.everyoneFree"))
                .isTrue();
        send(HttpMethod.DELETE, "/v1/things/" + hers, nora, null, 204);
        assertThat(JsonPath.<Boolean>read(fetch(view, nora), "$.view.everyoneFree"))
                .isTrue();

        // A trip that began two days ago and ends tomorrow covers today.
        String trip = event(
                nora,
                "Away with the class",
                today.minusDays(2).toString(),
                null,
                ",\"audience\":\"circle\",\"endDay\":\"%s\",\"guests\":[{\"memberId\":\"%s\"}]"
                        .formatted(today.plusDays(1), miaId));
        assertThat(JsonPath.<Boolean>read(fetch(view, alex), "$.view.everyoneFree"))
                .isFalse();
        send(HttpMethod.DELETE, "/v1/things/" + trip, nora, null, 204);

        // Leo's haircut comes round every week on this day of the week: not everyone is free, for anyone.
        event(
                nora,
                "Haircut · Leo",
                today.minusWeeks(3).toString(),
                "10:00",
                ",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\"},\"guests\":[{\"memberId\":\"%s\"}]"
                        .formatted(leoId));
        assertThat(JsonPath.<Boolean>read(fetch(view, alex), "$.view.everyoneFree"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fetch(view, nora), "$.view.everyoneFree"))
                .isFalse();
    }
}
