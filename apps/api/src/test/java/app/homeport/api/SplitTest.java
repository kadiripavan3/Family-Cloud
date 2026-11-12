package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.money.split.ReminderAsked;
import app.homeport.api.money.split.SplitService;
import app.homeport.api.money.split.SplitService.Owed;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

/** Splitting costs: who paid what, who owes who, and the fewest payments that settle it. It only keeps count. */
@RecordApplicationEvents
class SplitTest extends ApiTest {

    @Autowired
    SplitService splits;

    @Autowired
    ApplicationEvents events;

    private String split(String token, String circle, String title) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"}".formatted(id(), circle, title),
                        201),
                "$.id");
    }

    /** Adds an expense shared equally by these members (or by everyone when none are named). Returns the answer. */
    private String expense(
            String token, String split, String title, long cents, String paidBy, String day, String... sharers)
            throws Exception {
        String shares = sharers.length == 0
                ? ""
                : ",\"shares\":["
                        + String.join(
                                ",",
                                List.of(sharers).stream()
                                        .map(id -> "{\"memberId\":\"" + id + "\"}")
                                        .toList())
                        + "]";
        return send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                token,
                "{\"clientId\":\"%s\",\"title\":\"%s\",\"amountCents\":%d,\"paidBy\":\"%s\",\"spentOn\":\"%s\"%s}"
                        .formatted(id(), title, cents, paidBy, day, shares),
                201);
    }

    private String payment(String token, String split, String from, String to, long cents) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/payments",
                token,
                "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":%d}"
                        .formatted(id(), from, to, cents),
                201);
    }

    private UUID userId(String memberId) {
        return jdbc.sql("select user_id from members where id = cast(:id as uuid)")
                .param("id", memberId)
                .query(UUID.class)
                .single();
    }

    @Test
    void theLisbonWeekendAddsUpAsOnTheScreen() throws Exception {
        String lea = person("Lea");
        String nora = person("Nora");
        String kai = person("Kai");
        String lena = person("Lena");
        String ana = person("Ana");
        String circle = circle(lea, "crew", "Lisbon crew");
        String l = JsonPath.read(fetch("/v1/circles/" + circle, lea), "$.myMemberId");
        String n = join(lea, circle, nora);
        String k = join(lea, circle, kai);
        String e = join(lea, circle, lena);
        String a = join(lea, circle, ana);
        String split = split(lea, circle, "Lisbon weekend");
        String fri = "2026-10-30";
        String sat = "2026-10-31";
        String sun = "2026-11-01";

        // Fourteen expenses, €1,236 in all. Anyone in the crew adds what anyone paid.
        expense(ana, split, "Groceries for the flat", 6250, a, fri);
        expense(lea, split, "Tram passes for everyone", 3810, l, fri);
        expense(nora, split, "Pastéis de Belém", 1800, n, fri);
        expense(kai, split, "Wine for the rooftop", 1660, k, fri);
        expense(nora, split, "Breakfast at the bakery", 2360, n, sat);
        expense(ana, split, "Lunch at the Time Out Market", 4260, a, sat);
        expense(ana, split, "Fado night tickets", 4500, a, sat, a, n, e);
        expense(lea, split, "Ride back from Bairro Alto", 1400, l, sat, l, n, k, a);
        expense(nora, split, "Sunscreen and water", 950, n, sun);
        expense(kai, split, "Coffee at the viewpoint", 1150, k, sun);
        expense(lena, split, "Plasters and the pharmacy", 2460, e, sun);
        expense(lena, split, "Flat, 3 nights", 72000, e, sun);
        expense(nora, split, "Airport taxi", 2400, n, sun, n, l);
        String ramiro = expense(nora, split, "Dinner at Ramiro", 18600, k, sun);
        assertThat(JsonPath.<String>read(ramiro, "$.paidBy.name")).isEqualTo("Kai");
        assertThat(JsonPath.<Boolean>read(ramiro, "$.paidByYou")).isFalse();
        assertThat(JsonPath.<List<Integer>>read(ramiro, "$.shares[*].cents")).containsOnly(3720);
        // Three of them have paid Lena most of their part of the flat already.
        payment(nora, split, n, e, 25000);
        payment(lea, split, l, e, 15000);
        payment(lena, split, a, e, 13000);

        String forNora = fetch("/v1/splits/" + split, nora);

        // "After 14 expenses, €1,236 in all. You're owed €64."
        assertThat(JsonPath.<Integer>read(forNora, "$.expenses")).isEqualTo(14);
        assertThat(JsonPath.<Integer>read(forNora, "$.totalCents")).isEqualTo(123_600);
        assertThat(JsonPath.<Integer>read(forNora, "$.myBalanceCents")).isEqualTo(6400);
        assertThat(JsonPath.<List<String>>read(forNora, "$.people[*].person.name"))
                .containsExactly("Lea", "Nora", "Kai", "Lena", "Ana");
        assertThat(JsonPath.<List<Integer>>read(forNora, "$.people[*].balanceCents"))
                .containsExactly(-4400, 6400, -2000, -3100, 3100);
        assertThat(JsonPath.<List<Integer>>read(forNora, "$.people[*].paidCents"))
                .containsExactly(5210, 7510, 21_410, 74_460, 15_010);
        assertThat(JsonPath.<List<Integer>>read(forNora, "$.people[*].shareCents"))
                .containsExactly(24_610, 26_110, 23_410, 24_560, 24_910);
        // "The fewest payments to settle up": hers first.
        assertThat(JsonPath.<List<String>>read(forNora, "$.settle[*].from.name"))
                .containsExactly("Lea", "Kai", "Lena");
        assertThat(JsonPath.<List<String>>read(forNora, "$.settle[*].to.name")).containsExactly("Nora", "Nora", "Ana");
        assertThat(JsonPath.<List<Integer>>read(forNora, "$.settle[*].cents")).containsExactly(4400, 2000, 3100);
        assertThat(JsonPath.<List<Boolean>>read(forNora, "$.settle[*].paysYou")).containsExactly(true, true, false);
        // "Latest": Kai paid, split 5 ways; you paid, split with Lea; Lena paid, split 5 ways.
        assertThat(JsonPath.<List<String>>read(forNora, "$.latest[0:3].title"))
                .containsExactly("Dinner at Ramiro", "Airport taxi", "Flat, 3 nights");
        assertThat(JsonPath.<Boolean>read(forNora, "$.latest[1].paidByYou")).isTrue();
        assertThat(JsonPath.<List<String>>read(forNora, "$.latest[1].shares[*].person.name"))
                .containsExactly("Lea", "Nora");
        assertThat(JsonPath.<Integer>read(forNora, "$.latest[2].shares.length()"))
                .isEqualTo(5);
        assertThat(JsonPath.<Integer>read(forNora, "$.latest.length()")).isEqualTo(14);
        assertThat(JsonPath.<Integer>read(forNora, "$.paid.length()")).isEqualTo(3);
        // Among equals a split starts shared with everyone.
        assertThat(JsonPath.<String>read(forNora, "$.chip.audience")).isEqualTo("circle");

        // The same split from Lea's side.
        String forLea = fetch("/v1/splits/" + split, lea);
        assertThat(JsonPath.<Integer>read(forLea, "$.myBalanceCents")).isEqualTo(-4400);
        assertThat(JsonPath.<Boolean>read(forLea, "$.settle[0].youPay")).isTrue();

        // What the rest of the app is told: the circle switcher's "you're owed €64", Today, a glance, Money's page.
        assertThat(splits.owed(UUID.fromString(circle), userId(n))).containsExactly(new Owed("EUR", 6400));
        assertThat(splits.owed(UUID.fromString(circle), userId(l))).containsExactly(new Owed("EUR", -4400));
        String today = fetch("/v1/circles/" + circle + "/today", nora);
        assertThat(JsonPath.<String>read(today, "$.items[0].title")).isEqualTo("You're owed for Lisbon weekend");
        assertThat(JsonPath.<String>read(today, "$.items[0].lead")).isEqualTo("€64");
        assertThat(JsonPath.<String>read(today, "$.items[0].note")).isEqualTo("Lea €44 · Kai €20");
        assertThat(JsonPath.<String>read(today, "$.items[0].kind")).isEqualTo("split");
        // Whoever is owed can remind the others from the line; whoever owes can pay their share from it. Someone
        // who owes one person reads who, and someone who owes two reads how much in all.
        assertThat(JsonPath.<String>read(today, "$.items[0].action.label")).isEqualTo("Remind");
        assertThat(JsonPath.<String>read(today, "$.items[0].action.act")).isEqualTo("remind");
        String lenas = fetch("/v1/circles/" + circle + "/today", lena);
        assertThat(JsonPath.<String>read(lenas, "$.items[0].title")).isEqualTo("You owe Ana for Lisbon weekend");
        assertThat(JsonPath.<String>read(lenas, "$.items[0].action.label")).isEqualTo("Pay");
        assertThat(JsonPath.<String>read(lenas, "$.items[0].action.act")).isEqualTo("settle");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle + "/today", lea), "$.items[0].title"))
                .startsWith("You owe ")
                .endsWith(" for Lisbon weekend");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + split, nora), "$.glance"))
                .isEqualTo("You're owed €64");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + split, kai), "$.glance"))
                .isEqualTo("You owe €20");
        String money = fetch("/v1/circles/" + circle + "/money", nora);
        assertThat(JsonPath.<List<String>>read(money, "$.owing[*].person.name")).containsExactly("Lea", "Kai");
        assertThat(JsonPath.<List<Integer>>read(money, "$.owing[*].cents")).containsExactly(4400, 2000);
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/circles/" + circle + "/money", lena), "$.owing[*].cents"))
                .containsExactly(-3100);
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/circles/" + circle + "/splits", nora), "$.items[0].myBalanceCents"))
                .isEqualTo(6400);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=ramiro", ana)).contains(split);
    }

    @Test
    void aCostIsSharedEquallyByShareOrByExactAmountsAndTheSharesAddUpToIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "flat", "Trubarjeva 9");
        String n = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String a = join(nora, circle, alex);
        String k = join(nora, circle, kai);
        addMember(nora, circle, "Biscuit", "pet");
        String split = split(nora, circle, "The flat");

        // €10 between three, paid by Alex: 3.33 each and a cent over, which goes to the one who paid.
        String equal = send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                alex,
                "{\"clientId\":\"%s\",\"title\":\"Bin bags\",\"amountCents\":1000}".formatted(id()),
                201);
        assertThat(JsonPath.<List<String>>read(equal, "$.shares[*].person.name"))
                .containsExactly("Nora", "Alex", "Kai");
        assertThat(JsonPath.<List<Integer>>read(equal, "$.shares[*].cents")).containsExactly(333, 334, 333);
        assertThat(JsonPath.<String>read(equal, "$.paidBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Boolean>read(equal, "$.paidByYou")).isTrue();
        assertThat(JsonPath.<String>read(equal, "$.mode")).isEqualTo("equal");
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/splits/" + split, nora), "$.people[*].balanceCents"))
                .containsExactly(-333, 666, -333);

        // By shares: Nora has the big room and takes two of four.
        String shares = send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                "{\"clientId\":\"%s\",\"title\":\"Heating\",\"amountCents\":10001,\"mode\":\"shares\",\"shares\":[{\"memberId\":\"%s\",\"weight\":2},{\"memberId\":\"%s\",\"weight\":1},{\"memberId\":\"%s\",\"weight\":1}]}"
                        .formatted(id(), n, a, k),
                201);
        // 50.005, 25.0025, 25.0025: Nora lost the most by rounding down, so the cent over is hers.
        assertThat(JsonPath.<List<Integer>>read(shares, "$.shares[*].cents")).containsExactly(5001, 2500, 2500);

        // Exact amounts have to add up to what it cost.
        String exact =
                "{\"clientId\":\"%s\",\"title\":\"Groceries\",\"amountCents\":4200,\"mode\":\"exact\",\"shares\":[{\"memberId\":\"%s\",\"cents\":3000},{\"memberId\":\"%s\",\"cents\":%d}]}";
        assertThat(send(
                        HttpMethod.POST,
                        "/v1/splits/" + split + "/expenses",
                        nora,
                        exact.formatted(id(), n, a, 1000),
                        400))
                .contains("The amounts add up to €40.00, and it cost €42.00.");
        String groceries = send(
                HttpMethod.POST, "/v1/splits/" + split + "/expenses", nora, exact.formatted(id(), n, a, 1200), 201);
        assertThat(JsonPath.<List<Integer>>read(groceries, "$.shares[*].cents")).containsExactly(3000, 1200);

        // Whatever was added, the balances add up to nothing.
        String all = fetch("/v1/splits/" + split, kai);
        List<Integer> balances = JsonPath.read(all, "$.people[*].balanceCents");
        assertThat(balances.stream().mapToInt(Integer::intValue).sum()).isZero();
        assertThat(JsonPath.<Integer>read(all, "$.totalCents")).isEqualTo(1000 + 10_001 + 4200);
        // Nora: −3.33 for the bags, +100.01 − 50.01 for the heating, +42 − 30 for the groceries.
        assertThat(balances).containsExactly(-333 + 5000 + 1200, 666 - 2500 - 1200, -333 - 2500);
        // The dog isn't asked to pay, and isn't listed.
        assertThat(JsonPath.<List<String>>read(all, "$.people[*].person.name")).containsExactly("Nora", "Alex", "Kai");

        // What can't be: nobody named for shares, someone from elsewhere, the same person twice, a pet, nothing.
        String start = "{\"clientId\":\"%s\",\"title\":\"Odd\",\"amountCents\":900".formatted(id());
        send(HttpMethod.POST, "/v1/splits/" + split + "/expenses", nora, start + ",\"mode\":\"shares\"}", 400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                start + ",\"shares\":[{\"memberId\":\"%s\"}]}".formatted(UUID.randomUUID()),
                400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                start + ",\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]}".formatted(a, a),
                400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                start + ",\"paidBy\":\"%s\"}".formatted(UUID.randomUUID()),
                400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                "{\"clientId\":\"%s\",\"title\":\"Free\",\"amountCents\":0}".formatted(id()),
                400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                "{\"clientId\":\"%s\",\"amountCents\":100}".formatted(id()),
                400);
    }

    @Test
    void anExpenseAndAPaymentSentTwiceAreEachAddedOnce() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String a = join(nora, circle, alex);
        String n = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String body = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Who pays what\"}".formatted(id(), circle);
        String split = JsonPath.read(send(HttpMethod.POST, "/v1/splits", nora, body, 201), "$.id");
        assertThat(JsonPath.<String>read(send(HttpMethod.POST, "/v1/splits", nora, body, 201), "$.id"))
                .isEqualTo(split);

        String expense = "{\"clientId\":\"%s\",\"title\":\"  Big   shop \",\"emoji\":\"🛒\",\"amountCents\":8400}"
                .formatted(id());
        String first = send(HttpMethod.POST, "/v1/splits/" + split + "/expenses?day=2026-11-08", nora, expense, 201);
        String second = send(HttpMethod.POST, "/v1/splits/" + split + "/expenses?day=2026-11-08", nora, expense, 201);
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<String>read(first, "$.title")).isEqualTo("Big shop");
        assertThat(JsonPath.<String>read(first, "$.spentOn")).isEqualTo("2026-11-08");
        assertThat(JsonPath.<String>read(first, "$.addedBy.name")).isEqualTo("Nora");

        // As on the couple's Today and the family's Money page: "Alex owes you €42".
        String before = fetch("/v1/splits/" + split, nora);
        assertThat(JsonPath.<Integer>read(before, "$.expenses")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(before, "$.myBalanceCents")).isEqualTo(4200);
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle + "/today", nora), "$.items[0].note"))
                .isEqualTo("Alex €42");

        String payment =
                "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":4200,\"paidOn\":\"2026-11-10\"}"
                        .formatted(id(), a, n);
        String paid = send(HttpMethod.POST, "/v1/splits/" + split + "/payments", alex, payment, 201);
        send(HttpMethod.POST, "/v1/splits/" + split + "/payments", alex, payment, 201);
        assertThat(JsonPath.<String>read(paid, "$.from.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(paid, "$.paidOn")).isEqualTo("2026-11-10");

        // Settled: nothing left to pay, and it says so wherever it is listed.
        String after = fetch("/v1/splits/" + split, nora);
        assertThat(JsonPath.<Integer>read(after, "$.paid.length()")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(after, "$.myBalanceCents")).isZero();
        assertThat(JsonPath.<Integer>read(after, "$.settle.length()")).isZero();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + split, nora), "$.glance"))
                .isEqualTo("You're even");
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/today", nora), "$.items.length()"))
                .isZero();
        assertThat(splits.owed(UUID.fromString(circle), userId(n))).isEmpty();

        // It was marked by mistake: taken back, Alex owes again. Taking back what is gone is fine.
        String paymentId = JsonPath.read(paid, "$.id");
        send(HttpMethod.DELETE, "/v1/split-payments/" + paymentId, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/split-payments/" + paymentId, nora, null, 204);
        assertThat(JsonPath.<Integer>read(fetch("/v1/splits/" + split, alex), "$.myBalanceCents"))
                .isEqualTo(-4200);
        // A payment goes from one person of the circle to another.
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/payments",
                nora,
                "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":100}".formatted(id(), n, n),
                400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/payments",
                nora,
                "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":100}"
                        .formatted(id(), n, UUID.randomUUID()),
                400);
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/payments",
                nora,
                "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":0}".formatted(id(), n, a),
                400);
    }

    @Test
    void whoeverIsOwedCanRemindAndTheReminderIsKeptAndPassedOn() throws Exception {
        String nora = person("Nora");
        String lea = person("Lea");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        String n = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String l = join(nora, circle, lea);
        String k = join(nora, circle, kai);
        String split = split(nora, circle, "Lisbon weekend");
        expense(nora, split, "Airport taxi", 2400, n, "2026-11-01", n, l);

        String reminded = send(HttpMethod.PUT, "/v1/splits/" + split + "/reminders/" + l, nora, null, 200);

        assertThat(JsonPath.<String>read(reminded, "$.settle[0].from.name")).isEqualTo("Lea");
        assertThat(JsonPath.<String>read(reminded, "$.settle[0].remindedAt")).isNotBlank();
        // Whoever sends notifications hears of it; Money sends nothing itself.
        List<ReminderAsked> asked = events.stream(ReminderAsked.class).toList();
        assertThat(asked).hasSize(1);
        assertThat(asked.get(0).toMemberId().toString()).isEqualTo(l);
        assertThat(asked.get(0).byMemberId().toString()).isEqualTo(n);
        assertThat(asked.get(0).cents()).isEqualTo(1200);
        assertThat(asked.get(0).title()).isEqualTo("Lisbon weekend");

        // Only someone who is owed by them can remind: not a bystander, not the one who owes, and nobody who is even.
        assertThat(send(HttpMethod.PUT, "/v1/splits/" + split + "/reminders/" + l, kai, null, 400))
                .contains("They don't owe you anything here.");
        send(HttpMethod.PUT, "/v1/splits/" + split + "/reminders/" + n, lea, null, 400);
        send(HttpMethod.PUT, "/v1/splits/" + split + "/reminders/" + k, nora, null, 400);
        assertThat(events.stream(ReminderAsked.class).count()).isEqualTo(1);
    }

    @Test
    void someoneWhoLeftTheCircleStillOwesWhatTheyOwed() throws Exception {
        String kai = person("Kai");
        String lea = person("Lea");
        String ana = person("Ana");
        String circle = circle(kai, "flat", "Trubarjeva 9");
        String k = JsonPath.read(fetch("/v1/circles/" + circle, kai), "$.myMemberId");
        String l = join(kai, circle, lea);
        String a = join(kai, circle, ana);
        String split = split(kai, circle, "The kitty");
        expense(kai, split, "Olive oil, salt, sponges", 1470, k, "2026-11-02");

        // Ana moves out. What she owes doesn't leave with her.
        send(HttpMethod.DELETE, "/v1/members/" + a, kai, null, 204);

        String after = fetch("/v1/splits/" + split, kai);
        assertThat(JsonPath.<List<String>>read(after, "$.people[*].person.name"))
                .containsExactly("Kai", "Lea", "Ana");
        assertThat(JsonPath.<List<Integer>>read(after, "$.people[*].balanceCents"))
                .containsExactly(980, -490, -490);
        assertThat(JsonPath.<List<String>>read(after, "$.settle[*].from.name")).containsExactlyInAnyOrder("Lea", "Ana");
        // A new cost is shared by the two who are still there, and she can't be named for it.
        String next = send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                lea,
                "{\"clientId\":\"%s\",\"title\":\"Loo roll\",\"amountCents\":890}".formatted(id()),
                201);
        assertThat(JsonPath.<List<String>>read(next, "$.shares[*].person.name")).containsExactly("Kai", "Lea");
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                lea,
                "{\"clientId\":\"%s\",\"title\":\"Odd\",\"amountCents\":300,\"shares\":[{\"memberId\":\"%s\"}]}"
                        .formatted(id(), a),
                400);
        // She pays up by bank transfer; Kai notes it.
        payment(kai, split, a, k, 490);
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/splits/" + split, kai), "$.people[*].balanceCents"))
                .containsExactly(980 - 490 - 445, -490 + 445, 0);
        // And she no longer sees any of it.
        send(HttpMethod.GET, "/v1/splits/" + split, ana, null, 404);
    }

    @Test
    void expensesAreReadInPagesAndCanBeChangedAndRemoved() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String a = join(nora, circle, alex);
        String n = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String split = split(nora, circle, "Who pays what");
        for (int day = 1; day <= 5; day++) {
            expense(nora, split, "Day " + day, 1000L * day, n, "2026-11-0" + day);
        }

        // The latest first.
        String first = fetch("/v1/splits/" + split + "/expenses?limit=2", alex);
        assertThat(JsonPath.<List<String>>read(first, "$.items[*].title")).containsExactly("Day 5", "Day 4");
        String second = fetch(
                "/v1/splits/" + split + "/expenses?limit=2&cursor=" + JsonPath.<String>read(first, "$.nextCursor"),
                alex);
        assertThat(JsonPath.<List<String>>read(second, "$.items[*].title")).containsExactly("Day 3", "Day 2");
        String third = fetch(
                "/v1/splits/" + split + "/expenses?limit=2&cursor=" + JsonPath.<String>read(second, "$.nextCursor"),
                alex);
        assertThat(JsonPath.<List<String>>read(third, "$.items[*].title")).containsExactly("Day 1");
        assertThat(JsonPath.<Object>read(third, "$.nextCursor")).isNull();
        send(HttpMethod.GET, "/v1/splits/" + split + "/expenses?cursor=nonsense", alex, null, 400);
        // Both owe half of 150: Alex owes Nora €75.
        assertThat(JsonPath.<Integer>read(fetch("/v1/splits/" + split, nora), "$.myBalanceCents"))
                .isEqualTo(7500);

        // It was Alex who paid on day 5, it was 60 and not 50, and it was only his.
        String day5 = JsonPath.read(first, "$.items[0].id");
        String changed = send(
                HttpMethod.PATCH,
                "/v1/split-expenses/" + day5,
                alex,
                "{\"title\":\"Day 5, corrected\",\"amountCents\":6000,\"paidBy\":\"%s\",\"shares\":[{\"memberId\":\"%s\"}],\"spentOn\":\"2026-11-06\"}"
                        .formatted(a, a),
                200);
        assertThat(JsonPath.<String>read(changed, "$.title")).isEqualTo("Day 5, corrected");
        assertThat(JsonPath.<String>read(changed, "$.paidBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<List<String>>read(changed, "$.shares[*].person.name"))
                .containsExactly("Alex");
        // His own cost changes nothing between them: Nora is owed half of days 1 to 4.
        assertThat(JsonPath.<Integer>read(fetch("/v1/splits/" + split, nora), "$.myBalanceCents"))
                .isEqualTo(5000);
        // An exact split can't have its amount changed without saying who pays how much.
        String exact = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits/" + split + "/expenses",
                        nora,
                        "{\"clientId\":\"%s\",\"title\":\"Cinema\",\"amountCents\":2000,\"mode\":\"exact\",\"shares\":[{\"memberId\":\"%s\",\"cents\":1500},{\"memberId\":\"%s\",\"cents\":500}]}"
                                .formatted(id(), n, a),
                        201),
                "$.id");
        send(HttpMethod.PATCH, "/v1/split-expenses/" + exact, nora, "{\"amountCents\":3000}", 400);
        String equal = send(
                HttpMethod.PATCH,
                "/v1/split-expenses/" + exact,
                nora,
                "{\"amountCents\":3000,\"mode\":\"equal\"}",
                200);
        assertThat(JsonPath.<List<Integer>>read(equal, "$.shares[*].cents")).containsExactly(1500, 1500);

        // Removed by both at once: fine. Then it can't be changed any more.
        send(HttpMethod.DELETE, "/v1/split-expenses/" + day5, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/split-expenses/" + day5, alex, null, 204);
        assertThat(send(HttpMethod.PATCH, "/v1/split-expenses/" + day5, alex, "{\"title\":\"Gone\"}", 404))
                .contains("That expense isn't there any more.");
        assertThat(JsonPath.<Integer>read(fetch("/v1/splits/" + split, nora), "$.expenses"))
                .isEqualTo(5);
        assertThat(JsonPath.<String>read(
                        send(HttpMethod.PATCH, "/v1/splits/" + split, alex, "{\"title\":\"Between us\"}", 200),
                        "$.title"))
                .isEqualTo("Between us");
    }

    @Test
    void whatYouAreOwedInACircleAddsUpItsSplitsAndAFamilyKeepsItOffToday() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String a = join(nora, circle, alex);
        String n = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        // In a family a split is yours until you share it: Nora shares hers with Alex, Alex keeps one to himself.
        String shopping = split(nora, circle, "Between us");
        send(
                HttpMethod.PUT,
                "/v1/things/" + shopping + "/audience",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(a),
                200);
        expense(nora, shopping, "Big shop for the party", 8400, n, "2026-11-08", n, a);
        String garage = split(alex, circle, "The car");
        expense(alex, garage, "Tyres", 30_000, a, "2026-11-05", n, a);
        String dollars = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"New York\",\"currency\":\"USD\",\"audience\":\"circle\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        expense(alex, dollars, "Bagels", 2000, a, "2026-11-05", n, a);

        // Nora sees her own split and the one in dollars; of Alex's private one she knows nothing, so it isn't counted.
        assertThat(splits.owed(UUID.fromString(circle), userId(n)))
                .containsExactlyInAnyOrder(new Owed("EUR", 4200), new Owed("USD", -1000));
        // Alex sees all three: −42 and +150 in euros.
        assertThat(splits.owed(UUID.fromString(circle), userId(a)))
                .containsExactlyInAnyOrder(new Owed("EUR", 10_800), new Owed("USD", 1000));
        String money = fetch("/v1/circles/" + circle + "/money", nora);
        assertThat(JsonPath.<List<Integer>>read(money, "$.owing[*].cents")).containsExactly(4200, -1000);
        assertThat(JsonPath.<List<String>>read(money, "$.owing[*].currency")).containsExactly("EUR", "USD");
        // In a family it stays in Money: Today is for the day's things.
        assertThat(fetch("/v1/circles/" + circle + "/today", nora)).doesNotContain(shopping);
        // Someone outside the circle is owed nothing in it.
        assertThat(splits.owed(UUID.fromString(circle), UUID.randomUUID())).isEmpty();
    }
}
