package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Where is it?: asking where something was put, and the things that are kept to the grown-ups, tried as a
 * parent and as a teenager who may see the list but not everything on it.
 */
class WhereIsItTest extends FunBoardTest {

    private static final String SECRET = "Marta keeps it behind the garden gnome";

    @Test
    void aThingKeptToSomePeopleIsNotOnTheListForAnyoneElseByAnyRoute() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String noraId = memberOf(nora, circle);
        String alexId = join(nora, circle, alex);
        teen(nora, circle, kai);
        String where = board(nora, circle, "where_is_it", "circle", null);

        String tent = add(
                alex,
                where,
                "item",
                "{\"name\":\"Tent\",\"emoji\":\"⛺\",\"place\":\"Attic, blue crate 3\",\"note\":\"Tent, pegs and both mats.\",\"mediaId\":\"%s\"}"
                        .formatted(uploadPhoto(alex)));
        String key = add(
                nora,
                where,
                "item",
                "{\"name\":\"Zanzibar car key\",\"place\":\"%s\",\"onlyMemberIds\":[\"%s\",\"%s\"]}"
                        .formatted(SECRET, noraId, alexId));

        // The two it is kept to see both things; the chip under the key says who.
        for (String parent : List.of(nora, alex)) {
            String seen = view(parent, where);
            assertThat(JsonPath.<Integer>read(seen, "$.view.count")).isEqualTo(2);
            assertThat(JsonPath.<List<String>>read(seen, "$.view.items[*].name"))
                    .containsExactly("Zanzibar car key", "Tent");
            assertThat(JsonPath.<List<String>>read(seen, "$.view.items[0].only[*].name"))
                    .containsExactly("Nora", "Alex");
            assertThat(JsonPath.<List<Object>>read(seen, "$.view.items[1].only"))
                    .isEmpty();
            assertThat(glance(parent, where)).isEqualTo("2 things put away");
            assertThat(fetch("/v1/circles/" + circle + "/search?q=garden gnome", parent))
                    .contains(where);
        }

        // Kai sees the list, and on it only the tent. The key isn't counted, found, asked for or reached.
        String asKai = view(kai, where);
        assertThat(JsonPath.<Integer>read(asKai, "$.view.count")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(asKai, "$.view.items[*].name")).containsExactly("Tent");
        assertThat(glance(kai, where)).isEqualTo("1 thing put away");
        assertSecret(kai, nora, circle, where, SECRET);
        assertSecret(kai, nora, circle, where, "Zanzibar car key");
        String asked = fetch("/v1/boards/" + where + "?show=where is the zanzibar car key", kai);
        assertThat(JsonPath.<Object>read(asked, "$.view.found")).isNull();
        assertThat(asked).doesNotContain("gnome");
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/circles/" + circle + "/search?q=where's the zanzibar car key", kai), "$.hits"))
                .isEmpty();
        change(kai, key, "{\"place\":\"In my pocket\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + key, kai, null, 404);
        act(kai, where, "seen", "{\"entryId\":\"%s\",\"place\":\"somewhere\"}".formatted(key), 404);
        // The photo of the tent is there for him; the page of a guest names the list and nothing on it.
        assertThat(JsonPath.<String>read(asKai, "$.view.items[0].photo.url")).contains("/media/photos");
        assertThat(guestPage(nora, circle, where)).doesNotContain("Attic").doesNotContain("gnome");

        // Whoever keeps a thing to some people is always one of them.
        String passports = add(
                nora,
                where,
                "item",
                "{\"name\":\"The passports\",\"place\":\"Bedroom, grey folder\",\"onlyMemberIds\":[\"%s\"]}"
                        .formatted(alexId));
        assertThat(JsonPath.<List<String>>read(view(alex, where), "$.view.items[0].only[*].name"))
                .containsExactlyInAnyOrder("Nora", "Alex");
        add(
                nora,
                where,
                "item",
                "{\"name\":\"Odd\",\"place\":\"Here\",\"onlyMemberIds\":[\"%s\"]}".formatted(id()),
                400);
        // Opened up for everyone, Kai finds them.
        change(nora, passports, "{\"onlyMemberIds\":[]}", 200);
        assertThat(JsonPath.<List<String>>read(view(kai, where), "$.view.items[*].name"))
                .containsExactly("The passports", "Tent");
        assertThat(tent).isNotNull();
    }

