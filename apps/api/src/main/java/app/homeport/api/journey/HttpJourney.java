package app.homeport.api.journey;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Http;
import app.homeport.api.common.Page;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaStorage;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.IntConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Journey's real API ({@code homeport.journey.mode=http}), asked as the signed-in person with their own
 * bearer token. This API has no key to Journey of its own: without the person's token nothing is asked, and
 * what Journey answers is what Journey's rules give that person.
 *
 * <p>Written against Journey's description (its {@code openapi.json}) as it is today:
 *
 * <ul>
 *   <li>the profile: {@code GET /v1/me}, then {@code GET /v1/profiles/{username}} for the counts;
 *   <li>the person's journeys: {@code GET /v1/me/journeys}; one journey with its numbers:
 *       {@code GET /v1/journeys/{id}} and {@code /recap};
 *   <li>a whole story: {@code GET /v1/journeys/{id}/entries}, page after page;
 *   <li>the kind words: {@code GET /v1/entries/{id}/comments};
 *   <li>who is away: {@code GET /v1/me/following}, and {@code /summary} for what is new;
 *   <li>a journey from a draft: {@code POST /v1/journeys}, {@code POST /v1/media/uploads} (send, complete) for
 *       each photo, {@code POST /v1/journeys/{id}/entries} for each day;
 *   <li>a challenge's ticked days: {@code GET /v1/journeys/{id}/summary}.
 * </ul>
 *
 * What Journey doesn't offer yet is listed in {@link #notYet()} and written out, with what it should add, in
 * docs/10-journey-changes.md. Where Journey starts to send a field this adapter already reads ({@code
 * takenAt} and {@code originalHash} on a photo, {@code downloadUrl} on a clip), that part switches itself on.
 */
@Component
@ConditionalOnProperty(name = "homeport.journey.mode", havingValue = "http")
class HttpJourney implements JourneyPort {

    private static final Logger log = LoggerFactory.getLogger(HttpJourney.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /** Journey's largest page. */
    static final int PAGE = 100;

    /** A story longer than this many pages is cut off: six thousand entries. */
    static final int MOST_PAGES = 60;

    /** Journey's own limits for one entry. */
    static final int PHOTOS_AN_ENTRY = 10;

    static final int CLIPS_AN_ENTRY = 3;

    /** The largest file brought home in one piece. */
    static final int LARGEST_FILE = 64 * 1024 * 1024;

    /** How many journeys of people at home are asked about for one Today. */
    static final int MOST_AWAY = 5;

    private final RestClient journey;
    private final RestClient files;
    private final MediaStorage storage;
    private final String open;

    @Autowired
    HttpJourney(
            @Value("${homeport.journey.http.url:}") String url,
            @Value("${homeport.journey.open:journey://}") String open,
            MediaStorage storage) {
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("The link with Journey is switched on (homeport.journey.mode=http) but"
                    + " JOURNEY_API_URL is empty. Set it to the address of Journey's API, or set"
                    + " HOMEPORT_JOURNEY_MODE=off to run without Journey.");
        }
        this.journey = Http.client().baseUrl(url.trim().replaceAll("/+$", "")).build();
        this.files = Http.client(Duration.ofSeconds(60)).build();
        this.storage = storage;
        this.open = open;
    }

    @Override
    public JourneyMode mode() {
        return JourneyMode.HTTP;
    }

    @Override
    public List<NotYet> notYet() {
        return List.of(
                new NotYet(
                        "originals",
                        "Journey doesn't say yet when each photo was taken, so it can't be matched to the original"
                                + " in your Library. Photos are kept at the size Journey has."),
                new NotYet("clips", "Journey can play a clip but not hand it over yet, so clips stay in Journey."),
                new NotYet(
                        "co_authors",
                        "A journey made from here starts with you as its only author. Invite the others in Journey."),
                new NotYet("not_followed", "Only the journeys you follow in Journey show up at home."));
    }

    // ---------- reading ----------

