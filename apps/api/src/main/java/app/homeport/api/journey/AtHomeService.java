package app.homeport.api.journey;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleService.CircleResponse;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.folder.People;
import app.homeport.api.journey.GoodnightService.GoodnightResponse;
import app.homeport.api.journey.JourneyPort.AwayJourney;
import app.homeport.api.journey.JourneyPort.JourneyBrief;
import app.homeport.api.journey.JourneyPort.NotYet;
import app.homeport.api.journey.JourneyPort.StoryEntry;
import app.homeport.api.journey.JourneyPort.Traveller;
import app.homeport.api.library.LibraryForJourney;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaStore;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.profile.Profile;
import app.homeport.api.profile.ProfileStore;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Journey, at home: what of Journey shows up in a circle's everyday. Who is away on a journey right now (for
 * the people who may see that journey in Journey, and only for them), a day from a kept journey of an
 * earlier year, the goodnights that wait for bedtime; and the two small answers the pair of apps needs:
 * what the switch between them shows, and which circles a person is in.
 *
 * <p>A heart given at home to someone's entry stays at home. Children have no Journey account; the family
 * can still love what Alex posted, and Journey is never told.
 */
@Service
public class AtHomeService {

    private static final Logger log = LoggerFactory.getLogger(AtHomeService.class);

    /** How long an answer about who is away is used again, when it came from the real Journey. */
    static final Duration AWAY_IS_FRESH_FOR = Duration.ofSeconds(60);

    /** What the switch between the two apps shows of Journey, and nothing more. */
    public record AppSwitchResponse(
            JourneyMode mode,

            @Schema(description = "False when this app runs without Journey: show nothing of it")
            boolean available,

            @Schema(description = "The name you are signed in with, in both apps")
            String signedInAs,

            @Schema(
                    nullable = true,
                    description = "Your Journey profile. Null when you have none yet, or Journey couldn't be asked.")
            Traveller journey,

            @Schema(nullable = true, description = "Why Journey couldn't be asked just now, when it couldn't")
            String note,

            @Schema(
                    description =
                            "What Journey doesn't offer this app yet, each with a sentence to show where it matters")
            List<NotYet> notYet) {}

    public record AwayEntry(
            UUID entryId,

            @Schema(description = "Day 6") String label,

            @Schema(nullable = true) String place,

            @Schema(description = "Its title, or how its words begin")
            String title,

            @Schema(nullable = true) String imageUrl,

            @Schema(description = "Who at home gave it a heart")
            List<PersonBrief> lovedBy,

            @Schema(description = "True when you did") boolean loved) {}

    public record AwayResponse(
            @Schema(description = "Who is away: someone of this circle")
            PersonBrief who,

            JourneyBrief journey,

            @Schema(description = "How many entries are new to you")
            int newCount,

            AwayEntry latest) {}

    public record JourneyPastDay(
            int yearsAgo,
            LocalDate day,
            String title,

            @Schema(description = "Day 22") String label,

            @Schema(nullable = true) String place,
            @Schema(nullable = true) String imageUrl,
            UUID keptId,

            @Schema(nullable = true, description = "The book it is in")
            UUID pageId) {}

    public record AtHomeResponse(
            @Schema(description = "False when this app runs without Journey")
            boolean available,

            @Schema(description = "People of the circle who are on a journey you may see in Journey. Five at most.")
            List<AwayResponse> away,

            @Schema(description = "Days from kept journeys that fell on this day in earlier years. Six at most.")
            List<JourneyPastDay> onThisDay,

            @Schema(description = "Goodnights meant for this day. Show them from bedtime on.")
            List<GoodnightResponse> goodnights,

            @Schema(type = "string", example = "20:00", description = "The circle's bedtime")
            @JsonFormat(pattern = "HH:mm")
            LocalTime bedtime) {}

    public record JourneyMember(UUID userId, String name) {}

