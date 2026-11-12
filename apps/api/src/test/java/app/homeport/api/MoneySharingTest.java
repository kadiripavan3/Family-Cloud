package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Who can see what, for Money's three kinds of thing: a bill, a sheet and a split. Each sentence of the rule
 * is tried through every way there is to reach the thing (by its id, in its list, on Money's page, in
 * search by its name and by what is inside it, on Today, through a row or an expense of it), and they all
 * have to agree. "Today" is Wednesday 11 November 2026.
 */
class MoneySharingTest extends ApiTest {

    private static final String TODAY = "2026-11-11";

    /** One bill, one sheet and one split of the same owner in the same circle, with the ids inside them. */
    private record Money(
            String circle,
            String bill,
            String sheet,
            String tab,
            String row,
            String column,
            String tile,
            String split,
            String expense,
            String payment) {}

    private int status(HttpMethod method, String path, String token, String json) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(method, path)
                .header("Authorization", token);
        if (json != null) {
            request = request.contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .content(json);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    private int status(String path, String token) throws Exception {
        return status(HttpMethod.GET, path, token, null);
    }

    /** The owner's bill (due tomorrow), sheet (a trip budget) and split (one expense, one payment), shared as given. */
    private Money money(String owner, String circle, String audience, String ownerId, String otherId) throws Exception {
        String shared = audience == null ? "" : ",\"audience\":\"" + audience + "\"";
        String bill = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/bills",
                        owner,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Electricity\",\"payee\":\"Elektro Ljubljana\",\"amountCents\":8420,\"dueOn\":\"2026-11-12\",\"repeat\":\"monthly\"%s}"
                                .formatted(id(), circle, shared),
                        201),
                "$.id");
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                owner,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Norway budget\",\"template\":\"trip_budget\"%s}"
                        .formatted(id(), circle, shared),
                201);
        String split = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits",
                        owner,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Lisbon weekend\"%s}"
                                .formatted(id(), circle, shared),
                        201),
                "$.id");
        String expense = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits/" + split + "/expenses",
                        owner,
                        "{\"clientId\":\"%s\",\"title\":\"Dinner at Ramiro\",\"amountCents\":18600,\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]}"
                                .formatted(id(), ownerId, otherId),
                        201),
                "$.id");
        String payment = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits/" + split + "/payments",
                        owner,
                        "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":1000}"
                                .formatted(id(), otherId, ownerId),
                        201),
                "$.id");
        return new Money(
                circle,
                bill,
                JsonPath.read(sheet, "$.id"),
                JsonPath.read(sheet, "$.tab.id"),
                JsonPath.read(sheet, "$.tab.rows[1].id"),
                JsonPath.read(sheet, "$.tab.columns[2].id"),
                JsonPath.read(sheet, "$.tab.tiles[0].id"),
                split,
                expense,
                payment);
    }

    /** True when this person can reach the bill by any of the ways there are. They must all agree. */
    private boolean seesBill(String token, Money m) throws Exception {
        boolean byId = status("/v1/bills/" + m.bill(), token) == 200;
        List<Boolean> ways = List.of(
                byId,
                status("/v1/things/" + m.bill(), token) == 200,
                status("/v1/things/" + m.bill() + "/audience", token) == 200,
                status("/v1/things/" + m.bill() + "/links", token) == 200,
                fetch("/v1/circles/" + m.circle() + "/bills", token).contains(m.bill()),
                fetch("/v1/circles/" + m.circle() + "/money?day=" + TODAY, token)
                        .contains(m.bill()),
                fetch("/v1/circles/" + m.circle() + "/search?q=Electricity", token)
                        .contains(m.bill()),
                fetch("/v1/circles/" + m.circle() + "/search?q=Elektro", token).contains(m.bill()),
                fetch("/v1/circles/" + m.circle() + "/today?day=" + TODAY, token)
                        .contains(m.bill()));
        assertThat(ways).as("every way to reach the bill gives the same answer").containsOnly(byId);
        return byId;
    }

    private boolean seesSheet(String token, Money m) throws Exception {
        boolean byId = status("/v1/sheets/" + m.sheet(), token) == 200;
        List<Boolean> ways = List.of(
                byId,
                status("/v1/sheets/" + m.sheet() + "/rows", token) == 200,
                status("/v1/things/" + m.sheet(), token) == 200,
                status("/v1/sheet-rows/" + m.row(), token) == 200,
                status(
                                HttpMethod.POST,
                                "/v1/sheet-tabs/" + m.tab() + "/formula",
                                token,
                                "{\"formula\":\"SUM([Cost])\"}")
                        == 200,
                status(HttpMethod.POST, "/v1/sheet-tabs/" + m.tab() + "/ask", token, "{\"question\":\"Total cost\"}")
                        == 200,
                fetch("/v1/circles/" + m.circle() + "/sheets", token).contains(m.sheet()),
                fetch("/v1/circles/" + m.circle() + "/money?day=" + TODAY, token)
                        .contains(m.sheet()),
                fetch("/v1/circles/" + m.circle() + "/search?q=Norway", token).contains(m.sheet()),
                fetch("/v1/circles/" + m.circle() + "/search?q=somewhere to stay", token)
                        .contains(m.sheet()));
        assertThat(ways)
                .as("every way to reach the sheet gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    private boolean seesSplit(String token, Money m) throws Exception {
        boolean byId = status("/v1/splits/" + m.split(), token) == 200;
        List<Boolean> ways = List.of(
                byId,
                status("/v1/splits/" + m.split() + "/expenses", token) == 200,
                status("/v1/things/" + m.split(), token) == 200,
                fetch("/v1/circles/" + m.circle() + "/splits", token).contains(m.split()),
                fetch("/v1/circles/" + m.circle() + "/search?q=Lisbon", token).contains(m.split()),
                fetch("/v1/circles/" + m.circle() + "/search?q=Ramiro", token).contains(m.split()));
        assertThat(ways)
                .as("every way to reach the split gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    private boolean seesAll(String token, Money m) throws Exception {
        List<Boolean> each = List.of(seesBill(token, m), seesSheet(token, m), seesSplit(token, m));
        assertThat(each).as("a bill, a sheet and a split follow the same rule").containsOnly(each.get(0));
        return each.get(0);
    }

    private void share(String owner, Money m, String body) throws Exception {
        for (String thing : List.of(m.bill(), m.sheet(), m.split())) {
            send(HttpMethod.PUT, "/v1/things/" + thing + "/audience", owner, body, 200);
        }
    }

    /** Every way there is to change a bill, a sheet or a split, with what each answers for this person. */
    private List<Integer> changes(String token, Money m, String memberId) throws Exception {
        String client = "\"clientId\":\"" + id() + "\"";
        return List.of(
                status(HttpMethod.PATCH, "/v1/bills/" + m.bill(), token, "{\"note\":\"Mine now\"}"),
                status(HttpMethod.PUT, "/v1/bills/" + m.bill() + "/paid", token, "{\"dueOn\":\"2026-11-12\"}"),
                status(HttpMethod.PATCH, "/v1/sheets/" + m.sheet(), token, "{\"title\":\"Mine now\"}"),
                status(
                        HttpMethod.POST,
                        "/v1/sheets/" + m.sheet() + "/tabs",
                        token,
                        "{" + client + ",\"name\":\"More\"}"),
                status(HttpMethod.PATCH, "/v1/sheet-tabs/" + m.tab(), token, "{\"name\":\"Mine\"}"),
                status(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + m.tab() + "/columns",
                        token,
                        "{" + client + ",\"name\":\"More\"}"),
                status(HttpMethod.PATCH, "/v1/sheet-columns/" + m.column(), token, "{\"name\":\"Price\"}"),
                status(HttpMethod.POST, "/v1/sheet-tabs/" + m.tab() + "/rows", token, "{" + client + ",\"cells\":{}}"),
                status(HttpMethod.PATCH, "/v1/sheet-rows/" + m.row(), token, "{\"note\":\"Mine now\"}"),
                status(
                        HttpMethod.POST,
                        "/v1/sheet-rows/" + m.row() + "/papers",
                        token,
                        "{" + client + ",\"mediaId\":\"" + uploadPhoto(token) + "\"}"),
                status(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + m.tab() + "/tiles",
                        token,
                        "{" + client + ",\"name\":\"More\",\"formula\":\"COUNT()\"}"),
                status(HttpMethod.PATCH, "/v1/sheet-tiles/" + m.tile(), token, "{\"name\":\"Mine\"}"),
                status(HttpMethod.PATCH, "/v1/splits/" + m.split(), token, "{\"title\":\"Mine now\"}"),
                status(
                        HttpMethod.POST,
                        "/v1/splits/" + m.split() + "/expenses",
                        token,
                        "{" + client + ",\"title\":\"More\",\"amountCents\":100}"),
                status(HttpMethod.PATCH, "/v1/split-expenses/" + m.expense(), token, "{\"title\":\"Mine now\"}"),
                status(
                        HttpMethod.POST,
                        "/v1/splits/" + m.split() + "/payments",
                        token,
                        "{" + client + ",\"from\":\"" + memberId + "\",\"to\":\"" + memberId
                                + "\",\"amountCents\":1}"));
    }

    /** Every way there is to remove something from a sheet or a split. Kept apart, so they can be tried last. */
    private List<Integer> removals(String token, Money m) throws Exception {
        return List.of(
                status(HttpMethod.DELETE, "/v1/sheet-rows/" + m.row() + "/papers/" + id(), token, null),
                status(HttpMethod.DELETE, "/v1/sheet-rows/" + m.row(), token, null),
                status(HttpMethod.DELETE, "/v1/sheet-tiles/" + m.tile(), token, null),
                status(HttpMethod.DELETE, "/v1/sheet-columns/" + m.column(), token, null),
                status(HttpMethod.DELETE, "/v1/sheet-tabs/" + m.tab(), token, null),
                status(HttpMethod.DELETE, "/v1/split-expenses/" + m.expense(), token, null),
                status(HttpMethod.DELETE, "/v1/split-payments/" + m.payment(), token, null));
    }

    @Test
    void inAFamilyMoneyIsYoursAloneUntilYouShareIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");

        Money m = money(nora, circle, null, noraId, alexId);

        assertThat(seesAll(nora, m)).isTrue();
        assertThat(seesAll(alex, m)).isFalse();
        // What he can't see, he can't change or remove either: to him none of it is there.
        assertThat(changes(alex, m, alexId)).containsOnly(404);
        assertThat(removals(alex, m)).containsOnly(404);
        assertThat(status(HttpMethod.PUT, "/v1/splits/" + m.split() + "/reminders/" + alexId, alex, null))
                .isEqualTo(404);
        // Nothing of hers shows in what Money's page adds up for him, although he is named in her split.
        String money = fetch("/v1/circles/" + circle + "/money?day=" + TODAY, alex);
        assertThat(JsonPath.<Integer>read(money, "$.monthTotalCents")).isZero();
        assertThat(JsonPath.<Integer>read(money, "$.dueThisWeekCents")).isZero();
        assertThat(JsonPath.<Integer>read(money, "$.owing.length()")).isZero();
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle, alex), "$.shared.length()"))
                .isZero();
        // Still all there for her.
        assertThat(seesAll(nora, m)).isTrue();
        assertThat(JsonPath.<String>read(fetch("/v1/sheets/" + m.sheet(), nora), "$.title"))
                .isEqualTo("Norway budget");
    }

    @Test
    void amongEqualsMoneyStartsSharedWithEveryoneWhoCanAlsoChangeIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        for (String kind : List.of("couple", "flat", "crew")) {
            String circle = circle(nora, kind, "Us " + kind);
            String alexId = join(nora, circle, alex);
            String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");

            Money m = money(nora, circle, null, noraId, alexId);

            assertThat(seesAll(alex, m)).as(kind).isTrue();
            assertThat(JsonPath.<String>read(fetch("/v1/bills/" + m.bill(), alex), "$.chip.audience"))
                    .isEqualTo("circle");
            // Among equals a split shows on Today.
            assertThat(fetch("/v1/circles/" + circle + "/today?day=" + TODAY, alex))
                    .contains(m.split());
        }
    }

    @Test
    void someoneWhoIsNotInTheCircleReachesNothingOfItsMoney() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        Money m = money(nora, circle, "circle", noraId, alexId);
        String theirs =
                JsonPath.read(fetch("/v1/circles/" + circle(stranger, "solo", "Elsewhere"), stranger), "$.myMemberId");

        for (String path : List.of(
                "/v1/bills/" + m.bill(),
                "/v1/sheets/" + m.sheet(),
                "/v1/sheets/" + m.sheet() + "/rows",
                "/v1/sheet-rows/" + m.row(),
                "/v1/splits/" + m.split(),
                "/v1/splits/" + m.split() + "/expenses",
                "/v1/things/" + m.bill(),
                "/v1/things/" + m.sheet() + "/audience",
                "/v1/things/" + m.split() + "/links",
                "/v1/circles/" + circle + "/money",
                "/v1/circles/" + circle + "/bills",
                "/v1/circles/" + circle + "/sheets",
                "/v1/circles/" + circle + "/splits")) {
            assertThat(status(path, stranger)).as(path).isEqualTo(404);
        }
        assertThat(status(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + m.tab() + "/formula",
                        stranger,
                        "{\"formula\":\"SUM([Cost])\"}"))
                .isEqualTo(404);
        assertThat(status(
                        HttpMethod.POST,
                        "/v1/sheet-tabs/" + m.tab() + "/ask",
                        stranger,
                        "{\"question\":\"Total cost\"}"))
                .isEqualTo(404);
        assertThat(changes(stranger, m, theirs)).containsOnly(404);
        assertThat(removals(stranger, m)).containsOnly(404);
        assertThat(status(HttpMethod.DELETE, "/v1/things/" + m.sheet(), stranger, null))
                .isEqualTo(404);
        // And nothing can be put into the circle from outside.
        for (String kind : List.of("bills", "sheets", "splits")) {
            assertThat(status(
                            HttpMethod.POST,
                            "/v1/" + kind,
                            stranger,
                            "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Hello\",\"amountCents\":1,\"dueOn\":\"2026-11-12\"}"
                                    .formatted(id(), circle)))
                    .as(kind)
                    .isEqualTo(404);
        }
        // Nothing was changed by any of it.
        assertThat(seesAll(alex, m)).isTrue();
        assertThat(JsonPath.<Integer>read(fetch("/v1/sheets/" + m.sheet(), nora), "$.tab.rowCount"))
                .isEqualTo(5);
        assertThat(JsonPath.<Integer>read(fetch("/v1/splits/" + m.split(), nora), "$.expenses"))
                .isEqualTo(1);
    }

    @Test
    void sharedToLookAtItCanBeReadAndNotChangedAndSharedToEditItCan() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        Money m = money(nora, circle, null, noraId, alexId);

        share(
                nora,
                m,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));

        // Alex reads all of it, by every way; Kai, who wasn't named, none of it.
        assertThat(seesAll(alex, m)).isTrue();
        assertThat(seesAll(kai, m)).isFalse();
        String bill = fetch("/v1/bills/" + m.bill(), alex);
        assertThat(JsonPath.<Boolean>read(bill, "$.canEdit")).isFalse();
        assertThat(JsonPath.<Boolean>read(bill, "$.mine")).isFalse();
        assertThat(JsonPath.<List<String>>read(bill, "$.chip.people[*].name")).containsExactly("Alex");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/sheets/" + m.sheet(), alex), "$.canEdit"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/sheet-rows/" + m.row(), alex), "$.canEdit"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/splits/" + m.split(), alex), "$.canEdit"))
                .isFalse();
        // He can look, work a formula out and ask, and remind nobody (he owes, he isn't owed); he can change nothing.
        assertThat(changes(alex, m, alexId)).containsOnly(403);
        assertThat(removals(alex, m)).containsOnly(403);
        assertThat(status(HttpMethod.DELETE, "/v1/things/" + m.bill(), alex, null))
                .isEqualTo(403);
        assertThat(status(HttpMethod.PUT, "/v1/things/" + m.split() + "/audience", alex, "{\"audience\":\"circle\"}"))
                .isEqualTo(403);
        assertThat(changes(kai, m, alexId)).containsOnly(404);
        // Nothing changed.
        assertThat(JsonPath.<String>read(fetch("/v1/bills/" + m.bill(), nora), "$.note"))
                .isEmpty();
        assertThat(JsonPath.<String>read(fetch("/v1/sheets/" + m.sheet(), nora), "$.title"))
                .isEqualTo("Norway budget");
        assertThat(JsonPath.<Integer>read(fetch("/v1/sheets/" + m.sheet(), nora), "$.tab.rowCount"))
                .isEqualTo(5);
        assertThat(JsonPath.<Integer>read(fetch("/v1/splits/" + m.split(), nora), "$.expenses"))
                .isEqualTo(1);

        // Shared to edit: now he can. (The payment from himself to himself is still refused, as for anyone.)
        share(
                nora,
                m,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(alexId));
        List<Integer> allowed = changes(alex, m, alexId);
        assertThat(allowed.subList(0, allowed.size() - 1)).containsOnly(200, 201);
        assertThat(allowed.get(allowed.size() - 1)).isEqualTo(400);
        // The column is used by the tiles, so it stays (409); the rest go.
        assertThat(removals(alex, m)).containsExactly(204, 204, 204, 409, 204, 204, 204);
        // Deleting the thing itself, and deciding who sees it, stay with its owner.
        assertThat(status(HttpMethod.DELETE, "/v1/things/" + m.sheet(), alex, null))
                .isEqualTo(403);
        assertThat(status(HttpMethod.DELETE, "/v1/things/" + m.sheet(), nora, null))
                .isEqualTo(204);
        assertThat(status("/v1/sheets/" + m.sheet(), nora)).isEqualTo(404);
        assertThat(status("/v1/sheet-rows/" + m.row(), nora)).isEqualTo(404);
    }

    @Test
    void hiddenFromOnePersonItIsGoneForThemByEveryWayUntilTheDayPasses() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        Money m = money(nora, circle, "circle", noraId, alexId);
        assertThat(seesAll(mia, m)).isTrue();

        // The party budget is hidden from the birthday girl until her birthday.
        share(
                nora,
                m,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                        .formatted(miaId, java.time.LocalDate.now().plusDays(3)));

        assertThat(seesAll(alex, m)).isTrue();
        assertThat(seesAll(mia, m)).isFalse();
        assertThat(changes(mia, m, miaId)).containsOnly(404);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/sheets/" + m.sheet(), alex), "$.chip.hiddenFrom"))
                .containsExactly("Mia");
        // Hidden also holds for someone it was shared with by name.
        share(
                nora,
                m,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}],\"hiddenFrom\":[{\"memberId\":\"%s\"}]}"
                        .formatted(miaId, miaId));
        assertThat(seesAll(mia, m)).isFalse();

        // The day after the last hidden day, it is simply there again.
        share(
                nora,
                m,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                        .formatted(miaId, java.time.LocalDate.now().plusDays(3)));
        jdbc.sql("update thing_hides set through = current_date - 1").update();
        assertThat(seesAll(mia, m)).isTrue();
    }

    @Test
    void aTeenOrAChildSeesMoneyOnlyWhenAThingWasSharedWithThemByName() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"teen\"}", 200);
        // Shared with everyone in the family.
        Money m = money(nora, circle, "circle", noraId, alexId);

        // "Everyone" is the adults: Alex sees it, Mia doesn't, by any way.
        assertThat(seesAll(alex, m)).isTrue();
        assertThat(seesAll(mia, m)).isFalse();
        assertThat(changes(mia, m, miaId)).containsOnly(404);
        String forMia = fetch("/v1/circles/" + circle + "/money?day=" + TODAY, mia);
        assertThat(JsonPath.<Integer>read(forMia, "$.monthTotalCents")).isZero();
        assertThat(JsonPath.<Integer>read(forMia, "$.dueSoon.length()")).isZero();
        assertThat(JsonPath.<Integer>read(forMia, "$.sheets.length()")).isZero();
        // The audience sheet says so too: with everyone, Mia has no access.
        String audience = fetch("/v1/things/" + m.bill() + "/audience", nora);
        assertThat(JsonPath.<List<String>>read(audience, "$.people[?(@.name == 'Mia')].access"))
                .containsExactly("none");
        // The same holds for a child.
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"child\"}", 200);
        assertThat(seesAll(mia, m)).isFalse();

        // With her name on it, she sees it: her savings sheet, the bill for her phone, the split of her class trip.
        share(
                nora,
                m,
                "{\"audience\":\"circle\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(miaId));
        assertThat(seesAll(mia, m)).isTrue();
        assertThat(changes(mia, m, miaId)).containsOnly(403);
        // And as an adult she would have seen it all along.
        share(nora, m, "{\"audience\":\"circle\"}");
        assertThat(seesAll(mia, m)).isFalse();
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"adult\"}", 200);
        assertThat(seesAll(mia, m)).isTrue();
        // Something a teen makes herself in Money is hers and she sees it.
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"teen\"}", 200);
        Money hers = money(mia, circle, null, miaId, noraId);
        assertThat(seesAll(mia, hers)).isTrue();
        assertThat(seesAll(nora, hers)).isFalse();
    }
}
