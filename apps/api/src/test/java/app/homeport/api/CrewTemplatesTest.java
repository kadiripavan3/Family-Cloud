package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * A crew's templates, tried as three friends: finding a date (also by link, without the app), a vote that is
 * private until it closes, the dictionary, predictions sealed until their day, awards voted in private, and a
 * walk that keeps one number per walk. (Secret Santa has its own test.)
 */
class CrewTemplatesTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    private String lea;
    private String nora;
    private String kai;
    private String crew;
    private String leaId;
    private String noraId;
    private String kaiId;

    @BeforeEach
    void threeFriends() throws Exception {
        lea = person("Lea");
        nora = person("Nora");
        kai = person("Kai");
        crew = circle(lea, "crew", "Lisbon crew");
        leaId = memberOf(lea, crew);
        noraId = join(lea, crew, nora);
        kaiId = join(lea, crew, kai);
    }

    private String today(String token) throws Exception {
        return fetch("/v1/circles/" + crew + "/today?day=" + TODAY, token);
    }

    private List<String> cardTitles(String token) throws Exception {
        return JsonPath.read(today(token), "$.cards[*].title");
    }

    private static String words(LocalDate day) {
        return day.getDayOfWeek().getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH) + " "
                + day.getDayOfMonth() + " "
                + day.getMonth().getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH);
    }

    // ---------- 19.3 when can everyone? ----------

    @Test
    void theBestDayIsWorkedOutFromEveryonesDaysAlsoThoseOfSomeoneWhoAnswersByLink() throws Exception {
        LocalDate first = TODAY.plusDays(3);
        String board = board(
                lea, crew, "find_date", null, "{\"from\":\"%s\",\"to\":\"%s\"}".formatted(first, first.plusDays(9)));
        newBoard(
                lea,
                crew,
                "find_date",
                null,
                "{\"from\":\"%s\",\"to\":\"%s\"}".formatted(first, first.plusDays(80)),
                400);
        String tap = "{\"day\":\"%s\"}";
        act(lea, board, "tap", tap.formatted(first.plusDays(1)), 200);
        act(lea, board, "tap", tap.formatted(first.plusDays(4)), 200);
        act(lea, board, "tap", tap.formatted(first.plusDays(4)), 200);
        act(nora, board, "tap", tap.formatted(first.plusDays(4)), 200);
        act(nora, board, "tap", tap.formatted(first.plusDays(6)), 200);
        act(nora, board, "tap", tap.formatted(first.plusDays(30)), 400);

        String seen = view(nora, board);
        assertThat(JsonPath.<Integer>read(seen, "$.view.days.length()")).isEqualTo(10);
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.days[*].free"))
                .containsExactly(0, 1, 0, 0, 2, 0, 1, 0, 0, 0);
        assertThat(JsonPath.<String>read(seen, "$.view.best.day"))
                .isEqualTo(first.plusDays(4).toString());
        assertThat(JsonPath.<Boolean>read(seen, "$.view.best.allWhoAnswered")).isTrue();
        assertThat(JsonPath.<Boolean>read(seen, "$.view.best.everyone")).isFalse();
        assertThat(JsonPath.<List<String>>read(seen, "$.view.best.names")).containsExactly("Lea", "you");
        assertThat(JsonPath.<Boolean>read(seen, "$.view.days[4].you")).isTrue();
        assertThat(JsonPath.<Boolean>read(seen, "$.view.days[4].best")).isTrue();
        assertThat(JsonPath.<Integer>read(seen, "$.view.asked")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(seen, "$.view.answered")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.waitingFor[*].person.name"))
                .containsExactly("Kai");
        assertThat(JsonPath.<Boolean>read(seen, "$.view.waitingFor[0].opened")).isFalse();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, nora), "$.glance"))
                .isEqualTo(words(first.plusDays(4)) + " works for 2 of 3");

        // On Today: the best day, and who it waits for. Kai, who hasn't answered, gets a button.
        String norasToday = today(nora);
        assertThat(JsonPath.<String>read(norasToday, "$.cards[0].title"))
                .isEqualTo(words(first.plusDays(4)) + " works for two of you");
        assertThat(JsonPath.<String>read(norasToday, "$.cards[0].line"))
                .isEqualTo("When can everyone? · waiting for Kai");
        assertThat(JsonPath.<Object>read(norasToday, "$.cards[0].action")).isNull();
        assertThat(JsonPath.<String>read(today(kai), "$.cards[0].action")).isEqualTo("Answer");

        // Kai opens it; Lea nudges him, once a day. Then he says none of the days work, and changes his mind.
        act(kai, board, "opened", "{}", 200);
        assertThat(JsonPath.<Boolean>read(view(lea, board), "$.view.waitingFor[0].opened"))
                .isTrue();
        act(lea, board, "nudge", "{\"memberId\":\"%s\"}".formatted(kaiId), 200);
        assertThat(act(nora, board, "nudge", "{\"memberId\":\"%s\"}".formatted(kaiId), 409))
                .contains("Kai was nudged today already");
        assertThat(act(lea, board, "nudge", "{\"memberId\":\"%s\"}".formatted(noraId), 409))
                .contains("They have answered already");
        assertThat(JsonPath.<String>read(today(kai), "$.cards[0].line"))
                .isEqualTo("When can everyone? · the others are waiting for you");
        String cant = act(kai, board, "cant", "{}", 200);
        assertThat(JsonPath.<Boolean>read(cant, "$.view.youCant")).isTrue();
        assertThat(JsonPath.<Integer>read(cant, "$.view.answered")).isEqualTo(3);
        assertThat(JsonPath.<Boolean>read(cant, "$.view.best.allWhoAnswered")).isFalse();
        String can = act(kai, board, "tap", tap.formatted(first.plusDays(6)), 200);
        assertThat(JsonPath.<Boolean>read(can, "$.view.youCant")).isFalse();
        // Two days now have two each: the earlier one stays the best.
        assertThat(JsonPath.<String>read(can, "$.view.best.day"))
                .isEqualTo(first.plusDays(4).toString());

        // By link, without the app: the page shows the title and who asks, and nothing of anyone's answers.
        String link = JsonPath.read(view(lea, board), "$.view.link");
        String path = link.replaceFirst("^https?://[^/]+", "");
        assertThat(path).matches("/when/[a-z0-9-]{23}");
        var page = mvc.perform(get(path)).andReturn().getResponse();
        assertThat(page.getHeader("Referrer-Policy")).isEqualTo("same-origin");
        assertThat(page.getContentAsString())
                .contains("Lea is asking")
                .contains("When can everyone?")
                .contains(words(first.plusDays(6)))
                .doesNotContain("Nora")
                .doesNotContain("Kai")
                .doesNotContain("Lisbon crew")
                .doesNotContain("checked");
        assertThat(mvc.perform(get("/when/abcde-fghjk-mnpqr-stuvw"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .contains("This link doesn't work any more");
        // A name is needed. With one, the answer counts, and this browser can change it.
        assertThat(mvc.perform(post(path)
                                .param("name", " ")
                                .param("days", first.plusDays(6).toString()))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .contains("Write your name");
        var answered = mvc.perform(post(path)
                        .param("name", "Tom")
                        .param(
                                "days",
                                first.plusDays(6).toString(),
                                first.plusDays(7).toString(),
                                "2020-01-01",
                                "nonsense"))
                .andReturn()
                .getResponse();
        assertThat(answered.getStatus()).isEqualTo(302);
        Cookie key = answered.getCookie("homeport_when");
        assertThat(key).isNotNull();
        assertThat(key.isHttpOnly()).isTrue();
        String withTom = view(nora, board);
        assertThat(JsonPath.<String>read(withTom, "$.view.best.day"))
                .isEqualTo(first.plusDays(6).toString());
        assertThat(JsonPath.<Integer>read(withTom, "$.view.best.free")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(withTom, "$.view.best.names")).containsExactly("Kai", "Tom", "you");
        assertThat(JsonPath.<List<String>>read(withTom, "$.view.byLink[*].name"))
                .containsExactly("Tom");
        assertThat(JsonPath.<Integer>read(withTom, "$.view.byLink[0].days")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(withTom, "$.view.asked")).isEqualTo(4);
        // His browser gets his own ticks back; another browser gets an empty page.
        assertThat(mvc.perform(get(path + "?saved=1").cookie(key))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .contains("Thank you")
                .contains("value=\"Tom\"")
                .contains("checked");
        assertThat(mvc.perform(get(path)).andReturn().getResponse().getContentAsString())
                .doesNotContain("Tom")
                .doesNotContain("checked");
        mvc.perform(post(path)
                        .cookie(key)
                        .param("name", "Tom B")
                        .param("days", first.plusDays(1).toString()))
                .andReturn();
        String changed = view(lea, board);
        assertThat(JsonPath.<List<String>>read(changed, "$.view.byLink[*].name"))
                .containsExactly("Tom B");
        assertThat(JsonPath.<Integer>read(changed, "$.view.byLink[0].days")).isEqualTo(1);
        // Someone who may only look at the board gets no link; whoever may change it can take Tom's answer out.
        send(
                HttpMethod.PUT,
                "/v1/things/" + board + "/audience",
                lea,
                "{\"audience\":\"circle\",\"everyoneEdits\":false}",
                200);
        assertThat(JsonPath.<Object>read(view(kai, board), "$.view.link")).isNull();
        String tom = JsonPath.read(changed, "$.view.byLink[0].id");
        send(HttpMethod.DELETE, "/v1/board-entries/" + tom, kai, null, 403);
        // Looking only, Kai still changes his own days.
        act(kai, board, "tap", tap.formatted(first.plusDays(4)), 200);
        send(HttpMethod.DELETE, "/v1/board-entries/" + tom, lea, null, 204);
        String three = view(lea, board);
        assertThat(JsonPath.<List<Object>>read(three, "$.view.byLink")).isEmpty();
        assertThat(JsonPath.<Boolean>read(three, "$.view.best.everyone")).isTrue();
        assertThat(JsonPath.<String>read(today(nora), "$.cards[0].title"))
                .isEqualTo(words(first.plusDays(4)) + " works for everyone");

        // Lea sets it: it is an event on everyone's calendar, the card leaves Today, and the link says so.
        act(kai, board, "set", "{}", 403);
        String set = act(lea, board, "set", "{\"time\":\"19:30\",\"timeZone\":\"Europe/Ljubljana\"}", 200);
        String event = JsonPath.read(set, "$.view.eventId");
        assertThat(JsonPath.<String>read(set, "$.view.setFor"))
                .isEqualTo(first.plusDays(4).toString());
        act(lea, board, "set", "{}", 200);
        String asEvent = fetch("/v1/events/" + event, kai);
        assertThat(JsonPath.<String>read(asEvent, "$.title")).isEqualTo("When can everyone?");
        assertThat(JsonPath.<Integer>read(asEvent, "$.guests.length()")).isEqualTo(3);
        assertThat(fetch("/v1/circles/" + crew + "/plan?day=" + first.plusDays(4) + "&days=1", nora))
                .contains(event);
        assertThat(cardTitles(nora)).isEmpty();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, nora), "$.glance"))
                .isEqualTo("Set for " + words(first.plusDays(4)));
        assertThat(mvc.perform(get(path)).andReturn().getResponse().getContentAsString())
                .contains("It is set for");
        // A new link: the old one is gone.
        String newLink = JsonPath.read(act(lea, board, "new_link", "{}", 200), "$.view.link");
        assertThat(newLink).isNotEqualTo(link);
        assertThat(mvc.perform(get(path)).andReturn().getResponse().getContentAsString())
                .contains("This link doesn't work any more");
    }

    // ---------- 19.5 where next? ----------

    @Test
    void aVoteForWhereNextIsPrivateUntilItClosesAndThenTheWinnerCanBeMadeATrip() throws Exception {
        String board = board(nora, crew, "where_next", null, "{\"when\":\"Spring\"}");
        String porto = add(nora, board, "idea", "{\"name\":\"Porto\",\"days\":4,\"costCents\":31000}");
        String soca = add(kai, board, "idea", "{\"name\":\"The Soča valley\",\"days\":3,\"costCents\":18000}");
        act(nora, board, "vote", "{\"ideaId\":\"%s\"}".formatted(porto), 200);
        act(lea, board, "vote", "{\"ideaId\":\"%s\"}".formatted(soca), 200);
        // Voting again moves the vote: one each.
        act(lea, board, "vote", "{\"ideaId\":\"%s\"}".formatted(porto), 200);
        assertThat(act(nora, board, "make_trip", "{}", 409)).contains("There is no winner yet");

        // While it is open: who has voted, never for what. Each sees only their own vote. The ideas stay in the
        // order they were added.
        for (String who : List.of(lea, nora, kai)) {
            String open = view(who, board);
            assertThat(JsonPath.<Boolean>read(open, "$.view.closed")).isFalse();
            assertThat(JsonPath.<Integer>read(open, "$.view.voted")).isEqualTo(2);
            assertThat(JsonPath.<List<String>>read(open, "$.view.waitingFor[*].name"))
                    .containsExactly("Kai");
            assertThat(JsonPath.<List<String>>read(open, "$.view.ideas[*].name"))
                    .containsExactly("Porto", "The Soča valley");
            assertThat(JsonPath.<List<Object>>read(open, "$.view.ideas[*].votes"))
                    .containsOnly((Object) null);
            assertThat(JsonPath.<List<Object>>read(open, "$.view.ideas[*].percent"))
                    .containsOnly((Object) null);
            assertThat(JsonPath.<List<List<Object>>>read(open, "$.view.ideas[*].voters"))
                    .allSatisfy(voters -> assertThat(voters).isEmpty());
            assertThat(JsonPath.<List<Boolean>>read(open, "$.view.ideas[*].winner"))
                    .containsOnly(false);
            assertThat(JsonPath.<Object>read(open, "$.view.winnerId")).isNull();
            assertThat(JsonPath.<List<Boolean>>read(open, "$.view.ideas[*].yours"))
                    .containsExactly(!who.equals(kai), false);
            // Nothing else says how the vote stands either.
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, who), "$.glance"))
                    .isEqualTo("2 ideas · 2 of 3 voted");
            assertThat(JsonPath.<List<Object>>read(fetch("/v1/boards/" + board + "/entries", who), "$.items"))
                    .isEmpty();
            String today = today(who);
            assertThat(JsonPath.<List<String>>read(today, "$.fresh[?(@.thingId == '" + board + "')].note"))
                    .containsExactly("2 of 3 voted");
            assertThat(today).doesNotContain("ahead").doesNotContain("it is");
        }
        assertThat(cardTitles(kai)).containsExactly("Where next?");
        assertThat(JsonPath.<String>read(today(kai), "$.cards[0].line"))
                .isEqualTo("2 of 3 voted · your vote is missing");
        assertThat(cardTitles(nora)).isEmpty();
        // A vote can't be reached by its id.
        String vote = jdbc.sql(
                        "select cast(id as text) from board_entries where board_id = cast(:board as uuid) and kind = 'vote' and author_id = cast(:voter as uuid)")
                .param("board", board)
                .param("voter", leaId)
                .query(String.class)
                .single();
        change(kai, vote, "{\"ideaId\":\"%s\"}".formatted(soca), 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + vote, kai, null, 404);
        assertThat(view(kai, board)).doesNotContain(vote);
        // Only whoever added an idea changes it.
        change(lea, soca, "{\"name\":\"Somewhere else\"}", 403);
        change(kai, soca, "{\"name\":\"The Soča valley, by bike\"}", 200);

        // Kai's vote is the last: it closes, and everyone sees how it went.
        String closed = act(kai, board, "vote", "{\"ideaId\":\"%s\"}".formatted(soca), 200);
        assertThat(JsonPath.<Boolean>read(closed, "$.view.closed")).isTrue();
        assertThat(JsonPath.<String>read(closed, "$.view.winnerId")).isEqualTo(porto);
        assertThat(JsonPath.<List<Integer>>read(closed, "$.view.ideas[*].votes"))
                .containsExactly(2, 1);
        assertThat(JsonPath.<List<Integer>>read(closed, "$.view.ideas[*].percent"))
                .containsExactly(67, 33);
        assertThat(JsonPath.<List<String>>read(closed, "$.view.ideas[0].voters[*].name"))
                .containsExactlyInAnyOrder("Nora", "Lea");
        assertThat(JsonPath.<Boolean>read(closed, "$.view.tied")).isFalse();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, lea), "$.glance"))
                .isEqualTo("Porto it is · 2 votes");
        String after = today(lea);
        assertThat(JsonPath.<List<String>>read(after, "$.fresh[?(@.thingId == '" + board + "')].note"))
                .containsExactly("Porto it is");
        assertThat(JsonPath.<List<String>>read(after, "$.fresh[?(@.thingId == '" + board + "')].pill"))
                .containsExactly("2 votes");
        // Closed stays closed.
        assertThat(act(nora, board, "vote", "{\"ideaId\":\"%s\"}".formatted(soca), 409))
                .contains("The vote is closed");
        act(nora, board, "unvote", "{}", 409);
        add(nora, board, "idea", "{\"name\":\"Sicily\"}", 409);
        send(HttpMethod.DELETE, "/v1/board-entries/" + porto, nora, null, 409);

        // Made a trip: a folder under Trips with a page that holds the facts. Doing it twice makes one.
        String made = act(lea, board, "make_trip", "{}", 200);
        String folder = JsonPath.read(made, "$.view.tripFolderId");
        assertThat(JsonPath.<String>read(act(nora, board, "make_trip", "{}", 200), "$.view.tripFolderId"))
                .isEqualTo(folder);
        String asFolder = fetch("/v1/folders/" + folder, kai);
        assertThat(JsonPath.<String>read(asFolder, "$.title")).isEqualTo("Porto");
        assertThat(JsonPath.<List<String>>read(asFolder, "$.breadcrumb[*].title"))
                .containsExactly("Trips");
        assertThat(fetch("/v1/circles/" + crew + "/search?q=Porto: the plan", kai))
                .contains("Porto: the plan");
        assertThat(JsonPath.<List<Object>>read(today(lea), "$.fresh[?(@.thingId == '" + board + "')]"))
                .isEmpty();
    }

    // ---------- 19.6 the dictionary ----------

    @Test
    void theDictionaryKeepsEachWordWithWhoCoinedItAndTellsTheCrewOfANewOne() throws Exception {
        String board = board(lea, crew, "dictionary", null, null);
        add(
                nora,
                board,
                "word",
                "{\"word\":\"second breakfast\",\"part\":\"noun\",\"meaning\":\"Not optional. Scheduled.\",\"origin\":\"every trip since 2019\"}");
        String word = add(
                lea,
                board,
                "word",
                "{\"word\":\"doing a Kai\",\"part\":\"verb\",\"meaning\":\"Reaching the gate as it closes, with a pastry.\",\"coinedByMemberId\":\"%s\",\"origin\":\"Lisbon airport\",\"firstRecorded\":\"%s\",\"mediaId\":\"%s\"}"
                        .formatted(leaId, TODAY.minusDays(38), uploadPhoto(lea)));
        add(lea, board, "word", "{\"word\":\"alone\"}", 400);
        add(
                lea,
                board,
                "word",
                "{\"word\":\"early\",\"meaning\":\"Not yet\",\"firstRecorded\":\"%s\"}".formatted(TODAY.plusDays(1)),
                400);
        add(
                kai,
                board,
                "word",
                "{\"word\":\"the long way\",\"meaning\":\"The way that is shorter.\",\"coinedByName\":\"A taxi driver\"}");

        String seen = view(kai, board);
        assertThat(JsonPath.<Integer>read(seen, "$.view.total")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.words[*].word"))
                .containsExactly("the long way", "doing a Kai", "second breakfast");
        assertThat(JsonPath.<String>read(seen, "$.view.words[0].coinedByName")).isEqualTo("A taxi driver");
        assertThat(JsonPath.<Object>read(seen, "$.view.words[0].coinedBy")).isNull();
        assertThat(JsonPath.<String>read(seen, "$.view.words[1].coinedBy.name")).isEqualTo("Lea");
        assertThat(JsonPath.<String>read(seen, "$.view.words[1].firstRecorded"))
                .isEqualTo(TODAY.minusDays(38).toString());
        assertThat(JsonPath.<String>read(seen, "$.view.words[1].photo.url")).contains("/media/");
        // Left out, whoever wrote it down coined it.
        assertThat(JsonPath.<String>read(seen, "$.view.words[2].coinedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, kai), "$.glance"))
                .isEqualTo("3 words · newest: the long way");

        change(nora, word, "{\"seeAlso\":\"gate cardio\"}", 200);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + board + "/entries?q=gate cardio", kai), "$.items[*].word"))
                .containsExactly("doing a Kai");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + board + "/entries?member=" + noraId, kai), "$.items[*].word"))
                .containsExactly("second breakfast");
        assertThat(fetch("/v1/circles/" + crew + "/search?q=with a pastry", nora))
                .contains(board);
        // The newest word is told to the crew.
        assertThat(JsonPath.<List<String>>read(today(nora), "$.fresh[?(@.title == 'New word')].note"))
                .containsExactly("“the long way”");
    }

    // ---------- 19.7 predictions ----------

    @Test
    void aPredictionIsSealedUntilItsDayForEveryoneItsWriterIncluded() throws Exception {
        String secret = "Walrus tamer in Tromso";
        String draft = "Pelican keeper, maybe";
        String board = board(
                lea,
                crew,
                "predictions",
                null,
                "{\"opensOn\":\"%s\",\"occasion\":\"the reunion\"}".formatted(TODAY.plusYears(5)));
        newBoard(lea, crew, "predictions", null, "{\"opensOn\":\"%s\"}".formatted(TODAY), 400);
        String sealed =
                add(nora, board, "prediction", "{\"aboutMemberId\":\"%s\",\"text\":\"%s\"}".formatted(leaId, secret));
        String unsealed = add(
                nora,
                board,
                "prediction",
                "{\"aboutMemberId\":\"%s\",\"text\":\"%s\",\"seal\":false}".formatted(kaiId, draft));
        add(lea, board, "prediction", "{\"aboutMemberId\":\"%s\",\"text\":\"Runs a bookshop\"}".formatted(noraId));
        // One about each of the others, never about yourself.
        assertThat(add(
                        nora,
                        board,
                        "prediction",
                        "{\"aboutMemberId\":\"%s\",\"text\":\"Another\"}".formatted(leaId),
                        409))
                .contains("You've already written one about Lea");
        add(nora, board, "prediction", "{\"aboutMemberId\":\"%s\",\"text\":\"Me\"}".formatted(noraId), 400);
        add(nora, board, "prediction", "{\"aboutMemberId\":\"%s\"}".formatted(kaiId), 409);

        // Sealed: nobody reads it, not the person it is about, not its writer. All three see the same envelope.
        for (String who : List.of(lea, nora, kai)) {
            assertNowhere(who, crew, board, secret);
            String seen = view(who, board);
            assertThat(JsonPath.<List<String>>read(seen, "$.view.items[?(@.id == '" + sealed + "')].by.name"))
                    .containsExactly("Nora");
            assertThat(JsonPath.<List<String>>read(seen, "$.view.items[?(@.id == '" + sealed + "')].about.name"))
                    .containsExactly("Lea");
            assertThat(JsonPath.<List<Boolean>>read(seen, "$.view.items[?(@.id == '" + sealed + "')].sealed"))
                    .containsExactly(true);
            assertThat(JsonPath.<List<Object>>read(seen, "$.view.items[?(@.id == '" + sealed + "')].text"))
                    .containsExactly((Object) null);
            assertThat(JsonPath.<Boolean>read(seen, "$.view.open")).isFalse();
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, who), "$.glance"))
                    .startsWith("2 sealed · opens ");
        }
        // A draft is its writer's alone: the others aren't told it is there, and the count they see leaves it out.
        for (String who : List.of(lea, kai)) {
            assertNowhere(who, crew, board, draft);
            assertThat(JsonPath.<Integer>read(view(who, board), "$.view.items.length()"))
                    .isEqualTo(2);
            assertThat(JsonPath.<List<Integer>>read(
                            view(who, board), "$.view.writers[?(@.person.name == 'Nora')].written"))
                    .containsExactly(1);
        }
        String noras = view(nora, board);
        assertThat(JsonPath.<List<String>>read(noras, "$.view.items[?(@.draft == true)].text"))
                .containsExactly(draft);
        assertThat(JsonPath.<List<Integer>>read(noras, "$.view.writers[?(@.you == true)].written"))
                .containsExactly(2);
        assertThat(JsonPath.<List<Integer>>read(noras, "$.view.writers[?(@.you == true)].drafts"))
                .containsExactly(1);
        assertThat(JsonPath.<List<Integer>>read(noras, "$.view.writers[?(@.you == true)].of"))
                .containsExactly(2);
        assertThat(JsonPath.<List<List<Object>>>read(noras, "$.view.writers[?(@.you == true)].stillAbout"))
                .containsExactly(List.of());
        assertThat(JsonPath.<List<String>>read(view(kai, board), "$.view.writers[?(@.you == true)].stillAbout[*].name"))
                .containsExactly("Lea", "Nora");
        change(lea, unsealed, "{\"text\":\"Rewritten\"}", 404);
        act(lea, board, "seal", "{\"entryId\":\"%s\"}".formatted(unsealed), 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + unsealed, kai, null, 404);

        // Its writer changes it, seals it, and from then on can't read or change it either.
        change(nora, unsealed, "{\"text\":\"%s for good\"}".formatted(draft), 200);
        act(nora, board, "seal", "{}", 200);
        assertNowhere(nora, crew, board, draft);
        assertThat(change(nora, unsealed, "{\"text\":\"One more word\"}", 409)).contains("Sealed means sealed");
        assertThat(change(lea, sealed, "{\"text\":\"Peek\"}", 409)).contains("Sealed means sealed");
        send(HttpMethod.DELETE, "/v1/board-entries/" + sealed, lea, null, 403);
        act(kai, board, "mark", "{\"predictionId\":\"%s\",\"right\":true}".formatted(sealed), 409);
        // A phone that says it is 2099 opens nothing, and the day can't be pulled forward.
        assertThat(fetch("/v1/boards/" + board + "?day=2099-01-01", lea)).doesNotContain(secret);
        assertThat(send(
                        HttpMethod.PATCH,
                        "/v1/boards/" + board,
                        lea,
                        "{\"settings\":{\"opensOn\":\"%s\"}}".formatted(TODAY.plusDays(1)),
                        409))
                .contains("The day they open can't change now");

        // The day comes: everyone reads all of them, and says who was right. Nobody marks their own.
        setSetting(board, "opensOn", TODAY.toString());
        for (String who : List.of(lea, nora, kai)) {
            String open = view(who, board);
            assertThat(JsonPath.<Boolean>read(open, "$.view.open")).isTrue();
            assertThat(JsonPath.<List<String>>read(open, "$.view.items[*].text"))
                    .containsExactly(secret, draft + " for good", "Runs a bookshop");
            assertThat(JsonPath.<List<String>>read(today(who), "$.items[*].note"))
                    .containsExactly("The predictions open today");
        }
        assertThat(fetch("/v1/circles/" + crew + "/search?q=Walrus", kai)).contains(board);
        assertThat(act(nora, board, "mark", "{\"predictionId\":\"%s\",\"right\":true}".formatted(sealed), 409))
                .contains("It's your own prediction");
        act(lea, board, "mark", "{\"predictionId\":\"%s\",\"right\":true}".formatted(sealed), 200);
        act(kai, board, "mark", "{\"predictionId\":\"%s\",\"right\":false}".formatted(sealed), 200);
        String marked = act(kai, board, "mark", "{\"predictionId\":\"%s\",\"right\":true}".formatted(sealed), 200);
        assertThat(JsonPath.<List<Integer>>read(marked, "$.view.items[?(@.id == '" + sealed + "')].right"))
                .containsExactly(2);
        assertThat(JsonPath.<List<String>>read(marked, "$.view.items[?(@.id == '" + sealed + "')].verdict"))
                .containsExactly("right");
        assertThat(JsonPath.<List<Boolean>>read(marked, "$.view.items[?(@.id == '" + sealed + "')].yourMark"))
                .containsExactly(true);
        assertThat(add(
                        lea,
                        board,
                        "prediction",
                        "{\"aboutMemberId\":\"%s\",\"text\":\"Too late\"}".formatted(kaiId),
                        409))
                .contains("They have opened");
    }

    // ---------- 19.8 the awards ----------

    @Test
    void anAwardIsVotedInPrivateAndItsResultIsShownOnlyOnceItIsDecided() throws Exception {
        String board = board(lea, crew, "awards", null, null);
        String award = add(lea, board, "award", "{\"name\":\"Most likely to miss the flight\",\"emoji\":\"🏆\"}");
        String forKai = add(lea, board, "nominee", "{\"awardId\":\"%s\",\"memberId\":\"%s\"}".formatted(award, kaiId));
        String forLea = add(
                nora,
                board,
                "nominee",
                "{\"awardId\":\"%s\",\"memberId\":\"%s\",\"what\":\"the Porto bus\"}".formatted(award, leaId));
        add(nora, board, "nominee", "{\"awardId\":\"%s\"}".formatted(award), 400);
        String vote = "{\"nomineeId\":\"%s\"}";
        act(kai, board, "vote", vote.formatted(forKai), 200);
        act(nora, board, "vote", vote.formatted(forLea), 200);
        act(nora, board, "vote", vote.formatted(forKai), 200);

        // While it is open: how many have voted, never for whom. Each sees only their own vote.
        for (String who : List.of(lea, nora, kai)) {
            String open = view(who, board);
            assertThat(JsonPath.<Boolean>read(open, "$.view.awards[0].decided")).isFalse();
            assertThat(JsonPath.<Integer>read(open, "$.view.awards[0].voted")).isEqualTo(2);
            assertThat(JsonPath.<Integer>read(open, "$.view.awards[0].asked")).isEqualTo(3);
            assertThat(JsonPath.<Object>read(open, "$.view.awards[0].totalVotes"))
                    .isNull();
            assertThat(JsonPath.<List<Object>>read(open, "$.view.awards[0].nominees[*].votes"))
                    .containsOnly((Object) null);
            assertThat(JsonPath.<List<Boolean>>read(open, "$.view.awards[0].nominees[*].winner"))
                    .containsOnly(false);
            assertThat(JsonPath.<List<Boolean>>read(open, "$.view.awards[0].nominees[*].ownVoteIncluded"))
                    .containsOnly(false);
            assertThat(JsonPath.<List<String>>read(open, "$.view.awards[0].nominees[*].person.name"))
                    .containsExactly("Kai", "Lea");
            assertThat(JsonPath.<Boolean>read(open, "$.view.awards[0].youVoted"))
                    .isEqualTo(!who.equals(lea));
            assertThat(JsonPath.<Object>read(open, "$.view.awards[0].yourNomineeId"))
                    .isEqualTo(who.equals(lea) ? null : forKai);
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, who), "$.glance"))
                    .isEqualTo("0 decided · 1 voting");
            assertThat(JsonPath.<List<Object>>read(fetch("/v1/boards/" + board + "/entries", who), "$.items"))
                    .isEmpty();
        }
        String aVote = jdbc.sql(
                        "select cast(id as text) from board_entries where board_id = cast(:board as uuid) and kind = 'vote' and author_id = cast(:voter as uuid)")
                .param("board", board)
                .param("voter", kaiId)
                .query(String.class)
                .single();
        change(lea, aVote, "{}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + aVote, lea, null, 404);
        assertThat(view(lea, board)).doesNotContain(aVote);
        // The awards are found by their names, never by a vote.
        assertThat(fetch("/v1/circles/" + crew + "/search?q=miss the flight", nora))
                .contains(board);

        // The last vote decides it: Kai, two of three votes, his own included.
        String decided = act(lea, board, "vote", vote.formatted(forLea), 200);
        assertThat(JsonPath.<Boolean>read(decided, "$.view.awards[0].decided")).isTrue();
        assertThat(JsonPath.<Integer>read(decided, "$.view.awards[0].totalVotes"))
                .isEqualTo(3);
        assertThat(JsonPath.<List<Integer>>read(decided, "$.view.awards[0].nominees[*].votes"))
                .containsExactly(2, 1);
        assertThat(JsonPath.<List<Boolean>>read(decided, "$.view.awards[0].nominees[*].winner"))
                .containsExactly(true, false);
        assertThat(JsonPath.<Boolean>read(decided, "$.view.awards[0].nominees[0].ownVoteIncluded"))
                .isTrue();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, kai), "$.glance"))
                .isEqualTo("1 decided");
        // Decided stays decided.
        assertThat(act(nora, board, "vote", vote.formatted(forLea), 409)).contains("This award is decided");
        act(nora, board, "unvote", "{\"awardId\":\"%s\"}".formatted(award), 409);
        add(kai, board, "nominee", "{\"awardId\":\"%s\",\"memberId\":\"%s\"}".formatted(award, noraId), 409);
        send(HttpMethod.DELETE, "/v1/board-entries/" + forKai, lea, null, 409);

        // One that is still open on New Year's Eve is decided then, with the votes there are. Two with the same
        // number of votes both win.
        String second = add(nora, board, "award", "{\"name\":\"Find of the year\"}");
        String bar = add(
                nora,
                board,
                "nominee",
                "{\"awardId\":\"%s\",\"memberId\":\"%s\",\"what\":\"the tiled bar\"}".formatted(second, noraId));
        String bakery = add(
                kai,
                board,
                "nominee",
                "{\"awardId\":\"%s\",\"memberId\":\"%s\",\"what\":\"the bakery\"}".formatted(second, kaiId));
        act(lea, board, "vote", vote.formatted(bar), 200);
        act(kai, board, "vote", vote.formatted(bakery), 200);
        assertThat(JsonPath.<List<Object>>read(view(nora, board), "$.view.awards[1].nominees[*].votes"))
                .containsOnly((Object) null);
        assertThat(act(nora, board, "decide", "{\"awardId\":\"%s\"}".formatted(second), 200))
                .contains("\"decided\":true");
        // Seen as last year's awards, everything was decided on its New Year's Eve.
        String third = add(lea, board, "award", "{\"name\":\"Loudest laugh\"}");
        add(lea, board, "nominee", "{\"awardId\":\"%s\",\"memberId\":\"%s\"}".formatted(third, noraId));
        jdbc.sql("update board_entries set amount = :year where id = cast(:id as uuid)")
                .param("year", TODAY.getYear() - 1)
                .param("id", third)
                .update();
        String now = view(kai, board);
        assertThat(JsonPath.<List<String>>read(now, "$.view.awards[*].name"))
                .containsExactly("Most likely to miss the flight", "Find of the year");
        assertThat(JsonPath.<List<Boolean>>read(now, "$.view.awards[1].nominees[*].winner"))
                .containsExactly(true, true);
        assertThat(JsonPath.<List<Integer>>read(now, "$.view.years")).containsExactly(TODAY.getYear() - 1);
        String lastYear = fetch("/v1/boards/" + board + "?show=" + (TODAY.getYear() - 1), kai);
        assertThat(JsonPath.<List<String>>read(lastYear, "$.view.awards[*].name"))
                .containsExactly("Loudest laugh");
        assertThat(JsonPath.<Boolean>read(lastYear, "$.view.awards[0].decided")).isTrue();
        assertThat(JsonPath.<Boolean>read(lastYear, "$.view.open")).isTrue();
        assertThat(JsonPath.<Integer>read(lastYear, "$.view.awards[0].totalVotes"))
                .isZero();
    }

    // ---------- 19.9 a goal you walk together ----------

    @Test
    void theWalkAddsUpWhatEachPersonTypesAndKeepsNothingButTheNumber() throws Exception {
        String board =
                board(lea, crew, "walk_together", null, "{\"from\":\"Ljubljana\",\"to\":\"Lisbon\",\"goal\":2100000}");
        assertThat(newBoard(lea, crew, "walk_together", null, "{\"to\":\"Lisbon\"}", 400))
                .contains("Say how far it is");
        newBoard(lea, crew, "walk_together", null, "{\"goal\":5,\"unit\":\"miles\"}", 400);
        add(lea, board, "stop", "{\"name\":\"Milan\",\"at\":490000}");
        LocalDate monday = TODAY.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
        String norasWalk = add(nora, board, "walk", "{\"amount\":31000,\"day\":\"%s\"}".formatted(monday));
        add(lea, board, "walk", "{\"amount\":44000}");
        add(kai, board, "walk", "{\"amount\":500000,\"day\":\"%s\"}".formatted(monday.minusDays(3)));
        assertThat(add(kai, board, "walk", "{}", 400)).contains("Type how far you walked");
        add(kai, board, "walk", "{\"amount\":1000,\"day\":\"%s\"}".formatted(TODAY.plusDays(1)), 400);
        add(kai, board, "walk", "{\"amount\":900000}", 400);

        String seen = view(nora, board);
        assertThat(JsonPath.<Integer>read(seen, "$.view.total")).isEqualTo(575000);
        assertThat(JsonPath.<Integer>read(seen, "$.view.percent")).isEqualTo(27);
        assertThat(JsonPath.<Integer>read(seen, "$.view.thisWeek")).isEqualTo(75000);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.people[*].person.name"))
                .containsExactly("Lea", "Nora", "Kai");
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.people[*].thisWeek"))
                .containsExactly(44000, 31000, 0);
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.people[*].total")).containsExactly(44000, 31000, 500000);
        assertThat(JsonPath.<List<Boolean>>read(seen, "$.view.stops[*].reached"))
                .containsExactly(true);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.yours[*].id")).containsExactly(norasWalk);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, kai), "$.glance"))
                .isEqualTo("575 of 2,100 km · 27%");
        String norasToday = today(nora);
        assertThat(JsonPath.<String>read(norasToday, "$.cards[0].figure")).isEqualTo("27%");
        assertThat(JsonPath.<String>read(norasToday, "$.cards[0].title")).isEqualTo("A goal you walk together");
        assertThat(JsonPath.<String>read(norasToday, "$.cards[0].line"))
                .isEqualTo("575 of 2,100 km · you added 31 this week");
        assertThat(JsonPath.<String>read(today(kai), "$.cards[0].line"))
                .isEqualTo("575 of 2,100 km · nothing from you yet this week");

        // A walk is its walker's own: nobody else changes or removes it.
        change(lea, norasWalk, "{\"amount\":1}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + norasWalk, kai, null, 403);
        change(nora, norasWalk, "{\"amount\":33000}", 200);
        assertThat(JsonPath.<Integer>read(view(lea, board), "$.view.total")).isEqualTo(577000);
        // Someone who may only look at the board still adds their own walks, and nothing else.
        send(
                HttpMethod.PUT,
                "/v1/things/" + board + "/audience",
                lea,
                "{\"audience\":\"circle\",\"everyoneEdits\":false}",
                200);
        add(kai, board, "walk", "{\"amount\":2000}");
        add(kai, board, "stop", "{\"name\":\"Lyon\",\"at\":950000}", 403);

        // What is kept for a walk: who, the day, and the number. Nothing else has anywhere to go.
        assertThat(jdbc.sql("""
                    select count(*) from board_entries where board_id = cast(:board as uuid) and kind = 'walk'
                      and (doc <> '{}'::jsonb or media_id is not null or token is not null or opens_at is not null
                           or parent_id is not null or done_at is not null)
                    """).param("board", board).query(Integer.class).single())
                .isZero();
        add(
                nora,
                board,
                "walk",
                "{\"amount\":1000,\"route\":\"along the river\",\"heartRate\":120,\"note\":\"felt great\"}");
        assertThat(jdbc.sql(
                                "select count(*) from board_entries where board_id = cast(:board as uuid) and cast(doc as text) <> '{}'")
                        .param("board", board)
                        .query(Integer.class)
                        .single())
                .isEqualTo(1); // the one place along the way, and its name
        assertThat(view(lea, board)).doesNotContain("river").doesNotContain("heartRate");

        // The last metres: they arrive.
        for (int n = 0; n < 4; n++) {
            add(lea, board, "walk", "{\"amount\":400000}");
        }
        String arrived = view(nora, board);
        assertThat(JsonPath.<Boolean>read(arrived, "$.view.reached")).isTrue();
        assertThat(JsonPath.<Integer>read(arrived, "$.view.percent")).isEqualTo(100);
        assertThat(JsonPath.<String>read(today(nora), "$.cards[0].line")).isEqualTo("You made it to Lisbon: 2,100 km");
    }
}