    /** A circle as Journey may know it: that it exists and who is in it. Nothing of what it keeps. */
    public record CircleForJourney(
            UUID id,
            String name,
            CircleKind kind,

            @Schema(
                    description =
                            "The people in it who sign in themselves, by the id they sign in with (the same in Journey)")
            List<JourneyMember> people,

            @Schema(
                    type = "string",
                    example = "20:00",
                    nullable = true,
                    description =
                            "When someone away could record a goodnight for home: set when the circle has children")
            @JsonFormat(pattern = "HH:mm")
            LocalTime goodnightAt,

            @Schema(
                    nullable = true,
                    description = "The clock that time is on, when the circle has said: Europe/Ljubljana")
            String timeZone) {}

    /** What the link with Journey adds to a circle's week, in a few lines, for the Sunday summary. */
    public record WeekFromJourney(List<String> kept, List<String> told, int goodnights) {

        public boolean empty() {
            return kept.isEmpty() && told.isEmpty() && goodnights == 0;
        }
    }

    private record Cached(Instant until, List<AwayJourney> away) {}

    private final JourneyPort port;
    private final CircleService circles;
    private final MemberStore members;
    private final People people;
    private final ProfileStore profiles;
    private final KeepStore keeps;
    private final TellStore drafts;
    private final GoodnightStore goodnightStore;
    private final GoodnightService goodnights;
    private final HomeSettings homes;
    private final MediaStore mediaStore;
    private final MediaService media;
    private final LibraryForJourney shelf;
    private final ThingStore thingStore;
    private final JdbcClient jdbc;
    private final Map<String, Cached> lately = new ConcurrentHashMap<>();

    AtHomeService(
            JourneyPort port,
            CircleService circles,
            MemberStore members,
            People people,
            ProfileStore profiles,
            KeepStore keeps,
            TellStore drafts,
            GoodnightStore goodnightStore,
            GoodnightService goodnights,
            HomeSettings homes,
            MediaStore mediaStore,
            MediaService media,
            LibraryForJourney shelf,
            ThingStore thingStore,
            JdbcClient jdbc) {
        this.port = port;
        this.circles = circles;
        this.members = members;
        this.people = people;
        this.profiles = profiles;
        this.keeps = keeps;
        this.drafts = drafts;
        this.goodnightStore = goodnightStore;
        this.goodnights = goodnights;
        this.homes = homes;
        this.mediaStore = mediaStore;
        this.media = media;
        this.shelf = shelf;
        this.thingStore = thingStore;
        this.jdbc = jdbc;
    }

    // ---------- one account, two apps ----------

    public AppSwitchResponse me(UUID me) {
        String name = profiles.find(me).map(Profile::displayName).orElse("");
        Traveller journey = null;
        String note = null;
        if (port.mode() != JourneyMode.OFF) {
            try {
                journey = port.profile(Caller.of(me)).orElse(null);
            } catch (ApiProblem problem) {
                note = problem.getMessage();
            }
        }
        return new AppSwitchResponse(port.mode(), port.mode() != JourneyMode.OFF, name, journey, note, port.notYet());
    }

    /**
     * The circles this person is in, as Journey may know them: for "Only The Linds" as who can see a journey,
     * and for offering a goodnight. Their names, and who in them has a sign-in. Nothing of what they keep.
     */
    public List<CircleForJourney> circlesForJourney(UUID me) {
        List<CircleResponse> mine = circles.mine(me);
        Map<UUID, List<MemberRow>> in = members
                .of(mine.stream().map(CircleResponse::id).toList())
                .stream()
                .collect(Collectors.groupingBy(MemberRow::circleId));
        return mine.stream()
                .map(circle -> {
                    List<MemberRow> everyone = in.getOrDefault(circle.id(), List.of());
                    return new CircleForJourney(
                            circle.id(),
                            circle.name(),
                            circle.kind(),
                            everyone.stream()
                                    .filter(member -> member.userId() != null
                                            && member.status() == MemberStatus.JOINED
                                            && member.kind() == MemberKind.PERSON)
                                    .map(member -> new JourneyMember(member.userId(), member.name()))
                                    .toList(),
                            everyone.stream().anyMatch(TellService::isChild) ? homes.bedtime(circle.id()) : null,
                            homes.zone(circle.id()).map(java.time.ZoneId::getId).orElse(null));
                })
                .toList();
    }

    // ---------- on Today ----------

