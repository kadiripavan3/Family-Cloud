package app.homeport.api.journey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Page;
import app.homeport.api.journey.JourneyPort.AwayJourney;
import app.homeport.api.journey.JourneyPort.JourneyBrief;
import app.homeport.api.journey.JourneyPort.PostedJourney;
import app.homeport.api.journey.JourneyPort.Story;
import app.homeport.api.journey.JourneyPort.StoryShot;
import app.homeport.api.journey.JourneyPort.Traveller;
import app.homeport.api.journey.LeavingHome.Candidate;
import app.homeport.api.journey.LeavingHome.DayWords;
import app.homeport.api.journey.LeavingHome.Switches;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * The adapter for Journey's real API, tried against a small server that answers the way Journey's description
 * (its openapi.json) says Journey does. No Journey and no network are needed. Every answer here is cut from
 * that description: the same fields, with the same names.
 */
class HttpJourneyTest {

    private record Call(String method, String path, String authorization, String body) {}

    private static final String NORA = "0b5d7a52-58ad-4c57-8f09-4e7a1f1e0001";
    private static final String ALEX = "0b5d7a52-58ad-4c57-8f09-4e7a1f1e0002";
    private static final String ICELAND = "5f0d2a8e-1111-4a1b-9c3d-000000000001";
    private static final Caller AS_NORA = new Caller(UUID.fromString(NORA), "noras-token");

    private HttpServer server;
    private final List<Call> calls = new CopyOnWriteArrayList<>();
    /** What the server answers, by "METHOD /path?query". Anything else is 404, as Journey answers. */
    private final Map<String, String> answers = new HashMap<>();

