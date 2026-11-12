package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** The piggy bank: three jars in whole cents, a bank run by the parents, and interest on the first of the month. */
class PiggyBankTest extends FunBoardTest {

    private String entry(String token, String bank, String kind, String fields) throws Exception {
        return add(token, bank, kind, fields);
    }

    private List<Integer> jars(String view) {
        return JsonPath.read(view, "$.view.jars[*].cents");
    }

    @Test
    void moneyIsCountedInThreeJarsToTheCentAndNoJarGoesBelowNothing() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        teen(nora, circle, kai);
        String mia = addMember(nora, circle, "Mia", "child");
        String biscuit = addMember(nora, circle, "Biscuit", "pet");

        assertThat(newBoard(nora, circle, "piggy_bank", "circle", "{}", 400)).contains("Choose whose piggy bank it is");
        newBoard(nora, circle, "piggy_bank", "circle", "{\"forMemberId\":\"%s\"}".formatted(biscuit), 400);
        String bank = board(
                nora,
                circle,
                "piggy_bank",
                "circle",
                "{\"forMemberId\":\"%s\",\"starCents\":20,\"fund\":{\"name\":\"Skates fund\",\"stars\":50},\"spendGoalCents\":2000}"
                        .formatted(mia));
        String empty = view(nora, bank);
        assertThat(JsonPath.<String>read(empty, "$.view.child.name")).isEqualTo("Mia");
        assertThat(JsonPath.<String>read(empty, "$.view.currency")).isEqualTo("EUR");
        assertThat(JsonPath.<List<String>>read(empty, "$.view.jars[*].jar")).containsExactly("spend", "save", "give");
        assertThat(jars(empty)).containsExactly(0, 0, 0);
        assertThat(JsonPath.<Object>read(empty, "$.view.nextInterestOn")).isNull(); // no rate, no interest

        // Pocket money into Save; ten stars at 20 cents each into Spend; Alex pays in too.
        String pocket = entry(nora, bank, "in", "{\"jar\":\"save\",\"cents\":1200,\"title\":\"Pocket money\"}");
        String body =
                "{\"clientId\":\"%s\",\"kind\":\"in\",\"fields\":{\"jar\":\"spend\",\"stars\":10,\"title\":\"10 stars from the chore wheel\"}}"
                        .formatted(id());
        send(HttpMethod.POST, "/v1/boards/" + bank + "/entries", alex, body, 201);
        String twice = send(HttpMethod.POST, "/v1/boards/" + bank + "/entries", alex, body, 201);
        assertThat(JsonPath.<List<Integer>>read(twice, "$.board.view.jars[*].cents"))
                .containsExactly(200, 1200, 0); // sent twice, paid in once
        entry(
                nora,
                bank,
                "in",
                "{\"jar\":\"spend\",\"cents\":500,\"title\":\"From Grandma Astrid\",\"note\":\"For a good school report\",\"fromName\":\"Astrid Lind\"}");

        // Out of a jar only what is in it.
        assertThat(add(nora, bank, "out", "{\"jar\":\"spend\",\"cents\":701,\"title\":\"A scooter\"}", 409))
                .contains("There is only €7.00 in Spend");
        entry(
                nora,
                bank,
                "out",
                "{\"jar\":\"spend\",\"cents\":350,\"title\":\"Stickers\",\"note\":\"Her own choice\"}");
        assertThat(add(nora, bank, "move", "{\"jar\":\"give\",\"toJar\":\"save\",\"cents\":1}", 409))
                .contains("There is only €0.00 in Give");
        String move = entry(nora, bank, "move", "{\"jar\":\"save\",\"toJar\":\"give\",\"cents\":300}");