    public AtHomeResponse atHome(UUID circleId, UUID me, LocalDate day) {
        circles.require(circleId, me);
        LocalDate on = day == null ? LocalDate.now() : day;
        return new AtHomeResponse(
                port.mode() != JourneyMode.OFF,
                away(circleId, me),
                onThisDay(circleId, me, on),
                goodnights.waiting(circleId, me, on),
                homes.bedtime(circleId));
    }

    /**
     * Who of this circle is on a journey right now that this person may see in Journey. Journey decides that,
     * asked as this person; when it can't be asked, nobody is shown. Never fails: Today must open whatever
     * Journey does.
     */
    public List<AwayResponse> away(UUID circleId, UUID me) {
        MemberRow mine = circles.me(circleId, me);
        Map<UUID, MemberRow> byUser = members.of(List.of(circleId)).stream()
                .filter(member -> member.userId() != null
                        && member.status() == MemberStatus.JOINED
                        && !member.userId().equals(me))
                .collect(Collectors.toMap(MemberRow::userId, Function.identity(), (a, b) -> a));
        if (byUser.isEmpty() || port.mode() == JourneyMode.OFF) {
            return List.of();
        }
        Map<UUID, PersonBrief> who = people.of(circleId);
        List<AwayResponse> away = new ArrayList<>();
        List<AwayJourney> asked = asked(circleId, me, byUser.keySet());
        Map<UUID, List<UUID>> loves =
                loves(circleId, asked.stream().map(one -> one.latest().id()).toList());
        for (AwayJourney one : asked) {
            Optional<MemberRow> member = one.journey().authors().stream()
                    .map(author -> byUser.get(author.id()))
                    .filter(found -> found != null)
                    .findFirst();
            if (member.isEmpty() || !who.containsKey(member.get().id())) {
                continue;
            }
            StoryEntry latest = one.latest();
            List<UUID> hearts = loves.getOrDefault(latest.id(), List.of());
            away.add(new AwayResponse(
                    who.get(member.get().id()),
                    one.journey(),
                    one.newCount(),
                    new AwayEntry(
                            latest.id(),
                            latest.label(),
                            latest.placeName(),
                            headline(latest),
                            latest.shots().isEmpty()
                                    ? null
                                    : latest.shots().get(0).url(),
                            hearts.stream()
                                    .map(who::get)
                                    .filter(person -> person != null)
                                    .toList(),
                            hearts.contains(mine.id()))));
        }
        return away;
    }

    private static String headline(StoryEntry entry) {
        if (entry.title() != null && !entry.title().isBlank()) {
            return entry.title().trim();
        }
        String words = entry.body() == null ? "" : entry.body().trim();
        int line = words.indexOf('\n');
        words = line > 0 ? words.substring(0, line) : words;
        return words.length() > 80 ? words.substring(0, 79).trim() + "…" : words;
    }

    private List<AwayJourney> asked(UUID circleId, UUID me, Set<UUID> userIds) {
        String key = me + " " + circleId;
        Cached known = lately.get(key);
        if (known != null && known.until().isAfter(Instant.now())) {
            return known.away();
        }
        List<AwayJourney> away;
        try {
            away = port.away(Caller.of(me), userIds);
        } catch (RuntimeException failed) {
            log.debug("Journey couldn't be asked who is away: {}", failed.toString());
            away = List.of();
        }
        if (port.mode() == JourneyMode.HTTP) {
            // The real Journey is another server: Today is opened often, and need not ask it every time.
            if (lately.size() > 10_000) {
                lately.clear();
            }
            lately.put(key, new Cached(Instant.now().plus(AWAY_IS_FRESH_FOR), away));
        }
        return away;
    }

