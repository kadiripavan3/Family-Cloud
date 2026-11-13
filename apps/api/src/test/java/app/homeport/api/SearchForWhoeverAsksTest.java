package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.home.SearchSource;
import app.homeport.api.home.SearchSource.Found;
import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * The search knows who is asking. Every place is handed the person who searches and looks only through what
 * that person may see: a line of a list kept from one person is found by the others, what someone can't see
 * never uses up the handful they are shown, and no place has to look into the request to learn who it is.
 */
class SearchForWhoeverAsksTest extends ApiTest {

    @Autowired
    List<SearchSource> places;

    private UUID userOf(String memberId) {
        return jdbc.sql("select user_id from members where id = cast(:id as uuid)")
                .param("id", memberId)
                .query(UUID.class)
                .single();
    }

    private String make(String route, String token, String json) throws Exception {
        return JsonPath.read(send(HttpMethod.POST, route, token, json, 201), "$.id");
    }

    @Test
    void aLineKeptFromOnePersonIsFoundByTheOthers() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String list = make(
                "/v1/checklists",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Groceries\",\"audience\":\"circle\",\"items\":[\"Bananas\"]}"
                        .formatted(id(), circle));
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/items",
                nora,
                "{\"clientId\":\"%s\",\"text\":\"Birthday candles\",\"hideFrom\":[\"%s\"]}".formatted(id(), miaId),
                201);

        // Alex may read the line, so he finds the list by it, with the line under its name.
        String his = fetch("/v1/circles/" + circle + "/search?q=candles", alex);
        assertThat(JsonPath.<List<String>>read(his, "$.hits[*].thing.id")).containsExactly(list);
        assertThat(JsonPath.<String>read(his, "$.hits[0].snippet")).isEqualTo("Birthday candles");
        // Mia may not: for her the list holds no such word.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=candles", mia), "$.hits[*].thing.id"))
                .isEmpty();
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=bananas", mia), "$.hits[*].thing.id"))
                .containsExactly(list);
    }

    @Test
    void whatSomeoneMayNotSeeNeverUsesUpWhatTheyAreShown() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        // Alex wrote one page that says "pancakes" inside. Then Nora wrote forty-five of her own, later, that say it
        // too.
        String his = make(
                "/v1/pages",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Sunday\",\"body\":\"Make pancakes for everyone\",\"audience\":\"circle\"}"
                        .formatted(id(), circle));
        for (int n = 0; n < 45; n++) {
            make(
                    "/v1/pages",
                    nora,
                    "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Diary %d\",\"body\":\"No pancakes today\",\"audience\":\"me\"}"
                            .formatted(id(), circle, n));
        }

        // A search hands back forty at most. His own page is among them, however many newer ones he can't see.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=pancakes", alex), "$.hits[*].thing.id"))
                .containsExactly(his);
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/circles/" + circle + "/search?q=pancakes", nora), "$.hits.length()"))
                .isEqualTo(40);
    }

    @Test
    void everyPlaceLooksOnlyThroughWhatThePersonAskingMaySee() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String alexId = join(nora, circle, alex);
        String with = "{\"clientId\":\"%s\",\"circleId\":\"" + circle + "\",\"audience\":\"me\",";

        // One thing of every kind that can be searched inside, each Nora's alone, each with "zebra" inside it.
        List<String> hers = new ArrayList<>();
        hers.add(make("/v1/pages", nora, (with + "\"title\":\"Diary\",\"body\":\"A zebra crossed\"}").formatted(id())));
        hers.add(make(
                "/v1/checklists", nora, (with + "\"title\":\"Gifts\",\"items\":[\"A zebra mug\"]}").formatted(id())));
        hers.add(make(
                "/v1/events",
                nora,
                (with + "\"title\":\"Outing\",\"day\":\"2026-11-14\",\"timeZone\":\"UTC\",\"notes\":\"See the zebra\"}")
                        .formatted(id())));
        hers.add(make(
                "/v1/reminders",
                nora,
                (with + "\"title\":\"Tickets\",\"timeZone\":\"UTC\",\"notes\":\"For the zebra house\"}")
                        .formatted(id())));
        hers.add(make(
                "/v1/goals",
                nora,
                (with + "\"title\":\"Safari\",\"target\":5,\"blurb\":\"To see a zebra\"}").formatted(id())));
        hers.add(make(
                "/v1/bills",
                nora,
                (with
                                + "\"title\":\"Membership\",\"payee\":\"Zebra Club\",\"amountCents\":1200,\"dueOn\":\"2026-11-20\"}")
                        .formatted(id())));
        String sheet = send(HttpMethod.POST, "/v1/sheets", nora, (with + "\"title\":\"Costs\"}").formatted(id()), 201);
        send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + JsonPath.<String>read(sheet, "$.tab.id") + "/columns",
                nora,
                "{\"clientId\":\"%s\",\"name\":\"Zebra food\",\"kind\":\"money\"}".formatted(id()),
                201);
        hers.add(JsonPath.read(sheet, "$.id"));
        String split = make("/v1/splits", nora, (with + "\"title\":\"Between us\"}").formatted(id()));
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                "{\"clientId\":\"%s\",\"title\":\"Zebra tickets\",\"amountCents\":2400,\"paidBy\":\"%s\",\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]}"
                        .formatted(id(), noraId, noraId, alexId),
                201);
        hers.add(split);
        String scan = uploadPhoto(nora);
        hers.add(JsonPath.<List<String>>read(
                        send(
                                HttpMethod.POST,
                                "/v1/library",
                                nora,
                                "{\"circleId\":\"%s\",\"items\":[{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"kind\":\"document\",\"audience\":\"me\",\"text\":\"Entry for one zebra\"}]}"
                                        .formatted(circle, id(), scan),
                                201),
                        "$.items[*].item.id")
                .get(0));
        send(
                HttpMethod.PUT,
                "/v1/vault",
                nora,
                "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"AAAA\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}}"
                        .formatted("A".repeat(43), "A".repeat(22)),
                200);
        hers.add(make(
                "/v1/vault/items",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Club login\",\"category\":\"login\",\"site\":\"zebra.example\",\"ciphertext\":\"AAAA\",\"wrappedKey\":\"AAAA\"}"
                        .formatted(id(), circle)));
        String where = make(
                "/v1/boards",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"where_is_it\",\"audience\":\"me\",\"settings\":{}}"
                        .formatted(id(), circle));
        send(
                HttpMethod.POST,
                "/v1/boards/" + where + "/entries",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"item\",\"fields\":{\"name\":\"Zebra costume\",\"place\":\"Attic, blue crate\"}}"
                        .formatted(id()),
                201);
        hers.add(where);

        // Asked outside any request, as another part of the API might: each place goes by the person it is handed.
        UUID noraUser = userOf(noraId);
        UUID alexUser = userOf(alexId);
        UUID circleId = UUID.fromString(circle);
        List<String> forNora = new ArrayList<>();
        List<String> forAlex = new ArrayList<>();
        for (SearchSource place : places) {
            for (String words : List.of("zebra", "where's the zebra costume")) {
                place.find(circleId, noraUser, words, 40).stream()
                        .map(Found::thingId)
                        .forEach(id -> forNora.add(id.toString()));
                place.find(circleId, alexUser, words, 40).stream()
                        .map(Found::thingId)
                        .forEach(id -> forAlex.add(id.toString()));
            }
        }
        assertThat(forNora).containsAll(hers);
        assertThat(forAlex)
                .as("what the places found for someone who may see none of it")
                .isEmpty();

        // And through the search itself: all of it for her, none of it for him.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=zebra", nora), "$.hits[*].thing.id"))
                .containsExactlyInAnyOrderElementsOf(hers);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=zebra", alex), "$.hits[*].thing.id"))
                .isEmpty();
    }
}
