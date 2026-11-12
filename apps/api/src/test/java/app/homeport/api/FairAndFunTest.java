package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Four of a family's fair-and-fun templates, where nothing is secret: whose turn it is, the Saturday jar,
 * sleeps until a day, and the habit charts. Each test is the rules of one of them.
 */
class FairAndFunTest extends FunBoardTest {

    // ---------- whose turn ----------

    @Test
    void aTurnPassesToTheNextPersonIsKeptWithItsDayAndOnlyGrownUpsWriteItDown() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        teen(nora, circle, kai);
        String mia = addMember(nora, circle, "Mia", "child");
        String leo = addMember(nora, circle, "Leo", "child");
        String biscuit = addMember(nora, circle, "Biscuit", "pet");
        String turns = board(nora, circle, "whose_turn", "circle", null);

        String film = add(
                nora,
                turns,
                "thing",
                "{\"name\":\"Film night\",\"emoji\":\"🎬\",\"does\":\"chooses the film\",\"did\":\"chose\",\"people\":[\"%s\",\"%s\"],\"onDay\":\"%s\"}"
                        .formatted(mia, leo, TODAY));
        String start = view(nora, turns);
        assertThat(JsonPath.<String>read(start, "$.view.things[0].next.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Boolean>read(start, "$.view.things[0].tonight")).isTrue();
        assertThat(JsonPath.<Boolean>read(start, "$.view.things[0].yourTurn")).isTrue(); // a parent stands in for her
        assertThat(JsonPath.<Object>read(start, "$.view.things[0].line")).isNull();
        assertThat(JsonPath.<Boolean>read(start, "$.view.canChange")).isTrue();
        assertThat(glance(alex, turns)).isEqualTo("Tonight: Mia chooses the film");

        // "Done, pass it on": the turn is written down with its day, and it is Leo's next. Tonight is over.
        String body =
                "{\"clientId\":\"%s\",\"kind\":\"turn\",\"fields\":{\"thingId\":\"%s\",\"note\":\"Frozen, again\"}}"
                        .formatted(id(), film);
        String first = send(HttpMethod.POST, "/v1/boards/" + turns + "/entries", nora, body, 201);
        String again = send(HttpMethod.POST, "/v1/boards/" + turns + "/entries", nora, body, 201);
        assertThat(JsonPath.<String>read(again, "$.entryId")).isEqualTo(JsonPath.<String>read(first, "$.entryId"));
        assertThat(JsonPath.<Integer>read(again, "$.board.view.turns")).isEqualTo(1); // sent twice, taken once
        assertThat(JsonPath.<String>read(again, "$.board.view.things[0].next.name"))
                .isEqualTo("Leo");
        assertThat(JsonPath.<Boolean>read(again, "$.board.view.things[0].tonight"))
                .isFalse();
        assertThat(JsonPath.<String>read(again, "$.board.view.things[0].line"))
                .isEqualTo("Mia chose today. Frozen, again.");
        assertThat(JsonPath.<String>read(again, "$.board.view.history[0].day")).isEqualTo(TODAY.toString());
        assertThat(JsonPath.<String>read(again, "$.board.view.history[0].who.name"))
                .isEqualTo("Mia");
        assertThat(glance(nora, turns)).isEqualTo("1 thing · 1 turn kept");

        // Leo takes his, on Alex's phone. Taking it back gives it to him again.
        String second = add(alex, turns, "turn", "{\"thingId\":\"%s\"}".formatted(film));
        assertThat(JsonPath.<String>read(view(nora, turns), "$.view.things[0].next.name"))
                .isEqualTo("Mia");
        assertThat(JsonPath.<String>read(view(nora, turns), "$.view.things[0].line"))
                .isEqualTo("Leo had the last turn, today");
        send(HttpMethod.DELETE, "/v1/board-entries/" + second, alex, null, 204);
        String back = view(nora, turns);
        assertThat(JsonPath.<String>read(back, "$.view.things[0].next.name")).isEqualTo("Leo");
        assertThat(JsonPath.<Integer>read(back, "$.view.turns")).isEqualTo(1);

        // Someone did it out of turn: it is written down for them, and moves on from them.
        add(nora, turns, "turn", "{\"thingId\":\"%s\",\"memberId\":\"%s\"}".formatted(film, mia));
        assertThat(JsonPath.<String>read(view(nora, turns), "$.view.things[0].next.name"))
                .isEqualTo("Leo");
        // And whose turn it is can simply be set, to end an argument.
        change(nora, film, "{\"nextMemberId\":\"%s\"}".formatted(mia), 200);
        assertThat(JsonPath.<String>read(view(nora, turns), "$.view.things[0].next.name"))
                .isEqualTo("Mia");

        // The proof: a month of turns, each with its date.
        String month = fetch("/v1/boards/" + turns + "?show=" + TODAY.toString().substring(0, 7), nora);
        assertThat(JsonPath.<List<String>>read(month, "$.view.history[*].note")).contains("Frozen, again");
        assertThat(JsonPath.<String>read(month, "$.view.historyFrom")).endsWith("-01");
        send(HttpMethod.GET, "/v1/boards/" + turns + "?show=november", nora, null, 400);

        // A teenager sees it all and changes nothing; a pet takes no turns; nobody from elsewhere does either.
        String asKai = view(kai, turns);
        assertThat(JsonPath.<Boolean>read(asKai, "$.view.canChange")).isFalse();
        assertThat(JsonPath.<Integer>read(asKai, "$.view.turns")).isEqualTo(2);
        assertThat(add(kai, turns, "turn", "{\"thingId\":\"%s\"}".formatted(film), 403))
                .contains("Only the grown-ups can change what happened");
        add(kai, turns, "thing", "{\"name\":\"The remote\"}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + JsonPath.<String>read(first, "$.entryId"), kai, null, 403);
        assertThat(add(nora, turns, "thing", "{\"name\":\"Walks\",\"people\":[\"%s\"]}".formatted(biscuit), 400))
                .contains("A pet can't take a turn");
        add(nora, turns, "turn", "{\"thingId\":\"%s\",\"memberId\":\"%s\"}".formatted(film, id()), 400);
        add(nora, turns, "turn", "{\"thingId\":\"%s\",\"day\":\"%s\"}".formatted(film, TODAY.plusDays(1)), 400);
        add(nora, turns, "thing", "{\"emoji\":\"🚗\"}", 400);
        // Left to itself a thing is for everyone in the family, in the family's order, without the pet.
        String seat = add(nora, turns, "thing", "{\"name\":\"The front seat\",\"when\":\"Every drive\"}");
        String seen = view(nora, turns);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.things[1].people[*].name"))
                .containsExactly("Nora", "Alex", "Kai", "Mia", "Leo");
        assertThat(JsonPath.<String>read(seen, "$.view.things[1].line")).isEqualTo("Every drive");
        assertThat(seat).isNotNull();
        // What was written down is found by its words.
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Frozen", kai)).contains(turns);
        // Nothing of this is put on Today: the family's Today stays as its screen draws it.
        assertThat(JsonPath.<List<Object>>read(today(nora, circle), "$.cards")).isEmpty();
    }

    // ---------- the Saturday jar ----------

    @Test
    void theJarPullsAnIdeaThatFitsAndSayingYesPutsItInTheCalendarWithAnAlbum() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        teen(nora, circle, kai);
        String mia = addMember(nora, circle, "Mia", "child");
        String jar = board(nora, circle, "saturday_jar", "circle", null);

        assertThat(act(nora, jar, "shake", "{}", 409)).contains("The jar is empty");
        String picnic = add(
                nora,
                jar,
                "idea",
                "{\"text\":\"A picnic by the pond\",\"emoji\":\"🧺\",\"place\":\"outdoors\",\"minutes\":120,\"cents\":0,\"byMemberId\":\"%s\"}"
                        .formatted(mia));
        add(
                alex,
                jar,
                "idea",
                "{\"text\":\"The big slides at the pool\",\"place\":\"indoors\",\"minutes\":240,\"cents\":6000}");
        assertThat(act(nora, jar, "shake", "{\"minutes\":60,\"outdoors\":false}", 409))
                .contains("Nothing in the jar fits that");
        String den = add(alex, jar, "idea", "{\"text\":\"Build a den in the living room\",\"place\":\"home\"}");

        String full = view(alex, jar);
        assertThat(JsonPath.<Integer>read(full, "$.view.count")).isEqualTo(3);
        assertThat(JsonPath.<Object>read(full, "$.view.pulled")).isNull();
        assertThat(JsonPath.<Object>read(full, "$.view.asked")).isNull();
        // No weather source, and no calendar to say who is free: the jar doesn't make either up.
        assertThat(JsonPath.<Object>read(full, "$.view.weather")).isNull();
        assertThat(JsonPath.<Object>read(full, "$.view.everyoneFree")).isNull();
        assertThat(glance(nora, jar)).isEqualTo("3 ideas in the jar");

        // An hour, for free, indoors: only the den. Shaking again finds nothing else, so it is the den again.
        String shaken = act(alex, jar, "shake", "{\"minutes\":60,\"cents\":0,\"outdoors\":false}", 200);
        assertThat(JsonPath.<String>read(shaken, "$.view.pulled.text")).isEqualTo("Build a den in the living room");
        assertThat(JsonPath.<Boolean>read(shaken, "$.view.asked.outdoors")).isFalse();
        assertThat(JsonPath.<String>read(
                        act(nora, jar, "shake", "{\"minutes\":60,\"cents\":0,\"outdoors\":false}", 200),
                        "$.view.pulled.id"))
                .isEqualTo(den);
        // The slip is the same for everyone who looks.
        assertThat(JsonPath.<String>read(view(kai, jar), "$.view.pulled.id")).isEqualTo(den);
        // What fits today, what suits a rainy day, what is at home, what is free.
        assertThat(texts(nora, jar, "fits")).containsExactly("Build a den in the living room");
        assertThat(texts(nora, jar, "rainy"))
                .containsExactly("Build a den in the living room", "The big slides at the pool");
        assertThat(texts(nora, jar, "home")).containsExactly("Build a den in the living room");
        assertThat(texts(nora, jar, "free")).containsExactly("Build a den in the living room", "A picnic by the pond");
        send(HttpMethod.GET, "/v1/boards/" + jar + "/entries?filter=sunny", nora, null, 400);
        // With all day and the sky to play under, shaking again gives a different slip each time there is one.
        String one = JsonPath.read(act(nora, jar, "shake", "{\"outdoors\":true}", 200), "$.view.pulled.id");
        String two = JsonPath.read(act(nora, jar, "shake", "{\"outdoors\":true}", 200), "$.view.pulled.id");
        assertThat(two).isNotEqualTo(one);

        // "Let's do it": it leaves the jar and lands in the calendar, with an album waiting for the photos.
        String yes =
                act(nora, jar, "do", "{\"ideaId\":\"%s\",\"day\":\"%s\"}".formatted(picnic, TODAY.plusDays(2)), 200);
        assertThat(JsonPath.<Integer>read(yes, "$.view.count")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(yes, "$.view.done")).isEqualTo(1);
        String event = JsonPath.read(yes, "$.view.comingUp[0].eventId");
        String album = JsonPath.read(yes, "$.view.comingUp[0].albumId");
        assertThat(JsonPath.<String>read(fetch("/v1/events/" + event, alex), "$.title"))
                .isEqualTo("A picnic by the pond");
        assertThat(JsonPath.<String>read(fetch("/v1/events/" + event, alex), "$.day"))
                .isEqualTo(TODAY.plusDays(2).toString());
        assertThat(JsonPath.<String>read(fetch("/v1/albums/" + album, alex), "$.title"))
                .isEqualTo("A picnic by the pond");
        assertThat(fetch("/v1/things/" + event + "/links", nora)).contains(album);
        // Saying yes twice makes one event.
        String twice = act(alex, jar, "do", "{\"ideaId\":\"%s\"}".formatted(picnic), 200);
        assertThat(JsonPath.<String>read(twice, "$.view.comingUp[0].eventId")).isEqualTo(event);
        act(nora, jar, "do", "{\"ideaId\":\"%s\",\"day\":\"%s\"}".formatted(den, TODAY.minusDays(1)), 400);
        // It can be put back in the jar.
        change(nora, picnic, "{\"done\":false}", 200);
        assertThat(JsonPath.<Integer>read(view(nora, jar), "$.view.count")).isEqualTo(3);

        // Nobody can set the weather, and a child's idea is put in by whoever looks after them.
        String patched =
                send(HttpMethod.PATCH, "/v1/boards/" + jar, nora, "{\"settings\":{\"weather\":\"dry until 4\"}}", 200);
        assertThat(JsonPath.<Object>read(patched, "$.settings.weather")).isNull();
        add(kai, jar, "idea", "{\"text\":\"Hers\",\"byMemberId\":\"%s\"}".formatted(mia), 400);
        add(nora, jar, "idea", "{\"text\":\"Somewhere\",\"place\":\"the moon\"}", 400);
        add(nora, jar, "idea", "{\"place\":\"home\"}", 400);

        // Someone who may only look at the jar can still drop an idea in and shake, but not take out another's.
        String hers = add(nora, jar, "idea", "{\"text\":\"Cycle to the river\",\"place\":\"outdoors\"}");
        shareWith(nora, jar, alexId, "view");
        String own = add(alex, jar, "idea", "{\"text\":\"Pancakes for dinner\",\"place\":\"home\",\"minutes\":30}");
        act(alex, jar, "shake", "{}", 200);
        send(HttpMethod.DELETE, "/v1/board-entries/" + hers, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + own, alex, null, 204);
        // A child's idea is looked after by the grown-ups: either of them can take it out.
        send(HttpMethod.DELETE, "/v1/board-entries/" + picnic, alex, null, 204);
    }

    private List<String> texts(String token, String jar, String filter) throws Exception {
        return JsonPath.read(fetch("/v1/boards/" + jar + "/entries?filter=" + filter, token), "$.items[*].text");
    }

    // ---------- sleeps ----------

    @Test
    void sleepsAreTheNightsLeftAndOneLinkOfTheChainComesOffAtBedtime() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String leo = addMember(nora, circle, "Leo", "child");
        String sleeps = board(nora, circle, "sleeps", "circle", null);
        assertThat(glance(nora, sleeps)).isEqualTo("Nothing to count down to yet");

        // The chain was started two days ago, with fourteen links.
        String grandma = add(
                nora,
                sleeps,
                "count",
                "{\"title\":\"Grandma Astrid comes\",\"day\":\"%s\",\"from\":\"%s\",\"tearerMemberId\":\"%s\"}"
                        .formatted(TODAY.plusDays(12), TODAY.minusDays(2), leo));
        // A birthday comes every year: it counts to its next time round. (Four years back keeps a 29 February.)
        LocalDate next = TODAY.plusDays(30);
        add(
                nora,
                sleeps,
                "count",
                "{\"title\":\"Mia's birthday\",\"emoji\":\"🎂\",\"day\":\"%s\",\"yearly\":true}"
                        .formatted(next.minusYears(4)));
        add(
                nora,
                sleeps,
                "count",
                "{\"title\":\"Norway\",\"day\":\"%s\",\"note\":\"from the trip\"}".formatted(TODAY.plusDays(143)));

        String seen = view(nora, sleeps);
        assertThat(JsonPath.<String>read(seen, "$.view.first.title")).isEqualTo("Grandma Astrid comes");
        assertThat(JsonPath.<Integer>read(seen, "$.view.first.sleeps")).isEqualTo(12);
        assertThat(JsonPath.<Integer>read(seen, "$.view.first.links")).isEqualTo(14);
        assertThat(JsonPath.<Integer>read(seen, "$.view.first.off")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(seen, "$.view.first.canTear")).isTrue();
        assertThat(JsonPath.<String>read(seen, "$.view.first.tearer.name")).isEqualTo("Leo");
        assertThat(JsonPath.<List<String>>read(seen, "$.view.others[*].title"))
                .containsExactly("Mia's birthday", "Norway");
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.others[*].sleeps"))
                .containsExactly(30, 143);
        assertThat(JsonPath.<String>read(seen, "$.view.others[0].day")).isEqualTo(next.toString());
        assertThat(JsonPath.<Integer>read(seen, "$.view.others[1].links")).isEqualTo(60); // a long wait is sixty links
        assertThat(glance(alex, sleeps)).isEqualTo("12 sleeps until Grandma Astrid comes");

        // Tonight's link comes off once, whoever tears it, also someone who may only look. The sleeps stay twelve
        // until the morning.
        shareWith(nora, sleeps, alexId, "view");
        String body = "{\"entryId\":\"%s\"}".formatted(grandma);
        act(alex, sleeps, "tear", body, 200);
        String torn = act(nora, sleeps, "tear", body, 200);
        assertThat(JsonPath.<Integer>read(torn, "$.view.first.off")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(torn, "$.view.first.sleeps")).isEqualTo(12);
        assertThat(JsonPath.<Boolean>read(torn, "$.view.first.tornTonight")).isTrue();
        assertThat(JsonPath.<Boolean>read(torn, "$.view.first.canTear")).isFalse();
        String putBack = act(nora, sleeps, "tear", "{\"entryId\":\"%s\",\"torn\":false}".formatted(grandma), 200);
        assertThat(JsonPath.<Integer>read(putBack, "$.view.first.off")).isEqualTo(2);

        // A day gone by can't be counted down to. On the day itself there are no sleeps and no links left.
        add(nora, sleeps, "count", "{\"title\":\"Yesterday\",\"day\":\"%s\"}".formatted(TODAY.minusDays(1)), 400);
        add(nora, sleeps, "count", "{\"day\":\"%s\"}".formatted(TODAY.plusDays(3)), 400);
        String today = add(nora, sleeps, "count", "{\"title\":\"The school play\",\"day\":\"%s\"}".formatted(TODAY));
        String onTheDay = view(nora, sleeps);
        assertThat(JsonPath.<String>read(onTheDay, "$.view.first.title")).isEqualTo("The school play");
        assertThat(JsonPath.<Integer>read(onTheDay, "$.view.first.sleeps")).isZero();
        assertThat(JsonPath.<Boolean>read(onTheDay, "$.view.first.canTear")).isFalse();
        assertThat(act(nora, sleeps, "tear", "{\"entryId\":\"%s\"}".formatted(today), 409))
                .contains("The day has come");
        assertThat(glance(nora, sleeps)).isEqualTo("Today: The school play");
        // A guest with a pass reads the count, and nothing else.
        assertThat(guestPage(nora, circle, sleeps)).contains("Today: The school play");
    }