        String seen = view(kai, bank);
        assertThat(jars(seen)).containsExactly(350, 900, 300);
        assertThat(JsonPath.<Integer>read(seen, "$.view.totalCents")).isEqualTo(1550);
        // Spend is drawn against its €20; Save against the fund, which counts stars: ten of fifty.
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.jars[*].fill")).containsExactly(17, 20, null);
        assertThat(JsonPath.<Integer>read(seen, "$.view.fund.starsIn")).isEqualTo(10);
        assertThat(JsonPath.<Integer>read(seen, "$.view.fund.percent")).isEqualTo(20);
        assertThat(JsonPath.<Integer>read(seen, "$.view.fund.starsToGo")).isEqualTo(40);
        // The last three things, newest first, money out as a number below zero.
        assertThat(JsonPath.<List<String>>read(seen, "$.view.lately[*].title"))
                .containsExactly("Moved to Give", "Stickers", "From Grandma Astrid");
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.lately[*].cents")).containsExactly(300, -350, 500);
        assertThat(JsonPath.<String>read(seen, "$.view.lately[2].fromName")).isEqualTo("Astrid Lind");
        assertThat(glance(alex, bank)).isEqualTo("€15.50 · €9.00 in Save");
        // The whole list, a page at a time.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + bank + "/entries?limit=2", nora), "$.items[*].kind"))
                .containsExactly("move", "out");

        // Whole cents only, above nothing, into one of the three jars, on a day that has been.
        add(nora, bank, "in", "{\"jar\":\"save\",\"cents\":3.5,\"title\":\"Half a cent\"}", 400);
        add(nora, bank, "in", "{\"jar\":\"save\",\"cents\":0,\"title\":\"Nothing\"}", 400);
        add(nora, bank, "in", "{\"jar\":\"save\",\"cents\":-5,\"title\":\"Less than nothing\"}", 400);
        add(nora, bank, "in", "{\"jar\":\"sweets\",\"cents\":5,\"title\":\"Sweets\"}", 400);
        add(nora, bank, "in", "{\"jar\":\"save\",\"title\":\"How much?\"}", 400);
        add(nora, bank, "in", "{\"jar\":\"save\",\"cents\":5}", 400);
        add(nora, bank, "move", "{\"jar\":\"save\",\"toJar\":\"save\",\"cents\":5}", 400);
        add(
                nora,
                bank,
                "in",
                "{\"jar\":\"save\",\"cents\":5,\"title\":\"Tomorrow\",\"day\":\"%s\"}".formatted(TODAY.plusDays(1)),
                400);
        add(nora, bank, "interest", "{\"jar\":\"save\",\"cents\":500,\"title\":\"A gift to myself\"}", 400);

        // The bank is run by the grown-ups: a teenager reads it and changes nothing.
        assertThat(JsonPath.<Boolean>read(seen, "$.view.canChange")).isFalse();
        assertThat(add(kai, bank, "in", "{\"jar\":\"save\",\"cents\":5000,\"title\":\"For me\"}", 403))
                .contains("Only the grown-ups run this bank");
        send(HttpMethod.DELETE, "/v1/board-entries/" + move, kai, null, 403);
        send(HttpMethod.PATCH, "/v1/boards/" + bank, kai, "{\"settings\":{\"interestPercent\":90}}", 403);