    @Override
    public Optional<Traveller> profile(Caller as) {
        JsonNode me = get(as, "/v1/me");
        JsonNode profile = me == null ? null : me.get("profile");
        if (profile == null || profile.isNull()) {
            return Optional.empty();
        }
        String username = profile.path("username").asString("");
        JsonNode counts = get(as, "/v1/profiles/{username}", username);
        return Optional.of(new Traveller(
                id(profile, "id"),
                username,
                profile.path("displayName").asString(""),
                text(profile, "avatarUrl"),
                counts == null ? 0 : counts.path("journeyCount").asInt(0),
                counts == null ? 0 : counts.path("followerCount").asInt(0),
                counts == null ? 0 : counts.path("followingCount").asInt(0),
                open + "profile/" + username));
    }

    @Override
    public Page<JourneyBrief> journeys(Caller as, String cursor, int limit) {
        JsonNode page = get(
                as,
                cursor == null ? "/v1/me/journeys?limit={limit}" : "/v1/me/journeys?limit={limit}&cursor={cursor}",
                Math.clamp(limit, 1, PAGE),
                cursor);
        if (page == null) {
            return new Page<>(List.of(), null);
        }
        List<JourneyBrief> items = new ArrayList<>();
        page.path("items").forEach(item -> items.add(brief(item, null)));
        return new Page<>(items, text(page, "nextCursor"));
    }

    @Override
    public Optional<JourneyBrief> journey(Caller as, UUID journeyId) {
        JsonNode found = get(as, "/v1/journeys/{id}", journeyId);
        if (found == null) {
            return Optional.empty();
        }
        return Optional.of(brief(found, get(as, "/v1/journeys/{id}/recap", journeyId)));
    }

    @Override
    public Story story(Caller as, UUID journeyId) {
        JourneyBrief brief = journey(as, journeyId).orElseThrow(JourneyPort::notFound);
        if (!brief.mine()) {
            // Journey would show a public journey's entries to anyone. Bringing a story home is for its authors.
            throw JourneyPort.notFound();
        }
        List<StoryEntry> entries = new ArrayList<>();
        String cursor = null;
        for (int page = 0; page < MOST_PAGES; page++) {
            JsonNode answer = get(
                    as,
                    cursor == null
                            ? "/v1/journeys/{id}/entries?limit={limit}"
                            : "/v1/journeys/{id}/entries?limit={limit}&cursor={cursor}",
                    journeyId,
                    PAGE,
                    cursor);
            if (answer == null) {
                throw JourneyPort.notFound();
            }
            answer.path("items").forEach(item -> entries.add(entry(item)));
            cursor = text(answer, "nextCursor");
            if (cursor == null) {
                break;
            }
        }
        return new Story(brief, entries);
    }

    @Override
    public List<StoryRemark> remarks(Caller as, UUID entryId) {
        JsonNode page = get(as, "/v1/entries/{id}/comments?limit=50", entryId);
        List<StoryRemark> remarks = new ArrayList<>();
        if (page != null) {
            page.path("items").forEach(item -> {
                if (!item.path("held").asBoolean(false)) {
                    remarks.add(new StoryRemark(
                            item.path("author").path("displayName").asString(""),
                            item.path("body").asString("")));
                }
            });
        }
        return remarks;
    }

    @Override
    public byte[] file(Caller as, StoryShot shot) {
        if (shot.fileUrl() == null) {
            throw JourneyPort.notYet("Journey can play a clip but not hand it over yet.");
        }
        return fetch(shot.fileUrl());
    }

    @Override
    public byte[] still(Caller as, StoryShot shot) {
        return fetch(shot.url());
    }

    @Override
    public Optional<byte[]> cover(Caller as, JourneyBrief journey) {
        return journey.coverUrl() == null ? Optional.empty() : Optional.of(fetch(journey.coverUrl()));
    }

