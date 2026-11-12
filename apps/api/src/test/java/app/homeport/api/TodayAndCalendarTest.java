package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.home.TodaySource.TodayAction;
import app.homeport.api.home.TodaySource.TodayDue;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.plan.PlanSource;
import app.homeport.api.plan.PlanSource.Dated;
import app.homeport.api.thing.ThingKind;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;

/**
 * What Plan brings to Today, and what other places bring to the calendar. Another place is stood in for
 * here by a bill that is due on Thursday 12 November, the way Money will bring its own.
 */
class TodayAndCalendarTest extends PlanTestBase {

    private static final UUID BILL = UUID.randomUUID();

    @TestConfiguration
    static class AnotherPlace {

        @Bean
        PlanSource billsDue() {
            return (me, circleId, from, to) -> List.of(new Dated(
                    LocalDate.parse("2026-11-12"),
                    new TodayItem(
                                    BILL,
                                    ThingKind.PAGE,
                                    "Electricity is due",
                                    "Split with Alex",
                                    "€84",
                                    null,
                                    1440,
                                    List.of())
                            .with(
                                    TodayAction.PAY,
                                    true,
                                    new TodayDue(LocalDate.parse("2026-11-12"), "€84.20", "Your half is €42.10")),
                    List.of()));
        }
    }

