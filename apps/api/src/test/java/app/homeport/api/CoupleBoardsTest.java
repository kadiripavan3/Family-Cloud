package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The couple's templates where nothing is hidden between the two (our story, the fair share), and what a
 * couple's Today is made of: the cards their boards bring, and the lists they pinned.
 */
class CoupleBoardsTest extends FunBoardTest {

    // ---------- our story ----------

    @Test
    void aStoryKeepsItsMomentsInOrderAndCountsTheDays() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String story = board(nora, circle, "our_story", null, null);
        assertThat(JsonPath.<Object>read(view(nora, story), "$.view.since")).isNull();
        assertThat(JsonPath.<List<Object>>read(today(nora, circle), "$.cards")).isEmpty();

        LocalDate met = TODAY.minusDays(4503);
        // Written out of order: the flat first, then how it began.
        add(
                alex,
                story,
                "moment",
                "{\"day\":\"%s\",\"precision\":\"month\",\"label\":\"First flat\",\"title\":\"The keys to Trubarjeva\",\"text\":\"One mattress, no curtains, a borrowed kettle.\"}"
                        .formatted(met.plusMonths(20).withDayOfMonth(1)));
        String first = add(
                nora,
                story,
                "moment",
                "{\"day\":\"%s\",\"label\":\"Piran\",\"title\":\"We met\",\"text\":\"At Jana's wedding.\",\"star\":true,\"mediaId\":\"%s\"}"
                        .formatted(met, uploadPhoto(nora)));
        add(nora, story, "photo", "{\"momentId\":\"%s\",\"mediaId\":\"%s\"}".formatted(first, uploadPhoto(nora)));