    /** Days of kept journeys this person may see that fell on this day of the year, the most recent year first. */
    public List<JourneyPastDay> onThisDay(UUID circleId, UUID me, LocalDate day) {
        List<KeepStore.JourneyPastDay> rows = keeps.onThisDay(circleId, me, day, 6);
        Map<UUID, MediaRow> pagePhotos = mediaStore
                .findAll(rows.stream()
                        .map(KeepStore.JourneyPastDay::pageMediaId)
                        .filter(id -> id != null)
                        .toList())
                .stream()
                .collect(Collectors.toMap(MediaRow::id, Function.identity()));
        Map<UUID, String> libraryPhotos = new HashMap<>();
        shelf.items(
                        circleId,
                        me,
                        rows.stream()
                                .map(KeepStore.JourneyPastDay::itemId)
                                .filter(id -> id != null)
                                .toList())
                .forEach(item -> libraryPhotos.put(item.id(), item.pictureKey()));
        Set<UUID> seenPages = thingStore
                .findAll(
                        rows.stream()
                                .map(KeepStore.JourneyPastDay::pageId)
                                .filter(id -> id != null)
                                .toList(),
                        me)
                .stream()
                .map(ThingRow::id)
                .collect(Collectors.toSet());
        return rows.stream()
                .sorted(java.util.Comparator.comparing(KeepStore.JourneyPastDay::day)
                        .reversed())
                .map(row -> {
                    // The picture in the book when this person may see the book, else the one in the Library.
                    MediaRow inBook = seenPages.contains(row.pageId()) ? pagePhotos.get(row.pageMediaId()) : null;
                    String key = inBook != null ? inBook.storageKey() : libraryPhotos.get(row.itemId());
                    return new JourneyPastDay(
                            day.getYear() - row.day().getYear(),
                            row.day(),
                            row.title().isBlank()
                                    ? (row.place() == null ? "A day of a journey" : row.place())
                                    : row.title(),
                            "Day " + row.number(),
                            row.place(),
                            media.urlFor(key, MediaSize.MEDIUM),
                            row.keptId(),
                            seenPages.contains(row.pageId()) ? row.pageId() : null);
                })
                .toList();
    }

    // ---------- hearts at home ----------

    /**
     * Gives a heart at home to the latest entry of someone who is away, or takes it back. Only an entry this
     * person is being shown can be loved. An adult can give one for a child without a phone.
     */
    @Transactional
    public List<AwayResponse> love(UUID circleId, UUID me, UUID entryId, UUID as, boolean on) {
        var circle = circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        AwayResponse shown = away(circleId, me).stream()
                .filter(one -> one.latest().entryId().equals(entryId))
                .findFirst()
                .orElseThrow(ThingService::notFound);
        UUID member = goodnights.actingFor(circle, mine, as);
        if (on) {
            jdbc.sql("""
                insert into journey_entry_loves (circle_id, entry_id, journey_id, member_id)
                values (:circle, :entry, :journey, :member) on conflict do nothing
                """)
                    .param("circle", circleId)
                    .param("entry", entryId)
                    .param("journey", shown.journey().id())
                    .param("member", member)
                    .update();
        } else {
            jdbc.sql(
                            "delete from journey_entry_loves where circle_id = :circle and entry_id = :entry and member_id = :member")
                    .param("circle", circleId)
                    .param("entry", entryId)
                    .param("member", member)
                    .update();
        }
        return away(circleId, me);
    }

    private Map<UUID, List<UUID>> loves(UUID circleId, List<UUID> entryIds) {
        Map<UUID, List<UUID>> loves = new HashMap<>();
        if (entryIds.isEmpty()) {
            return loves;
        }
        jdbc.sql("""
            select entry_id, member_id from journey_entry_loves
            where circle_id = :circle and entry_id in (:entries) order by created_at, member_id
            """)
                .param("circle", circleId)
                .param("entries", entryIds)
                .query((rs, n) -> loves.computeIfAbsent(rs.getObject("entry_id", UUID.class), k -> new ArrayList<>())
                        .add(rs.getObject("member_id", UUID.class)))
                .list();
        return loves;
    }

    // ---------- the Sunday summary ----------

    /**
     * What came through the link in a week, for one person in one circle: the journeys kept (that they may
     * see), the ones they told, how many goodnights arrived. Read from this app's own tables: no sign-in is
     * needed, so a nightly job can ask.
     */
    public WeekFromJourney week(UUID circleId, UUID me, Instant from, Instant to) {
        MemberRow mine = circles.me(circleId, me);
        return new WeekFromJourney(
                keeps.keptBetween(circleId, me, from, to),
                drafts.toldBetween(circleId, mine.id(), from, to),
                goodnightStore.between(circleId, me, from, to));
    }
}
