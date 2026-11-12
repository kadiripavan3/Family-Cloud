package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.list.ChecklistService;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

/**
 * What a shared list does besides holding lines: headings and sums, who is in it right now, a line kept
 * from someone, a line that comes back, what to add again, and catching up after having no signal.
 */
class SharedListTest extends NotesApiTest {

    @Autowired
    ChecklistService lists;

    private void change(String token, String item, String json, int expected) throws Exception {
        send(HttpMethod.PATCH, "/v1/checklist-items/" + item, token, json, expected);
    }

    private List<String> lines(String list, String token) throws Exception {
        return JsonPath.read(fetch("/v1/checklists/" + list, token), "$.items[*].text");
    }

    @Test
    void aListAddsUpItsAmountsAndCountsUnderEachHeading() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String list = list(nora, circle, null, "Gift ideas", null);
        String skates = line(nora, list, "Roller skates, size 33", ",\"section\":\"Gift ideas\",\"amountCents\":4500");
        line(nora, list, "Watercolour set", ",\"section\":\"Gift ideas\",\"amountCents\":2800");
        line(nora, list, "Climbing course, 5 lessons", ",\"section\":\"Experiences\",\"amountCents\":9000");
        line(nora, list, "Wrapping paper", "");
        change(nora, skates, "{\"done\":true,\"note\":\"Alex bought them\"}", 200);

        String now = fetch("/v1/checklists/" + list, nora);

        assertThat(JsonPath.<Integer>read(now, "$.sumCents")).isEqualTo(16300);
        assertThat(JsonPath.<Integer>read(now, "$.sumDoneCents")).isEqualTo(4500);
        assertThat(JsonPath.<String>read(now, "$.currency")).isEqualTo("EUR");
        assertThat(titles(now, "$.sections[*].name")).containsExactly("Gift ideas", "Experiences", "");
        assertThat(JsonPath.<List<Integer>>read(now, "$.sections[*].left")).containsExactly(1, 1, 1);
        assertThat(JsonPath.<List<Integer>>read(now, "$.sections[*].done")).containsExactly(1, 0, 0);
        assertThat(JsonPath.<List<Integer>>read(now, "$.sections[*].sumCents")).containsExactly(7300, 9000, null);
        assertThat(JsonPath.<Integer>read(now, "$.left")).isEqualTo(3);
        assertThat(JsonPath.<String>read(now, "$.items[0].addedAt")).isNotNull();