        // What happened stays: its words can be put right; money that has moved on can't be taken back.
        change(nora, pocket, "{\"title\":\"Pocket money, October\"}", 200);
        assertThat(send(HttpMethod.DELETE, "/v1/board-entries/" + pocket, nora, null, 409))
                .contains("Some of that money has been spent or moved since");
        send(HttpMethod.DELETE, "/v1/board-entries/" + move, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/board-entries/" + pocket, nora, null, 204);
        assertThat(jars(view(nora, bank))).containsExactly(350, 0, 0);
        // It is one child's: once there is money in it, it can't be made someone else's.
        String leo = addMember(nora, circle, "Leo", "child");
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + bank,
                nora,
                "{\"settings\":{\"forMemberId\":\"%s\"}}".formatted(leo),
                409);
    }

    @Test
    void interestArrivesOnTheFirstOfTheMonthAndANewRateNeverReachesBack() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String mia = addMember(nora, circle, "Mia", "child");
        String bank = board(
                nora, circle, "piggy_bank", "circle", "{\"forMemberId\":\"%s\",\"interestPercent\":5}".formatted(mia));
        add(nora, bank, "in", "{\"jar\":\"save\",\"cents\":1200,\"title\":\"Pocket money\"}");
        add(nora, bank, "in", "{\"jar\":\"spend\",\"cents\":800,\"title\":\"Pocket money\"}");
        String start = view(nora, bank);
        assertThat(JsonPath.<Object>read(start, "$.view.lastInterest")).isNull();
        assertThat(JsonPath.<String>read(start, "$.view.nextInterestOn"))
                .isEqualTo(TODAY.withDayOfMonth(1).plusMonths(1).toString());

        // Two months pass: all of this happened two months ago, and nobody has looked since.
        LocalDate then = TODAY.minusMonths(2);
        jdbc.sql("update board_entries set day = :day where board_id = cast(:id as uuid)")
                .param("day", then)
                .param("id", bank)
                .update();
        setSetting(bank, "paidThrough", then.toString());
        LocalDate thisFirst = TODAY.withDayOfMonth(1);
        LocalDate lastFirst = thisFirst.minusMonths(1);

        // Looking is enough to see it: 5% of €12.00, then 5% of €12.60 with half a cent going up. Only Save earns.
        String grown = view(nora, bank);
        assertThat(jars(grown)).containsExactly(800, 1323, 0);
        assertThat(JsonPath.<String>read(grown, "$.view.lastInterest.day")).isEqualTo(thisFirst.toString());
        assertThat(JsonPath.<Integer>read(grown, "$.view.lastInterest.cents")).isEqualTo(63);
        assertThat(glance(nora, bank)).isEqualTo("€21.23 · €13.23 in Save");
        // Looking wrote nothing down.
        assertThat(jdbc.sql("select count(*) from board_entries where kind = 'interest'")
                        .query(Integer.class)
                        .single())
                .isZero();

        // The next change writes it down first, at the rate it was earned at. The new rate is for the firsts to come.
        String changed =
                send(HttpMethod.PATCH, "/v1/boards/" + bank, nora, "{\"settings\":{\"interestPercent\":50}}", 200);
        assertThat(JsonPath.<Integer>read(changed, "$.settings.interestPercent"))
                .isEqualTo(50);
        assertThat(JsonPath.<String>read(changed, "$.settings.paidThrough")).isEqualTo(thisFirst.toString());
        assertThat(jars(changed)).containsExactly(800, 1323, 0);
        String paid = fetch("/v1/boards/" + bank + "/entries?kind=interest", nora);
        assertThat(JsonPath.<List<Integer>>read(paid, "$.items[*].cents")).containsExactly(63, 60);
        assertThat(JsonPath.<List<String>>read(paid, "$.items[*].day"))
                .containsExactly(thisFirst.toString(), lastFirst.toString());
        assertThat(JsonPath.<List<String>>read(paid, "$.items[*].title")).containsOnly("Interest, 5%");
        assertThat(JsonPath.<List<Object>>read(paid, "$.items[*].by")).containsOnly((Object) null);
        // Paid once: changing something again, or changing the rate back, pays nothing more for those months.
        add(nora, bank, "out", "{\"jar\":\"spend\",\"cents\":100,\"title\":\"A comic\"}");
        send(HttpMethod.PATCH, "/v1/boards/" + bank, nora, "{\"settings\":{\"interestPercent\":5}}", 200);
        assertThat(jars(view(nora, bank))).containsExactly(700, 1323, 0);
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/boards/" + bank + "/entries?kind=interest", nora), "$.items.length()"))
                .isEqualTo(2);
        // The interest is not among the last things that happened, and it can't be taken back.
        assertThat(JsonPath.<List<String>>read(view(nora, bank), "$.view.lately[*].kind"))
                .doesNotContain("interest");
        String interest = JsonPath.read(paid, "$.items[0].id");
        assertThat(send(HttpMethod.DELETE, "/v1/board-entries/" + interest, nora, null, 409))
                .contains("The bank's interest can't be taken back");
        send(HttpMethod.PATCH, "/v1/boards/" + bank, nora, "{\"settings\":{\"interestPercent\":101}}", 400);
    }
}