    private List<String> today(String token) throws Exception {
        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, token);
        List<String> leads = JsonPath.read(today, "$.items[*].lead");
        List<String> titles = JsonPath.read(today, "$.items[*].title");
        List<String> notes = JsonPath.read(today, "$.items[*].note");
        List<Boolean> done = JsonPath.read(today, "$.items[*].done");
        List<String> lines = new java.util.ArrayList<>();
        for (int i = 0; i < titles.size(); i++) {
            lines.add(leads.get(i) + "|" + titles.get(i) + "|" + notes.get(i) + "|" + done.get(i));
        }
        return lines;
    }

    @Test
    void todayShowsTheDaysEventsAndTheRemindersThatAreYoursOrThatYouAskedFor() throws Exception {
        theLinds();
        event(
                nora,
                "Dentist · Mia",
                TODAY,
                "15:30",
                ",\"audience\":\"circle\",\"place\":\"Trubarjeva 12\",\"guests\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\",\"part\":\"is taking her\"}]"
                        .formatted(miaId, alexId));
        event(nora, "Leo's school play", TODAY, null, ",\"audience\":\"circle\"");
        event(nora, "Tomorrow's thing", "2026-11-12", "10:00", ",\"audience\":\"circle\"");
        reminder(
                nora,
                "Take the bins out",
                ",\"dueOn\":\"%s\",\"dueTime\":\"19:00\",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\",\"days\":[\"tue\",\"fri\"]},\"takesTurns\":true,\"givenTo\":[\"%s\",\"%s\"]"
                        .formatted(TODAY, noraId, alexId));
        reminder(nora, "Pay the school", ",\"dueOn\":\"2026-11-09\"");
        reminder(nora, "Book the car service", ",\"dueOn\":\"%s\",\"givenTo\":[\"%s\"]".formatted(TODAY, alexId));
        String fed = reminder(
                nora,
                "Feed Biscuit",
                ",\"dueOn\":\"%s\",\"dueTime\":\"07:30\",\"repeat\":{\"unit\":\"day\"},\"stars\":1,\"givenTo\":[\"%s\"]"
                        .formatted(TODAY, leoId));
        send(
                HttpMethod.PUT,
                "/v1/reminders/" + fed + "/done",
                nora,
                "{\"done\":true,\"dueOn\":\"%s\",\"day\":\"%s\"}".formatted(TODAY, TODAY),
                200);
        jdbc.sql("update reminder_ticks set done_at = timestamptz '2026-11-11 07:40+01'")
                .update();
        reminder(nora, "Sign the form", ",\"dueOn\":\"2026-11-13\"");
        reminder(nora, "Some time", "");

        // In order of time; what has no time comes last. A job has a tick in front, so no lead.
        assertThat(today(nora))
                .containsExactly(
                        "All day|Leo's school play||null",
                        "null|Feed Biscuit|Leo · Done at 7:40 · 1 star|true",
                        "15:30|Dentist · Mia|Alex is taking her|null",
                        "null|Take the bins out|Tonight · your turn|false",
                        "null|Book the car service|Today · Alex|false",
                        "null|Pay the school|Since Monday|false");
        String home = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        assertThat(JsonPath.<Integer>read(home, "$.left")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(home, "$.done")).isEqualTo(1);
        assertThat(JsonPath.<String>read(home, "$.items[2].kind")).isEqualTo("event");
        assertThat(JsonPath.<Integer>read(home, "$.items[2].minute")).isEqualTo(930);
        // Each line says whether it can be ticked from here. One that is done says which due day was ticked, so
        // its tick can be taken away again without asking the reminder first. An event has nothing to tick.
        assertThat(JsonPath.<List<Boolean>>read(home, "$.items[*].canTick"))
                .containsExactly(false, true, false, true, true, true);
        assertThat(JsonPath.<Boolean>read(home, "$.items[1].done")).isTrue();
        assertThat(JsonPath.<String>read(home, "$.items[1].due.on")).isEqualTo(TODAY);
        assertThat(JsonPath.<Boolean>read(home, "$.items[1].repeats")).isTrue();
        assertThat(JsonPath.<String>read(home, "$.items[3].due.on")).isEqualTo(TODAY);
        assertThat(JsonPath.<String>read(home, "$.items[5].due.on"))
                .as("still open from Monday: the day it was due")
                .isEqualTo("2026-11-09");
        // Alex was given the car service: he may tick it. He asked for nothing and made nothing else.
        assertThat(JsonPath.<List<Boolean>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + TODAY, alex), "$.items[*].canTick"))
                .containsExactly(false, false, true);

        // The day's list keeps to the calendar, and hands over what is still open from before next to it.
        String plan = fetch("/v1/circles/" + circle + "/plan?day=" + TODAY + "&days=1", nora);
        assertThat(JsonPath.<List<String>>read(plan, "$.days[0].entries[*].title"))
                .containsExactly(
                        "Leo's school play",
                        "Feed Biscuit",
                        "Dentist · Mia",
                        "Take the bins out",
                        "Book the car service");
        assertThat(JsonPath.<List<String>>read(plan, "$.overdue[*].title")).containsExactly("Pay the school");
        assertThat(JsonPath.<String>read(plan, "$.overdue[0].day"))
                .as("the day it was due: what a tick is sent with")
                .isEqualTo("2026-11-09");
        assertThat(JsonPath.<Boolean>read(plan, "$.overdue[0].canTick")).isTrue();

        // Alex sees the events, and his own job. The bins are not his tonight; what Nora keeps to herself isn't there.
        assertThat(today(alex))
                .containsExactly(
                        "All day|Leo's school play||null",
                        "15:30|Dentist · Mia|Alex is taking her|null",
                        "null|Book the car service|Today|false");

        // The tick is taken away with nothing but what Today said: the reminder is open again, due the same day.
        send(
                HttpMethod.PUT,
                "/v1/reminders/" + fed + "/done",
                nora,
                "{\"done\":false,\"dueOn\":\"%s\",\"day\":\"%s\"}"
                        .formatted(JsonPath.<String>read(home, "$.items[1].due.on"), TODAY),
                200);
        String again = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        assertThat(JsonPath.<List<Boolean>>read(again, "$.items[?(@.title == 'Feed Biscuit')].done"))
                .containsExactly(false);
        assertThat(JsonPath.<List<String>>read(again, "$.items[?(@.title == 'Feed Biscuit')].due.on"))
                .containsExactly(TODAY);
    }

    @Test
    void whatAnotherPlaceBringsStandsOnTheCalendarAmongEventsAndReminders() throws Exception {
        theLinds();
        event(nora, "Swimming · Mia", "2026-11-12", "17:00", ",\"guests\":[{\"memberId\":\"%s\"}]".formatted(miaId));

        assertThat(day(nora, "2026-11-12"))
                .containsExactly("17:00|Swimming · Mia|", "€84|Electricity is due|Split with Alex");
        String plan = fetch("/v1/circles/" + circle + "/plan?day=2026-11-12&days=1", nora);
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[1].thingId")).isEqualTo(BILL.toString());
        assertThat(JsonPath.<Object>read(plan, "$.days[0].entries[1].chip"))
                .as("its own place says who sees it")
                .isNull();
        assertThat(JsonPath.<Boolean>read(plan, "$.days[0].entries[1].canTick")).isFalse();
        // What the place said about its line comes through whole: its button, that it comes round, when it is due.
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[1].action.label"))
                .isEqualTo("Pay");
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[1].action.act"))
                .isEqualTo("pay");
        assertThat(JsonPath.<Boolean>read(plan, "$.days[0].entries[1].repeats")).isTrue();
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[1].due.on")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[1].due.amount"))
                .isEqualTo("€84.20");
        assertThat(JsonPath.<Object>read(plan, "$.days[0].entries[0].action")).isNull();
        assertThat(JsonPath.<Object>read(plan, "$.days[0].entries[0].due")).isNull();
        // The week and the month give it a dot: everyone's, since it named nobody.
        assertThat(JsonPath.<List<Integer>>read(plan, "$.week[3].dots[*].tint"))
                .hasSize(2)
                .contains(0);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/month?month=2026-11", alex),
                        "$.days[?(@.dots.length() > 0)].day"))
                .containsExactly("2026-11-12");
        // Filtered to one person it is not theirs. And Today is left to the place itself, so nothing shows twice.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/plan?day=2026-11-12&days=1&member=" + miaId, nora),
                        "$.days[0].entries[*].title"))
                .containsExactly("Swimming · Mia");
        assertThat(fetch("/v1/circles/" + circle + "/today?day=2026-11-12", nora))
                .doesNotContain("Electricity");
    }
}