    /**
     * Fetches a file from where Journey's files are served. That is not Journey's API: the person's sign-in is
     * not sent there, and nothing is needed, because a file's address is one only its readers were given.
     */
    private byte[] fetch(String url) {
        URI address = URI.create(url);
        if (!"https".equals(address.getScheme()) && !"http".equals(address.getScheme())) {
            throw JourneyPort.unreachable();
        }
        try {
            byte[] bytes = files.get().uri(address).exchange((request, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) {
                    return null;
                }
                try (InputStream in = response.getBody()) {
                    return in.readNBytes(LARGEST_FILE + 1);
                }
            });
            if (bytes == null || bytes.length == 0 || bytes.length > LARGEST_FILE) {
                throw JourneyPort.unreachable();
            }
            return bytes;
        } catch (RestClientException failed) {
            log.warn("A file couldn't be fetched from Journey: {}", failed.toString());
            throw JourneyPort.unreachable();
        }
    }

    @Override
    public List<AwayJourney> away(Caller as, Collection<UUID> userIds) {
        // Journey has no question "which journeys of these people may I see" yet. What it has: the journeys
        // this person follows. Those are the ones that can show up at home.
        JsonNode followed = get(as, "/v1/me/following?limit={limit}", PAGE);
        List<AwayJourney> away = new ArrayList<>();
        if (followed == null) {
            return away;
        }
        for (JsonNode item : followed.path("items")) {
            if (away.size() >= MOST_AWAY) {
                break;
            }
            JourneyBrief brief = brief(item, null);
            boolean theirs = brief.authors().stream().anyMatch(author -> userIds.contains(author.id()));
            if (brief.status() != JourneyStatus.ACTIVE || brief.mine() || !theirs) {
                continue;
            }
            JsonNode summary = get(as, "/v1/journeys/{id}/summary", brief.id());
            JsonNode latest = summary == null ? null : summary.path("latest").path(0);
            if (latest == null || latest.isMissingNode()) {
                continue;
            }
            away.add(new AwayJourney(brief, summary.path("newCount").asInt(0), entry(latest)));
        }
        return away;
    }

    @Override
    public Optional<ChallengeDays> challenge(Caller as, String ref) {
        UUID id;
        try {
            id = UUID.fromString(ref);
        } catch (IllegalArgumentException notAJourney) {
            return Optional.empty();
        }
        JsonNode found = get(as, "/v1/journeys/{id}", id);
        JsonNode summary = found == null ? null : get(as, "/v1/journeys/{id}/summary", id);
        if (summary == null) {
            return Optional.empty();
        }
        return Optional.of(new ChallengeDays(
                id,
                found.path("title").asString(""),
                summary.path("days").size(),
                found.path("targetDays").isNumber() ? found.path("targetDays").asInt() : null));
    }

    // ---------- telling ----------

    @Override
    public PostedJourney post(Caller as, LeavingHome.Checked draft, IntConsumer sent) {
        if (draft.startsOn() == null) {
            throw ApiProblem.badRequest("nothing_to_tell", "Nothing in this draft is going. Switch something back on.");
        }
        Map<String, Object> start = new LinkedHashMap<>();
        start.put("title", draft.title());
        start.put("template", "trip");
        start.put("startDate", draft.startsOn().toString());
        start.put("visibility", draft.visibility().code());
        start.put("clientId", draft.draftId().toString());
        JsonNode made = send(as, HttpMethod.POST, "/v1/journeys", start);
        UUID journeyId = id(made, "id");

        int entries = 0;
        int shots = 0;
        for (LeavingHome.Checked.Day day : draft.days()) {
            List<List<LeavingHome.Checked.Leaving>> parts = entriesOf(day.shots());
            for (int part = 0; part < parts.size(); part++) {
                List<String> mediaIds = new ArrayList<>();
                for (LeavingHome.Checked.Leaving leaving : parts.get(part)) {
                    mediaIds.add(upload(as, leaving));
                    sent.accept(++shots);
                }
                String words = part == 0 ? day.line() : "";
                if (mediaIds.isEmpty() && words.isBlank()) {
                    continue;
                }
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("body", words);
                entry.put("happenedOn", day.day().toString());
                if (day.place() != null) {
                    entry.put(
                            "placeName", day.place().length() > 80 ? day.place().substring(0, 80) : day.place());
                    if (day.lat() != null && day.lng() != null) {
                        entry.put("lat", day.lat());
                        entry.put("lng", day.lng());
                        entry.put("locationPrecision", day.exact() ? "exact" : "city");
                    }
                }
                entry.put("mediaIds", mediaIds);
                // Named by the draft, the day and the part: sent again, it is the same entry.
                entry.put(
                        "clientId",
                        UUID.nameUUIDFromBytes((draft.draftId() + " " + day.day() + " " + part)
                                        .getBytes(StandardCharsets.UTF_8))
                                .toString());
                send(as, HttpMethod.POST, "/v1/journeys/" + journeyId + "/entries", entry);
                entries++;
            }
        }
        List<String> said = draft.coAuthors().isEmpty()
                ? List.of()
                : List.of("Journey can't add the other authors from here yet. Invite them in Journey.");
        return new PostedJourney(journeyId, open + "journey/" + journeyId, entries, shots, said);
    }

    /** A day's photos and clips, in as many entries as Journey's limits ask for: ten photos and three clips each. */
    static List<List<LeavingHome.Checked.Leaving>> entriesOf(List<LeavingHome.Checked.Leaving> shots) {
        List<List<LeavingHome.Checked.Leaving>> parts = new ArrayList<>();
        List<LeavingHome.Checked.Leaving> part = new ArrayList<>();
        int photos = 0;
        int clips = 0;
        for (LeavingHome.Checked.Leaving shot : shots) {
            boolean clip = shot.kind() == MediaKind.VIDEO;
            if ((clip && clips == CLIPS_AN_ENTRY) || (!clip && photos == PHOTOS_AN_ENTRY)) {
                parts.add(part);
                part = new ArrayList<>();
                photos = 0;
                clips = 0;
            }
            part.add(shot);
            if (clip) {
                clips++;
            } else {
                photos++;
            }
        }
        parts.add(part);
        return parts;
    }

    /** Journey's own three steps for a file: ask where to send it, send it there, say it is done. */
    private String upload(Caller as, LeavingHome.Checked.Leaving leaving) {
        boolean clip = leaving.kind() == MediaKind.VIDEO;
        Map<String, Object> ask = new LinkedHashMap<>();
        ask.put("kind", clip ? "video" : "photo");
        ask.put(
                "contentType",
                leaving.contentType() == null ? (clip ? "video/mp4" : "image/jpeg") : leaving.contentType());
        if (clip && leaving.durationSeconds() != null) {
            ask.put("durationSeconds", leaving.durationSeconds());
        }
        JsonNode target = send(as, HttpMethod.POST, "/v1/media/uploads", ask);
        String mediaId = target.path("mediaId").asString("");
        byte[] bytes;
        try (InputStream in = storage.open(leaving.storageKey())) {
            bytes = in.readAllBytes();
        } catch (IOException e) {
            throw new ApiProblem(
                    HttpStatus.SERVICE_UNAVAILABLE, "file_unreadable", "A photo couldn't be read just now. Try again.");
        }
        try {
            HttpMethod how = HttpMethod.valueOf(target.path("method").asString("PUT"));
            int status = files.method(how)
                    .uri(URI.create(target.path("uploadUrl").asString("")))
                    .headers(headers -> target.path("headers")
                            .properties()
                            .forEach(header -> headers.set(
                                    header.getKey(), header.getValue().asString(""))))
                    .body(bytes)
                    .exchange((request, response) -> response.getStatusCode().value());
            if (status / 100 != 2) {
                log.warn("Journey's storage refused an upload: {}", status);
                throw JourneyPort.unreachable();
            }
        } catch (RestClientException failed) {
            log.warn("An upload to Journey's storage failed: {}", failed.toString());
            throw JourneyPort.unreachable();
        }
        send(as, HttpMethod.POST, "/v1/media/uploads/" + mediaId + "/complete", null);
        return mediaId;
    }

    // ---------- Journey's answers, read ----------

    /**
     * @param recap Journey's recap of the same journey, when it was asked for: the numbers a list doesn't carry
     */
    private JourneyBrief brief(JsonNode journey, JsonNode recap) {
        List<JourneyPerson> authors = new ArrayList<>();
        journey.path("authors").forEach(author -> authors.add(person(author)));
        JourneyPerson owner = person(journey.path("owner"));
        if (authors.isEmpty()) {
            authors.add(owner);
        }
        LocalDate start = day(journey, "startDate");
        Instant lastEntryAt = instant(journey, "lastEntryAt");
        LocalDate lastDay = recap != null && text(recap, "lastDay") != null
                ? day(recap, "lastDay")
                : lastEntryAt == null
                        ? null
                        : lastEntryAt.atOffset(ZoneOffset.UTC).toLocalDate();
        int days = recap != null
                ? recap.path("dayCount").asInt(0)
                : lastDay == null ? 0 : (int) Math.max(ChronoUnit.DAYS.between(start, lastDay) + 1, 0);
        JsonNode viewer = journey.path("viewer");
        UUID id = id(journey, "id");
        return new JourneyBrief(
                id,
                journey.path("title").asString(""),
                word(journey, "status", JourneyStatus::read),
                word(journey, "visibility", JourneyVisibility::read),
                text(journey, "coverUrl"),
                start,
                lastDay,
                journey.path("targetDays").isNumber()
                        ? journey.path("targetDays").asInt()
                        : null,
                journey.path("latestNumber").asInt(0),
                journey.path("progressLabel").asString(""),
                days,
                journey.path("entryCount").asInt(0),
                recap == null ? null : recap.path("photoCount").asInt(0),
                // Journey counts photos on the recap, not clips. They are counted when the story is read.
                null,
                recap == null ? null : recap.path("placeCount").asInt(0),
                journey.path("followerCount").asInt(0),
                owner,
                authors,
                viewer.path("isOwner").asBoolean(false)
                        || viewer.path("isMember").asBoolean(false),
                text(journey, "closingNote"),
                lastEntryAt,
                open + "journey/" + id);
    }

    private static JourneyPerson person(JsonNode person) {
        return new JourneyPerson(id(person, "id"), person.path("displayName").asString(""), text(person, "avatarUrl"));
    }

    private static StoryEntry entry(JsonNode entry) {
        List<StoryShot> shots = new ArrayList<>();
        for (JsonNode media : entry.path("media")) {
            // What isn't ready, or is held for a reviewer, is not brought home.
            if (!"ready".equals(media.path("status").asString(""))
                    || media.path("held").asBoolean(false)) {
                continue;
            }
            boolean clip = "video".equals(media.path("kind").asString(""));
            shots.add(new StoryShot(
                    id(media, "id"),
                    clip ? MediaKind.VIDEO : MediaKind.PHOTO,
                    media.path("url").asString(""),
                    // A photo's address is the photo at Journey's largest size. A clip can only be played, until
                    // Journey sends an address to fetch it from.
                    clip ? text(media, "downloadUrl") : media.path("url").asString(""),
                    media.path("width").isNumber() ? media.path("width").asInt() : null,
                    media.path("height").isNumber() ? media.path("height").asInt() : null,
                    media.path("durationSeconds").isNumber()
                            ? media.path("durationSeconds").asInt()
                            : null,
                    instant(media, "takenAt"),
                    text(media, "originalHash")));
        }
        return new StoryEntry(
                id(entry, "id"),
                person(entry.path("author")),
                instant(entry, "happenedAt"),
                day(entry, "happenedOn"),
                entry.path("number").asInt(0),
                entry.path("label").asString(""),
                entry.path("title").asString(""),
                entry.path("body").asString(""),
                text(entry, "placeName"),
                entry.path("lat").isNumber() ? entry.path("lat").asDouble() : null,
                entry.path("lng").isNumber() ? entry.path("lng").asDouble() : null,
                shots,
                entry.path("likeCount").asInt(0),
                entry.path("commentCount").asInt(0),
                instant(entry, "createdAt"));
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString("");
    }

    private static Instant instant(JsonNode node, String field) {
        String value = text(node, field);
        return value == null ? null : wellFormed(() -> Instant.parse(value));
    }

    private static UUID id(JsonNode node, String field) {
        return wellFormed(() -> UUID.fromString(node.path(field).asString("")));
    }

    private static LocalDate day(JsonNode node, String field) {
        return wellFormed(() -> LocalDate.parse(node.path(field).asString("")));
    }

    private static <T> T word(JsonNode node, String field, java.util.function.Function<String, T> read) {
        return wellFormed(() -> read.apply(node.path(field).asString("")));
    }

    /** An answer that doesn't read as Journey's description says is the same to a person as no answer. */
    private static <T> T wellFormed(java.util.function.Supplier<T> read) {
        try {
            return read.get();
        } catch (RuntimeException unexpected) {
            log.warn("Journey answered with something unexpected: {}", unexpected.toString());
            throw JourneyPort.unreachable();
        }
    }

    // ---------- asking ----------

    /** Asks Journey for something. Null when Journey says it isn't there (for this person). */
    private JsonNode get(Caller as, String path, Object... values) {
        Answer answer = call(as, HttpMethod.GET, path, null, values);
        if (answer.status() == 404) {
            return null;
        }
        return read(answer);
    }

    private JsonNode send(Caller as, HttpMethod method, String path, Object body) {
        return read(call(as, method, path, body));
    }

    private record Answer(int status, String body) {}

    private Answer call(Caller as, HttpMethod method, String path, Object body, Object... values) {
        if (as.token() == null) {
            // Nobody's sign-in to ask with (a nightly job): Journey is not asked at all.
            throw JourneyPort.unreachable();
        }
        try {
            RestClient.RequestBodySpec request = journey.method(method)
                    .uri(path, values)
                    .headers(headers -> headers.setBearerAuth(as.token()))
                    .accept(MediaType.APPLICATION_JSON);
            if (body != null) {
                request.contentType(MediaType.APPLICATION_JSON).body(JSON.writeValueAsString(body));
            }
            return request.exchange((sent, response) -> new Answer(
                    response.getStatusCode().value(),
                    new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8)));
        } catch (RestClientException failed) {
            log.warn("Journey didn't answer {} {}: {}", method, path, failed.toString());
            throw JourneyPort.unreachable();
        }
    }

    /** Journey's answer, or the problem it stands for, said the way this API says problems. */
    private static JsonNode read(Answer answer) {
        if (answer.status() / 100 == 2) {
            return answer.body().isBlank() ? JSON.createObjectNode() : JSON.readTree(answer.body());
        }
        if (answer.status() == 401) {
            // The app renews the sign-in and asks again, as it does when this API says so itself.
            throw ApiProblem.unauthorized("signed_out", "Please sign in again.");
        }
        String code = "";
        String sentence = "";
        try {
            JsonNode problem = JSON.readTree(answer.body());
            code = problem.path("code").asString("");
            sentence = problem.path("detail").asString("");
        } catch (RuntimeException notAProblem) {
            // falls through to the answer for "something unexpected"
        }
        if (code.equals("profile_required")) {
            throw ApiProblem.conflict(
                    "no_journey_profile", "Open Journey once first, so there is somewhere to tell it.");
        }
        if (answer.status() == 404) {
            throw JourneyPort.notFound();
        }
        if (answer.status() / 100 == 4 && !sentence.isBlank()) {
            // Journey's own sentence is written for the person, like this API's are.
            throw new ApiProblem(HttpStatus.CONFLICT, "journey_said_no", sentence);
        }
        log.warn("Journey answered {} {}", answer.status(), code);
        throw JourneyPort.unreachable();
    }
}
