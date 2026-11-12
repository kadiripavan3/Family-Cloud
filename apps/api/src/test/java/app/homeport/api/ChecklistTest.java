package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Checklists: one line changed at a time, so two people using a list at once both keep what they did. */
class ChecklistTest extends ApiTest {

    private String list(String token, String circle, String title, String audience, String... items) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"%s,\"items\":[%s]}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        audience == null ? "" : ",\"audience\":\"" + audience + "\"",
                                        items.length == 0 ? "" : "\"" + String.join("\",\"", items) + "\""),
                        201),
                "$.id");
    }

    private String add(String token, String list, String text) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists/" + list + "/items",
                        token,
                        "{\"clientId\":\"%s\",\"text\":\"%s\"}".formatted(id(), text),
                        201),
                "$.id");
    }

    @Test
    void twoPeopleTickingAndAddingAtOnceBothKeepWhatTheyDid() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String list = list(nora, circle, "Shopping", null, "Milk", "Bread", "Eggs");
        List<String> ids = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[*].id");

        // Both have the list open. Nora ticks milk while Alex ticks bread and adds butter.
        send(HttpMethod.PATCH, "/v1/checklist-items/" + ids.get(0), nora, "{\"done\":true}", 200);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + ids.get(1), alex, "{\"done\":true}", 200);
        add(alex, list, "Butter");

        String now = fetch("/v1/checklists/" + list, nora);
        assertThat(JsonPath.<List<String>>read(now, "$.items[*].text"))
                .containsExactly("Milk", "Bread", "Eggs", "Butter");
        assertThat(JsonPath.<List<Boolean>>read(now, "$.items[*].done")).containsExactly(true, true, false, false);
        assertThat(JsonPath.<String>read(now, "$.items[0].doneBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(now, "$.items[1].doneBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(now, "$.items[3].addedBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Integer>read(now, "$.left")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(now, "$.done")).isEqualTo(2);

        // Ticking what the other already ticked keeps who was first; both removing the same line is fine.
        send(HttpMethod.PATCH, "/v1/checklist-items/" + ids.get(0), alex, "{\"done\":true}", 200);
        assertThat(JsonPath.<String>read(fetch("/v1/checklists/" + list, alex), "$.items[0].doneBy.name"))
                .isEqualTo("Nora");
        send(HttpMethod.DELETE, "/v1/checklist-items/" + ids.get(2), nora, null, 204);
        send(HttpMethod.DELETE, "/v1/checklist-items/" + ids.get(2), alex, null, 204);
    }

    @Test
    void aLineSentTwiceIsAddedOnce() throws Exception {
        String nora = person("Nora");
        String list = list(nora, circle(nora, "solo", "Just me"), "Packing", null);
        String body =
                "{\"clientId\":\"%s\",\"text\":\"  Passports   for all four \",\"amountCents\":4500}".formatted(id());

        String first = send(HttpMethod.POST, "/v1/checklists/" + list + "/items", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/checklists/" + list + "/items", nora, body, 201);

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<String>read(first, "$.text")).isEqualTo("Passports for all four");
        assertThat(JsonPath.<Integer>read(fetch("/v1/checklists/" + list, nora), "$.items.length()"))
                .isEqualTo(1);
    }

    @Test
    void aLineCanBeChangedGivenToSomeoneMovedAndCleared() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String list = list(nora, circle, "Party prep", "circle", "Cake", "Balloons", "Invitations");
        List<String> ids = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[*].id");

        send(
                HttpMethod.PATCH,
                "/v1/checklist-items/" + ids.get(0),
                nora,
                "{\"note\":\"Alex has the cake\",\"section\":\"Food\",\"amountCents\":2800,\"assignedTo\":\"%s\"}"
                        .formatted(alexId),
                200);
        send(
                HttpMethod.PATCH,
                "/v1/checklist-items/" + ids.get(2),
                nora,
                "{\"before\":\"%s\"}".formatted(ids.get(0)),
                200);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + ids.get(1), nora, "{\"done\":true}", 200);

        String now = fetch("/v1/checklists/" + list, alex);
        assertThat(JsonPath.<List<String>>read(now, "$.items[*].text"))
                .containsExactly("Invitations", "Cake", "Balloons");
        assertThat(JsonPath.<String>read(now, "$.items[1].assignedTo.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Integer>read(now, "$.items[1].amountCents")).isEqualTo(2800);
        assertThat(JsonPath.<String>read(now, "$.items[1].section")).isEqualTo("Food");

        send(
                HttpMethod.PATCH,
                "/v1/checklist-items/" + ids.get(0),
                nora,
                "{\"unassign\":true,\"removeAmount\":true,\"toEnd\":true}",
                200);
        String cleared = send(HttpMethod.DELETE, "/v1/checklists/" + list + "/done", alex, null, 200);
        assertThat(JsonPath.<List<String>>read(cleared, "$.items[*].text")).containsExactly("Invitations", "Cake");
        assertThat(JsonPath.<Object>read(cleared, "$.items[1].assignedTo")).isNull();
        assertThat(JsonPath.<Object>read(cleared, "$.items[1].amountCents")).isNull();
    }

    @Test
    void aListFollowsTheSameSharingRuleAsEverythingElse() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String list = list(nora, circle, "Gift ideas", null, "Roller skates");
        String item = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[0].id");

        // Only hers: Alex reaches neither the list nor a line of it, by any way.
        send(HttpMethod.GET, "/v1/checklists/" + list, alex, null, 404);
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/items",
                alex,
                "{\"clientId\":\"%s\",\"text\":\"Peek\"}".formatted(id()),
                404);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + item, alex, "{\"done\":true}", 404);
        send(HttpMethod.DELETE, "/v1/checklist-items/" + item, alex, null, 404);
        assertThat(fetch("/v1/circles/" + circle + "/checklists", alex)).doesNotContain(list);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=skates", alex)).doesNotContain(list);

        // Shared to look at: he reads it and can't tick. Shared to edit: he can.
        send(
                HttpMethod.PUT,
                "/v1/things/" + list + "/audience",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId),
                200);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=skates", alex)).contains(list);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + item, alex, "{\"done\":true}", 403);
        send(HttpMethod.GET, "/v1/checklists/" + list, kai, null, 404);
        send(
                HttpMethod.PUT,
                "/v1/things/" + list + "/audience",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(alexId),
                200);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + item, alex, "{\"done\":true}", 200);

        // A job can only be given to someone of the circle, and a line only moved within its own list.
        String stranger = JsonPath.read(fetch("/v1/circles/" + circle(kai, "solo", "Kai alone"), kai), "$.myMemberId");
        send(HttpMethod.PATCH, "/v1/checklist-items/" + item, nora, "{\"assignedTo\":\"%s\"}".formatted(stranger), 400);
        String other = list(nora, circle, "Another", null, "Line");
        String otherItem = JsonPath.read(fetch("/v1/checklists/" + other, nora), "$.items[0].id");
        send(HttpMethod.PATCH, "/v1/checklist-items/" + item, nora, "{\"before\":\"%s\"}".formatted(otherItem), 400);
    }

    @Test
    void thingsAreLinkedFromBothEndsForWhoeverMaySeeBoth() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String plan = page(nora, circle, "Birthday plan", "circle");
        String prep = list(nora, circle, "Party prep", "circle", "Cake");
        String gifts = list(nora, circle, "Gift ideas", "me", "Skates");

        send(HttpMethod.PUT, "/v1/things/" + plan + "/links/" + prep, nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + plan + "/links/" + gifts, nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + plan + "/links/" + prep, nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + plan + "/about", nora, "{\"memberIds\":[\"%s\"]}".formatted(mia), 204);

        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + plan + "/links", nora), "$[*].title"))
                .containsExactly("Party prep", "Gift ideas");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + prep + "/links", nora), "$[*].title"))
                .containsExactly("Birthday plan");
        // Alex sees the link to what he may see, and nothing of the private list.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + plan + "/links", alex), "$[*].title"))
                .containsExactly("Party prep");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/members/" + mia, alex), "$.kept[*].title"))
                .containsExactly("Birthday plan");

        // Not across circles, not to itself, and not to what you can't see.
        String elsewhere = page(nora, circle(nora, "crew", "Lisbon crew"), "Plans", "circle");
        send(HttpMethod.PUT, "/v1/things/" + plan + "/links/" + elsewhere, nora, null, 400);
        send(HttpMethod.PUT, "/v1/things/" + plan + "/links/" + plan, nora, null, 400);
        send(HttpMethod.PUT, "/v1/things/" + plan + "/links/" + gifts, alex, null, 404);

        send(HttpMethod.DELETE, "/v1/things/" + prep + "/links/" + plan, nora, null, 204);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + plan + "/links", nora), "$[*].title"))
                .containsExactly("Gift ideas");
    }
}