        // A list with no amounts has no sum (not a sum of nothing), and the currency is the list's own.
        String plain = fetch("/v1/checklists/" + list(nora, circle, null, "Packing", null, "Passports"), nora);
        assertThat(JsonPath.<Object>read(plain, "$.sumCents")).isNull();
        assertThat(JsonPath.<Object>read(plain, "$.sumDoneCents")).isNull();
        String changed =
                send(HttpMethod.PATCH, "/v1/checklists/" + list, nora, "{\"currency\":\"sek\",\"emoji\":\"🎁\"}", 200);
        assertThat(JsonPath.<String>read(changed, "$.currency")).isEqualTo("SEK");
        assertThat(JsonPath.<String>read(changed, "$.emoji")).isEqualTo("🎁");
        assertThat(JsonPath.<String>read(changed, "$.title")).isEqualTo("Gift ideas");
        send(HttpMethod.PATCH, "/v1/checklists/" + list, nora, "{\"currency\":\"kr\"}", 400);
    }

    @Test
    void aListCanBeStartedInAFolderWithAnEmoji() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String home = folder(nora, circle, null, "Home", null);
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"folderId\":\"%s\",\"title\":\"Groceries\",\"emoji\":\"🛒\",\"items\":[\"Milk\"]}"
                        .formatted(id(), circle, home);

        String made = send(HttpMethod.POST, "/v1/checklists", nora, body, 201);
        String again = send(HttpMethod.POST, "/v1/checklists", nora, body, 201);

        assertThat(JsonPath.<String>read(again, "$.id")).isEqualTo(JsonPath.<String>read(made, "$.id"));
        assertThat(titles(made, "$.breadcrumb[*].title")).containsExactly("Home");
        assertThat(JsonPath.<String>read(made, "$.folderId")).isEqualTo(home);
        String items = fetch("/v1/folders/" + home + "/items", nora);
        assertThat(titles(items, "$.items[*].title")).containsExactly("Groceries");
        assertThat(titles(items, "$.items[*].emoji")).containsExactly("🛒");
        assertThat(lines(JsonPath.read(made, "$.id"), nora)).containsExactly("Milk");
    }

    @Test
    void whoeverJustTickedOrAddedIsSeenInTheListForAWhile() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String list = list(nora, circle, null, "Groceries", null, "Milk", "Bread");
        String milk = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[0].id");

        change(alex, milk, "{\"done\":true}", 200);
        String hers = fetch("/v1/checklists/" + list, nora);
        assertThat(titles(hers, "$.here[*].who.name")).containsExactly("Alex");
        assertThat(titles(hers, "$.here[*].did")).containsExactly("ticked");
        assertThat(JsonPath.<String>read(hers, "$.editedBy.name")).isEqualTo("Alex");
        // He doesn't need telling that he is there himself.
        assertThat(titles(fetch("/v1/checklists/" + list, alex), "$.here[*].who.name"))
                .isEmpty();

        line(alex, list, "Butter", "");
        assertThat(titles(fetch("/v1/checklists/" + list, nora), "$.here[*].did"))
                .containsExactly("added");
        // The same on the home of Notes: "2 left · Alex is adding".
        String notes = fetch("/v1/circles/" + circle + "/notes", nora);
        assertThat(JsonPath.<Integer>read(notes, "$.recent[0].left")).isEqualTo(2);
        assertThat(titles(notes, "$.recent[0].here[*].who.name")).containsExactly("Alex");
        assertThat(titles(notes, "$.recent[0].here[*].did")).containsExactly("added");

        // Ten minutes after the last thing he did, he is no longer shown as being there.
        jdbc.sql("update checklist_people set did_at = now() - interval '11 minutes'")
                .update();
        assertThat(titles(fetch("/v1/checklists/" + list, nora), "$.here[*].who.name"))
                .isEmpty();
    }

    @Test
    void aLineKeptFromSomeoneIsNotThereForThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String outsider =
                JsonPath.read(fetch("/v1/circles/" + circle(alex, "solo", "Alex alone"), alex), "$.myMemberId");
        String list = list(nora, circle, null, "Groceries", "circle", "Bananas");
        String bananas = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[0].id");

        String candles = line(nora, list, "Birthday candles", ",\"hideFrom\":[\"%s\"]".formatted(miaId));

        // Everyone else has the line, and is told who doesn't.
        String his = fetch("/v1/checklists/" + list, alex);
        assertThat(titles(his, "$.items[*].text")).containsExactly("Bananas", "Birthday candles");
        assertThat(titles(his, "$.items[1].hiddenFrom")).containsExactly("Mia");
        assertThat(JsonPath.<Integer>read(his, "$.left")).isEqualTo(2);

        // Mia has a list of one line, by every way there is to it.
        String hers = fetch("/v1/checklists/" + list, mia);
        assertThat(titles(hers, "$.items[*].text")).containsExactly("Bananas");
        assertThat(JsonPath.<Integer>read(hers, "$.left")).isEqualTo(1);
        assertThat(hers).doesNotContain("candles").doesNotContain(candles);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/checklists", mia), "$.items[0].left"))
                .isEqualTo(1);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/checklists", alex), "$.items[0].left"))
                .isEqualTo(2);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + list, mia), "$.glance"))
                .isEqualTo("0 of 1 done");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=candles", mia)).doesNotContain(list);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=bananas", mia)).contains(list);
        change(mia, candles, "{\"done\":true}", 404);
        change(mia, bananas, "{\"before\":\"%s\"}".formatted(candles), 400);
        send(HttpMethod.DELETE, "/v1/checklist-items/" + candles, mia, null, 204);
        // Clearing the ticked lines clears the ones she can see, not one she can't.
        change(nora, candles, "{\"done\":true}", 200);
        send(HttpMethod.DELETE, "/v1/checklists/" + list + "/done", mia, null, 200);
        assertThat(lines(list, nora)).containsExactly("Bananas", "Birthday candles");

        // It is kept from people of this circle, never from yourself.
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/items",
                nora,
                "{\"clientId\":\"%s\",\"text\":\"Cake\",\"hideFrom\":[\"%s\"]}".formatted(id(), outsider),
                400);
        change(mia, bananas, "{\"hideFrom\":[\"%s\"]}".formatted(miaId), 400);

        // What the list offers to add again never gives a kept line away, and showing it again is one change.
        send(HttpMethod.DELETE, "/v1/checklist-items/" + candles, nora, null, 204);
        assertThat(fetch("/v1/checklists/" + list, mia)).doesNotContain("candles");
        String cake = line(alex, list, "Cake", "");
        change(alex, cake, "{\"hideFrom\":[\"%s\"]}".formatted(miaId), 200);
        assertThat(lines(list, mia)).containsExactly("Bananas");
        change(alex, cake, "{\"hideFrom\":[]}", 200);
        assertThat(lines(list, mia)).containsExactly("Bananas", "Cake");
    }

    @Test
    void aLineThatRepeatsStaysWhenTickedLinesAreClearedAndComesBackByItself() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String list = list(nora, circle, null, "Groceries", null, "Butter");
        String butter = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[0].id");
        String milk = line(nora, list, "Milk, 2 litres", ",\"repeats\":\"weekly\"");
        String rent = line(nora, list, "Pay the cleaner", ",\"repeats\":\"monthly\"");
        change(nora, butter, "{\"done\":true}", 200);
        change(nora, milk, "{\"done\":true}", 200);
        change(nora, rent, "{\"done\":true}", 200);

        String cleared = send(HttpMethod.DELETE, "/v1/checklists/" + list + "/done", nora, null, 200);
        assertThat(titles(cleared, "$.items[*].text")).containsExactly("Milk, 2 litres", "Pay the cleaner");
        assertThat(titles(cleared, "$.items[*].repeats")).containsExactly("weekly", "monthly");
        assertThat(JsonPath.<List<Boolean>>read(cleared, "$.items[*].done")).containsExactly(true, true);

        // Not yet: it was ticked a moment ago.
        assertThat(lists.bringBackRepeating()).isZero();
        String version = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.version");
        // Six days on, the milk is back, in time for the same day next week. The monthly line waits.
        jdbc.sql("update checklist_items set done_at = now() - interval '6 days 1 hour'")
                .update();
        assertThat(lists.bringBackRepeating()).isEqualTo(1);
        String back = fetch("/v1/checklists/" + list, nora);
        assertThat(JsonPath.<List<Boolean>>read(back, "$.items[*].done")).containsExactly(false, true);
        assertThat(JsonPath.<String>read(back, "$.version")).isNotEqualTo(version);
        jdbc.sql("update checklist_items set done_at = now() - interval '28 days' where done_at is not null")
                .update();
        assertThat(lists.bringBackRepeating()).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(fetch("/v1/checklists/" + list, nora), "$.left"))
                .isEqualTo(2);

        // A line that no longer repeats is cleared like any other.
        change(nora, milk, "{\"stopRepeating\":true,\"done\":true}", 200);
        assertThat(lines(list, nora)).containsExactly("Milk, 2 litres", "Pay the cleaner");
        send(HttpMethod.DELETE, "/v1/checklists/" + list + "/done", nora, null, 200);
        assertThat(lines(list, nora)).containsExactly("Pay the cleaner");
        change(nora, rent, "{\"repeats\":\"daily\"}", 400);
    }

    @Test
    void aShoppingListFindsTheAisleAndOffersWhatItHeldBefore() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String list = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Groceries\",\"aisles\":true,\"items\":[\"Butter\",\"Dog food for Biscuit\",\"Bananas\",\"Bread\"]}"
                                .formatted(id(), circle),
                        201),
                "$.id");

        // Each line found its aisle, and the aisles stand in the order of a shop, whatever was typed first.
        String now = fetch("/v1/checklists/" + list, nora);
        assertThat(JsonPath.<Boolean>read(now, "$.aisles")).isTrue();
        assertThat(titles(now, "$.items[*].section")).containsExactly("Fridge", "Other", "Fruit and veg", "Bakery");
        assertThat(titles(now, "$.sections[*].name")).containsExactly("Fruit and veg", "Bakery", "Fridge", "Other");
        assertThat(JsonPath.<List<Object>>read(now, "$.suggestions")).isEmpty();
        String bread = JsonPath.read(now, "$.items[3].id");
        String butter = JsonPath.read(now, "$.items[0].id");

        // Someone moves the bread under a heading of their own; then bread and butter are bought and gone.
        change(nora, bread, "{\"section\":\"Corner bakery\"}", 200);
        change(nora, bread, "{\"done\":true}", 200);
        send(HttpMethod.DELETE, "/v1/checklist-items/" + butter, nora, null, 204);
        String after = send(HttpMethod.DELETE, "/v1/checklists/" + list + "/done", nora, null, 200);
        assertThat(titles(after, "$.suggestions[*].text")).containsExactly("Bread", "Butter");
        assertThat(titles(after, "$.suggestions[*].section")).containsExactly("Corner bakery", "Fridge");

        // One tap adds it again, and it goes where it went last time without being told.
        line(nora, list, "bread", "");
        String again = fetch("/v1/checklists/" + list, nora);
        assertThat(JsonPath.<String>read(again, "$.items[2].section")).isEqualTo("Corner bakery");
        assertThat(titles(again, "$.suggestions[*].text")).containsExactly("Butter");
        assertThat(titles(again, "$.sections[*].name")).containsExactly("Fruit and veg", "Corner bakery", "Other");

        // A list that isn't a shopping list leaves a line under no heading until someone gives it one.
        String packing = list(nora, circle, null, "Packing", null, "Bananas");
        assertThat(titles(fetch("/v1/checklists/" + packing, nora), "$.items[*].section"))
                .containsExactly("");
        String turned = send(HttpMethod.PATCH, "/v1/checklists/" + packing, nora, "{\"aisles\":true}", 200);
        assertThat(JsonPath.<Boolean>read(turned, "$.aisles")).isTrue();
        line(nora, packing, "Apples", "");
        assertThat(titles(fetch("/v1/checklists/" + packing, nora), "$.items[*].section"))
                .containsExactly("", "Fruit and veg");
    }

    @Test
    void showingTickedLinesIsEachPersonsOwnChoice() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String list = list(nora, circle, null, "Groceries", null, "Milk");
        shareWith(nora, list, alexId, "view");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/checklists/" + list, alex), "$.showTicked"))
                .isTrue();

        // Alex may only look at the list, and how he looks at it is still his to choose.
        String his = send(HttpMethod.PUT, "/v1/checklists/" + list + "/look", alex, "{\"showTicked\":false}", 200);

        assertThat(JsonPath.<Boolean>read(his, "$.showTicked")).isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/checklists/" + list, nora), "$.showTicked"))
                .isTrue();
        // The lines all still come: hiding them is the app's to do, so a tick can be taken back.
        assertThat(lines(list, alex)).containsExactly("Milk");
        send(HttpMethod.PUT, "/v1/checklists/" + list + "/look", alex, "{}", 400);
        send(HttpMethod.PUT, "/v1/checklists/" + list + "/look", person("Stranger"), "{\"showTicked\":false}", 404);
    }

    @Test
    void askingAgainForAListThatDidNotChangeGetsAShortNo() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String list = list(nora, circle, null, "Groceries", null, "Milk", "Bread");
        String milk = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[0].id");
        String path = "/v1/checklists/" + list;
        String version = JsonPath.read(fetch(path, nora), "$.version");

        // Nora has the list open; her phone asks again every few seconds.
        MvcResult same = again(path, nora, version);
        assertThat(same.getResponse().getStatus()).isEqualTo(304);
        assertThat(same.getResponse().getContentAsString()).isEmpty();
        assertThat(same.getResponse().getHeader("ETag")).isEqualTo("\"" + version + "\"");
        assertThat(again(path, nora, version).getResponse().getStatus()).isEqualTo(304);

        // Alex ticks the milk in the shop: the next time she asks, she gets the list.
        change(alex, milk, "{\"done\":true}", 200);
        MvcResult changed = again(path, nora, version);
        assertThat(changed.getResponse().getStatus()).isEqualTo(200);
        String body = changed.getResponse().getContentAsString();
        assertThat(JsonPath.<Boolean>read(body, "$.items[0].done")).isTrue();
        String second = JsonPath.read(body, "$.version");
        assertThat(again(path, nora, second).getResponse().getStatus()).isEqualTo(304);

        // So does a new name, who may see it, and Alex no longer being there.
        send(HttpMethod.PATCH, path, alex, "{\"title\":\"Shopping\"}", 200);
        assertThat(again(path, nora, second).getResponse().getStatus()).isEqualTo(200);
        String third = JsonPath.read(fetch(path, nora), "$.version");
        audience(nora, list, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        assertThat(again(path, nora, third).getResponse().getStatus()).isEqualTo(200);
        String fourth = JsonPath.read(fetch(path, nora), "$.version");
        jdbc.sql("update checklist_people set did_at = now() - interval '11 minutes'")
                .update();
        assertThat(again(path, nora, fourth).getResponse().getStatus()).isEqualTo(200);

        // How Alex looks at it is his own business: it changes his answer, not hers.
        String hers = JsonPath.read(fetch(path, nora), "$.version");
        send(HttpMethod.PUT, path + "/look", alex, "{\"showTicked\":false}", 200);
        assertThat(again(path, nora, hers).getResponse().getStatus()).isEqualTo(304);

        // Knowing a version is no way in.
        assertThat(again(path, stranger, hers).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void changesThatWaitedOnAPhoneGoInOneByOneAndALateOneDoesNotStopTheRest() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String list = list(nora, circle, null, "Groceries", null, "Bananas", "Red onions", "Strawberries");
        List<String> ids = JsonPath.read(fetch("/v1/checklists/" + list, nora), "$.items[*].id");
        String other = list(nora, circle, null, "Packing", null, "Passports");
        String passports = JsonPath.read(fetch("/v1/checklists/" + other, nora), "$.items[0].id");

        // Alex is in a shop with no signal, ticking. Meanwhile, at home, Nora ticks the bananas herself and
        // takes the strawberries off the list.
        change(nora, ids.get(0), "{\"done\":true}", 200);
        send(HttpMethod.DELETE, "/v1/checklist-items/" + ids.get(2), nora, null, 204);

        String queue = """
            {"changes":[
              {"op":"change","itemId":"%1$s","change":{"done":true}},
              {"op":"change","itemId":"%2$s","change":{"done":true}},
              {"op":"add","add":{"clientId":"%3$s","text":"Eggs"}},
              {"op":"remove","itemId":"%4$s"},
              {"op":"change","itemId":"%5$s","change":{"done":true}},
              {"op":"add","add":{"clientId":"%6$s","text":"  "}},
              {"op":"remove","itemId":"%2$s"}
            ]}
            """.formatted(ids.get(0), ids.get(2), id(), ids.get(1), passports, id());
        String answer = send(HttpMethod.POST, "/v1/checklists/" + list + "/changes", alex, queue, 200);

        assertThat(titles(answer, "$.answers[*].outcome"))
                .containsExactly("done", "gone", "done", "done", "gone", "refused", "done");
        assertThat(JsonPath.<String>read(answer, "$.answers[1].said")).contains("removed while you were away");
        assertThat(JsonPath.<String>read(answer, "$.answers[5].said")).isNotBlank();
        assertThat(titles(answer, "$.list.items[*].text")).containsExactly("Bananas", "Eggs");
        // The bananas stay ticked by whoever ticked them first.
        assertThat(JsonPath.<String>read(answer, "$.list.items[0].doneBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/checklists/" + other, nora), "$.items[0].done"))
                .isFalse();

        // His phone didn't hear the answer and sends it all again. Nothing is added or changed twice.
        String again = send(HttpMethod.POST, "/v1/checklists/" + list + "/changes", alex, queue, 200);
        assertThat(titles(again, "$.answers[*].outcome"))
                .containsExactly("done", "gone", "done", "done", "gone", "refused", "done");
        assertThat(titles(again, "$.list.items[*].text")).containsExactly("Bananas", "Eggs");

        // Not his list to change, or not there for him: refused as a whole, with nothing done.
        audience(nora, list, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        send(HttpMethod.POST, "/v1/checklists/" + list + "/changes", alex, queue, 403);
        send(HttpMethod.POST, "/v1/checklists/" + list + "/changes", person("Stranger"), queue, 404);
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/changes",
                nora,
                "{\"changes\":[{\"itemId\":\"%s\"}]}".formatted(ids.get(0)),
                400);
    }

    @Test
    void aPhoneCanTickALineItAddedWithoutSignal() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String list = list(nora, circle, null, "Groceries", null, "Milk");
        String eggs = id();
        String flour = id();

        // In the shop with no signal: two lines added, one of them ticked, the other moved up and then taken
        // off again. The phone knows its new lines only by the ids it gave them itself.
        String queue = """
            {"changes":[
              {"op":"add","add":{"clientId":"%1$s","text":"Eggs"}},
              {"op":"add","add":{"clientId":"%2$s","text":"Flour"}},
              {"op":"change","itemId":"%1$s","change":{"done":true}},
              {"op":"change","itemId":"%2$s","change":{"before":"%1$s"}},
              {"op":"remove","itemId":"%2$s"},
              {"op":"change","itemId":"%2$s","change":{"done":true}}
            ]}
            """.formatted(eggs, flour);
        String answer = send(HttpMethod.POST, "/v1/checklists/" + list + "/changes", nora, queue, 200);

        assertThat(titles(answer, "$.answers[*].outcome"))
                .containsExactly("done", "done", "done", "done", "done", "gone");
        assertThat(titles(answer, "$.list.items[*].text")).containsExactly("Milk", "Eggs");
        assertThat(JsonPath.<List<Boolean>>read(answer, "$.list.items[*].done")).containsExactly(false, true);
        // The answers carry the ids the lines have from now on.
        assertThat(JsonPath.<String>read(answer, "$.answers[2].itemId"))
                .isEqualTo(JsonPath.<String>read(answer, "$.list.items[1].id"))
                .isNotEqualTo(eggs);
    }
}