    // ---------- habit charts ----------

    @Test
    void aTickADayIsAStarAndAMissedDayIsAGapThatResetsNothing() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String leo = addMember(nora, circle, "Leo", "child");
        String biscuit = addMember(nora, circle, "Biscuit", "pet");
        String charts = board(nora, circle, "habit_charts", "circle", null);

        String bed = add(
                nora,
                charts,
                "chart",
                "{\"title\":\"Bed made, bag packed\",\"people\":[\"%s\"],\"rows\":[{\"label\":\"Bed made\",\"icon\":\"sun\"},{\"label\":\"Bag packed\",\"icon\":\"moon\"}]}"
                        .formatted(leo));
        String phones =
                add(nora, charts, "chart", "{\"title\":\"Phones off the table\",\"emoji\":\"📱\",\"unit\":\"dinner\"}");
        String fresh = view(nora, charts);
        assertThat(JsonPath.<Boolean>read(fresh, "$.view.charts[0].earnsStars")).isTrue(); // one child's chart
        assertThat(JsonPath.<Integer>read(fresh, "$.view.charts[0].stars")).isZero();
        assertThat(JsonPath.<String>read(fresh, "$.view.charts[0].who")).isEqualTo("Leo");
        assertThat(JsonPath.<Boolean>read(fresh, "$.view.charts[1].earnsStars")).isFalse();
        assertThat(JsonPath.<Object>read(fresh, "$.view.charts[1].stars")).isNull();
        assertThat(JsonPath.<String>read(fresh, "$.view.charts[1].who")).isEqualTo("Everyone");
        assertThat(JsonPath.<String>read(fresh, "$.view.charts[1].line")).isEqualTo("Ready for a first tick");
        assertThat(JsonPath.<Integer>read(fresh, "$.view.charts[0].rows[0].cells.length()"))
                .isEqualTo(7);