    @Test
    void aQuestionIsAnsweredWithThePlaceAndAnyoneCanSayWhereTheyLastSawAThing() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String where = board(nora, circle, "where_is_it", "circle", null);
        String tent = add(
                alex,
                where,
                "item",
                "{\"name\":\"Tent\",\"place\":\"Attic, blue crate 3\",\"note\":\"Tent, pegs and both mats.\",\"day\":\"%s\"}"
                        .formatted(TODAY.minusDays(58)));
        add(nora, where, "item", "{\"name\":\"Christmas lights\",\"place\":\"Cellar, top shelf, on the left\"}");
        String bag = add(nora, where, "item", "{\"name\":\"Leo's swimming bag\",\"place\":\"Hall cupboard\"}");

        // "where's the tent", asked of the board: the tent is the answer, and the rest follow.
        String asked = fetch("/v1/boards/" + where + "?show=where's the tent", nora);
        assertThat(JsonPath.<String>read(asked, "$.view.asked")).isEqualTo("where's the tent");
        assertThat(JsonPath.<String>read(asked, "$.view.found.place")).isEqualTo("Attic, blue crate 3");
        assertThat(JsonPath.<String>read(asked, "$.view.found.note")).isEqualTo("Tent, pegs and both mats.");
        assertThat(JsonPath.<String>read(asked, "$.view.found.putBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(asked, "$.view.found.putOn"))
                .isEqualTo(TODAY.minusDays(58).toString());
        assertThat(JsonPath.<List<String>>read(asked, "$.view.items[*].name"))
                .containsExactly("Leo's swimming bag", "Christmas lights");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/boards/" + where + "?show=has anyone seen the swim bag?", alex),
                        "$.view.found.name"))
                .isEqualTo("Leo's swimming bag");
        assertThat(JsonPath.<Object>read(
                        fetch("/v1/boards/" + where + "?show=where is the unicorn", nora), "$.view.found"))
                .isNull();

        // The same question, typed into the circle's search: the list comes back with the place under it.
        String found = fetch("/v1/circles/" + circle + "/search?q=where's the tent", nora);
        assertThat(JsonPath.<List<String>>read(found, "$.hits[*].thing.id")).containsExactly(where);
        assertThat(JsonPath.<String>read(found, "$.hits[0].snippet"))
                .isEqualTo("Attic, blue crate 3 · Tent, pegs and both mats.");
        // Plain words find it too, as they find anything.
        assertThat(fetch("/v1/circles/" + circle + "/search?q=blue crate", alex))
                .contains(where);
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/circles/" + circle + "/search?q=where's the unicorn", nora), "$.hits"))
                .isEmpty();

        // Anyone who sees it says where they last saw it, also with a list they may only look at; a child's
        // sighting is said for them.
        shareWith(nora, where, alexId, "view");
        String seen = act(
                alex,
                where,
                "seen",
                "{\"entryId\":\"%s\",\"place\":\"on the hall hook\",\"byMemberId\":\"%s\"}".formatted(bag, mia),
                200);
        assertThat(JsonPath.<String>read(seen, "$.view.items[0].seen")).isEqualTo("on the hall hook");
        assertThat(JsonPath.<String>read(seen, "$.view.items[0].seenBy.name")).isEqualTo("Mia");
        assertThat(JsonPath.<String>read(seen, "$.view.items[0].seenAt")).isNotNull();
        act(alex, where, "seen", "{\"entryId\":\"%s\"}".formatted(bag), 400);
        // He may only look: putting it somewhere else is not his to do.
        change(alex, bag, "{\"place\":\"Bathroom\"}", 403);
        // Put somewhere else, by her, today: where it was last seen no longer matters.
        String moved = change(nora, bag, "{\"place\":\"In the car boot\"}", 200);
        assertThat(JsonPath.<Object>read(moved, "$.view.items[0].seen")).isNull();
        assertThat(JsonPath.<String>read(moved, "$.view.items[0].putBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(moved, "$.view.items[0].putOn")).isEqualTo(TODAY.toString());

        add(nora, where, "item", "{\"name\":\"Nowhere\"}", 400);
        add(nora, where, "item", "{\"place\":\"Somewhere\"}", 400);
        add(
                nora,
                where,
                "item",
                "{\"name\":\"Tomorrow's\",\"place\":\"Here\",\"day\":\"%s\"}".formatted(TODAY.plusDays(1)),
                400);
        send(HttpMethod.DELETE, "/v1/board-entries/" + tent, nora, null, 204);
        assertThat(JsonPath.<Integer>read(view(nora, where), "$.view.count")).isEqualTo(2);
    }
}
