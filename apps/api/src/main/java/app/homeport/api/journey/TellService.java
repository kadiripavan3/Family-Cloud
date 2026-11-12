package app.homeport.api.journey;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.common.Names;
import app.homeport.api.journey.JourneyJobs.JourneyJobKind;
import app.homeport.api.journey.JourneyJobs.JourneyJobResponse;
import app.homeport.api.journey.JourneyJobs.Progress;
import app.homeport.api.journey.JourneyPort.PostedJourney;
import app.homeport.api.journey.LeavingHome.Candidate;
import app.homeport.api.journey.LeavingHome.DayWords;
import app.homeport.api.journey.LeavingHome.LeavingFlag;
import app.homeport.api.journey.LeavingHome.LeftOut;
import app.homeport.api.journey.LeavingHome.Outcome;
import app.homeport.api.journey.LeavingHome.Verdict;
import app.homeport.api.journey.TellStore.DayRow;
import app.homeport.api.journey.TellStore.DraftRow;
import app.homeport.api.journey.TellStore.ItemRow;
import app.homeport.api.library.LibraryForJourney;
import app.homeport.api.library.LibraryForJourney.Gathered;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.IntConsumer;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tell it as a journey: the other direction. A moment or an album of the Library becomes the draft of a
 * journey, sorted into days ({@link Days}). The draft is its writer's alone and nothing in it has left home.
 *
 * <p>Before it does, it goes through "Before it leaves home" ({@link LeavingHome}): the draft as its screen
 * shows it is {@link #check}, and {@link #post} sends exactly what that check let through. {@link #send} is
 * the only place in this API that hands anything to {@link JourneyPort#post}, and it takes nothing but a
 * checked draft.
 */
@Service
public class TellService {

    public enum JourneyDraftStatus {
        DRAFT,
        POSTING,
        POSTED,
        FAILED;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }
    }

    // ---------- what the app is told ----------

    public record JourneyDraftItem(
            UUID itemId,
            ThingKind kind,
            @Schema(nullable = true) String thumbUrl,
            @Schema(nullable = true) Integer durationSeconds,

            @Schema(description = "True when you took it out of the draft")
            boolean dropped) {}

    public record JourneyDraftDay(
            LocalDate day,

            @Schema(description = "Its place among the days that have something: 1, 2, 3")
            int number,

            @Schema(description = "The day's first line. Change it as you like.")
            String line,

            @Schema(nullable = true) String place,

            @Schema(description = "How many photos are in the day, not counting dropped ones")
            int photos,

            int clips,
            List<JourneyDraftItem> items) {}

    public record JourneyDraftSource(
            @Schema(description = "moment or album") String kind,

            @Schema(description = "Saturday at the lake") String title,

            @Schema(nullable = true) String coverUrl,

            @Schema(description = "For a moment: how many days next to it joined the draft")
            int daysAround) {}

    public record JourneyDraftResponse(
            UUID id,
            UUID circleId,
            String title,
            JourneyDraftSource from,
            List<JourneyDraftDay> days,
            int photos,
            int clips,
            JourneyDraftStatus status,
            JourneyVisibility visibility,

            @Schema(nullable = true, description = "Once it has been sent: the journey it became")
            UUID journeyId,

            @Schema(nullable = true, description = "Opens that journey in the Journey app")
            String openUrl,

            @Schema(nullable = true, description = "How sending it is going, once that was asked for")
            JourneyJobResponse job,

            Instant updatedAt) {}

    public record DayLine(LocalDate day, String line) {}

    public record Move(UUID itemId, LocalDate day) {}

    public record DraftChange(String title, List<DayLine> days, List<Move> move, List<UUID> drop, List<UUID> restore) {}

    public record ChildrenSwitch(
            boolean on,

            @Schema(description = "How many photos and videos in the draft are about a child")
            int count,

            @Schema(description = "Out of how many in the draft")
            int of,

            @Schema(description = "The children they are about: Mia, Leo")
            List<String> names) {}

    public record TownSwitch(
            boolean on,

            @Schema(nullable = true, description = "The name a day would carry: Lake Bled")
            String shows) {}

    public record HomeSwitch(
            boolean on,

            @Schema(description = "How many were taken at home")
            int count,

            @Schema(
                    description =
                            "False when the circle hasn't said where home is: nothing can be recognised as taken there")
            boolean homeKnown) {}

    public record LeavingFlagCount(LeavingFlag flag, int count) {}

    public record LeavingCheckItem(
            UUID itemId,
            LocalDate day,
            @Schema(nullable = true) String thumbUrl,
            boolean goes,

            @Schema(description = "Why it stays home: child, home, dropped, not_a_photo, too_long")
            List<LeftOut> leftOut,

            @Schema(description = "What to look at twice: only_you, hidden, someone_elses")
            List<LeavingFlag> flags,

            @Schema(description = "True when you switched this one back on")
            boolean backOn) {}

    /** "Before it leaves home", as its screen shows it. */
    public record LeavingCheckResponse(
            UUID draftId,
            ChildrenSwitch children,
            TownSwitch town,
            HomeSwitch home,

            @Schema(description = "Files, bills and the Vault never go to Journey. This switch can't be turned.")
            boolean onlyPhotosAndVideos,

            @Schema(description = "Videos longer than Journey takes (60 seconds): they stay")
            int tooLong,

            List<LeavingFlagCount> flags,
            JourneyVisibility visibility,

            @Schema(description = "How many photos would go")
            int photosGoing,

            int clipsGoing,
            List<LeavingCheckItem> items) {}

    public record LeavingCheckChange(
            Boolean leaveOutChildren,
            Boolean townOnly,
            Boolean skipHome,
            JourneyVisibility visibility,

            @Schema(description = "Things to send after all, although a rule left them out")
            List<UUID> backOn,

            @Schema(description = "Things to leave to the rules again")
            List<UUID> backOff) {}

    private final TellStore store;
    private final LibraryForJourney shelf;
    private final CircleService circles;
    private final MemberStore members;
    private final HomeSettings homes;
    private final JourneyPort port;
    private final JourneyJobs jobs;
    private final MediaService media;
    private final ApplicationEventPublisher events;

    TellService(
            TellStore store,
            LibraryForJourney shelf,
            CircleService circles,
            MemberStore members,
            HomeSettings homes,
            JourneyPort port,
            JourneyJobs jobs,
            MediaService media,
            ApplicationEventPublisher events) {
        this.store = store;
        this.shelf = shelf;
        this.circles = circles;
        this.members = members;
        this.homes = homes;
        this.port = port;
        this.jobs = jobs;
        this.media = media;
        this.events = events;
    }

    // ---------- drafting ----------

    /** Drafts a journey from an album, or from the moment a photo belongs to and the days around it. Nothing is sent. */
    @Transactional
    public JourneyDraftResponse create(UUID me, UUID circleId, UUID momentOf, UUID albumId, UUID clientId) {
        circles.require(circleId, me);
        if (port.mode() == JourneyMode.OFF) {
            throw JourneyPort.off();
        }
        MemberRow mine = circles.me(circleId, me);
        UUID before = store.sentBefore(mine.id(), clientId).orElse(null);
        if (before != null) {
            return get(before, me);
        }
        if ((momentOf == null) == (albumId == null)) {
            throw ApiProblem.badRequest("choose_one", "Choose a moment or an album to tell the story from.");
        }
        Gathered gathered = albumId != null ? shelf.ofAlbum(albumId, me) : shelf.aroundMoment(momentOf, me);
        if (gathered.items().stream().anyMatch(item -> !item.thing().circleId().equals(circleId))) {
            throw ThingService.notFound();
        }
        if (gathered.items().isEmpty()) {
            throw ApiProblem.badRequest("nothing_to_tell", "There are no photos there to tell a story with.");
        }
        Days.Sorted sorted = Days.sort(gathered.items().stream()
                .map(item -> new Days.Taken(
                        item.id(),
                        item.day(),
                        item.takenLocal(),
                        item.placeName(),
                        item.country(),
                        item.thing().kind() == ThingKind.VIDEO))
                .toList());
        String title = sorted.title().length() > 80 ? sorted.title().substring(0, 80) : sorted.title();
        UUID id = store.insert(
                circleId,
                mine.id(),
                title,
                albumId != null ? "album" : "moment",
                albumId != null ? albumId : momentOf,
                gathered.title() == null ? "" : gathered.title(),
                clientId);
        for (Days.DayOf day : sorted.days()) {
            store.day(id, day.day(), day.line(), day.place());
            for (int n = 0; n < day.items().size(); n++) {
                store.item(id, day.items().get(n), day.day(), n + 1);
            }
        }
        return get(id, me);
    }

    /**
     * A draft, for its writer. One that says it is on its way although the work of sending it stopped long ago
     * (the API was replaced half way) is put back to "failed" first: it can be sent again, and Journey takes
     * the same draft twice as one journey.
     */
    private DraftRow require(UUID id, UUID me) {
        DraftRow draft = store.find(id, me).orElseThrow(ThingService::notFound);
        if (draft.status().equals("posting")
                && store.quietFor(id) > JourneyJobs.QUIET_MEANS_STOPPED.toSeconds()
                && jobs.latest(id, me)
                        .map(job -> job.status() != JourneyJobs.JourneyJobStatus.RUNNING
                                && job.status() != JourneyJobs.JourneyJobStatus.WAITING)
                        .orElse(true)) {
            store.failed(id);
            return store.find(id, me).orElseThrow(ThingService::notFound);
        }
        return draft;
    }

    private DraftRow requireOpen(UUID id, UUID me) {
        DraftRow draft = require(id, me);
        if (draft.status().equals("posting")) {
            throw JourneyJobs.busy();
        }
        if (draft.status().equals("posted")) {
            throw ApiProblem.conflict("already_told", "This draft has become a journey. Change it in Journey now.");
        }
        return draft;
    }

    public JourneyDraftResponse get(UUID id, UUID me) {
        DraftRow draft = require(id, me);
        Map<UUID, Item> items = items(draft, me);
        List<ItemRow> rows = store.items(id).stream()
                .filter(row -> items.containsKey(row.itemId()))
                .toList();
        Map<LocalDate, List<ItemRow>> byDay =
                rows.stream().collect(Collectors.groupingBy(ItemRow::day, java.util.TreeMap::new, Collectors.toList()));
        Map<LocalDate, DayRow> words =
                store.days(id).stream().collect(Collectors.toMap(DayRow::day, Function.identity()));
        List<JourneyDraftDay> days = new ArrayList<>();
        int photos = 0;
        int clips = 0;
        for (Map.Entry<LocalDate, List<ItemRow>> day : byDay.entrySet()) {
            int dayClips = (int) day.getValue().stream()
                    .filter(row ->
                            !row.dropped() && items.get(row.itemId()).thing().kind() == ThingKind.VIDEO)
                    .count();
            int dayPhotos =
                    (int) day.getValue().stream().filter(row -> !row.dropped()).count() - dayClips;
            DayRow line = words.get(day.getKey());
            days.add(new JourneyDraftDay(
                    day.getKey(),
                    days.size() + 1,
                    line == null ? Days.line(day.getKey(), null) : line.line(),
                    line == null ? null : line.place(),
                    dayPhotos,
                    dayClips,
                    day.getValue().stream()
                            .map(row -> {
                                Item item = items.get(row.itemId());
                                return new JourneyDraftItem(
                                        row.itemId(),
                                        item.thing().kind(),
                                        media.urlFor(item.pictureKey(), MediaSize.SMALL),
                                        item.durationS(),
                                        row.dropped());
                            })
                            .toList()));
            photos += dayPhotos;
            clips += dayClips;
        }
        Item cover = draft.sourceId() != null && items.containsKey(draft.sourceId())
                ? items.get(draft.sourceId())
                : rows.isEmpty() ? null : items.get(rows.get(0).itemId());
        return new JourneyDraftResponse(
                draft.id(),
                draft.circleId(),
                draft.title(),
                new JourneyDraftSource(
                        draft.sourceKind(),
                        draft.sourceTitle(),
                        cover == null ? null : media.urlFor(cover.pictureKey(), MediaSize.MEDIUM),
                        draft.sourceKind().equals("moment") ? Math.max(days.size() - 1, 0) : 0),
                days,
                photos,
                clips,
                JourneyDraftStatus.valueOf(draft.status().toUpperCase(java.util.Locale.ROOT)),
                draft.visibility(),
                draft.journeyId(),
                draft.openUrl(),
                jobs.latest(draft.id(), me).orElse(null),
                draft.updatedAt());
    }

    /** The draft's photos and videos as the Library has them now, as far as its writer may still see them. */
    private Map<UUID, Item> items(DraftRow draft, UUID me) {
        List<UUID> ids = store.items(draft.id()).stream().map(ItemRow::itemId).toList();
        Map<UUID, Item> items = new LinkedHashMap<>();
        shelf.items(draft.circleId(), me, ids).forEach(item -> items.put(item.id(), item));
        return items;
    }

    /** Changes the title, a day's first line, which day something is in, or what is dropped. */
    @Transactional
    public JourneyDraftResponse change(UUID id, UUID me, DraftChange change) {
        DraftRow draft = requireOpen(id, me);
        if (change.title() != null) {
            String title = change.title().trim();
            if (title.isEmpty() || title.length() > 80) {
                throw ApiProblem.badRequest("invalid_title", "Give it a title of 80 characters or fewer.");
            }
            store.retitle(id, title);
        }
        Set<LocalDate> days = store.days(id).stream().map(DayRow::day).collect(Collectors.toSet());
        if (change.days() != null) {
            for (DayLine line : change.days()) {
                if (line.day() == null || !days.contains(line.day())) {
                    throw ApiProblem.badRequest("no_such_day", "That day isn't in this draft.");
                }
                store.day(id, line.day(), line.line() == null ? "" : line.line().trim(), null);
            }
        }
        Set<UUID> inDraft = store.items(id).stream().map(ItemRow::itemId).collect(Collectors.toSet());
        if (change.move() != null) {
            for (Move move : change.move()) {
                if (move.day() == null || !inDraft.contains(move.itemId())) {
                    throw ApiProblem.badRequest("not_in_draft", "That photo isn't in this draft.");
                }
                store.dayIfNew(id, move.day(), Days.line(move.day(), null));
                store.move(id, move.itemId(), move.day());
            }
        }
        store.drop(id, change.drop() == null ? List.of() : change.drop(), true);
        store.drop(id, change.restore() == null ? List.of() : change.restore(), false);
        return get(draft.id(), me);
    }

    @Transactional
    public void delete(UUID id, UUID me) {
        DraftRow draft = require(id, me);
        if (draft.status().equals("posting")) {
            throw JourneyJobs.busy();
        }
        store.delete(id);
    }

    // ---------- before it leaves home ----------

    private record Checking(Outcome outcome, Map<UUID, Item> items, List<Candidate> candidates, Set<UUID> children) {}

    /** Runs the draft, as it stands this moment, through {@link LeavingHome}. */
    private Checking checking(DraftRow draft, UUID me) {
        Map<UUID, Item> items = items(draft, me);
        List<UUID> ids = List.copyOf(items.keySet());
        Map<UUID, List<UUID>> about = shelf.about(ids);
        Set<UUID> hidden = shelf.hiddenFromSomeone(ids);
        Set<UUID> children = members.of(List.of(draft.circleId())).stream()
                .filter(TellService::isChild)
                .map(MemberRow::id)
                .collect(Collectors.toSet());
        List<Candidate> candidates = store.items(draft.id()).stream()
                .filter(row -> items.containsKey(row.itemId()))
                .map(row -> {
                    Item item = items.get(row.itemId());
                    boolean photo = item.mediaKind() == MediaKind.PHOTO;
                    return new Candidate(
                            item.id(),
                            item.thing().kind(),
                            row.day(),
                            row.position(),
                            item.thing().audience(),
                            hidden.contains(item.id()),
                            item.thing().mine(),
                            about.getOrDefault(item.id(), List.of()).stream().anyMatch(children::contains),
                            item.lat(),
                            item.lng(),
                            item.placeName(),
                            item.mediaKind(),
                            // A photo goes as the copy this app made afresh: nothing travels inside it.
                            photo ? item.fullKey() : item.fileKey(),
                            photo ? "image/jpeg" : item.contentType(),
                            item.width(),
                            item.height(),
                            item.durationS(),
                            row.dropped(),
                            row.backOn());
                })
                .toList();
        Outcome outcome = LeavingHome.check(
                draft.id(),
                draft.title(),
                draft.visibility(),
                store.days(draft.id()).stream()
                        .map(day -> new DayWords(day.day(), day.line(), day.place(), null, null))
                        .toList(),
                candidates,
                draft.switches(),
                homes.home(draft.circleId()).orElse(null),
                List.of(),
                null,
                false);
        return new Checking(outcome, items, candidates, children);
    }

    /** A child of the circle: someone kept as a child, or with a child's or a teen's place in a family. */
    static boolean isChild(MemberRow member) {
        return member.kind() == MemberKind.CHILD || member.role() == Role.CHILD || member.role() == Role.TEEN;
    }

    public LeavingCheckResponse check(UUID id, UUID me) {
        DraftRow draft = require(id, me);
        Checking checking = checking(draft, me);
        List<Candidate> inDraft =
                checking.candidates().stream().filter(one -> !one.dropped()).toList();
        Map<UUID, Verdict> verdicts =
                checking.outcome().verdicts().stream().collect(Collectors.toMap(Verdict::itemId, Function.identity()));
        Map<UUID, List<UUID>> about =
                shelf.about(inDraft.stream().map(Candidate::itemId).toList());
        Map<UUID, MemberRow> who = members.of(List.of(draft.circleId())).stream()
                .collect(Collectors.toMap(MemberRow::id, Function.identity()));
        List<String> names = about.values().stream()
                .flatMap(List::stream)
                .distinct()
                .filter(checking.children()::contains)
                .map(memberId -> Names.first(who.get(memberId).name()))
                .sorted()
                .toList();
        LeavingHome.Home home = homes.home(draft.circleId()).orElse(null);
        Map<LeavingFlag, Integer> flags = new java.util.EnumMap<>(LeavingFlag.class);
        inDraft.forEach(one -> verdicts.get(one.itemId()).flags().forEach(flag -> flags.merge(flag, 1, Integer::sum)));
        int clipsGoing = (int) checking.outcome().draft().days().stream()
                .flatMap(day -> day.shots().stream())
                .filter(shot -> shot.kind() == MediaKind.VIDEO)
                .count();
        return new LeavingCheckResponse(
                draft.id(),
                new ChildrenSwitch(
                        draft.leaveOutChildren(),
                        (int) inDraft.stream().filter(Candidate::aboutChild).count(),
                        inDraft.size(),
                        names),
                new TownSwitch(
                        draft.townOnly(),
                        Days.mostNamed(inDraft.stream().map(Candidate::place).toList())),
                new HomeSwitch(
                        draft.skipHome(),
                        (int) inDraft.stream()
                                .filter(one -> LeavingHome.atHome(one.lat(), one.lng(), home))
                                .count(),
                        home != null),
                true,
                (int) inDraft.stream()
                        .filter(one -> verdicts.get(one.itemId()).leftOut().contains(LeftOut.TOO_LONG))
                        .count(),
                flags.entrySet().stream()
                        .map(flag -> new LeavingFlagCount(flag.getKey(), flag.getValue()))
                        .toList(),
                draft.visibility(),
                checking.outcome().draft().shots() - clipsGoing,
                clipsGoing,
                checking.candidates().stream()
                        .map(one -> {
                            Verdict verdict = verdicts.get(one.itemId());
                            return new LeavingCheckItem(
                                    one.itemId(),
                                    one.day(),
                                    media.urlFor(
                                            checking.items().get(one.itemId()).pictureKey(), MediaSize.SMALL),
                                    verdict.goes(),
                                    verdict.leftOut(),
                                    verdict.flags(),
                                    one.backOn());
                        })
                        .toList());
    }

    /** Turns the switches of "Before it leaves home", chooses what the journey starts as, or switches single photos back on. */
    @Transactional
    public LeavingCheckResponse setCheck(UUID id, UUID me, LeavingCheckChange change) {
        DraftRow draft = requireOpen(id, me);
        store.switches(
                id,
                new LeavingHome.Switches(
                        change.leaveOutChildren() == null ? draft.leaveOutChildren() : change.leaveOutChildren(),
                        change.townOnly() == null ? draft.townOnly() : change.townOnly(),
                        change.skipHome() == null ? draft.skipHome() : change.skipHome()),
                change.visibility() == null ? draft.visibility() : change.visibility());
        store.backOn(id, change.backOn() == null ? List.of() : change.backOn(), true);
        store.backOn(id, change.backOff() == null ? List.of() : change.backOff(), false);
        return check(id, me);
    }

    // ---------- sending ----------

    /**
     * Sends the draft to Journey: what the check lets through, and nothing else. Answers at once with the job;
     * the photos go after. A draft leaves once.
     */
    public JourneyJobResponse post(UUID id, UUID me, UUID clientId) {
        DraftRow draft = require(id, me);
        if (port.mode() == JourneyMode.OFF) {
            throw JourneyPort.off();
        }
        if (draft.status().equals("posted")) {
            throw ApiProblem.conflict("already_told", "This draft has become a journey already.");
        }
        if (checking(draft, me).outcome().draft().shots() == 0) {
            throw ApiProblem.badRequest("nothing_to_tell", "Nothing in this draft is going. Switch something back on.");
        }
        Caller as = Caller.of(me);
        return jobs.start(me, draft.circleId(), JourneyJobKind.POST, id, clientId, progress -> post(as, id, progress));
    }

    /** The work of sending a draft. Public so the tests can do it without waiting for a job. */
    public void post(Caller as, UUID draftId, Progress progress) {
        UUID me = as.userId();
        DraftRow draft = require(draftId, me);
        if (!store.startPosting(draftId)) {
            throw draft.status().equals("posted")
                    ? ApiProblem.conflict("already_told", "This draft has become a journey already.")
                    : JourneyJobs.busy();
        }
        try {
            // Checked again here, at the moment of sending: what changed since the screen was shown counts.
            LeavingHome.Checked checked = checking(draft, me).outcome().draft();
            int total = checked.shots();
            progress.step("Sending photos", 0, total);
            PostedJourney posted = send(as, checked, sent -> progress.step("Sending photos", sent, total));
            store.posted(draftId, posted.journeyId(), posted.openUrl());
            events.publishEvent(new JourneyHappened.Told(
                    draft.circleId(), draft.ownerId(), draftId, posted.journeyId(), draft.title(), posted.shots()));
            progress.step("Told", total, total);
        } catch (RuntimeException failed) {
            store.failed(draftId);
            throw failed;
        }
    }

    /**
     * The one door to Journey. Everything this API ever hands over goes through here, and what comes through
     * here has been checked: a {@link LeavingHome.Checked} draft can't be made any other way.
     */
    PostedJourney send(Caller as, LeavingHome.Checked draft, IntConsumer sent) {
        return port.post(as, draft, sent);
    }
}
