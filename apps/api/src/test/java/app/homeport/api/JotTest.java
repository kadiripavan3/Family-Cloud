package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Jot: a line is read, filed, remembered, undone and moved; a code is held back; the phone's own parts get what they show. */
class JotTest extends PlanTestBase {

    private String jot(String token, String text, String more, int expected) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/jots",
                token,
                "{\"clientId\":\"%s\",\"text\":\"%s\",\"day\":\"%s\"%s}".formatted(id(), text, TODAY, more),
                expected);
    }

    private String jot(String token, String text) throws Exception {
        return jot(token, text, "", 201);
    }

    private String list(String token, String title, String... items) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"audience\":\"circle\",\"items\":[%s]}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        items.length == 0 ? "" : "\"" + String.join("\",\"", items) + "\""),
                        201),
                "$.id");
    }

    private int count(String table) {
        return jdbc.sql("select count(*) from " + table).query(Integer.class).single();
    }

    private List<String> lines(String token, String listId) throws Exception {
        return JsonPath.read(fetch("/v1/checklists/" + listId, token), "$.items[*].text");
    }

    @Test
    void aLineIsReadWithoutSavingAnythingAndSaysHowItWasRead() throws Exception {
        theLinds();
        event(nora, "Haircut · Leo", "2026-10-03", "10:00", ",\"place\":\"Barber Miha\"");
        int things = count("things");

        String reading = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/read",
                nora,
                "{\"text\":\"Haircut for Leo Saturday at 10, remind me an hour before\",\"day\":\"%s\",\"timeZone\":\"%s\"}"
                        .formatted(TODAY, ZONE),
                200);

        assertThat(JsonPath.<Integer>read(reading, "$.items.length()")).isEqualTo(1);
        assertThat(JsonPath.<String>read(reading, "$.items[0].as")).isEqualTo("event");
        assertThat(JsonPath.<String>read(reading, "$.items[0].title")).isEqualTo("Haircut");
        assertThat(JsonPath.<String>read(reading, "$.items[0].day")).isEqualTo("2026-11-14");
        assertThat(JsonPath.<String>read(reading, "$.items[0].time")).isEqualTo("10:00");
        assertThat(JsonPath.<String>read(reading, "$.items[0].whenLabel")).isEqualTo("Sat 14 Nov · 10:00 to 10:30");
        assertThat(JsonPath.<String>read(reading, "$.items[0].person.memberId")).isEqualTo(leoId);
        assertThat(JsonPath.<String>read(reading, "$.items[0].personRole")).isEqualTo("for");
        assertThat(JsonPath.<String>read(reading, "$.items[0].personLabel")).isEqualTo("For Leo");
        assertThat(JsonPath.<String>read(reading, "$.items[0].remindLabel")).isEqualTo("1 hour before");
        assertThat(JsonPath.<String>read(reading, "$.items[0].place.label"))
                .as("where the last haircut was")
                .isEqualTo("Barber Miha, from last time");
        assertThat(JsonPath.<List<String>>read(reading, "$.items[0].pieces[*].what"))
                .containsExactly("person", "day", "time", "remind");
        assertThat(JsonPath.<List<String>>read(reading, "$.items[0].pieces[*].became"))
                .containsExactly("For Leo", "Sat 14 Nov", "10:00", "1 hour before");
        assertThat(count("things")).as("reading files nothing").isEqualTo(things);
        assertThat(count("jots")).isZero();

        // Shopping says where it would go; a code says what it looks like; a letter gives back its days.
        String more = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/read",
                nora,
                "{\"text\":\"2x oat milk, and the gate code is 4471\",\"day\":\"%s\"}".formatted(TODAY),
                200);
        assertThat(JsonPath.<String>read(more, "$.items[0].list.title")).isEqualTo("Groceries");
        assertThat(JsonPath.<Object>read(more, "$.items[0].list.id"))
                .as("no shopping list yet: one will be made")
                .isNull();
        assertThat(JsonPath.<String>read(more, "$.items[0].quantity")).isEqualTo("2");
        assertThat(JsonPath.<String>read(more, "$.items[1].as")).isEqualTo("code");
        assertThat(JsonPath.<String>read(more, "$.items[1].code")).isEqualTo("code");
        String letter = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/read",
                nora,
                ("{\"text\":\"Class 4B is going to the Postojna caves on Friday 20 November at 8:00. The bus leaves from the school gate"
                                + " and we will be back by four. Please sign the attached form and return it by Wed 18 Nov."
                                + " The trip costs €12, to be paid to the school together with the form. Children should bring a warm"
                                + " jacket, good shoes and a snack.\",\"day\":\"%s\"}")
                        .formatted(TODAY),
                200);
        assertThat(JsonPath.<Boolean>read(letter, "$.letter")).isTrue();
        assertThat(JsonPath.<List<String>>read(letter, "$.dates[*].day")).containsExactly("2026-11-20", "2026-11-18");
        assertThat(JsonPath.<String>read(letter, "$.dates[0].time")).isEqualTo("08:00");
        assertThat(JsonPath.<List<Boolean>>read(letter, "$.dates[*].deadline")).containsExactly(false, true);
        assertThat(JsonPath.<Integer>read(letter, "$.amounts[0].cents")).isEqualTo(1200);
        send(HttpMethod.POST, "/v1/circles/" + circle + "/read", nora, "{\"text\":\" \"}", 400);
    }

    @Test
    void aJotFilesEverythingInTheLineAndSendingItTwiceFilesItOnce() throws Exception {
        theLinds();
        String body =
                "{\"clientId\":\"%s\",\"text\":\"dentist for Mia Tuesday at 3, buy plasters, and remind Alex about the bins\",\"day\":\"%s\",\"timeZone\":\"%s\",\"source\":\"voice\"}"
                        .formatted(id(), TODAY, ZONE);

        String first = send(HttpMethod.POST, "/v1/circles/" + circle + "/jots", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/circles/" + circle + "/jots", nora, body, 201);

        assertThat(JsonPath.<List<String>>read(second, "$[*].id"))
                .isEqualTo(JsonPath.<List<String>>read(first, "$[*].id"));
        assertThat(count("jots")).isEqualTo(3);
        assertThat(count("events")).isEqualTo(1);
        assertThat(count("reminders")).isEqualTo(1);
        assertThat(count("checklist_items")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(first, "$[*].became")).containsExactly("event", "list_item", "reminder");
        assertThat(JsonPath.<List<String>>read(first, "$[*].title"))
                .containsExactly("Dentist · Mia", "Plasters", "The bins");
        assertThat(JsonPath.<List<String>>read(first, "$[*].where"))
                .containsExactly("Event · Tue 17 Nov, 15:00", "Groceries", "Asked Alex");
        assertThat(JsonPath.<List<String>>read(first, "$[*].source")).containsOnly("voice");
        assertThat(JsonPath.<List<String>>read(first, "$[*].words"))
                .containsExactly("dentist for Mia Tuesday at 3", "plasters", "remind Alex about the bins");

        // The event: on Tuesday, half an hour, with Mia on it and on her page.
        String event = fetch("/v1/events/" + JsonPath.<String>read(first, "$[0].thingId"), nora);
        assertThat(JsonPath.<String>read(event, "$.day")).isEqualTo("2026-11-17");
        assertThat(JsonPath.<String>read(event, "$.endTime")).isEqualTo("15:30");
        assertThat(JsonPath.<String>read(event, "$.timeZone")).isEqualTo(ZONE);
        assertThat(JsonPath.<List<String>>read(event, "$.guests[*].name")).containsExactly("Mia");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/members/" + miaId, nora), "$.kept[*].title"))
                .containsExactly("Dentist · Mia");
        // The reminder is Alex's, and he sees it although Nora's things start as hers alone.
        String his = fetch("/v1/circles/" + circle + "/reminders?day=" + TODAY, alex);
        assertThat(JsonPath.<List<String>>read(his, "$.yours[*].reminders[*].title"))
                .containsExactly("The bins");
        // The shopping list was made for the circle, with the line on it.
        String groceries = JsonPath.read(first, "$[1].thingId");
        assertThat(lines(alex, groceries)).containsExactly("Plasters");
        assertThat(JsonPath.<String>read(fetch("/v1/checklists/" + groceries, alex), "$.title"))
                .isEqualTo("Groceries");
        assertThat(JsonPath.<String>read(first, "$[1].thingKind")).isEqualTo("checklist");

        // A second line of shopping goes to the same list, with how many.
        jot(alex, "2x oat milk and eggs");
        assertThat(lines(nora, groceries)).containsExactly("Plasters", "Oat milk", "Eggs");
        assertThat(JsonPath.<String>read(fetch("/v1/checklists/" + groceries, nora), "$.items[1].note"))
                .isEqualTo("×2");
        assertThat(count("checklists")).isEqualTo(1);
        // Without words there is nothing to jot.
        jot(nora, " ", "", 400);
    }

    @Test
    void whatReadsLikeANoteBecomesAPageAndATimedLineWhatThePersonChose() throws Exception {
        theLinds();
        String note = jot(nora, "Mia needs €5 for the class photo");
        assertThat(JsonPath.<String>read(note, "$[0].became")).isEqualTo("note");
        assertThat(JsonPath.<String>read(note, "$[0].where")).isEqualTo("Note");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/pages/" + JsonPath.<String>read(note, "$[0].thingId"), nora), "$.title"))
                .isEqualTo("Mia needs €5 for the class photo");

        // "A day or a time" is a reminder until the person says they want events.
        assertThat(JsonPath.<String>read(jot(nora, "Passport photos Friday"), "$[0].where"))
                .isEqualTo("Reminder · Fri 13 Nov");
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/jot-ways", nora, "{\"timedAs\":\"event\"}", 200);
        assertThat(JsonPath.<String>read(jot(nora, "Passport photos Friday"), "$[0].where"))
                .isEqualTo("Event · Fri 13 Nov");
        assertThat(JsonPath.<String>read(jot(nora, "Call the plumber tomorrow at 9"), "$[0].where"))
                .as("something to do is a reminder whatever was chosen")
                .isEqualTo("Reminder · tomorrow 9:00");

        // Something far too long for a line is kept whole, as one note.
        String longText = "The plumber said the boiler needs a new valve and that he can come back next week. "
                .repeat(5)
                .strip();
        String kept = jot(nora, longText);
        assertThat(JsonPath.<Integer>read(kept, "$.length()")).isEqualTo(1);
        String page = fetch("/v1/pages/" + JsonPath.<String>read(kept, "$[0].thingId"), nora);
        assertThat(JsonPath.<String>read(page, "$.title"))
                .hasSizeLessThanOrEqualTo(80)
                .endsWith("…");
        assertThat(JsonPath.<String>read(page, "$.body")).isEqualTo(longText);
    }

    @Test
    void somethingToBuyGoesToTheListThePersonChoseElseTheCirclesElseANewOne() throws Exception {
        theLinds();
        String weekly = list(alex, "Weekly shop", "Bananas");
        String packing = list(nora, "Packing list");

        // The circle marks a list as its shopping list: shopping lands there, for both of them.
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/shopping-list",
                alex,
                "{\"listId\":\"%s\"}".formatted(weekly),
                200);
        assertThat(JsonPath.<String>read(jot(nora, "milk"), "$[0].where")).isEqualTo("Weekly shop");
        jot(alex, "bread");
        assertThat(lines(nora, weekly)).containsExactly("Bananas", "Milk", "Bread");
        String ways = fetch("/v1/circles/" + circle + "/jot-ways", nora);
        assertThat(JsonPath.<String>read(ways, "$.buyList.id")).isEqualTo(weekly);
        assertThat(JsonPath.<Boolean>read(ways, "$.buyListIsYours")).isFalse();

        // Nora chooses a list of her own for her shopping; Alex's still goes to the circle's.
        String hers = list(nora, "Nora's market list");
        String chosen = send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/jot-ways",
                nora,
                "{\"buyListId\":\"%s\"}".formatted(hers),
                200);
        assertThat(JsonPath.<Boolean>read(chosen, "$.buyListIsYours")).isTrue();
        jot(nora, "eggs");
        jot(alex, "coffee");
        assertThat(lines(nora, hers)).containsExactly("Eggs");
        assertThat(lines(nora, weekly)).containsExactly("Bananas", "Milk", "Bread", "Coffee");
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/jot-ways", nora, "{\"useCirclesList\":true}", 200);
        assertThat(JsonPath.<String>read(jot(nora, "butter"), "$[0].where")).isEqualTo("Weekly shop");

        // A line for a named list goes to that list; a list nobody has is not made up: the words are kept as a note.
        assertThat(JsonPath.<String>read(jot(nora, "put sun cream on the packing list"), "$[0].where"))
                .isEqualTo("Packing list");
        assertThat(lines(nora, packing)).containsExactly("Sun cream");
        String unknown = jot(nora, "add skis to the winter list");
        assertThat(JsonPath.<String>read(unknown, "$[0].became")).isEqualTo("note");
        assertThat(JsonPath.<String>read(unknown, "$[0].title")).isEqualTo("Add skis to the winter list");

        // When Alex takes the circle's list for himself, Nora's shopping gets a list of her own instead of failing.
        share(alex, weekly, "{\"audience\":\"me\"}");
        String own = jot(nora, "flour");
        assertThat(JsonPath.<String>read(own, "$[0].where")).isEqualTo("Groceries");
        assertThat(JsonPath.<String>read(own, "$[0].thingId")).isNotEqualTo(weekly);
        assertThat(lines(alex, weekly)).doesNotContain("Flour");

        // Only a list of this circle that you may change can be the shopping list or your own choice.
        String elsewhere = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Other\"}"
                                .formatted(id(), circle(nora, "solo", "Just me")),
                        201),
                "$.id");
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/shopping-list",
                nora,
                "{\"listId\":\"%s\"}".formatted(elsewhere),
                400);
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/shopping-list",
                nora,
                "{\"listId\":\"%s\"}".formatted(weekly),
                404);
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/jot-ways",
                nora,
                "{\"buyListId\":\"%s\"}".formatted(elsewhere),
                400);
    }

    @Test
    void aCodeIsHeldBackAndKeptOnlyUntilThePersonSaysWhatToDoWithIt() throws Exception {
        theLinds();
        int pages = count("pages");

        String made = jot(nora, "Milk, and the gate code is 4471");

        assertThat(JsonPath.<List<String>>read(made, "$[*].became")).containsExactly("list_item", "code");
        assertThat(JsonPath.<String>read(made, "$[1].title")).isEqualTo("Gate code 4471");
        assertThat(JsonPath.<String>read(made, "$[1].where")).isEqualTo("Looks like a code");
        assertThat(JsonPath.<Object>read(made, "$[1].thingId"))
                .as("it hasn't been kept anywhere")
                .isNull();
        assertThat(count("pages")).isEqualTo(pages);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=4471", nora)).doesNotContain("Gate");
        String held = JsonPath.read(made, "$[1].id");

        // "Keep in the Vault": the phone keeps it there itself, then the jot and its words are gone from here.
        send(HttpMethod.DELETE, "/v1/jots/" + held, nora, null, 204);
        assertThat(jdbc.sql("select count(*) from jots where words like '%4471%'")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(count("pages")).isEqualTo(pages);

        // "It's just a note": it becomes a page like any other.
        String again = JsonPath.read(jot(nora, "PIN 4471"), "$[0].id");
        String moved = send(HttpMethod.PUT, "/v1/jots/" + again + "/move", nora, "{\"to\":\"note\"}", 200);
        assertThat(JsonPath.<String>read(moved, "$.became")).isEqualTo("note");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/pages/" + JsonPath.<String>read(moved, "$.thingId"), nora), "$.title"))
                .isEqualTo("PIN 4471");

        // Someone who chose "a note" for codes isn't asked.
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/jot-ways", nora, "{\"codes\":\"note\"}", 200);
        assertThat(JsonPath.<String>read(jot(nora, "door code 2580"), "$[0].became"))
                .isEqualTo("note");
        // A code can't be moved "to a code".
        send(HttpMethod.PUT, "/v1/jots/" + again + "/move", nora, "{\"to\":\"code\"}", 400);
    }

    @Test
    void everyJotCanBeUndoneAndMovedAndOnlyByWhoeverJottedIt() throws Exception {
        theLinds();
        String packing = list(nora, "Packing list");
        String made = jot(nora, "Dentist tomorrow at 3, eggs, call the plumber");
        String eventJot = JsonPath.read(made, "$[0].id");
        String eventId = JsonPath.read(made, "$[0].thingId");
        String eggsJot = JsonPath.read(made, "$[1].id");
        String groceries = JsonPath.read(made, "$[1].thingId");
        String plumberJot = JsonPath.read(made, "$[2].id");

        // Alex can do nothing with Nora's jots, and doesn't see them.
        send(HttpMethod.PUT, "/v1/jots/" + eggsJot + "/move", alex, "{\"to\":\"note\"}", 404);
        send(HttpMethod.DELETE, "/v1/jots/" + eventJot, alex, null, 204);
        assertThat(status("/v1/events/" + eventId, nora)).as("still there").isEqualTo(200);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/jots", alex), "$.items"))
                .isEmpty();

        // Undo: what it made is gone, and so is the jot. Twice is fine.
        send(HttpMethod.DELETE, "/v1/jots/" + eventJot, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/jots/" + eventJot, nora, null, 204);
        assertThat(status("/v1/events/" + eventId, nora)).isEqualTo(404);

        // Move the eggs to another list, then make them a reminder, then a note. Each time the old one goes.
        String toPacking = send(
                HttpMethod.PUT,
                "/v1/jots/" + eggsJot + "/move",
                nora,
                "{\"to\":\"list_item\",\"listId\":\"%s\"}".formatted(packing),
                200);
        assertThat(JsonPath.<String>read(toPacking, "$.where")).isEqualTo("Packing list");
        assertThat(lines(nora, groceries)).isEmpty();
        assertThat(lines(nora, packing)).containsExactly("Eggs");
        String same = send(
                HttpMethod.PUT,
                "/v1/jots/" + eggsJot + "/move",
                nora,
                "{\"to\":\"list_item\",\"listId\":\"%s\"}".formatted(packing),
                200);
        assertThat(JsonPath.<String>read(same, "$.itemId"))
                .as("moved twice: moved once")
                .isEqualTo(JsonPath.<String>read(toPacking, "$.itemId"));
        assertThat(lines(nora, packing)).containsExactly("Eggs");
        String asReminder = send(
                HttpMethod.PUT,
                "/v1/jots/" + eggsJot + "/move",
                nora,
                "{\"to\":\"reminder\",\"day\":\"%s\"}".formatted(TODAY),
                200);
        assertThat(JsonPath.<String>read(asReminder, "$.where")).isEqualTo("Reminder");
        assertThat(lines(nora, packing)).isEmpty();
        assertThat(JsonPath.<String>read(
                        fetch("/v1/reminders/" + JsonPath.<String>read(asReminder, "$.thingId"), nora), "$.title"))
                .isEqualTo("Eggs");
        String asNote = send(HttpMethod.PUT, "/v1/jots/" + eggsJot + "/move", nora, "{\"to\":\"note\"}", 200);
        assertThat(count("reminders")).as("only the plumber is left").isEqualTo(1);
        assertThat(JsonPath.<String>read(asNote, "$.thingKind")).isEqualTo("page");

        // A reminder moved to an event keeps the day that was in its words.
        String onDay = JsonPath.read(jot(nora, "Passport photos Friday"), "$[0].id");
        String asEvent = send(
                HttpMethod.PUT,
                "/v1/jots/" + onDay + "/move",
                nora,
                "{\"to\":\"event\",\"day\":\"%s\",\"timeZone\":\"%s\"}".formatted(TODAY, ZONE),
                200);
        assertThat(JsonPath.<String>read(asEvent, "$.where")).isEqualTo("Event · Fri 13 Nov");
        // Moved back to the shopping list, with no list named.
        String back = send(HttpMethod.PUT, "/v1/jots/" + plumberJot + "/move", nora, "{\"to\":\"list_item\"}", 200);
        assertThat(JsonPath.<String>read(back, "$.where")).isEqualTo("Groceries");
        assertThat(lines(nora, groceries)).containsExactly("Call the plumber");
        // Not to a list of another circle, or one that isn't there.
        send(
                HttpMethod.PUT,
                "/v1/jots/" + plumberJot + "/move",
                nora,
                "{\"to\":\"list_item\",\"listId\":\"%s\"}".formatted(id()),
                404);
        send(HttpMethod.PUT, "/v1/jots/" + id() + "/move", nora, "{\"to\":\"note\"}", 404);
    }

    @Test
    void whatWasJottedIsListedLatestFirstAndSaysWhenWhatItMadeIsGone() throws Exception {
        theLinds();
        String first = jot(nora, "Call the plumber tomorrow at 9");
        jot(nora, "Milk, bread");
        jot(nora, "Remind Alex about the car service at 6");
        jdbc.sql(
                        "update jots set created_at = created_at - make_interval(mins => 10 - position) where title in ('Milk', 'Bread')")
                .update();
        jdbc.sql("update jots set created_at = created_at - interval '20 minutes' where title = 'Call the plumber'")
                .update();

        String page = fetch("/v1/circles/" + circle + "/jots?day=" + TODAY + "&limit=3", nora);
        assertThat(JsonPath.<List<String>>read(page, "$.items[*].title"))
                .containsExactly("The car service", "Bread", "Milk");
        assertThat(JsonPath.<String>read(page, "$.items[0].where")).isEqualTo("Asked Alex · today 18:00");
        String next = fetch(
                "/v1/circles/" + circle + "/jots?day=" + TODAY + "&limit=3&cursor="
                        + JsonPath.<String>read(page, "$.nextCursor"),
                nora);
        assertThat(JsonPath.<List<String>>read(next, "$.items[*].title")).containsExactly("Call the plumber");
        assertThat(JsonPath.<String>read(next, "$.items[0].where")).isEqualTo("Reminder · tomorrow 9:00");
        assertThat(JsonPath.<Boolean>read(next, "$.items[0].gone")).isFalse();
        // Tomorrow the same jot says "today".
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/jots?day=2026-11-12&limit=50", nora), "$.items[3].where"))
                .isEqualTo("Reminder · today 9:00");

        // The reminder is deleted in the app, the milk is ticked and cleared: the jots stay and say so.
        send(HttpMethod.DELETE, "/v1/things/" + JsonPath.<String>read(first, "$[0].thingId"), nora, null, 204);
        String groceries = JsonPath.read(page, "$.items[2].thingId");
        send(
                HttpMethod.PATCH,
                "/v1/checklist-items/" + JsonPath.<String>read(page, "$.items[2].itemId"),
                nora,
                "{\"done\":true}",
                200);
        send(HttpMethod.DELETE, "/v1/checklists/" + groceries + "/done", nora, null, 200);
        String after = fetch("/v1/circles/" + circle + "/jots?day=" + TODAY, nora);
        assertThat(JsonPath.<List<Boolean>>read(after, "$.items[*].gone")).containsExactly(false, false, true, true);
        assertThat(JsonPath.<String>read(after, "$.items[3].where")).isEqualTo("Not there any more");
        // Undoing a jot whose thing is gone only forgets the jot.
        send(HttpMethod.DELETE, "/v1/jots/" + JsonPath.<String>read(after, "$.items[3].id"), nora, null, 204);
        send(HttpMethod.DELETE, "/v1/jots/" + JsonPath.<String>read(after, "$.items[2].id"), nora, null, 204);
        assertThat(count("jots")).isEqualTo(2);
    }

    @Test
    void theWaysInAreKeptPerPersonAndKeepWhatIsLeftOut() throws Exception {
        theLinds();
        String fresh = fetch("/v1/circles/" + circle + "/jot-ways", nora);
        assertThat(JsonPath.<Boolean>read(fresh, "$.pinnedNote"))
                .as("a pinned notification is asked for, not assumed")
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fresh, "$.voice")).isTrue();
        assertThat(JsonPath.<String>read(fresh, "$.timedAs")).isEqualTo("reminder");
        assertThat(JsonPath.<String>read(fresh, "$.codes")).isEqualTo("ask");
        assertThat(JsonPath.<String>read(fresh, "$.buyList.title")).isEqualTo("Groceries");
        assertThat(JsonPath.<Object>read(fresh, "$.forwardAddress"))
                .as("receiving email isn't connected yet")
                .isNull();

        send(HttpMethod.PUT, "/v1/circles/" + circle + "/jot-ways", nora, "{\"pinnedNote\":true,\"share\":false}", 200);
        String changed =
                send(HttpMethod.PUT, "/v1/circles/" + circle + "/jot-ways", nora, "{\"codes\":\"vault\"}", 200);

        assertThat(JsonPath.<Boolean>read(changed, "$.pinnedNote")).isTrue();
        assertThat(JsonPath.<Boolean>read(changed, "$.share")).isFalse();
        assertThat(JsonPath.<Boolean>read(changed, "$.voice")).isTrue();
        assertThat(JsonPath.<String>read(changed, "$.codes")).isEqualTo("vault");
        // The switches are the person's, in every circle; Alex has his own.
        String other = circle(nora, "solo", "Just me");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/circles/" + other + "/jot-ways", nora), "$.pinnedNote"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/circles/" + circle + "/jot-ways", alex), "$.pinnedNote"))
                .isFalse();
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/jot-ways", nora, "{\"timedAs\":\"sometimes\"}", 400);
        // With "the Vault" chosen a code is still held back here: only the phone can put it in the Vault.
        assertThat(JsonPath.<String>read(jot(nora, "Gate code 4471"), "$[0].became"))
                .isEqualTo("code");
    }

    @Test
    void theWidgetsGetTheChipsTheShoppingListTheListInUseAndWhatIsNext() throws Exception {
        theLinds();
        for (String line : List.of("Milk", "Eggs", "milk", "Bread", "Milk", "eggs", "Coffee and oat milk")) {
            jot(nora, line, ",\"source\":\"widget\"", 201);
        }
        String groceries = JsonPath.read(fetch("/v1/circles/" + circle + "/jot-ways", nora), "$.buyList.id");
        String firstLine = JsonPath.read(fetch("/v1/checklists/" + groceries, nora), "$.items[0].id");
        send(HttpMethod.PATCH, "/v1/checklist-items/" + firstLine, alex, "{\"done\":true}", 200);
        event(nora, "Dentist · Mia", TODAY, "15:30", ",\"audience\":\"circle\"");
        reminder(nora, "Take the bins out", ",\"dueOn\":\"%s\",\"dueTime\":\"19:00\"".formatted(TODAY));
        event(nora, "Swimming", TODAY, "20:00", "");
        event(nora, "Late film", TODAY, "22:00", "");
        String private1 = list(nora, "Gift ideas", "Skates");
        share(nora, private1, "{\"audience\":\"me\"}");

        String widgets = fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, nora);

        // What is added most, most often first, as it was last written.
        assertThat(JsonPath.<List<String>>read(widgets, "$.chips"))
                .containsExactly("Milk", "Eggs", "Coffee", "Oat milk", "Bread");
        assertThat(JsonPath.<String>read(widgets, "$.shopping.title")).isEqualTo("Groceries");
        assertThat(JsonPath.<Integer>read(widgets, "$.shopping.left")).isEqualTo(7);
        assertThat(JsonPath.<Integer>read(widgets, "$.shopping.done")).isEqualTo(1);
        assertThat(JsonPath.<List<Boolean>>read(widgets, "$.shopping.lines[*].done"))
                .as("what is left comes first")
                .hasSize(6)
                .containsOnly(false);
        assertThat(JsonPath.<Object>read(widgets, "$.inUse")).isNull();
        assertThat(JsonPath.<List<String>>read(widgets, "$.next[*].title"))
                .containsExactly("Dentist · Mia", "Take the bins out", "Swimming");
        assertThat(JsonPath.<List<String>>read(widgets, "$.next[*].lead")).containsExactly("15:30", "19:00", "20:00");
        assertThat(JsonPath.<Integer>read(widgets, "$.addedToday")).isGreaterThanOrEqualTo(0);
        assertThat(count("jots")).isEqualTo(8);

        // Alex is at the shop and says so: both Lock Screens show the list he is using.
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/list-in-use",
                alex,
                "{\"listId\":\"%s\"}".formatted(groceries),
                204);
        String forNora = fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(forNora, "$.inUse.by.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Boolean>read(forNora, "$.inUse.you")).isFalse();
        assertThat(JsonPath.<String>read(forNora, "$.inUse.list.title")).isEqualTo("Groceries");
        assertThat(JsonPath.<Boolean>read(
                        fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, alex), "$.inUse.you"))
                .isTrue();
        // A list only Nora sees doesn't show on Alex's Lock Screen when she uses it; her own use comes first for her.
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/list-in-use",
                nora,
                "{\"listId\":\"%s\"}".formatted(private1),
                204);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, nora), "$.inUse.list.title"))
                .isEqualTo("Gift ideas");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, alex), "$.inUse.list.title"))
                .isEqualTo("Groceries");
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/list-in-use",
                alex,
                "{\"listId\":\"%s\"}".formatted(private1),
                404);
        // After eight hours, or when he says he is done, it is over.
        send(HttpMethod.DELETE, "/v1/circles/" + circle + "/list-in-use", nora, null, 204);
        jdbc.sql("update jot_places set in_use_since = now() - interval '9 hours'")
                .update();
        assertThat(JsonPath.<Object>read(fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, nora), "$.inUse"))
                .isNull();
        // The chips only count lists you may see.
        share(nora, groceries, "{\"audience\":\"me\"}");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, alex), "$.chips"))
                .isEmpty();
        assertThat(JsonPath.<Object>read(fetch("/v1/circles/" + circle + "/widgets?day=" + TODAY, alex), "$.shopping"))
                .isNull();
    }
}