        // A tick is a star, once: ticking the same row for the same day again changes nothing.
        String morning = "{\"chartId\":\"%s\"}".formatted(bed);
        act(nora, charts, "tick", morning, 200);
        String once = act(alex, charts, "tick", morning, 200);
        assertThat(JsonPath.<Integer>read(once, "$.view.charts[0].stars")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(once, "$.view.charts[0].doneToday")).isFalse(); // the evening row is open
        String both = act(nora, charts, "tick", "{\"chartId\":\"%s\",\"row\":1}".formatted(bed), 200);
        assertThat(JsonPath.<Integer>read(both, "$.view.charts[0].stars")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(both, "$.view.charts[0].doneToday")).isTrue();
        assertThat(JsonPath.<Integer>read(both, "$.view.charts[0].streak")).isEqualTo(1);

        // Yesterday was kept too; the day before was missed; three days ago was kept. The gap ends the streak
        // and takes nothing away.
        for (int back : List.of(1, 3)) {
            for (int row : List.of(0, 1)) {
                act(
                        nora,
                        charts,
                        "tick",
                        "{\"chartId\":\"%s\",\"row\":%d,\"day\":\"%s\"}".formatted(bed, row, TODAY.minusDays(back)),
                        200);
            }
        }
        String gap = view(nora, charts);
        assertThat(JsonPath.<Integer>read(gap, "$.view.charts[0].streak")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(gap, "$.view.charts[0].stars")).isEqualTo(6);
        // Taking this evening's tick back: one star fewer, and the streak counts up to yesterday while today is open.
        String open = act(nora, charts, "tick", "{\"chartId\":\"%s\",\"row\":1,\"done\":false}".formatted(bed), 200);
        assertThat(JsonPath.<Integer>read(open, "$.view.charts[0].stars")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(open, "$.view.charts[0].streak")).isEqualTo(1);
        assertThat(JsonPath.<String>read(open, "$.view.charts[0].line")).endsWith("so far this week");