        // Both see all of it: in the order of the days, counted from the first moment.
        for (String who : List.of(nora, alex)) {
            String seen = view(who, story);
            assertThat(JsonPath.<String>read(seen, "$.view.since")).isEqualTo(met.toString());
            assertThat(JsonPath.<Integer>read(seen, "$.view.days")).isEqualTo(4503);
            assertThat(JsonPath.<List<String>>read(seen, "$.view.moments[*].title"))
                    .containsExactly("We met", "The keys to Trubarjeva");
            assertThat(JsonPath.<List<String>>read(seen, "$.view.moments[*].precision"))
                    .containsExactly("day", "month");
            assertThat(JsonPath.<List<Boolean>>read(seen, "$.view.moments[*].star"))
                    .containsExactly(true, false);
            assertThat(JsonPath.<Integer>read(seen, "$.view.moments[0].photos.length()"))
                    .isEqualTo(2);
            assertThat(JsonPath.<String>read(seen, "$.view.moments[0].addedBy.name"))
                    .isEqualTo("Nora");
            assertThat(glance(who, story)).isEqualTo("4,503 days · 2 moments");
            assertThat(fetch("/v1/circles/" + circle + "/search?q=borrowed kettle", who))
                    .contains(story);
        }
        // Today: the count of days, since what it began with, over its first photo.
        String card = today(alex, circle);
        assertThat(JsonPath.<String>read(card, "$.cards[0].figure")).isEqualTo("4,503 days");
        assertThat(JsonPath.<String>read(card, "$.cards[0].title")).isEqualTo("Our story");
        assertThat(JsonPath.<String>read(card, "$.cards[0].line")).startsWith("Since ");
        assertThat(JsonPath.<String>read(card, "$.cards[0].imageUrl")).contains("/media/photos");
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + story,
                nora,
                "{\"settings\":{\"sinceWords\":\"a wedding in Piran\"}}",
                200);
        assertThat(JsonPath.<String>read(today(nora, circle), "$.cards[0].line"))
                .isEqualTo("Since a wedding in Piran");
        // The count can start from a day of its own.
        String counted = send(
                HttpMethod.PATCH,
                "/v1/boards/" + story,
                nora,
                "{\"settings\":{\"since\":\"%s\"}}".formatted(TODAY.minusDays(100)),
                200);
        assertThat(JsonPath.<Integer>read(counted, "$.view.days")).isEqualTo(100);
        assertThat(JsonPath.<String>read(counted, "$.settings.sinceWords")).isEqualTo("a wedding in Piran");

        // A moment moves when its day is put right; nothing happens tomorrow.
        change(alex, first, "{\"day\":\"%s\"}".formatted(met.plusYears(5)), 200);
        assertThat(JsonPath.<List<String>>read(view(nora, story), "$.view.moments[*].title"))
                .containsExactly("The keys to Trubarjeva", "We met");
        add(nora, story, "moment", "{\"day\":\"%s\",\"title\":\"Tomorrow\"}".formatted(TODAY.plusDays(1)), 400);
        add(nora, story, "moment", "{\"day\":\"%s\"}".formatted(TODAY), 400);
        add(
                nora,
                story,
                "moment",
                "{\"day\":\"%s\",\"title\":\"A decade\",\"precision\":\"decade\"}".formatted(TODAY),
                400);
        add(nora, story, "photo", "{\"momentId\":\"%s\"}".formatted(first), 400);
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + story,
                nora,
                "{\"settings\":{\"since\":\"%s\"}}".formatted(TODAY.plusDays(1)),
                400);
    }

    // ---------- the fair share ----------

    private void tick(String token, String share, String job, int hours, YearMonth month) throws Exception {
        act(token, share, "tick", "{\"jobId\":\"%s\",\"hours\":%d,\"month\":\"%s\"}".formatted(job, hours, month), 200);
    }

    @Test
    void theFairShareShowsEachOnesOwnHoursTheGapAndOneSwapWithoutAScore() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String share = board(nora, circle, "fair_share", null, null);
        YearMonth last = YearMonth.from(TODAY).minusMonths(1);
        String october = last.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);

        Map<String, String> jobs = new LinkedHashMap<>();
        for (String name : List.of(
                "Meals",
                "School things",
                "Laundry",
                "Doctor, dentist",
                "Birthdays",
                "Bedtimes",
                "Bins, repairs",
                "The car",
                "Bills",
                "Biscuit")) {
            jobs.put(name, add(nora, share, "job", "{\"name\":\"%s\"}".formatted(name)));
        }
        // Nothing ticked yet: the month shown is this one, and there is nothing to bring close.
        String empty = view(nora, share);
        assertThat(JsonPath.<String>read(empty, "$.view.month"))
                .isEqualTo(YearMonth.from(TODAY).toString());
        assertThat(JsonPath.<Boolean>read(empty, "$.view.close")).isTrue();
        assertThat(JsonPath.<Object>read(empty, "$.view.swap")).isNull();
        assertThat(act(nora, share, "suggest", "{}", 409)).contains("It is close already");

        // Each ticks their own jobs of last month, with their own guess of the hours.
        tick(nora, share, jobs.get("Meals"), 11, last);
        tick(nora, share, jobs.get("School things"), 7, last);
        tick(nora, share, jobs.get("Laundry"), 6, last);
        tick(nora, share, jobs.get("Doctor, dentist"), 4, last);
        tick(nora, share, jobs.get("Birthdays"), 3, last);
        tick(alex, share, jobs.get("Bedtimes"), 9, last);
        tick(alex, share, jobs.get("Bins, repairs"), 5, last);
        tick(alex, share, jobs.get("The car"), 4, last);
        tick(alex, share, jobs.get("Bills"), 2, last);
        tick(alex, share, jobs.get("Biscuit"), 20, last);
        tick(alex, share, jobs.get("Biscuit"), 2, last); // a second guess replaces the first

        String hers = view(nora, share);
        assertThat(JsonPath.<String>read(hers, "$.view.month")).isEqualTo(last.toString());
        assertThat(JsonPath.<String>read(hers, "$.view.monthName")).isEqualTo(october);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.people[*].person.name"))
                .containsExactly("Nora", "Alex");
        assertThat(JsonPath.<List<Integer>>read(hers, "$.view.people[*].hours")).containsExactly(31, 22);
        assertThat(JsonPath.<List<Integer>>read(hers, "$.view.people[*].percent"))
                .containsExactly(58, 42);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.people[0].jobs[*].name"))
                .containsExactly("Meals", "School things", "Laundry", "Doctor, dentist", "Birthdays");
        assertThat(JsonPath.<List<Integer>>read(hers, "$.view.people[1].jobs[*].hours"))
                .containsExactly(9, 5, 4, 2, 2);
        assertThat(JsonPath.<Integer>read(hers, "$.view.totalHours")).isEqualTo(53);
        assertThat(JsonPath.<Integer>read(hers, "$.view.gapHours")).isEqualTo(9);
        assertThat(JsonPath.<Boolean>read(hers, "$.view.close")).isFalse();
        // One swap would bring it close, said to each in their own words.
        assertThat(JsonPath.<String>read(hers, "$.view.swap.line"))
                .isEqualTo("Alex takes the school things; you take the car.");
        assertThat(JsonPath.<Integer>read(hers, "$.view.swap.gapAfter")).isEqualTo(3);
        assertThat(JsonPath.<String>read(view(alex, share), "$.view.swap.line"))
                .isEqualTo("You take the school things; Nora takes the car.");
        assertThat(glance(nora, share)).isEqualTo(october + " · you 31 h, Alex 22 h");
        // There is no score in it: nothing that adds up over months, ranks or says who is ahead.
        assertThat(JsonPath.<Map<String, Object>>read(hers, "$.view").keySet())
                .containsExactlyInAnyOrder(
                        "month",
                        "monthName",
                        "months",
                        "totalHours",
                        "people",
                        "gapHours",
                        "close",
                        "swap",
                        "offered",
                        "jobs",
                        "canTick");
        assertThat(JsonPath.<Map<String, Object>>read(hers, "$.view.people[0]").keySet())
                .containsExactlyInAnyOrder("person", "you", "hours", "percent", "jobs");

        // She suggests it; it is his to answer, not hers.
        String suggested = act(nora, share, "suggest", "{}", 200);
        String offer = JsonPath.read(suggested, "$.view.offered.id");
        assertThat(JsonPath.<Boolean>read(suggested, "$.view.offered.yours")).isTrue();
        assertThat(JsonPath.<Object>read(suggested, "$.view.offered.accepted")).isNull();
        assertThat(act(nora, share, "answer", "{\"entryId\":\"%s\",\"yes\":true}".formatted(offer), 409))
                .contains("You suggested this one");
        act(alex, share, "answer", "{\"entryId\":\"%s\"}".formatted(offer), 400);
        String answered = act(alex, share, "answer", "{\"entryId\":\"%s\",\"yes\":true}".formatted(offer), 200);
        assertThat(JsonPath.<Boolean>read(answered, "$.view.offered.accepted")).isTrue();
        assertThat(JsonPath.<String>read(answered, "$.view.offered.line"))
                .isEqualTo("You take the school things; Nora takes the car.");
        // Nothing changed by itself: last month is as each of them ticked it.
        assertThat(JsonPath.<List<Integer>>read(answered, "$.view.people[*].hours"))
                .containsExactly(31, 22);

        // This month: a tick without hours takes the guess from last time. Nobody ticks for the other: a job
        // both tick is on both sides, each with their own hours.
        act(alex, share, "tick", "{\"jobId\":\"%s\"}".formatted(jobs.get("Bedtimes")), 200);
        act(alex, share, "tick", "{\"jobId\":\"%s\",\"hours\":3}".formatted(jobs.get("Meals")), 200);
        act(nora, share, "tick", "{\"jobId\":\"%s\"}".formatted(jobs.get("Meals")), 200);
        String now = fetch("/v1/boards/" + share + "?show=" + YearMonth.from(TODAY), nora);
        assertThat(JsonPath.<List<Integer>>read(now, "$.view.people[*].hours")).containsExactly(11, 12);
        assertThat(JsonPath.<List<Integer>>read(now, "$.view.jobs[?(@.name == 'Meals')].yourHours"))
                .containsExactly(11);
        assertThat(JsonPath.<Boolean>read(now, "$.view.canTick")).isTrue();
        assertThat(JsonPath.<List<String>>read(now, "$.view.months"))
                .containsExactly(YearMonth.from(TODAY).toString(), last.toString());
        // Taking a tick back.
        act(alex, share, "tick", "{\"jobId\":\"%s\",\"mine\":false}".formatted(jobs.get("Meals")), 200);
        assertThat(JsonPath.<List<Integer>>read(
                        fetch("/v1/boards/" + share + "?show=" + YearMonth.from(TODAY), nora),
                        "$.view.people[*].hours"))
                .containsExactly(11, 9);

        // Only this month and the one before can be ticked; hours are whole and above nothing.
        act(
                nora,
                share,
                "tick",
                "{\"jobId\":\"%s\",\"hours\":2,\"month\":\"%s\"}".formatted(jobs.get("Meals"), last.minusMonths(1)),
                400);
        act(
                nora,
                share,
                "tick",
                "{\"jobId\":\"%s\",\"hours\":2,\"month\":\"%s\"}".formatted(jobs.get("Meals"), last.plusMonths(2)),
                400);
        act(nora, share, "tick", "{\"jobId\":\"%s\",\"hours\":0}".formatted(jobs.get("Meals")), 400);
        act(nora, share, "tick", "{\"jobId\":\"%s\",\"hours\":1.5}".formatted(jobs.get("Meals")), 400);
        send(HttpMethod.GET, "/v1/boards/" + share + "?show=october", nora, null, 400);
        // A job that was ever ticked is taken off the list and stays in its months.
        send(HttpMethod.DELETE, "/v1/board-entries/" + jobs.get("Birthdays"), nora, null, 204);
        String after = view(nora, share);
        assertThat(JsonPath.<List<String>>read(after, "$.view.jobs[*].name"))
                .doesNotContain("Birthdays")
                .hasSize(9);
        assertThat(JsonPath.<List<Integer>>read(after, "$.view.people[*].hours"))
                .containsExactly(31, 22);
        act(nora, share, "tick", "{\"jobId\":\"%s\"}".formatted(jobs.get("Birthdays")), 404);
    }

    @Test
    void aShareIsBetweenThePeopleItNamesAndNeedsTwo() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String alone = circle(nora, "family", "Just Nora");
        assertThat(newBoard(nora, alone, "fair_share", "circle", null, 400))
                .contains("A share needs at least two people");

        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String share = board(
                nora,
                circle,
                "fair_share",
                null,
                "{\"people\":[\"%s\",\"%s\"]}".formatted(memberOf(nora, circle), alexId));
        String job = add(nora, share, "job", "{\"name\":\"The kitty\"}");
        // Kai sees it and has no side in it.
        assertThat(JsonPath.<List<String>>read(view(kai, share), "$.view.people[*].person.name"))
                .containsExactly("Nora", "Alex");
        assertThat(act(kai, share, "tick", "{\"jobId\":\"%s\",\"hours\":4}".formatted(job), 403))
                .contains("This share is between other people");
        act(kai, share, "suggest", "{}", 403);
    }

    // ---------- a couple's Today ----------

    @Test
    void aCouplesTodayPutsItsBoardsAndPinnedListsOnCardsAndAFamilysStaysAsItIs() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String couple = circle(nora, "couple", "Nora and Alex");
        join(nora, couple, alex);

        // A list she pinned, a story, a date she plans, and something they both said yes to.
        String someday = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Someday\",\"items\":[\"See the northern lights\",\"Learn to dance\",\"A night in a lighthouse\"]}"
                                .formatted(id(), couple),
                        201),
                "$.id");
        String line = JsonPath.read(fetch("/v1/checklists/" + someday, nora), "$.items[0].id");
        send(HttpMethod.PATCH, "/v1/checklist-items/" + line, alex, "{\"done\":true}", 200);
        send(HttpMethod.PUT, "/v1/things/" + someday + "/pin", nora, null, 204);
        String story = board(nora, couple, "our_story", null, "{\"sinceWords\":\"a wedding in Piran\"}");
        add(nora, story, "moment", "{\"day\":\"%s\",\"title\":\"We met\"}".formatted(TODAY.minusDays(4503)));
        String dates = board(nora, couple, "mystery_date", null, null);
        add(
                nora,
                dates,
                "date",
                "{\"day\":\"%s\",\"time\":\"20:00\",\"hint\":\"Wear something warm.\"}".formatted(TODAY.plusDays(2)));
        String yes = board(nora, couple, "both_yes", null, null);
        String deck = add(nora, yes, "deck", "{\"name\":\"Dinner\"}");
        String thai = add(nora, yes, "idea", "{\"deckId\":\"%s\",\"text\":\"Thai\"}".formatted(deck));
        for (String who : List.of(nora, alex)) {
            act(who, yes, "say", "{\"ideaId\":\"%s\",\"yes\":true}".formatted(thai), 200);
        }

        // Hers: the date first, then the story, the match, and the list she pinned.
        String hers = today(nora, couple);
        assertThat(JsonPath.<List<String>>read(hers, "$.cards[*].look"))
                .containsExactly("mystery_date", "our_story", "both_yes", "checklist");
        assertThat(JsonPath.<String>read(hers, "$.cards[0].title")).endsWith("is yours to plan");
        assertThat(JsonPath.<List<String>>read(hers, "$.cards[*].line"))
                .containsExactly(
                        "All Alex knows: “20:00, wear something warm”",
                        "Since a wedding in Piran",
                        "Thai · Dinner",
                        "1 of 3 done");
        assertThat(JsonPath.<List<String>>read(hers, "$.cards[*].figure"))
                .containsExactly(null, "4,503 days", "A match", null);
        assertThat(JsonPath.<List<String>>read(hers, "$.cards[*].kind"))
                .containsExactly("board", "board", "board", "checklist");
        assertThat(JsonPath.<String>read(hers, "$.cards[3].thingId")).isEqualTo(someday);
        assertThat(JsonPath.<String>read(hers, "$.cards[3].title")).isEqualTo("Someday");
        // His: the same boards in his words. He didn't pin the list, so it isn't on his.
        String his = today(alex, couple);
        assertThat(JsonPath.<List<String>>read(his, "$.cards[*].look"))
                .containsExactly("mystery_date", "our_story", "both_yes");
        assertThat(JsonPath.<String>read(his, "$.cards[0].line"))
                .isEqualTo("Nora is planning. 20:00. Wear something warm.");
        // A list of a board she hides from him brings him no card.
        send(HttpMethod.PUT, "/v1/things/" + story + "/audience", nora, "{\"audience\":\"me\"}", 200);
        assertThat(JsonPath.<List<String>>read(today(alex, couple), "$.cards[*].look"))
                .containsExactly("mystery_date", "both_yes");

        // A family: the same boards and a pinned list put nothing on its Today.
        String family = circle(nora, "family", "The Linds");
        String groceries = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Groceries\",\"items\":[\"Milk\"]}"
                                .formatted(id(), family),
                        201),
                "$.id");
        send(HttpMethod.PUT, "/v1/things/" + groceries + "/pin", nora, null, 204);
        String turns = board(nora, family, "whose_turn", "circle", null);
        add(nora, turns, "thing", "{\"name\":\"Film night\",\"onDay\":\"%s\"}".formatted(TODAY));
        board(nora, family, "sleeps", "circle", null);
        board(nora, family, "habit_charts", "circle", null);
        board(nora, family, "saturday_jar", "circle", null);
        board(nora, family, "secret_missions", "circle", null);
        board(nora, family, "where_is_it", "circle", null);
        String linds = today(nora, family);
        assertThat(JsonPath.<List<Object>>read(linds, "$.cards")).isEmpty();
        assertThat(JsonPath.<List<Object>>read(linds, "$.items")).isEmpty();
        assertThat(JsonPath.<List<Object>>read(linds, "$.fresh[?(@.kind == 'board')]"))
                .isEmpty();
    }
}