    private final Map<String, Integer> statuses = new HashMap<>();
    private final Map<String, byte[]> stored = new HashMap<>();
    private HttpJourney journey;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String query = exchange.getRequestURI().getRawQuery();
            String path = exchange.getRequestURI().getPath() + (query == null ? "" : "?" + query);
            byte[] sent = exchange.getRequestBody().readAllBytes();
            String key = exchange.getRequestMethod() + " " + path;
            calls.add(new Call(
                    exchange.getRequestMethod(),
                    path,
                    exchange.getRequestHeaders().getFirst("Authorization"),
                    path.startsWith("/storage/")
                            ? "(" + sent.length + " bytes)"
                            : new String(sent, StandardCharsets.UTF_8)));
            if (exchange.getRequestMethod().equals("PUT") && path.startsWith("/storage/")) {
                stored.put(path, sent);
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }
            String answer = answers.get(key);
            int status = statuses.getOrDefault(key, answer == null ? 404 : 200);
            byte[] body = (answer == null
                            ? "{\"type\":\"about:blank\",\"status\":404,\"detail\":\"We couldn't find that.\",\"code\":\"not_found\"}"
                            : answer)
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            if (status == 204) {
                exchange.sendResponseHeaders(204, -1);
            } else {
                exchange.sendResponseHeaders(status, body.length);
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        server.start();
        journey = new HttpJourney(address(""), "journey://", new MediaStorage() {
            @Override
            public UploadTarget uploadTarget(UUID mediaId, String storageKey, String contentType) {
                throw new UnsupportedOperationException();
            }

            @Override
            public String publicUrl(String storageKey) {
                return "https://media.example.org/" + storageKey;
            }

            @Override
            public OptionalLong size(String storageKey) {
                return OptionalLong.empty();
            }

            @Override
            public InputStream open(String storageKey) {
                return new ByteArrayInputStream(("bytes of " + storageKey).getBytes(StandardCharsets.UTF_8));
            }

            @Override
            public void put(String storageKey, byte[] bytes, String contentType) {}

            @Override
            public void delete(String storageKey) {}
        });
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private String address(String path) {
        return "http://127.0.0.1:" + server.getAddress().getPort() + path;
    }

    // ---------- Journey's answers, as its description gives them ----------

    private static String person(String id, String username, String name) {
        return "{\"id\":\"%s\",\"username\":\"%s\",\"displayName\":\"%s\",\"avatarUrl\":null}"
                .formatted(id, username, name);
    }

    private String journeyJson(
            String id, String title, String status, String visibility, boolean mine, String authors) {
        return """
            {"id":"%s","title":"%s","description":"","category":"travel","template":"trip","labelStyle":"day",
             "visibility":"%s","status":"%s","tags":[],"coverUrl":"%s","coverThumbUrl":null,"startDate":"2026-04-01",
             "targetDays":null,"latestNumber":14,"progressLabel":"Day 14","entryCount":62,"followerCount":58,
             "lastEntryAt":"2026-04-14T20:30:00Z","completedAt":null,"closingNote":"Not enough.","shareUrl":null,
             "owner":%s,"authors":[%s],
             "viewer":{"isOwner":%s,"isFollowing":true,"canAddEntry":%s,"isMember":false,"lastReadAt":null},
             "pausedAutomatically":false}
            """.formatted(
                        id,
                        title,
                        visibility,
                        status,
                        address("/files/cover.jpg"),
                        person(NORA, "nora", "Nora Lind"),
                        authors,
                        mine,
                        mine);
    }

    private String media(String id, String kind, String more) {
        return """
            {"id":"%s","kind":"%s","status":"ready","url":"%s","thumbUrl":"%s","playbackUrl":%s,"width":2048,
             "height":1536,"durationSeconds":%s,"held":false%s}
            """.formatted(
                        id,
                        kind,
                        address("/files/" + id + ".jpg"),
                        address("/files/" + id + ".w800.jpg"),
                        kind.equals("video") ? "\"https://stream.example/" + id + ".m3u8\"" : "null",
                        kind.equals("video") ? "12" : "null",
                        more);
    }

    private String entryJson(String id, int number, String day, String title, String mediaJson) {
        return """
            {"id":"%s","journeyId":"%s","journeyTitle":"Iceland ring road","author":%s,
             "happenedAt":"%sT20:30:00Z","happenedOn":"%s","label":"Day %d","number":%d,"position":%d,
             "title":"%s","body":"Words of day %d.","placeName":"Reykjavík","lat":64.15,"lng":-21.94,
             "locationPrecision":"city","isMilestone":false,"media":[%s],"likeCount":24,"commentCount":2,
             "createdAt":"%sT21:00:00Z","edited":false,"viewer":{"canEdit":true,"canDelete":true,"hasLiked":false}}
            """.formatted(
                        id,
                        ICELAND,
                        person(NORA, "nora", "Nora Lind"),
                        day,
                        day,
                        number,
                        number,
                        number,
                        title,
                        number,
                        mediaJson,
                        day);
    }

    private static String entryId(int n) {
        return "7a000000-0000-4000-8000-%012d".formatted(n);
    }

    private static String mediaId(int n) {
        return "7b000000-0000-4000-8000-%012d".formatted(n);
    }

    // ---------- reading ----------

    @Test
    void theProfileIsAskedForAsThePersonWithTheirOwnToken() {
        answers.put("GET /v1/me", """
            {"id":"%s","email":"nora@example.com","profile":{"id":"%s","username":"nora","displayName":"Nora Lind",
             "bio":"","link":null,"avatarUrl":"https://cdn.example/a.jpg","interests":[]}}
            """.formatted(NORA, NORA));
        answers.put("GET /v1/profiles/nora", """
            {"id":"%s","username":"nora","displayName":"Nora Lind","bio":"","link":null,"avatarUrl":null,
             "journeyCount":7,"entryCount":300,"followerCount":112,"followingCount":58,
             "viewer":{"isMe":true,"isFollowing":false,"followsYou":false,"hasBlocked":false}}
            """.formatted(NORA));

        Traveller nora = journey.profile(AS_NORA).orElseThrow();

        assertThat(nora.username()).isEqualTo("nora");
        assertThat(nora.displayName()).isEqualTo("Nora Lind");
        assertThat(nora.avatarUrl()).isEqualTo("https://cdn.example/a.jpg");
        assertThat(nora.following()).isEqualTo(58);
        assertThat(nora.followers()).isEqualTo(112);
        assertThat(nora.journeys()).isEqualTo(7);
        assertThat(nora.openUrl()).isEqualTo("journey://profile/nora");
        assertThat(calls).extracting(Call::path).containsExactly("/v1/me", "/v1/profiles/nora");
        assertThat(calls).allSatisfy(call -> assertThat(call.authorization()).isEqualTo("Bearer noras-token"));

        // Someone who signed in and never made a Journey profile: Journey says so, and there is no profile.
        answers.put("GET /v1/me", "{\"id\":\"%s\",\"email\":\"new@example.com\",\"profile\":null}".formatted(NORA));
        assertThat(journey.profile(AS_NORA)).isEmpty();
    }

    @Test
    void theirJourneysAreAPageOfJourneysWithJourneysOwnCursor() {
        answers.put(
                "GET /v1/me/journeys?limit=20",
                "{\"items\":[%s],\"nextCursor\":\"abc\"}"
                        .formatted(journeyJson(
                                ICELAND,
                                "Iceland ring road",
                                "completed",
                                "public",
                                true,
                                person(NORA, "nora", "Nora Lind") + "," + person(ALEX, "alex", "Alex Strand"))));
        answers.put("GET /v1/me/journeys?limit=20&cursor=abc", "{\"items\":[],\"nextCursor\":null}");

        Page<JourneyBrief> first = journey.journeys(AS_NORA, null, 20);

        JourneyBrief iceland = first.items().get(0);
        assertThat(iceland.title()).isEqualTo("Iceland ring road");
        assertThat(iceland.status()).isEqualTo(JourneyStatus.COMPLETED);
        assertThat(iceland.visibility()).isEqualTo(JourneyVisibility.PUBLIC);
        assertThat(iceland.entries()).isEqualTo(62);
        assertThat(iceland.followers()).isEqualTo(58);
        assertThat(iceland.progressLabel()).isEqualTo("Day 14");
        assertThat(iceland.days()).as("from its first day to its last entry").isEqualTo(14);
        assertThat(iceland.authors())
                .extracting(JourneyPort.JourneyPerson::name)
                .containsExactly("Nora Lind", "Alex Strand");
        assertThat(iceland.mine()).isTrue();
        assertThat(iceland.photos()).as("a list doesn't carry the photo count").isNull();
        assertThat(iceland.openUrl()).isEqualTo("journey://journey/" + ICELAND);
        assertThat(first.nextCursor()).isEqualTo("abc");
        assertThat(journey.journeys(AS_NORA, "abc", 20).items()).isEmpty();
    }

    @Test
    void oneJourneyComesWithTheNumbersOfItsRecapAndOneThatIsNotThereIsEmpty() {
        answers.put(
                "GET /v1/journeys/" + ICELAND,
                journeyJson(
                        ICELAND, "Iceland ring road", "completed", "public", true, person(NORA, "nora", "Nora Lind")));
        answers.put("GET /v1/journeys/" + ICELAND + "/recap", """
            {"journey":%s,"dayCount":14,"entryCount":62,"placeCount":11,"photoCount":214,"likeCount":900,
             "firstDay":"2026-04-01","lastDay":"2026-04-14","momentUrls":[]}
            """.formatted(journeyJson(
                ICELAND, "Iceland ring road", "completed", "public", true, person(NORA, "nora", "Nora Lind"))));

        JourneyBrief iceland =
                journey.journey(AS_NORA, UUID.fromString(ICELAND)).orElseThrow();

        assertThat(iceland.days()).isEqualTo(14);
        assertThat(iceland.photos()).isEqualTo(214);
        assertThat(iceland.places()).isEqualTo(11);
        assertThat(iceland.lastDay()).isEqualTo(LocalDate.of(2026, 4, 14));
        assertThat(iceland.clips())
                .as("Journey doesn't count clips on the recap")
                .isNull();
        // A private journey of someone else looks exactly like one that doesn't exist: 404, and so it is empty here.
        assertThat(journey.journey(AS_NORA, UUID.randomUUID())).isEmpty();
    }

    @Test
    void aWholeStoryIsReadPageAfterPageAndOnlyByItsAuthors() {
        String mine = journeyJson(
                ICELAND, "Iceland ring road", "completed", "public", true, person(NORA, "nora", "Nora Lind"));
        answers.put("GET /v1/journeys/" + ICELAND, mine);
        answers.put(
                "GET /v1/journeys/" + ICELAND + "/entries?limit=100",
                "{\"items\":[%s,%s],\"nextCursor\":\"page2\",\"prevCursor\":null,\"total\":3}"
                        .formatted(
                                entryJson(
                                        entryId(1),
                                        1,
                                        "2026-04-01",
                                        "Picked up the van",
                                        media(mediaId(1), "photo", "") + "," + media(mediaId(2), "video", "")),
                                entryJson(
                                        entryId(2),
                                        2,
                                        "2026-04-02",
                                        "",
                                        media(
                                                        mediaId(3),
                                                        "photo",
                                                        ",\"takenAt\":\"2026-04-02T08:05:30Z\",\"originalHash\":\""
                                                                + "ab".repeat(32) + "\"")
                                                .replace("\"status\":\"ready\"", "\"status\":\"ready\""))));
        answers.put(
                "GET /v1/journeys/" + ICELAND + "/entries?limit=100&cursor=page2",
                "{\"items\":[%s],\"nextCursor\":null,\"prevCursor\":\"x\",\"total\":3}"
                        .formatted(entryJson(
                                entryId(3),
                                3,
                                "2026-04-03",
                                "Black sand",
                                media(mediaId(4), "photo", "").replace("\"held\":false", "\"held\":true") + ","
                                        + media(mediaId(5), "photo", "")
                                                .replace("\"status\":\"ready\"", "\"status\":\"processing\""))));

        Story story = journey.story(AS_NORA, UUID.fromString(ICELAND));

        assertThat(story.entries())
                .extracting(JourneyPort.StoryEntry::label)
                .containsExactly("Day 1", "Day 2", "Day 3");
        JourneyPort.StoryEntry first = story.entries().get(0);
        assertThat(first.title()).isEqualTo("Picked up the van");
        assertThat(first.body()).isEqualTo("Words of day 1.");
        assertThat(first.happenedOn()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(first.placeName()).isEqualTo("Reykjavík");
        assertThat(first.lat()).isEqualTo(64.15);
        assertThat(first.likes()).isEqualTo(24);
        assertThat(first.comments()).isEqualTo(2);
        // A photo is fetched from its own address, at Journey's largest size. A clip can only be played today.
        StoryShot photo = first.shots().get(0);
        assertThat(photo.kind()).isEqualTo(MediaKind.PHOTO);
        assertThat(photo.fileUrl()).isEqualTo(address("/files/" + mediaId(1) + ".jpg"));
        assertThat(photo.width()).isEqualTo(2048);
        assertThat(photo.takenAt())
                .as("today's Journey doesn't say when a photo was taken")
                .isNull();
        assertThat(photo.originalHash()).isNull();
        StoryShot clip = first.shots().get(1);
        assertThat(clip.kind()).isEqualTo(MediaKind.VIDEO);
        assertThat(clip.fileUrl()).isNull();
        assertThat(clip.durationSeconds()).isEqualTo(12);
        // The day Journey sends them, the time and the fingerprint are read without a change here.
        StoryShot later = story.entries().get(1).shots().get(0);
        assertThat(later.takenAt()).isEqualTo(Instant.parse("2026-04-02T08:05:30Z"));
        assertThat(later.originalHash()).isEqualTo("ab".repeat(32));
        // What is held for a reviewer, or isn't ready, is not brought home.
        assertThat(story.entries().get(2).shots()).isEmpty();
        assertThat(calls)
                .extracting(Call::path)
                .contains(
                        "/v1/journeys/" + ICELAND + "/entries?limit=100",
                        "/v1/journeys/" + ICELAND + "/entries?limit=100&cursor=page2");

        // Journey shows a public journey's entries to anyone. Bringing one home is for the people who wrote it.
        answers.put(
                "GET /v1/journeys/" + ICELAND,
                journeyJson(
                        ICELAND,
                        "Iceland ring road",
                        "completed",
                        "public",
                        false,
                        person(ALEX, "alex", "Alex Strand")));
        assertThatThrownBy(() -> journey.story(AS_NORA, UUID.fromString(ICELAND)))
                .isInstanceOfSatisfying(
                        ApiProblem.class,
                        problem -> assertThat(problem.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void aFileIsFetchedFromWhereFilesAreServedWithoutTheSignInAndAClipIsNotAvailableYet() {
        answers.put("GET /files/photo.jpg", "the bytes of a photo");
        StoryShot photo = new StoryShot(
                UUID.randomUUID(),
                MediaKind.PHOTO,
                address("/files/photo.jpg"),
                address("/files/photo.jpg"),
                10,
                10,
                null,
                null,
                null);

        assertThat(new String(journey.file(AS_NORA, photo), StandardCharsets.UTF_8))
                .isEqualTo("the bytes of a photo");
        assertThat(calls.get(0).authorization())
                .as("a file's address is not Journey's API: the token doesn't go there")
                .isNull();

        StoryShot clip = new StoryShot(
                UUID.randomUUID(), MediaKind.VIDEO, address("/files/still.jpg"), null, null, null, 12, null, null);
        assertThatThrownBy(() -> journey.file(AS_NORA, clip)).isInstanceOfSatisfying(ApiProblem.class, problem -> {
            assertThat(problem.status()).isEqualTo(HttpStatus.NOT_IMPLEMENTED);
            assertThat(problem.code()).isEqualTo("journey_not_yet");
        });
        assertThat(journey.notYet())
                .extracting(JourneyPort.NotYet::code)
                .contains("originals", "clips", "co_authors", "not_followed");
        // A file that is gone is "Journey didn't answer", not a crash.
        StoryShot gone = new StoryShot(
                UUID.randomUUID(),
                MediaKind.PHOTO,
                address("/files/gone.jpg"),
                address("/files/gone.jpg"),
                1,
                1,
                null,
                null,
                null);
        assertThatThrownBy(() -> journey.file(AS_NORA, gone))
                .isInstanceOfSatisfying(
                        ApiProblem.class, problem -> assertThat(problem.code()).isEqualTo("journey_unreachable"));
    }

    @Test
    void whoIsAwayIsReadFromTheJourneysThePersonFollows() {
        String lofoten = "5f0d2a8e-1111-4a1b-9c3d-000000000002";
        String finished = "5f0d2a8e-1111-4a1b-9c3d-000000000003";
        String someoneElses = "5f0d2a8e-1111-4a1b-9c3d-000000000004";
        String alex = person(ALEX, "alex", "Alex Strand");
        String kai = person("0b5d7a52-58ad-4c57-8f09-4e7a1f1e0009", "kai", "Kai");
        answers.put(
                "GET /v1/me/following?limit=100",
                "{\"items\":[%s,%s,%s],\"nextCursor\":null}"
                        .formatted(
                                journeyJson(lofoten, "Lofoten by bike", "active", "public", false, alex)
                                        .replace("\"progressLabel\":\"Day 14\"", "\"progressLabel\":\"Day 6 of 9\""),
                                journeyJson(finished, "Last summer", "completed", "public", false, alex),
                                journeyJson(someoneElses, "A build", "active", "public", false, kai)));
        answers.put("GET /v1/journeys/" + lofoten + "/summary", """
            {"first":null,"latest":[%s],"photos":[],"photoCount":9,"days":[1,2,4,5,6],"milestones":[],"newCount":2,
             "firstNewEntryId":null}
            """.formatted(entryJson(
                entryId(6), 6, "2026-11-11", "Ferry day, and finally a rest", media(mediaId(9), "photo", ""))));

        List<AwayJourney> away = journey.away(AS_NORA, List.of(UUID.fromString(ALEX)));

        assertThat(away).hasSize(1);
        assertThat(away.get(0).journey().title()).isEqualTo("Lofoten by bike");
        assertThat(away.get(0).journey().progressLabel()).isEqualTo("Day 6 of 9");
        assertThat(away.get(0).newCount()).isEqualTo(2);
        assertThat(away.get(0).latest().title()).isEqualTo("Ferry day, and finally a rest");
        // Only the active journey of someone asked about is looked into.
        assertThat(calls)
                .extracting(Call::path)
                .containsExactly("/v1/me/following?limit=100", "/v1/journeys/" + lofoten + "/summary");
    }

    @Test
    void aChallengesTickedDaysAreCounted() {
        answers.put(
                "GET /v1/journeys/" + ICELAND,
                journeyJson(ICELAND, "Family 10K", "active", "unlisted", true, person(NORA, "nora", "Nora Lind"))
                        .replace("\"targetDays\":null", "\"targetDays\":30"));
        answers.put("GET /v1/journeys/" + ICELAND + "/summary", """
            {"first":null,"latest":[],"photos":[],"photoCount":0,"days":[1,2,3,4,5,6,7,8,9,10,11,12],"milestones":[],
             "newCount":0,"firstNewEntryId":null}
            """);

        JourneyPort.ChallengeDays challenge =
                journey.challenge(AS_NORA, ICELAND).orElseThrow();

        assertThat(challenge.title()).isEqualTo("Family 10K");
        assertThat(challenge.checkIns()).isEqualTo(12);
        assertThat(challenge.targetDays()).isEqualTo(30);
        // A goal that names something Journey doesn't know reads nothing, and Journey isn't asked about a name that is
        // no id.
        calls.clear();
        assertThat(journey.challenge(AS_NORA, "family-10k")).isEmpty();
        assertThat(calls).isEmpty();
        assertThat(journey.challenge(AS_NORA, UUID.randomUUID().toString())).isEmpty();
    }

    // ---------- telling ----------

    private static Candidate leaving(LocalDate day, int position, MediaKind kind, String key) {
        return new Candidate(
                UUID.randomUUID(),
                kind == MediaKind.VIDEO ? ThingKind.VIDEO : ThingKind.PHOTO,
                day,
                position,
                Audience.CIRCLE,
                false,
                true,
                false,
                46.36254,
                14.09381,
                "Lake Bled",
                kind,
                key,
                kind == MediaKind.VIDEO ? "video/mp4" : "image/jpeg",
                2048,
                1536,
                kind == MediaKind.VIDEO ? 42 : null,
                false,
                false);
    }

    @Test
    void aCheckedDraftBecomesAJourneyWithJourneysOwnThreeStepsForEveryFile() {
        UUID draftId = UUID.randomUUID();
        LocalDate saturday = LocalDate.of(2026, 11, 7);
        List<Candidate> candidates = new ArrayList<>();
        // Twelve photos and a clip on Saturday, one photo on Sunday.
        for (int n = 1; n <= 12; n++) {
            candidates.add(leaving(saturday, n, MediaKind.PHOTO, "photos/sat-" + n + ".jpg"));
        }
        candidates.add(leaving(saturday, 13, MediaKind.VIDEO, "videos/sat.mp4"));
        candidates.add(leaving(saturday.plusDays(1), 1, MediaKind.PHOTO, "photos/sun.jpg"));
        LeavingHome.Checked checked = LeavingHome.check(
                        draftId,
                        "A weekend at Lake Bled",
                        JourneyVisibility.PRIVATE,
                        List.of(
                                new DayWords(saturday, "Saturday at Lake Bled", null, null, null),
                                new DayWords(saturday.plusDays(1), "Sunday at Lake Bled", null, null, null)),
                        candidates,
                        Switches.CAREFUL,
                        null,
                        List.of(UUID.fromString(ALEX)),
                        null,
                        false)
                .draft();
        String made = "5f0d2a8e-1111-4a1b-9c3d-0000000000aa";
        answers.put(
                "POST /v1/journeys",
                journeyJson(
                        made, "A weekend at Lake Bled", "active", "private", true, person(NORA, "nora", "Nora Lind")));
        statuses.put("POST /v1/journeys", 201);
        // Journey's answer for every upload: where to send the file, and how.
        answers.put(
                "POST /v1/media/uploads",
                "{\"mediaId\":\"%s\",\"uploadUrl\":\"%s\",\"method\":\"PUT\",\"headers\":{\"Content-Type\":\"image/jpeg\"}}"
                        .formatted(mediaId(77), address("/storage/incoming/77")));
        statuses.put("POST /v1/media/uploads/" + mediaId(77) + "/complete", 204);
        answers.put("POST /v1/journeys/" + made + "/entries", entryJson(entryId(1), 1, "2026-11-07", "", ""));
        statuses.put("POST /v1/journeys/" + made + "/entries", 201);
        List<Integer> progress = new ArrayList<>();

        PostedJourney posted = journey.post(AS_NORA, checked, progress::add);

        assertThat(posted.journeyId()).isEqualTo(UUID.fromString(made));
        assertThat(posted.openUrl()).isEqualTo("journey://journey/" + made);
        assertThat(posted.shots()).isEqualTo(14);
        assertThat(posted.entries())
                .as("Saturday is two entries: Journey takes ten photos in one")
                .isEqualTo(3);
        assertThat(posted.said())
                .containsExactly("Journey can't add the other authors from here yet. Invite them in Journey.");
        assertThat(progress).containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14);

        // The journey: its title, the first day that has something, private, named by the draft.
        Call start = calls.get(0);
        assertThat(start.path()).isEqualTo("/v1/journeys");
        assertThat(start.authorization()).isEqualTo("Bearer noras-token");
        assertThat(start.body())
                .contains("\"title\":\"A weekend at Lake Bled\"")
                .contains("\"template\":\"trip\"")
                .contains("\"startDate\":\"2026-11-07\"")
                .contains("\"visibility\":\"private\"")
                .contains("\"clientId\":\"" + draftId + "\"");
        // Each file: ask, send to storage (without the sign-in), say done.
        assertThat(calls.subList(1, 4))
                .extracting(Call::method, Call::path)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("POST", "/v1/media/uploads"),
                        org.assertj.core.groups.Tuple.tuple("PUT", "/storage/incoming/77"),
                        org.assertj.core.groups.Tuple.tuple("POST", "/v1/media/uploads/" + mediaId(77) + "/complete"));
        assertThat(calls.get(1).body()).contains("\"kind\":\"photo\"").contains("\"contentType\":\"image/jpeg\"");
        assertThat(calls.get(2).authorization()).isNull();
        assertThat(new String(stored.get("/storage/incoming/77"), StandardCharsets.UTF_8))
                .startsWith("bytes of ");
        assertThat(calls)
                .filteredOn(call -> call.body().contains("\"kind\":\"video\""))
                .singleElement()
                .satisfies(call -> assertThat(call.body())
                        .contains("\"durationSeconds\":42")
                        .contains("video/mp4"));
        // The entries: Saturday's first ten photos with the day's words, its other two and the clip after, then Sunday.
        List<Call> entries =
                calls.stream().filter(call -> call.path().endsWith("/entries")).toList();
        assertThat(entries).hasSize(3);
        assertThat(entries.get(0).body())
                .contains("\"body\":\"Saturday at Lake Bled\"")
                .contains("\"happenedOn\":\"2026-11-07\"")
                .contains("\"placeName\":\"Lake Bled\"")
                // The town, not the spot: a point rounded to about a kilometre, shown as a town.
                .contains("\"lat\":46.36")
                .contains("\"lng\":14.09")
                .contains("\"locationPrecision\":\"city\"")
                .doesNotContain("46.36254");
        assertThat(entries.get(1).body()).contains("\"body\":\"\"").contains("\"happenedOn\":\"2026-11-07\"");
        assertThat(entries.get(2).body())
                .contains("\"body\":\"Sunday at Lake Bled\"")
                .contains("\"happenedOn\":\"2026-11-08\"");
        assertThat(entries).extracting(Call::body).doesNotHaveDuplicates();
    }

    @Test
    void journeysLimitsForOneEntryAreKept() {
        List<LeavingHome.Checked.Leaving> shots = new ArrayList<>();
        for (int n = 0; n < 23; n++) {
            shots.add(new LeavingHome.Checked.Leaving(
                    UUID.randomUUID(), MediaKind.PHOTO, "p" + n, "image/jpeg", 1, 1, null));
        }
        for (int n = 0; n < 4; n++) {
            shots.add(new LeavingHome.Checked.Leaving(
                    UUID.randomUUID(), MediaKind.VIDEO, "v" + n, "video/mp4", null, null, 10));
        }
        List<List<LeavingHome.Checked.Leaving>> parts = HttpJourney.entriesOf(shots);
        assertThat(parts).extracting(List::size).containsExactly(10, 10, 6, 1);
        assertThat(parts).allSatisfy(part -> {
            assertThat(part.stream().filter(s -> s.kind() == MediaKind.PHOTO).count())
                    .isLessThanOrEqualTo(10);
            assertThat(part.stream().filter(s -> s.kind() == MediaKind.VIDEO).count())
                    .isLessThanOrEqualTo(3);
        });
        assertThat(parts.stream().flatMap(List::stream).toList()).containsExactlyElementsOf(shots);
        assertThat(HttpJourney.entriesOf(List.of())).containsExactly(List.of());
    }

    // ---------- when Journey says no ----------

    @Test
    void whatJourneyRefusesIsSaidTheWayThisApiSaysThings() {
        // The sign-in ran out between the two APIs: the app is told to sign in again, as it is by this API itself.
        answers.put("GET /v1/me", "{\"detail\":\"Please sign in again.\",\"code\":\"signed_out\"}");
        statuses.put("GET /v1/me", 401);
        assertThatThrownBy(() -> journey.profile(AS_NORA)).isInstanceOfSatisfying(ApiProblem.class, problem -> {
            assertThat(problem.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(problem.code()).isEqualTo("signed_out");
        });
        // Journey is having a bad moment.
        statuses.put("GET /v1/me", 500);
        assertThatThrownBy(() -> journey.profile(AS_NORA)).isInstanceOfSatisfying(ApiProblem.class, problem -> {
            assertThat(problem.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(problem.code()).isEqualTo("journey_unreachable");
        });
        // It answers with something that isn't what its description says.
        statuses.put("GET /v1/me", 200);
        answers.put(
                "GET /v1/me", "{\"id\":\"%s\",\"profile\":{\"id\":\"not an id\",\"username\":\"x\"}}".formatted(NORA));
        assertThatThrownBy(() -> journey.profile(AS_NORA))
                .isInstanceOfSatisfying(
                        ApiProblem.class, problem -> assertThat(problem.code()).isEqualTo("journey_unreachable"));
        // Someone without a Journey profile tries to tell a journey: Journey's 409 becomes a sentence about that.
        answers.put(
                "POST /v1/journeys",
                "{\"detail\":\"Finish setting up your profile first.\",\"code\":\"profile_required\"}");
        statuses.put("POST /v1/journeys", 409);
        LeavingHome.Checked plan = LeavingHome.check(
                        UUID.randomUUID(),
                        "Norway 2027",
                        null,
                        List.of(),
                        List.of(),
                        Switches.CAREFUL,
                        null,
                        List.of(),
                        LocalDate.of(2027, 4, 3),
                        true)
                .draft();
        assertThatThrownBy(() -> journey.post(AS_NORA, plan, sent -> {}))
                .isInstanceOfSatisfying(
                        ApiProblem.class, problem -> assertThat(problem.code()).isEqualTo("no_journey_profile"));
        // Journey's own sentences are written for people, and are passed on as they are.
        answers.put("POST /v1/journeys", "{\"detail\":\"Use 80 characters or fewer.\",\"code\":\"invalid_input\"}");
        statuses.put("POST /v1/journeys", 400);
        assertThatThrownBy(() -> journey.post(AS_NORA, plan, sent -> {}))
                .isInstanceOfSatisfying(ApiProblem.class, problem -> {
                    assertThat(problem.code()).isEqualTo("journey_said_no");
                    assertThat(problem.getMessage()).isEqualTo("Use 80 characters or fewer.");
                });
    }

    @Test
    void aPlanBecomesAJourneyWithItsTitleAndFirstDayAndNoEntries() {
        String made = "5f0d2a8e-1111-4a1b-9c3d-0000000000bb";
        answers.put(
                "POST /v1/journeys",
                journeyJson(made, "Norway 2027", "active", "private", true, person(NORA, "nora", "Nora Lind")));
        statuses.put("POST /v1/journeys", 201);
        LeavingHome.Checked plan = LeavingHome.check(
                        UUID.randomUUID(),
                        "Norway 2027",
                        null,
                        List.of(),
                        List.of(),
                        Switches.CAREFUL,
                        null,
                        List.of(),
                        LocalDate.of(2027, 4, 3),
                        true)
                .draft();

        PostedJourney posted = journey.post(AS_NORA, plan, sent -> {});

        assertThat(posted.entries()).isZero();
        assertThat(calls).hasSize(1);
        assertThat(calls.get(0).body()).contains("\"startDate\":\"2027-04-03\"").contains("\"title\":\"Norway 2027\"");
    }

    @Test
    void withoutThePersonsSignInJourneyIsNotAskedAtAll() {
        Caller nobody = new Caller(UUID.fromString(NORA), null);
        assertThatThrownBy(() -> journey.profile(nobody))
                .isInstanceOfSatisfying(
                        ApiProblem.class, problem -> assertThat(problem.code()).isEqualTo("journey_unreachable"));
        assertThatThrownBy(() -> journey.story(nobody, UUID.fromString(ICELAND)))
                .isInstanceOf(ApiProblem.class);
        assertThat(calls).as("this API has no key to Journey of its own").isEmpty();
        // And a token never ends up in a log line.
        assertThat(AS_NORA.toString()).doesNotContain("noras-token");
    }

    @Test
    void theAdapterNeedsToKnowWhereJourneyIs() {
        assertThatThrownBy(() -> new HttpJourney(" ", "journey://", null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JOURNEY_API_URL");
    }
}
