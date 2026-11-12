package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.money.BillService;
import app.homeport.api.money.BillStore.Reminder;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * Bills: what is due, who pays, what it usually costs. "Today" in these tests is Wednesday 11 November 2026,
 * as on the screens.
 */
class BillTest extends ApiTest {

    private static final String TODAY = "2026-11-11";

    @Autowired
    BillService bills;

    /** Adds a bill. {@code more} is the rest of the request, starting with a comma, or empty. Returns its id. */
    private String bill(String token, String circle, String title, long cents, String dueOn, String more)
            throws Exception {
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

    private String paid(String token, String bill, String body) throws Exception {
        return send(HttpMethod.PUT, "/v1/bills/" + bill + "/paid", token, body, 200);
    }

    private static String shares(String... memberIds) {
        return ",\"shares\":["
                + String.join(
                        ",",
                        List.of(memberIds).stream()
                                .map(id -> "{\"memberId\":\"" + id + "\"}")
                                .toList()) + "]";
    }

    @Test
    void aBillSentTwiceIsAddedOnce() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\" Electricity \",\"payee\":\"Elektro Ljubljana\",\"emoji\":\"⚡\",\"amountCents\":8420,\"dueOn\":\"2026-11-12\",\"repeat\":\"monthly\",\"remindDays\":2,\"reference\":\"SI12 3456 7890 1184\"}"
                        .formatted(id(), circle);

        String first = send(HttpMethod.POST, "/v1/bills", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/bills", nora, body, 201);

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/bills", nora), "$.items.length()"))
                .isEqualTo(1);
        assertThat(JsonPath.<String>read(first, "$.title")).isEqualTo("Electricity");
        assertThat(JsonPath.<String>read(first, "$.payee")).isEqualTo("Elektro Ljubljana");
        assertThat(JsonPath.<Integer>read(first, "$.amountCents")).isEqualTo(8420);
        assertThat(JsonPath.<String>read(first, "$.currency")).isEqualTo("EUR");
        assertThat(JsonPath.<Integer>read(first, "$.dueDay")).isEqualTo(12);
        assertThat(JsonPath.<Integer>read(first, "$.yearCents")).isEqualTo(101_040);
        // In a family it is yours alone until you share it, and whoever adds a bill pays it until they say otherwise.
        assertThat(JsonPath.<String>read(first, "$.chip.audience")).isEqualTo("me");
        assertThat(JsonPath.<List<String>>read(first, "$.shares[*].person.name"))
                .containsExactly("Nora");
        assertThat(JsonPath.<Integer>read(first, "$.myShare.cents")).isEqualTo(8420);
        assertThat(JsonPath.<Integer>read(second, "$.history.length()")).isEqualTo(1);
    }

    @Test
    void aBillNeedsANameAnAmountADayAndPayersFromItsOwnCircle() throws Exception {
        String nora = person("Nora");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String dog = addMember(nora, circle, "Biscuit", "pet");
        String elsewhere = JsonPath.read(fetch("/v1/circles/" + circle(kai, "solo", "Kai alone"), kai), "$.myMemberId");
        String start = "{\"clientId\":\"%s\",\"circleId\":\"%s\"".formatted(id(), circle);

        send(HttpMethod.POST, "/v1/bills", nora, start + ",\"title\":\"Rent\",\"dueOn\":\"2026-11-16\"}", 400);
        send(HttpMethod.POST, "/v1/bills", nora, start + ",\"title\":\"Rent\",\"amountCents\":98000}", 400);
        send(HttpMethod.POST, "/v1/bills", nora, start + ",\"amountCents\":98000,\"dueOn\":\"2026-11-16\"}", 400);
        send(
                HttpMethod.POST,
                "/v1/bills",
                nora,
                start + ",\"title\":\"Rent\",\"amountCents\":-1,\"dueOn\":\"2026-11-16\"}",
                400);
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/bills",
                        nora,
                        start
                                + ",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\",\"payUrl\":\"javascript:alert(1)\"}",
                        400))
                .contains("A link starts with https://.");
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/bills",
                        nora,
                        start + ",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\"" + shares(elsewhere)
                                + "}",
                        400))
                .contains("Choose people from this circle.");
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/bills",
                        nora,
                        start + ",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\"" + shares(dog)
                                + "}",
                        400))
                .contains("Biscuit can't pay for anything.");
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/bills",
                        nora,
                        start
                                + ",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\",\"repeat\":\"sometimes\"}",
                        400))
                .contains("Choose once, every month, every few months or every year.");
        send(
                HttpMethod.POST,
                "/v1/bills",
                nora,
                start + ",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\",\"repeat\":\"months\"}",
                400);
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/bills",
                        nora,
                        start
                                + ",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\",\"currency\":\"€\"}",
                        400))
                .contains("Write the currency as three letters, like EUR.");

        // A bill with only who it is paid to is called after them.
        String named = send(
                HttpMethod.POST,
                "/v1/bills",
                nora,
                start + ",\"payee\":\"Mr Novak\",\"amountCents\":98000,\"dueOn\":\"2026-11-16\"}",
                201);
        assertThat(JsonPath.<String>read(named, "$.title")).isEqualTo("Mr Novak");
    }

    @Test
    void markingARepeatingBillPaidMakesTheNextOneDue() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String bill = bill(nora, circle, "Electricity", 7800, "2026-10-12", ",\"repeat\":\"monthly\"");

        String november = paid(nora, bill, "{\"dueOn\":\"2026-10-12\"}");

        assertThat(JsonPath.<String>read(november, "$.dueOn")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<Boolean>read(november, "$.paid")).isFalse();
        assertThat(JsonPath.<Integer>read(november, "$.amountCents")).isEqualTo(7800);
        assertThat(JsonPath.<Boolean>read(november, "$.myShare.paid")).isFalse();
        assertThat(JsonPath.<List<String>>read(november, "$.history[*].dueOn"))
                .containsExactly("2026-10-12", "2026-11-12");
        assertThat(JsonPath.<List<Boolean>>read(november, "$.history[*].paid")).containsExactly(true, false);
        assertThat(JsonPath.<List<Boolean>>read(november, "$.history[*].current"))
                .containsExactly(false, true);

        // The same tap arriving a second time pays nothing more: it says which bill it meant.
        String again = paid(nora, bill, "{\"dueOn\":\"2026-10-12\"}");
        assertThat(JsonPath.<String>read(again, "$.dueOn")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<Integer>read(again, "$.history.length()")).isEqualTo(2);

        // This month's letter says €84.20: €6.20 more than last time, and usually about €81.
        String changed = send(HttpMethod.PATCH, "/v1/bills/" + bill, nora, "{\"amountCents\":8420}", 200);
        assertThat(JsonPath.<Integer>read(changed, "$.changeCents")).isEqualTo(620);
        assertThat(JsonPath.<Integer>read(changed, "$.usualCents")).isEqualTo(8110);
        assertThat(JsonPath.<List<Integer>>read(changed, "$.history[*].amountCents"))
                .containsExactly(7800, 8420);

        // Only the last six are kept in view.
        String due = "2026-11-12";
        for (int month = 0; month < 6; month++) {
            due = JsonPath.read(paid(nora, bill, "{\"dueOn\":\"" + due + "\"}"), "$.dueOn");
        }
        String later = fetch("/v1/bills/" + bill, nora);
        assertThat(due).isEqualTo("2027-05-12");
        assertThat(JsonPath.<List<String>>read(later, "$.history[*].dueOn"))
                .containsExactly("2026-12-12", "2027-01-12", "2027-02-12", "2027-03-12", "2027-04-12", "2027-05-12");
    }

    @Test
    void aBillOfTheThirtyFirstStaysOnTheLastDayOfShorterMonths() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String bill = bill(nora, circle, "Rent", 98000, "2027-01-31", ",\"repeat\":\"monthly\"");

        assertThat(JsonPath.<String>read(paid(nora, bill, "{\"dueOn\":\"2027-01-31\"}"), "$.dueOn"))
                .isEqualTo("2027-02-28");
        assertThat(JsonPath.<String>read(paid(nora, bill, "{\"dueOn\":\"2027-02-28\"}"), "$.dueOn"))
                .isEqualTo("2027-03-31");

        String quarterly = bill(nora, circle, "Water", 9000, "2026-11-30", ",\"repeat\":\"months\",\"everyMonths\":3");
        assertThat(JsonPath.<String>read(paid(nora, quarterly, "{\"dueOn\":\"2026-11-30\"}"), "$.dueOn"))
                .isEqualTo("2027-02-28");
        assertThat(JsonPath.<Integer>read(fetch("/v1/bills/" + quarterly, nora), "$.yearCents"))
                .isEqualTo(36_000);
        String yearly = bill(nora, circle, "Insurance", 36900, "2026-12-01", ",\"repeat\":\"yearly\"");
        assertThat(JsonPath.<String>read(paid(nora, yearly, "{\"dueOn\":\"2026-12-01\"}"), "$.dueOn"))
                .isEqualTo("2027-12-01");
    }

    @Test
    void aBillThatComesOnceIsDoneWhenItIsPaidAndPaidCanBeTakenBack() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String bill = bill(nora, circle, "Dentist", 8500, "2026-11-20", "");

        String done = paid(nora, bill, "{\"dueOn\":\"2026-11-20\"}");

        assertThat(JsonPath.<Boolean>read(done, "$.paid")).isTrue();
        assertThat(JsonPath.<String>read(done, "$.paidBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(done, "$.dueOn")).isEqualTo("2026-11-20");
        assertThat(JsonPath.<Object>read(done, "$.yearCents")).isNull();
        assertThat(fetch("/v1/circles/" + circle + "/bills", nora)).doesNotContain(bill);
        assertThat(fetch("/v1/circles/" + circle + "/bills?show=paid", nora)).contains(bill);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + bill, nora), "$.glance"))
                .isEqualTo("€85 · paid");

        String open = paid(nora, bill, "{\"dueOn\":\"2026-11-20\",\"paid\":false}");
        assertThat(JsonPath.<Boolean>read(open, "$.paid")).isFalse();
        assertThat(JsonPath.<Boolean>read(open, "$.myShare.paid")).isFalse();
        assertThat(fetch("/v1/circles/" + circle + "/bills", nora)).contains(bill);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + bill, nora), "$.glance"))
                .isEqualTo("€85 · due Fri 20 Nov");
    }

    @Test
    void everyoneWhoSharesABillMarksTheirOwnShareAndItIsPaidWhenAllAre() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String bill = bill(
                nora,
                circle,
                "Electricity",
                8420,
                "2026-11-12",
                ",\"repeat\":\"monthly\",\"audience\":\"circle\"" + shares(noraId, alexId));

        // Alex has paid his half. The bill is still due: Nora's half isn't paid yet.
        String half = paid(alex, bill, "{\"dueOn\":\"2026-11-12\"}");
        assertThat(JsonPath.<String>read(half, "$.dueOn")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<Boolean>read(half, "$.paid")).isFalse();
        assertThat(JsonPath.<List<Integer>>read(half, "$.shares[*].cents")).containsExactly(4210, 4210);
        assertThat(JsonPath.<List<Boolean>>read(half, "$.shares[*].paid")).containsExactly(false, true);
        assertThat(JsonPath.<String>read(half, "$.shares[1].paidBy.name")).isEqualTo("Alex");
        String forNora = fetch("/v1/bills/" + bill, nora);
        assertThat(JsonPath.<Boolean>read(forNora, "$.myShare.paid")).isFalse();
        assertThat(JsonPath.<Integer>read(forNora, "$.myShare.cents")).isEqualTo(4210);
        String row = fetch("/v1/circles/" + circle + "/bills", nora);
        assertThat(JsonPath.<List<String>>read(row, "$.items[0].splitWith[*].name"))
                .containsExactly("Alex");
        assertThat(JsonPath.<Integer>read(row, "$.items[0].myShareCents")).isEqualTo(4210);
        assertThat(JsonPath.<Boolean>read(row, "$.items[0].mySharePaid")).isFalse();

        // Nora marks hers: every share is paid, so next month's is due, with nothing marked.
        String next = paid(nora, bill, "{\"dueOn\":\"2026-11-12\"}");
        assertThat(JsonPath.<String>read(next, "$.dueOn")).isEqualTo("2026-12-12");
        assertThat(JsonPath.<List<Boolean>>read(next, "$.shares[*].paid")).containsExactly(false, false);

        // She tapped too early. Taking it back opens November again, with Alex's half still paid.
        String back = paid(nora, bill, "{\"dueOn\":\"2026-11-12\",\"paid\":false}");
        assertThat(JsonPath.<String>read(back, "$.dueOn")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<List<Boolean>>read(back, "$.shares[*].paid")).containsExactly(false, true);
        assertThat(JsonPath.<Integer>read(back, "$.history.length()")).isEqualTo(1);

        // One of them can pay for the other, or for everyone at once; it says who did.
        String both = paid(nora, bill, "{\"dueOn\":\"2026-11-12\",\"everyone\":true}");
        assertThat(JsonPath.<String>read(both, "$.dueOn")).isEqualTo("2026-12-12");
        String forAlex = paid(nora, bill, "{\"dueOn\":\"2026-12-12\",\"memberId\":\"%s\"}".formatted(alexId));
        assertThat(JsonPath.<String>read(forAlex, "$.shares[1].paidBy.name")).isEqualTo("Nora");
        // Once December is being paid, November can't be opened again.
        assertThat(send(
                        HttpMethod.PUT,
                        "/v1/bills/" + bill + "/paid",
                        nora,
                        "{\"dueOn\":\"2026-11-12\",\"paid\":false}",
                        409))
                .contains("The next one is already being paid. Take that back first.");
        // Someone who pays no share of it can't have theirs marked.
        String mia = addMember(nora, circle, "Mia", "child");
        send(
                HttpMethod.PUT,
                "/v1/bills/" + bill + "/paid",
                nora,
                "{\"dueOn\":\"2026-12-12\",\"memberId\":\"%s\"}".formatted(mia),
                400);
    }

    @Test
    void sharesAreDividedToTheCentAndExactAmountsMustAddUp() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "flat", "Trubarjeva 9");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");

        // €100 between three: 33.34, 33.33, 33.33. They add up to the bill.
        String three = bill(nora, circle, "Internet", 10_000, "2026-11-20", shares(noraId, alexId, kaiId));
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/bills/" + three, nora), "$.shares[*].cents"))
                .containsExactly(3334, 3333, 3333);

        // 60/40.
        String parts = bill(
                nora,
                circle,
                "Electricity",
                8420,
                "2026-11-12",
                ",\"shares\":[{\"memberId\":\"%s\",\"parts\":60},{\"memberId\":\"%s\",\"parts\":40}]"
                        .formatted(noraId, alexId));
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/bills/" + parts, nora), "$.shares[*].cents"))
                .containsExactly(5052, 3368);

        // Exact amounts have to add up to the bill, and keep their proportions when next month's amount differs.
        String wrong =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Heating\",\"amountCents\":8420,\"dueOn\":\"2026-11-12\",\"shares\":[{\"memberId\":\"%s\",\"cents\":5000},{\"memberId\":\"%s\",\"cents\":3000}]}"
                        .formatted(id(), circle, noraId, alexId);
        assertThat(send(HttpMethod.POST, "/v1/bills", nora, wrong, 400))
                .contains("The shares add up to €80.00, and the bill is €84.20.");
        String exact = bill(
                nora,
                circle,
                "Heating",
                8420,
                "2026-11-12",
                ",\"shares\":[{\"memberId\":\"%s\",\"cents\":5000},{\"memberId\":\"%s\",\"cents\":3420}]"
                        .formatted(noraId, alexId));
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/bills/" + exact, nora), "$.shares[*].cents"))
                .containsExactly(5000, 3420);
        String doubled = send(HttpMethod.PATCH, "/v1/bills/" + exact, nora, "{\"amountCents\":16840}", 200);
        assertThat(JsonPath.<List<Integer>>read(doubled, "$.shares[*].cents")).containsExactly(10_000, 6840);

        // Who pays can be changed later; a share that was paid by someone who no longer pays is forgotten.
        paid(alex, exact, "{\"dueOn\":\"2026-11-12\"}");
        String alone = send(
                HttpMethod.PATCH,
                "/v1/bills/" + exact,
                nora,
                "{\"shares\":[{\"memberId\":\"%s\"}]}".formatted(noraId),
                200);
        assertThat(JsonPath.<List<String>>read(alone, "$.shares[*].person.name"))
                .containsExactly("Nora");
        assertThat(JsonPath.<Boolean>read(alone, "$.paid")).isFalse();
        send(HttpMethod.PATCH, "/v1/bills/" + exact, nora, "{\"shares\":[]}", 400);
        send(
                HttpMethod.PATCH,
                "/v1/bills/" + exact,
                nora,
                "{\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]}".formatted(noraId, noraId),
                400);
    }

    @Test
    void aBillCanBeChanged() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String bill = bill(nora, circle, "Netflix", 1399, "2026-11-20", ",\"repeat\":\"monthly\",\"remindDays\":1");

        String changed = send(
                HttpMethod.PATCH,
                "/v1/bills/" + bill,
                nora,
                "{\"title\":\"Netflix Standard\",\"payee\":\"Netflix\",\"emoji\":\"📺\",\"dueOn\":\"2026-11-22\",\"subscription\":true,\"pays\":\"direct_debit\",\"removeReminder\":true,\"note\":\"Shared with Grandma\",\"payUrl\":\"https://www.netflix.com/account\",\"iban\":\"\",\"reference\":\"N-1184\",\"currency\":\"usd\"}",
                200);

        assertThat(JsonPath.<String>read(changed, "$.title")).isEqualTo("Netflix Standard");
        assertThat(JsonPath.<String>read(changed, "$.dueOn")).isEqualTo("2026-11-22");
        assertThat(JsonPath.<Integer>read(changed, "$.dueDay")).isEqualTo(22);
        assertThat(JsonPath.<Boolean>read(changed, "$.subscription")).isTrue();
        assertThat(JsonPath.<String>read(changed, "$.pays")).isEqualTo("direct_debit");
        assertThat(JsonPath.<Object>read(changed, "$.remindDays")).isNull();
        assertThat(JsonPath.<String>read(changed, "$.note")).isEqualTo("Shared with Grandma");
        assertThat(JsonPath.<String>read(changed, "$.payUrl")).isEqualTo("https://www.netflix.com/account");
        assertThat(JsonPath.<String>read(changed, "$.currency")).isEqualTo("USD");
        // What wasn't sent stays as it was.
        assertThat(JsonPath.<Integer>read(changed, "$.amountCents")).isEqualTo(1399);
        assertThat(JsonPath.<String>read(changed, "$.repeat")).isEqualTo("monthly");
        // It comes round on the 22nd from now on.
        assertThat(JsonPath.<String>read(paid(nora, bill, "{\"dueOn\":\"2026-11-22\"}"), "$.dueOn"))
                .isEqualTo("2026-12-22");

        String quarterly =
                send(HttpMethod.PATCH, "/v1/bills/" + bill, nora, "{\"repeat\":\"months\",\"everyMonths\":3}", 200);
        assertThat(JsonPath.<Integer>read(quarterly, "$.everyMonths")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(quarterly, "$.yearCents")).isEqualTo(5596);
        send(HttpMethod.PATCH, "/v1/bills/" + bill, nora, "{\"payUrl\":\"ftp://example.com\"}", 400);
        send(HttpMethod.PATCH, "/v1/bills/" + bill, nora, "{\"removePayUrl\":true}", 200);
        assertThat(JsonPath.<Object>read(fetch("/v1/bills/" + bill, nora), "$.payUrl"))
                .isNull();
    }

    @Test
    void theMoneyPageAddsUpTheMonthTheWeekAndTheSubscriptions() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        // Paid this month already.
        String internet = bill(nora, circle, "Internet", 3990, "2026-11-05", ",\"repeat\":\"monthly\"");
        paid(nora, internet, "{\"dueOn\":\"2026-11-05\"}");
        String spotify =
                bill(nora, circle, "Spotify", 1799, "2026-11-02", ",\"repeat\":\"monthly\",\"subscription\":true");
        paid(nora, spotify, "{\"dueOn\":\"2026-11-02\"}");
        // Still to pay: tomorrow, Monday, the Friday after, and one that is overdue since Monday.
        bill(nora, circle, "Electricity", 8420, "2026-11-12", ",\"repeat\":\"monthly\"" + shares(noraId, alexId));
        bill(nora, circle, "Rent", 98000, "2026-11-16", ",\"repeat\":\"monthly\",\"pays\":\"standing_order\"");
        bill(nora, circle, "Netflix", 1399, "2026-11-20", ",\"repeat\":\"monthly\",\"subscription\":true");
        bill(nora, circle, "Library fine", 250, "2026-11-09", "");
        // A yearly subscription, due in spring: it counts towards the subscriptions, not this month.
        bill(nora, circle, "Cloud storage", 11988, "2027-03-03", ",\"repeat\":\"yearly\",\"subscription\":true");
        // And one in dollars, which is listed but can't be added to euros.
        bill(nora, circle, "Domain name", 1500, "2026-11-25", ",\"currency\":\"USD\"");

        String money = fetch("/v1/circles/" + circle + "/money?day=" + TODAY, nora);

        assertThat(JsonPath.<String>read(money, "$.currency")).isEqualTo("EUR");
        assertThat(JsonPath.<List<String>>read(money, "$.otherCurrencies")).containsExactly("USD");
        assertThat(JsonPath.<String>read(money, "$.monthStart")).isEqualTo("2026-11-01");
        // November: 39.90 + 17.99 paid, and 84.20 + 980 + 13.99 + 2.50 still to pay.
        assertThat(JsonPath.<Integer>read(money, "$.monthPaidCents")).isEqualTo(3990 + 1799);
        assertThat(JsonPath.<Integer>read(money, "$.monthTotalCents"))
                .isEqualTo(3990 + 1799 + 8420 + 98000 + 1399 + 250);
        // By Sunday the 15th: the electricity and the overdue fine.
        assertThat(JsonPath.<Integer>read(money, "$.dueThisWeekCents")).isEqualTo(8420 + 250);
        // Spotify and Netflix every month, and a twelfth of the yearly one: 17.99 + 13.99 + 9.99.
        assertThat(JsonPath.<Integer>read(money, "$.subscriptions")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(money, "$.subscriptionsYearCents")).isEqualTo(1799 * 12 + 1399 * 12 + 11988);
        assertThat(JsonPath.<Integer>read(money, "$.subscriptionsMonthCents")).isEqualTo(1799 + 1399 + 999);
        // Due soon: the soonest first, the overdue one before all.
        assertThat(JsonPath.<List<String>>read(money, "$.dueSoon[*].title"))
                .containsExactly("Library fine", "Electricity", "Rent", "Netflix", "Domain name");
        assertThat(JsonPath.<List<String>>read(money, "$.dueSoon[1].splitWith[*].name"))
                .containsExactly("Alex");
        assertThat(JsonPath.<String>read(money, "$.dueSoon[2].pays")).isEqualTo("standing_order");

        // A month with nothing in it, and a circle with nothing in it.
        String january = fetch("/v1/circles/" + circle + "/money?day=2028-01-10", nora);
        assertThat(JsonPath.<Integer>read(january, "$.monthTotalCents")).isZero();
        String empty = fetch("/v1/circles/" + circle(nora, "solo", "Just me") + "/money?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(empty, "$.currency")).isEqualTo("EUR");
        assertThat(JsonPath.<Integer>read(empty, "$.dueSoon.length()")).isZero();
    }

    @Test
    void billsDueTodayOrTomorrowAreOnTodayUntilYourOwnShareIsPaid() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String electricity = bill(
                nora,
                circle,
                "Electricity",
                8420,
                "2026-11-12",
                ",\"repeat\":\"monthly\",\"audience\":\"circle\"" + shares(noraId, alexId));
        bill(nora, circle, "Rent", 98000, "2026-11-11", ",\"pays\":\"standing_order\"");
        bill(nora, circle, "Library fine", 250, "2026-11-09", "");
        bill(nora, circle, "Netflix", 1399, "2026-11-13", "");

        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);

        // As on Home: "€84 · Electricity · Due tomorrow · split with Alex".
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].title"))
                .containsExactly("Electricity", "Library fine", "Rent");
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].lead")).containsExactly("€84", "€3", "€980");
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].note"))
                .containsExactly("Due tomorrow · split with Alex", "Was due Mon 9 Nov", "Due today · standing order");
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].kind")).containsOnly("bill");
        assertThat(JsonPath.<Integer>read(today, "$.left")).isEqualTo(3);

        // Once her own half is paid it is off her Today, and still on Alex's.
        paid(nora, electricity, "{\"dueOn\":\"2026-11-12\"}");
        assertThat(fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora)).doesNotContain(electricity);
        String forAlex = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, alex);
        assertThat(JsonPath.<List<String>>read(forAlex, "$.items[*].note"))
                .containsExactly("Due tomorrow · split with Nora");
        // The day after tomorrow's bill isn't on today, and the day itself moves with the phone.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=2026-11-12", nora), "$.items[*].title"))
                .containsExactly("Library fine", "Netflix", "Rent");
    }

    @Test
    void aBillIsFoundByWhoItIsPaidToAndKnowsItsLinks() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String bill = bill(
                nora,
                circle,
                "Electricity",
                8420,
                "2026-11-12",
                ",\"payee\":\"Elektro Ljubljana\",\"note\":\"Meter is in the cellar\",\"reference\":\"SI12 3456 7890 1184\"");
        String invoice = page(nora, circle, "Invoice, November", "me");

        String byPayee = fetch("/v1/circles/" + circle + "/search?q=elektro", nora);
        assertThat(JsonPath.<String>read(byPayee, "$.hits[0].thing.id")).isEqualTo(bill);
        assertThat(JsonPath.<String>read(byPayee, "$.hits[0].snippet")).isEqualTo("Elektro Ljubljana");
        assertThat(JsonPath.<String>read(byPayee, "$.hits[0].thing.glance")).isEqualTo("€84 · due Thu 12 Nov");
        assertThat(JsonPath.<String>read(byPayee, "$.hits[0].thing.kind")).isEqualTo("bill");
        assertThat(JsonPath.<String>read(byPayee, "$.hits[0].thing.place")).isEqualTo("money");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=cellar", nora)).contains(bill);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=7890 1184", nora)).contains(bill);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=cellar&place=notes", nora))
                .doesNotContain(bill);

        // Things know about each other: the shared links say what a bill is linked to.
        send(HttpMethod.PUT, "/v1/things/" + bill + "/links/" + invoice, nora, null, 204);
        String linked = fetch("/v1/bills/" + bill, nora);
        assertThat(JsonPath.<List<String>>read(linked, "$.links[*].title")).containsExactly("Invoice, November");
        // A page lives in Notes: it is neither the bill's login (the Vault) nor its invoice (the Library).
        assertThat(JsonPath.<Object>read(linked, "$.login")).isNull();
        assertThat(JsonPath.<Object>read(linked, "$.invoice")).isNull();
        // Until the Vault and the Library keep things, their places are tried with a row moved there by hand.
        jdbc.sql("update things set place = 'vault' where id = cast(:id as uuid)")
                .param("id", invoice)
                .update();
        assertThat(JsonPath.<String>read(fetch("/v1/bills/" + bill, nora), "$.login.title"))
                .isEqualTo("Invoice, November");
        String row = fetch("/v1/circles/" + circle + "/bills", nora);
        assertThat(JsonPath.<Boolean>read(row, "$.items[0].hasLogin")).isTrue();
        assertThat(JsonPath.<Boolean>read(row, "$.items[0].hasInvoice")).isFalse();
    }

    @Test
    void listsOfBillsAreReadInPages() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        for (int day = 1; day <= 5; day++) {
            String bill = bill(
                    nora,
                    circle,
                    "Bill " + day,
                    1000L * day,
                    "2026-11-1" + day,
                    ",\"repeat\":\"monthly\",\"subscription\":" + (day % 2 == 1));
            if (day >= 4) {
                paid(nora, bill, "{\"dueOn\":\"2026-11-1" + day + "\"}");
            }
        }

        // Still to pay, soonest first: 11, 12, 13 November, then December's 14 and 15.
        String first = fetch("/v1/circles/" + circle + "/bills?limit=2", nora);
        assertThat(JsonPath.<List<String>>read(first, "$.items[*].title")).containsExactly("Bill 1", "Bill 2");
        String second = fetch(
                "/v1/circles/" + circle + "/bills?limit=2&cursor=" + JsonPath.<String>read(first, "$.nextCursor"),
                nora);
        assertThat(JsonPath.<List<String>>read(second, "$.items[*].title")).containsExactly("Bill 3", "Bill 4");
        String third = fetch(
                "/v1/circles/" + circle + "/bills?limit=2&cursor=" + JsonPath.<String>read(second, "$.nextCursor"),
                nora);
        assertThat(JsonPath.<List<String>>read(third, "$.items[*].dueOn")).containsExactly("2026-12-15");
        assertThat(JsonPath.<Object>read(third, "$.nextCursor")).isNull();

        // Paid, the latest first: one line for each time.
        String paid = fetch("/v1/circles/" + circle + "/bills?show=paid&limit=1", nora);
        assertThat(JsonPath.<List<String>>read(paid, "$.items[*].title")).containsExactly("Bill 5");
        assertThat(JsonPath.<Boolean>read(paid, "$.items[0].paid")).isTrue();
        String older = fetch(
                "/v1/circles/" + circle + "/bills?show=paid&limit=1&cursor="
                        + JsonPath.<String>read(paid, "$.nextCursor"),
                nora);
        assertThat(JsonPath.<List<String>>read(older, "$.items[*].title")).containsExactly("Bill 4");

        // Subscriptions, with what each costs in a year.
        String subscriptions = fetch("/v1/circles/" + circle + "/bills?show=subscriptions", nora);
        assertThat(JsonPath.<List<String>>read(subscriptions, "$.items[*].title"))
                .containsExactly("Bill 1", "Bill 3", "Bill 5");
        assertThat(JsonPath.<List<Integer>>read(subscriptions, "$.items[*].yearCents"))
                .containsExactly(12_000, 36_000, 60_000);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/bills?show=everything", nora, null, 400);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/bills?cursor=nonsense", nora, null, 400);
    }

    @Test
    void readingABillSuggestsWithoutSavingAnything() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");

        String reading = send(
                HttpMethod.POST,
                "/v1/bills/read",
                nora,
                "{\"day\":\"2026-11-11\",\"lines\":[\"ELEKTRO LJUBLJANA d.d.\",\"Poraba: 312 kWh\",\"Za plačilo: 84,20 EUR\",\"Rok plačila: 12.11.\",\"Sklic: SI12 3456 7890 1184\"]}",
                200);

        // What the "Is this right?" sheet shows, each with the line it was read from.
        assertThat(JsonPath.<String>read(reading, "$.payee.value")).isEqualTo("Elektro Ljubljana");
        assertThat(JsonPath.<String>read(reading, "$.payee.line")).isEqualTo("ELEKTRO LJUBLJANA d.d.");
        assertThat(JsonPath.<Integer>read(reading, "$.amountCents.value")).isEqualTo(8420);
        assertThat(JsonPath.<Integer>read(reading, "$.amountCents.lineNumber")).isEqualTo(2);
        assertThat(JsonPath.<String>read(reading, "$.currency")).isEqualTo("EUR");
        assertThat(JsonPath.<String>read(reading, "$.dueOn.value")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<String>read(reading, "$.reference.value")).isEqualTo("SI12 3456 7890 1184");
        assertThat(JsonPath.<Object>read(reading, "$.iban")).isNull();
        assertThat(JsonPath.<String>read(reading, "$.repeat.value")).isEqualTo("monthly");
        assertThat(JsonPath.<String>read(reading, "$.title")).isEqualTo("Electricity");
        // Nothing is kept until the person taps "Add bill".
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/bills", nora), "$.items.length()"))
                .isZero();
        send(HttpMethod.POST, "/v1/bills/read", nora, "{\"lines\":[]}", 400);
        send(HttpMethod.POST, "/v1/bills/read", nora, "{}", 400);
    }

    @Test
    void whoeverSendsNotificationsCanAskWhoToRemindOnADay() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String bill = bill(
                nora,
                circle,
                "Electricity",
                8420,
                "2026-11-13",
                ",\"remindDays\":2,\"audience\":\"circle\"" + shares(noraId, alexId));
        bill(nora, circle, "Rent", 98000, "2026-11-13", "");

        // Two days before, everyone whose share isn't paid; a bill that asked for no reminder isn't there.
        List<Reminder> due = bills.remindersFor(LocalDate.parse(TODAY));
        assertThat(due).extracting(Reminder::title).containsOnly("Electricity");
        assertThat(due).extracting(r -> r.memberId().toString()).containsExactlyInAnyOrder(noraId, alexId);
        assertThat(due.get(0).amountCents()).isEqualTo(8420);
        assertThat(due.get(0).dueOn()).isEqualTo(LocalDate.of(2026, 11, 13));

        paid(alex, bill, "{\"dueOn\":\"2026-11-13\"}");
        assertThat(bills.remindersFor(LocalDate.parse(TODAY)))
                .extracting(r -> r.memberId().toString())
                .containsExactly(noraId);
        assertThat(bills.remindersFor(LocalDate.parse("2026-11-12"))).isEmpty();
    }
}