        // Only today and the last seven days; only rows the chart has; only days the chart is on.
        act(nora, charts, "tick", "{\"chartId\":\"%s\",\"day\":\"%s\"}".formatted(bed, TODAY.minusDays(8)), 400);
        act(nora, charts, "tick", "{\"chartId\":\"%s\",\"day\":\"%s\"}".formatted(bed, TODAY.plusDays(1)), 400);
        act(nora, charts, "tick", "{\"chartId\":\"%s\",\"row\":2}".formatted(bed), 400);
        LocalDate twoDaysAgo = TODAY.minusDays(2);
        String code = twoDaysAgo
                .getDayOfWeek()
                .getDisplayName(TextStyle.SHORT, Locale.ENGLISH)
                .toLowerCase(Locale.ROOT);
        String weekly = add(
                nora,
                charts,
                "chart",
                "{\"title\":\"One evening with no screens\",\"people\":[\"%s\",\"%s\"],\"days\":[\"%s\"]}"
                        .formatted(memberOf(nora, circle), alexId, code));
        assertThat(act(nora, charts, "tick", "{\"chartId\":\"%s\"}".formatted(weekly), 400))
                .contains("This chart isn't on that day");
        String kept =
                act(nora, charts, "tick", "{\"chartId\":\"%s\",\"day\":\"%s\"}".formatted(weekly, twoDaysAgo), 200);
        assertThat(JsonPath.<String>read(kept, "$.view.charts[2].line"))
                .isEqualTo(twoDaysAgo.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH) + "s");
        assertThat(JsonPath.<String>read(kept, "$.view.charts[2].who")).isEqualTo("You and Alex");
        assertThat(JsonPath.<Boolean>read(kept, "$.view.charts[2].earnsStars")).isFalse();
        add(nora, charts, "chart", "{\"title\":\"Odd days\",\"days\":[\"someday\"]}", 400);
        add(nora, charts, "chart", "{\"title\":\"Walks\",\"people\":[\"%s\"]}".formatted(biscuit), 400);

        // The grown-ups' chart: no stars, and its own word for a day. Someone who may only look can still tick.
        shareWith(nora, charts, alexId, "view");
        String dinner = act(alex, charts, "tick", "{\"chartId\":\"%s\"}".formatted(phones), 200);
        assertThat(JsonPath.<String>read(dinner, "$.view.charts[1].line")).isEqualTo("1 dinner so far");
        assertThat(JsonPath.<Object>read(dinner, "$.view.charts[1].stars")).isNull();
        assertThat(glance(nora, charts)).startsWith("3 charts · ");

        // A chart that is taken down keeps the stars earned on it: Leo's next chart starts with his five.
        send(HttpMethod.DELETE, "/v1/board-entries/" + bed, nora, null, 204);
        add(nora, charts, "chart", "{\"title\":\"Reading, 20 minutes\",\"people\":[\"%s\"]}".formatted(leo));
        String after = view(nora, charts);
        assertThat(JsonPath.<List<String>>read(after, "$.view.charts[*].title"))
                .containsExactly("Phones off the table", "One evening with no screens", "Reading, 20 minutes");
        assertThat(JsonPath.<Integer>read(after, "$.view.charts[2].stars")).isEqualTo(5);
        act(nora, charts, "tick", morning, 404);
    }
}
