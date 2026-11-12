package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Money on the calendar and on Today: a bill that is still to pay stands on the day it is due with its amount
 * in front, says "Pay" to whoever pays it by hand, and is shown only to those who may see the bill. And what
 * Today's lines say about themselves so the app needn't work it out: whether a line can be ticked (or
 * unticked), the day it is due, its action word, and whether it comes round again.
 */
class BillsOnTheCalendarTest extends PlanTestBase {

    private String bill(String token, String title, long cents, String dueOn, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/bills",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"amountCents\":%d,\"dueOn\":\"%s\"%s}"
                                .formatted(id(), circle, title, cents, dueOn, more),
                        201),
                "$.id");
    }

    private String plan(String token, String day) throws Exception {
        return fetch("/v1/circles/" + circle + "/plan?day=" + day + "&days=1", token);
    }

    @Test
    void aBillStandsOnTheDayItIsDueWithItsAmountInFrontAndPayForWhoeverPaysItByHand() throws Exception {
        theLinds();
        String electricity = bill(
                nora,
                "Electricity",
                8420,
                "2026-11-12",
                ",\"audience\":\"circle\",\"repeat\":\"monthly\",\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]"
                        .formatted(noraId, alexId));
        bill(nora, "Rent", 98000, "2026-11-16", ",\"audience\":\"circle\",\"pays\":\"standing_order\"");
        // In a family a bill starts as its maker's own: this one is Nora's alone.
        bill(nora, "Surprise for Alex", 5000, "2026-11-12", "");
        event(
                nora,
                "Swimming · Mia",
                "2026-11-12",
                "17:00",
                ",\"audience\":\"circle\",\"guests\":[{\"memberId\":\"%s\"}]".formatted(miaId));

        // The day's list: the bills first, like something that takes all day, then the day's times.
        assertThat(day(nora, "2026-11-12"))
                .containsExactly(
                        "€84|Electricity is due|Split with Alex",
                        "€50|Surprise for Alex is due|",
                        "17:00|Swimming · Mia|");
        String thursday = plan(nora, "2026-11-12");
        assertThat(JsonPath.<String>read(thursday, "$.days[0].entries[0].kind")).isEqualTo("bill");
        assertThat(JsonPath.<String>read(thursday, "$.days[0].entries[0].thingId"))
                .isEqualTo(electricity);
        assertThat(JsonPath.<String>read(thursday, "$.days[0].entries[0].action"))
                .isEqualTo("Pay");
        assertThat(JsonPath.<String>read(thursday, "$.days[0].entries[0].dueOn"))
                .isEqualTo("2026-11-12");
        assertThat(JsonPath.<Boolean>read(thursday, "$.days[0].entries[0].repeats"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(thursday, "$.days[0].entries[1].repeats"))
                .isFalse();
        assertThat(JsonPath.<Object>read(thursday, "$.days[0].entries[0].done"))
                .as("a bill is paid on its own page, not ticked")
                .isNull();
        assertThat(JsonPath.<Boolean>read(thursday, "$.days[0].entries[0].canTick"))
                .isFalse();
        assertThat(JsonPath.<String>read(thursday, "$.days[0].entries[0].whose.memberId"))
                .as("the dot is its first payer's")
                .isEqualTo(noraId);
        assertThat(JsonPath.<Object>read(thursday, "$.days[0].entries[2].action"))
                .isNull();
        // What the bank pays by itself has nothing to press.
        assertThat(day(nora, "2026-11-16")).containsExactly("€980|Rent is due|Standing order");
        assertThat(JsonPath.<Object>read(plan(nora, "2026-11-16"), "$.days[0].entries[0].action"))
                .isNull();
        // The month has its dots on both days, and a face's own days are the ones they pay on.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/month?month=2026-11", nora),
                        "$.days[?(@.dots.length() > 0)].day"))
                .containsExactly("2026-11-12", "2026-11-16");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/month?month=2026-11&member=" + alexId, nora),
                        "$.days[?(@.dots.length() > 0)].day"))
                .containsExactly("2026-11-12");

        // Alex sees the bills that are shared with him, from his side. Nora's own bill isn't on his calendar.
        assertThat(day(alex, "2026-11-12"))
                .containsExactly("€84|Electricity is due|Split with Nora", "17:00|Swimming · Mia|");
        assertThat(fetch("/v1/circles/" + circle + "/month?month=2026-11", alex))
                .doesNotContain("Surprise");

        // He pays his half: the line says so to both, and he has nothing left to press.
        send(HttpMethod.PUT, "/v1/bills/" + electricity + "/paid", alex, "{\"dueOn\":\"2026-11-12\"}", 200);
        assertThat(day(nora, "2026-11-12")).contains("€84|Electricity is due|Split with Alex · Alex has paid");
        assertThat(day(alex, "2026-11-12")).contains("€84|Electricity is due|Split with Nora · you have paid");
        assertThat(JsonPath.<Object>read(plan(alex, "2026-11-12"), "$.days[0].entries[0].action"))
                .isNull();
        assertThat(JsonPath.<String>read(plan(nora, "2026-11-12"), "$.days[0].entries[0].action"))
                .isEqualTo("Pay");

        // Nora pays hers. The bill is paid, so it leaves its day; it comes round next month and stands there.
        send(HttpMethod.PUT, "/v1/bills/" + electricity + "/paid", nora, "{\"dueOn\":\"2026-11-12\"}", 200);
        assertThat(day(nora, "2026-11-12")).containsExactly("€50|Surprise for Alex is due|", "17:00|Swimming · Mia|");
        assertThat(day(nora, "2026-12-12")).containsExactly("€84|Electricity is due|Split with Alex");
    }

    @Test
    void todaysLinesSayWhatCanBeDoneWithThem() throws Exception {
        theLinds();
        String electricity = bill(
                nora,
                "Electricity",
                8420,
                "2026-11-12",
                ",\"audience\":\"circle\",\"repeat\":\"monthly\",\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]"
                        .formatted(noraId, alexId));
        bill(nora, "Netflix", 1399, "2026-11-11", ",\"audience\":\"circle\",\"pays\":\"direct_debit\"");
        event(nora, "Dentist · Mia", TODAY, "15:30", ",\"audience\":\"circle\"");
        String bins = reminder(
                nora,
                "Take the bins out",
                ",\"dueOn\":\"%s\",\"dueTime\":\"19:00\",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\",\"days\":[\"tue\",\"fri\"]},\"takesTurns\":true,\"givenTo\":[\"%s\",\"%s\"]"
                        .formatted(TODAY, noraId, alexId));
        String form = reminder(nora, "Sign the form", ",\"dueOn\":\"2026-11-09\",\"audience\":\"circle\"");
        String fed = reminder(
                nora,
                "Feed Biscuit",
                ",\"dueOn\":\"%s\",\"audience\":\"circle\",\"repeat\":{\"unit\":\"day\"},\"givenTo\":[\"%s\"]"
                        .formatted(TODAY, leoId));
        send(
                HttpMethod.PUT,
                "/v1/reminders/" + fed + "/done",
                nora,
                "{\"done\":true,\"dueOn\":\"%s\",\"day\":\"%s\"}".formatted(TODAY, TODAY),
                200);

        String home = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        // The bill: what to pay by when, and the word for its button. Netflix pays itself, so it has none.
        assertThat(line(home, "Electricity", "action")).isEqualTo("Pay");
        assertThat(line(home, "Electricity", "dueOn")).isEqualTo("2026-11-12");
        assertThat(line(home, "Electricity", "repeats")).isEqualTo(true);
        assertThat(line(home, "Electricity", "canTick")).isEqualTo(false);
        assertThat(line(home, "Netflix", "action")).isNull();
        assertThat(line(home, "Netflix", "dueOn")).isEqualTo(TODAY);
        assertThat(line(home, "Netflix", "repeats")).isEqualTo(false);
        // An event has no due day and nothing to press.
        assertThat(line(home, "Dentist · Mia", "dueOn")).isNull();
        assertThat(line(home, "Dentist · Mia", "action")).isNull();
        assertThat(line(home, "Dentist · Mia", "canTick")).isEqualTo(false);
        // Jobs: tonight's, on her turn, comes round again; the one still open says the day it was due.
        assertThat(line(home, "Take the bins out", "canTick")).isEqualTo(true);
        assertThat(line(home, "Take the bins out", "dueOn")).isEqualTo(TODAY);
        assertThat(line(home, "Take the bins out", "repeats")).isEqualTo(true);
        assertThat(line(home, "Sign the form", "dueOn")).isEqualTo("2026-11-09");
        assertThat(line(home, "Sign the form", "repeats")).isEqualTo(false);
        // A done line can be unticked by whoever could have ticked it, with the due day that was ticked.
        assertThat(line(home, "Feed Biscuit", "done")).isEqualTo(true);
        assertThat(line(home, "Feed Biscuit", "canTick")).isEqualTo(true);
        assertThat(line(home, "Feed Biscuit", "dueOn")).isEqualTo(TODAY);
        String day = plan(nora, TODAY);
        assertThat(JsonPath.<List<Boolean>>read(day, "$.days[0].entries[?(@.title == 'Feed Biscuit')].canTick"))
                .as("the tick of today can be taken away")
                .containsExactly(true);
        assertThat(JsonPath.<List<Boolean>>read(
                        plan(nora, "2026-11-12"), "$.days[0].entries[?(@.title == 'Feed Biscuit')].canTick"))
                .as("tomorrow's round isn't due yet")
                .containsExactly(false);
        assertThat(JsonPath.<List<String>>read(day, "$.days[0].entries[?(@.title == 'Feed Biscuit')].dueOn"))
                .contains(TODAY);

        // Alex may see the family's jobs. The bins are not his tonight, and what isn't his to change he can't tick.
        share(nora, form, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        share(nora, fed, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        String his = plan(alex, TODAY);
        assertThat(JsonPath.<List<Boolean>>read(his, "$.overdue[?(@.title == 'Sign the form')].canTick"))
                .containsExactly(false);
        assertThat(JsonPath.<List<Boolean>>read(his, "$.days[0].entries[?(@.done == true)].canTick"))
                .containsExactly(false);

        // Sending the line's dueOn back takes exactly that tick away, and the job is open again.
        send(
                HttpMethod.PUT,
                "/v1/reminders/" + fed + "/done",
                nora,
                "{\"done\":false,\"dueOn\":\"%s\",\"day\":\"%s\"}"
                        .formatted(line(home, "Feed Biscuit", "dueOn"), TODAY),
                200);
        String after = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        assertThat(line(after, "Feed Biscuit", "done")).isEqualTo(false);
        assertThat(bins).isNotNull();
        assertThat(electricity).isNotNull();
    }

    /** One field of the line of Today with this title. */
    private static Object line(String today, String title, String field) {
        List<Object> found = JsonPath.read(today, "$.items[?(@.title == \"" + title + "\")]." + field);
        assertThat(found).as("the line \"%s\" on Today", title).hasSize(1);
        return found.get(0);
    }
}
