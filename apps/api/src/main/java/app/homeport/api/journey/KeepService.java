package app.homeport.api.journey;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.folder.People;
import app.homeport.api.journey.JourneyJobs.JourneyJobKind;
import app.homeport.api.journey.JourneyJobs.JourneyJobResponse;
import app.homeport.api.journey.JourneyJobs.Progress;
import app.homeport.api.journey.JourneyPort.JourneyBrief;
import app.homeport.api.journey.JourneyPort.JourneyPerson;
import app.homeport.api.journey.JourneyPort.Story;
import app.homeport.api.journey.JourneyPort.StoryEntry;
import app.homeport.api.journey.JourneyPort.StoryRemark;
import app.homeport.api.journey.JourneyPort.StoryShot;
import app.homeport.api.journey.KeepStore.DayRow;
import app.homeport.api.journey.KeepStore.EntryRow;
import app.homeport.api.journey.KeepStore.KeptRow;
import app.homeport.api.journey.KeepStore.ShotRow;
import app.homeport.api.journey.KeepStore.Switches;
import app.homeport.api.library.LibraryForJourney;
import app.homeport.api.library.LibraryService;
import app.homeport.api.library.LibraryService.Added;
import app.homeport.api.library.LibraryService.NewItem;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.media.MediaStore;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.page.BlockKind;
import app.homeport.api.page.BlockService;
import app.homeport.api.page.BlockService.BlockResponse;
import app.homeport.api.page.BlockService.NewBlock;
import app.homeport.api.page.Mark;
import app.homeport.api.page.MarkKind;
import app.homeport.api.page.PageService;
import app.homeport.api.page.PageService.NewPage;
import app.homeport.api.page.PageService.PageResponse;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Keep a journey: bring a story told in Journey home.
 *
 * <ul>
 *   <li><b>The story, as a book.</b> One page in Notes, made of ordinary blocks, so it is read, shared,
 *       searched and added to like any page: a cover, the numbers, then each day with its words and photos
 *       ({@link BookLayout} says how much of a long journey fits).
 *   <li><b>The originals.</b> Journey keeps a lighter copy of each photo. Each one is matched to the original
 *       this person's Library already has ({@link Originals}); one that has none is brought in at the size
 *       Journey has. Both are put in an album of the journey.
 *   <li><b>The route.</b> What is brought in carries the place of its entry, so the Library's Places shows it;
 *       an original that didn't say where it was taken is told.
 *   <li><b>The kind words.</b> Likes and comments, written under each entry, if asked for.
 * </ul>
 *
 * A kept journey stays linked: asking again brings what was added since. Nothing is kept twice, because
 * every entry and every photo is written down under Journey's own id for it ({@code kept_entries},
 * {@code kept_media}), and every page block and Library item is made with an id worked out from those.
 *
 * <p>Keeping runs as a job ({@link JourneyJobs}): it fetches every photo, and no request should wait for
 * that. No transaction is open while a file is fetched or stored.
 */
@Service
public class KeepService {

    private static final Logger log = LoggerFactory.getLogger(KeepService.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);

    /** How many comments are written under one entry. */
    static final int MOST_REMARKS = 10;

    /** After this many files in a row that Journey didn't hand over, the job gives up: it can be asked for again. */
    static final int GIVES_UP_AFTER = 3;

    // ---------- what the app is told ----------

    public record KeepIn(UUID folderId, String title) {}

    /** What "Keep this journey" shows before anything is kept. */
    public record KeepOptions(
            JourneyBrief journey,
            int photos,
            int clips,

            @Schema(
                    nullable = true,
                    description = "How many of them are in your Library already, as the originals from your phone."
                            + " Null when that can't be told (see originalsNote).")
            Integer inLibrary,

            @Schema(nullable = true, description = "Why originals can't be matched, when they can't: a sentence")
            String originalsNote,

            @Schema(nullable = true, description = "Why clips stay in Journey, when they do: a sentence")
            String clipsNote,

            @Schema(
                    nullable = true,
                    description =
                            "Where the book would be filed: the circle's Trips space, when you can put things there")
            KeepIn keepIn,

            @Schema(description = "Who would see it, unless you choose otherwise")
            Audience audience,

            @Schema(
                    nullable = true,
                    description = "Set when you kept this journey here before: keeping again brings what is new")
            UUID keptId,

            @Schema(nullable = true) UUID pageId) {}

    public record KeepRequest(
            UUID clientId,
            UUID circleId,
            UUID journeyId,
            Boolean book,
            Boolean originals,
            Boolean route,
            Boolean words,
            UUID folderId,
            Audience audience,
            UUID tripId) {}

    public record JourneyStats(int days, int entries, int photos, int clips, int places, int followers) {}

    public record BroughtHome(
            @Schema(description = "How many photos and clips were in your Library already")
            int matched,

            @Schema(description = "How many were brought in from Journey, at the size Journey has")
            int brought,

            @Schema(description = "How many Journey couldn't hand over")
            int leftInJourney) {}

    public record KeptResponse(
            UUID id,
            UUID circleId,
            UUID journeyId,
            String title,

            @Schema(description = "Who told it: Nora and Alex")
            String byline,

            @Schema(nullable = true) String coverUrl,

            @Schema(
                    nullable = true,
                    description = "Its book: a page in Notes. Null when you can't see it, or none was kept.")
            UUID pageId,

            @Schema(
                    nullable = true,
                    description = "Its album in the Library. Null when you can't see it, or none was kept.")
            UUID albumId,

            JourneyStatus status,
            JourneyVisibility visibility,

            @Schema(description = "Journey's own numbers, as they stood when it was last asked")
            JourneyStats stats,

            BroughtHome originals,

            @Schema(nullable = true) LocalDate startsOn,
            @Schema(nullable = true) LocalDate endsOn,
            Instant keptAt,
            @Schema(nullable = true) Instant syncedAt,
            @Schema(nullable = true) String openUrl,
            @Schema(nullable = true) PersonBrief keptBy,

            @Schema(description = "True when you kept it: you can bring what is new, or stop keeping it")
            boolean mine) {}

    public record JourneyBookPhoto(UUID blockId, String url, String thumbUrl, String caption) {}

    public record JourneyBookDay(
            LocalDate day,

            @Schema(description = "Day 1") String label,

            @Schema(nullable = true) String place,

            @Schema(description = "The day's words, one for each block of text under its heading")
            List<String> words,

            @Schema(description = "The photos that stand in the page under this day")
            List<JourneyBookPhoto> photos,

            @Schema(description = "How many photos and clips the day has in all")
            int shots,

            @Schema(description = "How many of them are not in the page: they are in the album")
            int more) {}

    /** A kept journey laid out as the book's screen draws it, from the page as it stands now. */
    public record JourneyBookResponse(
            KeptResponse kept,
            boolean canEdit,
            AudienceChip chip,
            List<JourneyBookDay> days,

            @Schema(nullable = true, description = "The last time you asked for it to be kept, and how that went")
            JourneyJobResponse job) {}

    public record JourneyRoutePoint(
            double lat, double lng, @Schema(nullable = true) String place, LocalDate day, int number) {}

    /** A kept journey's route, for the Places map: its entries that say where they were, in order. */
    public record JourneyRouteResponse(
            UUID keptId,
            String title,
            @Schema(nullable = true) UUID pageId,
            List<JourneyRoutePoint> points) {}

    private final JourneyPort port;
    private final KeepStore store;
    private final JourneyJobs jobs;
    private final CircleService circles;
    private final ThingService things;
    private final ThingStore thingStore;
    private final PageService pages;
    private final BlockService blocks;
    private final FolderService folders;
    private final LibraryService library;
    private final LibraryForJourney shelf;
    private final MediaStore mediaStore;
    private final MediaSizes sizes;
    private final MediaStorage storage;
    private final MediaService media;
    private final People people;
    private final ApplicationEventPublisher events;

    KeepService(
            JourneyPort port,
            KeepStore store,
            JourneyJobs jobs,
            CircleService circles,
            ThingService things,
            ThingStore thingStore,
            PageService pages,
            BlockService blocks,
            FolderService folders,
            LibraryService library,
            LibraryForJourney shelf,
            MediaStore mediaStore,
            MediaSizes sizes,
            MediaStorage storage,
            MediaService media,
            People people,
            ApplicationEventPublisher events) {
        this.port = port;
        this.store = store;
        this.jobs = jobs;
        this.circles = circles;
        this.things = things;
        this.thingStore = thingStore;
        this.pages = pages;
        this.blocks = blocks;
        this.folders = folders;
        this.library = library;
        this.shelf = shelf;
        this.mediaStore = mediaStore;
        this.sizes = sizes;
        this.storage = storage;
        this.media = media;
        this.people = people;
        this.events = events;
    }

    // ---------- before keeping ----------

    /** What the sheet "Keep this journey" shows: the journey, how much of it is home already, where it would go. */
    public KeepOptions options(UUID me, UUID circleId, UUID journeyId) {
        var circle = circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        Caller as = Caller.of(me);
        Story story = port.story(as, journeyId);
        List<StoryShot> shots =
                story.entries().stream().flatMap(e -> e.shots().stream()).toList();
        int clips =
                (int) shots.stream().filter(s -> s.kind() == MediaKind.VIDEO).count();
        JourneyBrief journey = story.journey();
        boolean matchable = shots.stream().anyMatch(s -> s.takenAt() != null || s.originalHash() != null);
        Integer inLibrary = shots.isEmpty()
                ? Integer.valueOf(0)
                : matchable ? match(circleId, me, shots, Set.of()).size() : null;
        boolean clipsStay = shots.stream().anyMatch(s -> s.kind() == MediaKind.VIDEO && s.fileUrl() == null);
        Optional<KeptRow> before = store.mine(circleId, mine.id(), journeyId);
        return new KeepOptions(
                journey,
                journey.photos() != null ? journey.photos() : shots.size() - clips,
                journey.clips() != null ? journey.clips() : clips,
                inLibrary,
                inLibrary == null ? says("originals") : null,
                clipsStay ? says("clips") : null,
                trips(circleId, me).map(f -> new KeepIn(f.id(), f.title())).orElse(null),
                // What the world may already read is for the circle too; a private journey starts as things here do.
                journey.visibility() == JourneyVisibility.PRIVATE
                        ? circle.kind().startsAs()
                        : Audience.CIRCLE,
                before.map(KeptRow::id).orElse(null),
                before.map(KeptRow::pageId)
                        .filter(page -> thingStore.find(page, me).isPresent())
                        .orElse(null));
    }

    private String says(String code) {
        return port.notYet().stream()
                .filter(notYet -> notYet.code().equals(code))
                .map(JourneyPort.NotYet::says)
                .findFirst()
                .orElse(null);
    }

    /** The circle's Trips space, when this person may put things into it. */
    private Optional<FolderResponse> trips(UUID circleId, UUID me) {
        return folders.spaces(circleId, me).stream()
                .filter(space -> space.title().equalsIgnoreCase("Trips") && space.canEdit())
                .findFirst();
    }

    // ---------- keeping ----------

    /**
     * Starts keeping a journey, or bringing home what was added to one that is kept already. Answers at once
     * with the job; the work runs after.
     */
    public JourneyJobResponse keep(UUID me, KeepRequest request) {
        circles.require(request.circleId(), me);
        MemberRow mine = circles.me(request.circleId(), me);
        if (request.folderId() != null) {
            ThingRow folder = things.requireEdit(request.folderId(), me, ThingKind.FOLDER);
            if (!folder.circleId().equals(request.circleId())) {
                throw ApiProblem.badRequest("other_circle", "That folder is in another circle.");
            }
        }
        if (request.tripId() != null
                && !things.requireEdit(request.tripId(), me, ThingKind.FOLDER)
                        .circleId()
                        .equals(request.circleId())) {
            throw ApiProblem.badRequest("other_circle", "That trip is in another circle.");
        }
        Caller as = Caller.of(me);
        // Asked here, not in the job, so someone who may not read the story is told so straight away.
        if (port.journey(as, request.journeyId()).filter(JourneyBrief::mine).isEmpty()) {
            throw JourneyPort.notFound();
        }
        UUID before = store.mine(request.circleId(), mine.id(), request.journeyId())
                .map(KeptRow::id)
                .orElse(null);
        return jobs.start(
                me,
                request.circleId(),
                JourneyJobKind.KEEP,
                before,
                request.clientId(),
                progress -> run(as, request, progress));
    }

    /**
     * The work of keeping. Public so the sample data and the tests can do it without waiting for a job.
     *
     * @return the kept journey's id
     */
    public UUID run(Caller as, KeepRequest request, Progress progress) {
        UUID me = as.userId();
        UUID circleId = request.circleId();
        MemberRow mine = circles.me(circleId, me);
        progress.step("Reading the story", 0, 0);
        Story story = port.story(as, request.journeyId());
        JourneyBrief journey = story.journey();
        List<StoryEntry> entries = story.entries().stream()
                .sorted(Comparator.comparing(StoryEntry::happenedAt).thenComparing(StoryEntry::id))
                .toList();

        boolean first = store.mine(circleId, mine.id(), request.journeyId()).isEmpty();
        KeptRow kept = store.claim(
                circleId,
                mine.id(),
                request.journeyId(),
                journey.title(),
                new Switches(
                        !Boolean.FALSE.equals(request.book()),
                        !Boolean.FALSE.equals(request.originals()),
                        !Boolean.FALSE.equals(request.route()),
                        Boolean.TRUE.equals(request.words())));
        progress.about(kept.id());
        int clips = (int) entries.stream()
                .flatMap(e -> e.shots().stream())
                .filter(s -> s.kind() == MediaKind.VIDEO)
                .count();
        store.told(kept.id(), journey, byline(journey), journey.clips() != null ? journey.clips() : clips);
        if (kept.pageId() != null && thingStore.find(kept.pageId(), me).isEmpty()) {
            // Its book was deleted. Keeping again makes a new one.
            store.forgetBook(kept.id());
            kept = store.find(kept.id()).orElseThrow();
        }
        Audience audience = request.audience() != null
                ? request.audience()
                : journey.visibility() == JourneyVisibility.PRIVATE
                        ? circles.require(circleId, me).kind().startsAs()
                        : Audience.CIRCLE;

        Set<UUID> keptEntries =
                store.entries(kept.id()).stream().map(EntryRow::entryId).collect(Collectors.toSet());
        Map<UUID, ShotRow> keptShots =
                store.shots(kept.id()).stream().collect(Collectors.toMap(ShotRow::mediaId, Function.identity()));
        List<StoryEntry> newEntries =
                entries.stream().filter(e -> !keptEntries.contains(e.id())).toList();
        List<StoryShot> newShots = entries.stream()
                .flatMap(e -> e.shots().stream())
                .filter(s -> !keptShots.containsKey(s.id()))
                .toList();
        int total = newEntries.size() + newShots.size();
        int done = 0;

        // ---------- the book: a page, and the words of every new entry ----------
        UUID pageId = kept.pageId();
        if (kept.withBook()) {
            if (pageId == null) {
                pageId = startBook(kept, journey, entries, audience, request.folderId(), as);
                kept = store.find(kept.id()).orElseThrow();
            }
            progress.step("Writing the book", done, total);
            done += write(kept, pageId, entries, newEntries, as);
        }

        // ---------- the photos: originals matched, the rest brought, a copy in the page ----------
        UUID albumId =
                kept.albumId() != null && thingStore.find(kept.albumId(), me).isPresent() ? kept.albumId() : null;
        if (kept.withOriginals() && albumId == null && !newShots.isEmpty()) {
            albumId = shelf.albumFor(
                    me,
                    circleId,
                    journey.title(),
                    "kept in " + LocalDate.now().getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                    audience,
                    named(kept.id(), "album"));
            store.setAlbum(kept.id(), albumId);
        }
        int leftBehind = bring(kept, pageId, albumId, entries, newShots, keptShots, as, progress, done, total);

        store.countShots(kept.id());
        store.count(kept.id(), leftBehind);
        if (request.tripId() != null) {
            store.linkTrip(request.tripId(), kept.id());
        }
        events.publishEvent(new JourneyHappened.Kept(
                circleId,
                mine.id(),
                kept.id(),
                pageId,
                albumId,
                journey.title(),
                first,
                newEntries.size(),
                newShots.size()));
        progress.step(first ? "Kept" : "Up to date", total, total);
        return kept.id();
    }

    private static UUID named(UUID keptId, String what) {
        return UUID.nameUUIDFromBytes((keptId + " " + what).getBytes(StandardCharsets.UTF_8));
    }

    private static String byline(JourneyBrief journey) {
        List<String> names = journey.authors().stream()
                .map(JourneyPerson::name)
                .map(app.homeport.api.common.Names::first)
                .toList();
        return names.size() <= 1
                ? String.join("", names)
                : String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    /** Makes the page: its title, where it is filed, the cover, a line with who told it and the numbers. */
    private UUID startBook(
            KeptRow kept, JourneyBrief journey, List<StoryEntry> entries, Audience audience, UUID folderId, Caller as) {
        UUID me = as.userId();
        Map<LocalDate, List<StoryEntry>> byDay = byDay(entries);
        BookLayout.Plan plan = BookLayout.plan(byDay.entrySet().stream()
                .map(day -> new BookLayout.DaySize(
                        day.getKey(),
                        day.getValue().size(),
                        day.getValue().stream().mapToInt(e -> e.shots().size()).sum()))
                .toList());
        PageResponse page = pages.create(
                me,
                kept.circleId(),
                new NewPage(journey.title(), null, audience, folderId, "🌍"),
                named(kept.id(), "page"));
        // The cover first, when the journey has one and Journey hands it over.
        try {
            byte[] cover = port.cover(as, journey).orElse(null);
            if (cover != null && cover.length > 0) {
                UUID coverMedia = photo(me, cover);
                blocks.add(
                        page.id(),
                        me,
                        new NewBlock(BlockKind.PHOTO, "", null, null, null, null, coverMedia, null, null, null, null),
                        named(kept.id(), "cover " + page.id()));
                store.setCover(kept.id(), coverMedia);
            }
        } catch (RuntimeException failed) {
            log.warn("The cover of journey {} couldn't be brought home: {}", kept.journeyId(), failed.toString());
        }
        String numbers = "A journey by " + byline(journey) + ". " + plural(journey.days(), "day") + ", "
                + plural(journey.entries(), "entry", "entries")
                + (journey.photos() == null ? "" : ", " + plural(journey.photos(), "photo")) + ".";
        blocks.add(page.id(), me, text(BlockKind.PARAGRAPH, numbers, null), named(kept.id(), "numbers " + page.id()));
        store.setPage(kept.id(), page.id(), plan.shotsADay(), plan.wordsPerDay());
        return page.id();
    }

    private static String plural(int count, String one) {
        return plural(count, one, one + "s");
    }

    private static String plural(int count, String one, String many) {
        return count + " " + (count == 1 ? one : many);
    }

    private static Map<LocalDate, List<StoryEntry>> byDay(List<StoryEntry> entries) {
        Map<LocalDate, List<StoryEntry>> byDay = new java.util.TreeMap<>();
        entries.forEach(entry -> byDay.computeIfAbsent(entry.happenedOn(), day -> new ArrayList<>())
                .add(entry));
        return byDay;
    }

    private static NewBlock text(BlockKind kind, String words, List<Mark> marks) {
        return new NewBlock(kind, words, marks, null, null, null, null, null, null, null, null);
    }

    private static NewBlock after(NewBlock block, UUID after) {
        return new NewBlock(
                block.kind(),
                block.text(),
                block.marks(),
                after,
                null,
                block.thingId(),
                block.mediaId(),
                block.lat(),
                block.lng(),
                block.title(),
                block.items());
    }

    /**
     * Writes the words of the entries that aren't in the page yet: a heading for a day that has none, then
     * the entry (its title in bold, its words), each after what comes before it in the story. Where the
     * layout gives a day one block of words, the entries of a day share it. Returns how many entries it wrote
     * down.
     */
    private int write(KeptRow kept, UUID pageId, List<StoryEntry> story, List<StoryEntry> newEntries, Caller as) {
        UUID me = as.userId();
        Map<LocalDate, DayRow> days =
                store.days(kept.id()).stream().collect(Collectors.toMap(DayRow::day, Function.identity()));
        Map<UUID, UUID> lastBlock = new HashMap<>();
        store.entries(kept.id()).forEach(entry -> lastBlock.put(entry.entryId(), entry.block()));
        Set<UUID> fresh = newEntries.stream().map(StoryEntry::id).collect(Collectors.toSet());
        int wordsEach = Math.clamp(90_000 / Math.max(story.size(), 1), 200, 2000);
        int daysInBook = kept.bookDayWords() ? BookLayout.ROOM / 2 : Integer.MAX_VALUE;
        // Where a day shares one block of words: that block, and what it says so far in this run.
        Map<LocalDate, UUID> dayBlock = new HashMap<>();
        Map<LocalDate, String> dayWords = new HashMap<>();
        UUID previous = null; // the last block of what comes before, in story order
        int written = 0;
        boolean full = false;
        for (StoryEntry entry : story) {
            if (!fresh.contains(entry.id())) {
                UUID own = lastBlock.get(entry.id());
                previous = own != null ? own : previous;
                continue;
            }
            UUID own = null; // the last block this entry has of its own
            try {
                boolean dayHasHeading = days.containsKey(entry.happenedOn())
                        && days.get(entry.happenedOn()).headingBlock() != null;
                long headings = days.values().stream()
                        .filter(day -> day.headingBlock() != null)
                        .count();
                if (!full && (dayHasHeading || headings < daysInBook)) {
                    if (!dayHasHeading) {
                        String heading = entry.label()
                                + (entry.placeName() == null ? "" : " · " + entry.placeName()) + " · "
                                + DAY.format(entry.happenedOn());
                        previous = blocks.add(
                                        pageId,
                                        me,
                                        after(text(BlockKind.HEADING, heading, null), previous),
                                        named(kept.id(), "day " + entry.happenedOn()))
                                .id();
                        store.day(kept.id(), entry.happenedOn(), entry.number(), entry.placeName(), previous);
                        days.put(
                                entry.happenedOn(),
                                new DayRow(
                                        kept.id(), entry.happenedOn(), entry.number(), entry.placeName(), previous, 0));
                    }
                    String title = entry.title() == null ? "" : entry.title().trim();
                    String body =
                            shortened(entry.body() == null ? "" : entry.body().trim(), wordsEach);
                    String words = title.isEmpty() ? body : body.isEmpty() ? title : title + "\n" + body;
                    if (!words.isEmpty() && kept.bookDayWords() && dayBlock.containsKey(entry.happenedOn())) {
                        // The day's one block of words grows by this entry.
                        String all = dayWords.get(entry.happenedOn()) + "\n\n" + words;
                        own = dayBlock.get(entry.happenedOn());
                        blocks.change(
                                own, me, new BlockService.BlockChange(null, all, null, null, null, null, null, null));
                        dayWords.put(entry.happenedOn(), all);
                    } else if (!words.isEmpty()) {
                        List<Mark> bold = title.isEmpty() || body.isEmpty() || kept.bookDayWords()
                                ? List.of()
                                : List.of(new Mark(0, title.length(), MarkKind.BOLD, null, null));
                        own = blocks.add(
                                        pageId,
                                        me,
                                        after(text(BlockKind.PARAGRAPH, words, bold), previous),
                                        named(kept.id(), "entry " + entry.id()))
                                .id();
                        dayBlock.put(entry.happenedOn(), own);
                        dayWords.put(entry.happenedOn(), words);
                    }
                    if (kept.withWords() && !kept.bookDayWords()) {
                        own = kindWords(kept, pageId, entry, own != null ? own : previous, own, as);
                    }
                }
            } catch (ApiProblem problem) {
                if (!"page_full".equals(problem.code())) {
                    throw problem;
                }
                // The page holds no more. What doesn't fit stays in Journey; it is still written down as kept,
                // so it isn't tried again every time.
                full = true;
            }
            // A day the page has no room for still has its row: the route and "On this day" read it.
            store.day(kept.id(), entry.happenedOn(), entry.number(), entry.placeName(), null);
            store.entry(new EntryRow(
                    kept.id(),
                    entry.id(),
                    entry.happenedOn(),
                    entry.happenedAt(),
                    entry.title() == null ? "" : entry.title(),
                    entry.placeName(),
                    kept.withRoute() ? entry.lat() : null,
                    kept.withRoute() ? entry.lng() : null,
                    own));
            lastBlock.put(entry.id(), own);
            previous = own != null ? own : previous;
            written++;
        }
        return written;
    }

    private static String shortened(String words, int longest) {
        return words.length() <= longest
                ? words
                : words.substring(0, longest - 1).trim() + "…";
    }

    /**
     * The likes and the comments under an entry, as bullets after its words. Returns the last block the entry
     * now has of its own ({@code own} when nothing was written).
     */
    private UUID kindWords(KeptRow kept, UUID pageId, StoryEntry entry, UUID after, UUID own, Caller as) {
        UUID last = after;
        UUID mine = own;
        if (entry.likes() > 0) {
            mine = last = blocks.add(
                            pageId,
                            as.userId(),
                            after(text(BlockKind.BULLET, "Liked by " + entry.likes(), null), last),
                            named(kept.id(), "likes " + entry.id()))
                    .id();
        }
        if (entry.comments() > 0) {
            int n = 0;
            for (StoryRemark remark : port.remarks(as, entry.id())) {
                if (n == MOST_REMARKS) {
                    break;
                }
                mine = last = blocks.add(
                                pageId,
                                as.userId(),
                                after(
                                        text(
                                                BlockKind.BULLET,
                                                app.homeport.api.common.Names.first(remark.by()) + ": " + remark.body(),
                                                null),
                                        last),
                                named(kept.id(), "remark " + entry.id() + " " + n++))
                        .id();
            }
        }
        return mine;
    }

    /**
     * Brings the photos and clips that aren't home yet. For each: the original in the Library if there is one,
     * else a copy from Journey added to the Library; and, while the day has room in the page, a copy in the
     * page after its entry. Returns how many Journey couldn't hand over.
     */
    private int bring(
            KeptRow kept,
            UUID pageId,
            UUID albumId,
            List<StoryEntry> story,
            List<StoryShot> newShots,
            Map<UUID, ShotRow> keptShots,
            Caller as,
            Progress progress,
            int done,
            int total) {
        UUID me = as.userId();
        if (newShots.isEmpty()) {
            return kept.leftBehind();
        }
        Set<UUID> used = keptShots.values().stream()
                .map(ShotRow::itemId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<UUID, Originals.Match> matches =
                kept.withOriginals() ? match(kept.circleId(), me, newShots, used) : Map.of();
        Set<UUID> fresh = newShots.stream().map(StoryShot::id).collect(Collectors.toSet());
        Map<UUID, UUID> lastBlock = new HashMap<>();
        Map<UUID, LocalDate> dayOf = new HashMap<>();
        Map<LocalDate, Integer> inPage = new HashMap<>();
        for (EntryRow entry : store.entries(kept.id())) {
            lastBlock.put(entry.entryId(), entry.block());
            dayOf.put(entry.entryId(), entry.day());
        }
        keptShots.values().stream()
                .filter(shot -> shot.pageMediaId() != null && dayOf.containsKey(shot.entryId()))
                .forEach(shot -> inPage.merge(dayOf.get(shot.entryId()), 1, Integer::sum));
        Map<LocalDate, UUID> headings = new HashMap<>();
        store.days(kept.id()).stream()
                .filter(day -> day.headingBlock() != null)
                .forEach(day -> headings.put(day.day(), day.headingBlock()));
        ThingRow album = albumId == null ? null : things.require(albumId, me, ThingKind.ALBUM);
        boolean book = pageId != null && thingStore.find(pageId, me).isPresent();
        List<UUID> home = new ArrayList<>();
        int leftBehind = 0;
        int failures = 0;
        boolean pageFull = false;
        UUID previous = null; // the last block of what comes before this entry, in story order
        LocalDate previousDay = null;
        for (StoryEntry entry : story) {
            if (!entry.happenedOn().equals(previousDay)) {
                // A day starts under its own heading, wherever the day before ended.
                previous = headings.get(entry.happenedOn());
                previousDay = entry.happenedOn();
            }
            // An entry with words has a block of its own; one with only photos goes after what came before it.
            UUID anchor = lastBlock.get(entry.id()) != null ? lastBlock.get(entry.id()) : previous;
            for (StoryShot shot : entry.shots()) {
                if (!fresh.contains(shot.id())) {
                    continue;
                }
                progress.step("Bringing photos home", done++, total);
                Originals.Match match = matches.get(shot.id());
                boolean forPage = book
                        && !pageFull
                        && anchor != null
                        && headings.containsKey(entry.happenedOn())
                        && inPage.getOrDefault(entry.happenedOn(), 0) < kept.bookShots();
                boolean forLibrary = kept.withOriginals() && match == null;
                boolean clip = shot.kind() == MediaKind.VIDEO;
                UUID itemId = match == null ? null : match.own();
                UUID pageMediaId = null;
                try {
                    byte[] picture = forPage || forLibrary ? port.still(as, shot) : null;
                    if (picture != null && picture.length == 0) {
                        picture = null; // a clip that has no still
                    }
                    if (forLibrary && clip && shot.fileUrl() == null) {
                        leftBehind++; // Journey can play it, not hand it over
                    } else if (forLibrary) {
                        byte[] file = clip ? port.file(as, shot) : picture;
                        itemId = toLibrary(kept, entry, shot, file, picture, album, me);
                    } else if (itemId != null && kept.withRoute()) {
                        tellWhere(kept.circleId(), itemId, entry, me);
                    }
                    if (forPage && picture != null) {
                        pageMediaId = photo(me, picture);
                        try {
                            anchor = blocks.add(
                                            pageId,
                                            me,
                                            new NewBlock(
                                                    BlockKind.PHOTO,
                                                    clip ? "A clip. It plays in the album." : "",
                                                    null,
                                                    anchor,
                                                    null,
                                                    null,
                                                    pageMediaId,
                                                    null,
                                                    null,
                                                    null,
                                                    null),
                                            named(kept.id(), "shot " + shot.id()))
                                    .id();
                            lastBlock.put(entry.id(), anchor);
                            store.lastBlock(kept.id(), entry.id(), anchor);
                            store.setCover(kept.id(), pageMediaId);
                            inPage.merge(entry.happenedOn(), 1, Integer::sum);
                        } catch (ApiProblem problem) {
                            mediaStore.delete(List.of(pageMediaId));
                            pageMediaId = null;
                            if (!"page_full".equals(problem.code())) {
                                throw problem;
                            }
                            pageFull = true;
                        }
                    }
                    failures = 0;
                } catch (RuntimeException failed) {
                    // This one didn't come: Journey didn't hand it over, or it isn't a picture this app can
                    // keep. It isn't written down, so asking again tries it again.
                    log.warn("A photo of journey {} couldn't be brought home: {}", kept.journeyId(), failed.toString());
                    if (++failures >= GIVES_UP_AFTER) {
                        throw failed instanceof ApiProblem ? failed : JourneyPort.unreachable();
                    }
                    leftBehind++;
                    continue;
                }
                store.shot(
                        new ShotRow(kept.id(), shot.id(), entry.id(), shot.kind(), itemId, pageMediaId, match != null));
                if (itemId != null) {
                    home.add(itemId);
                }
            }
            previous = anchor != null ? anchor : previous;
        }
        if (albumId != null && !home.isEmpty()) {
            shelf.bringHome(albumId, me, home, home.get(0));
        }
        return leftBehind;
    }

    /** Which of these photos and clips have their original in this person's Library, by the rule in {@link Originals}. */
    private Map<UUID, Originals.Match> match(UUID circleId, UUID me, List<StoryShot> shots, Set<UUID> used) {
        List<Originals.Told> told = shots.stream()
                .map(s -> new Originals.Told(
                        s.id(), s.kind(), s.takenAt(), s.originalHash(), s.width(), s.height(), s.durationSeconds()))
                .toList();
        Map<UUID, Item> own = new LinkedHashMap<>();
        List<String> hashes = shots.stream()
                .map(StoryShot::originalHash)
                .filter(hash -> hash != null)
                .toList();
        List<UUID> byHash =
                List.copyOf(shelf.ownByFingerprint(circleId, me, hashes).values());
        shelf.items(circleId, me, byHash).forEach(item -> own.put(item.id(), item));
        List<Instant> times = shots.stream()
                .map(StoryShot::takenAt)
                .filter(at -> at != null)
                .sorted()
                .toList();
        if (!times.isEmpty()) {
            shelf.ownTakenBetween(
                            circleId,
                            me,
                            times.get(0).minus(Originals.WINDOW),
                            times.get(times.size() - 1).plus(Originals.WINDOW))
                    .forEach(item -> own.put(item.id(), item));
        }
        return Originals.match(
                told,
                own.values().stream()
                        .filter(item -> !used.contains(item.id()))
                        .map(item -> new Originals.Own(
                                item.id(),
                                item.mediaKind(),
                                item.takenAt(),
                                item.contentHash(),
                                item.width(),
                                item.height(),
                                item.durationS()))
                        .toList());
    }

    /** Adds a photo or clip from Journey to the Library, at the size Journey has, with the audience its album has. */
    private UUID toLibrary(
            KeptRow kept, StoryEntry entry, StoryShot shot, byte[] file, byte[] picture, ThingRow album, UUID me) {
        boolean clip = shot.kind() == MediaKind.VIDEO;
        UUID mediaId = clip ? clip(me, file, shot.durationSeconds()) : photo(me, file);
        UUID poster = clip && picture != null && picture.length > 0 ? photo(me, picture) : null;
        boolean located = kept.withRoute() && entry.lat() != null && entry.lng() != null;
        // Journey's time, or failing that the middle of the entry's day: the Library needs to know where on the wall it
        // goes.
        OffsetDateTime taken = shot.takenAt() != null
                ? shot.takenAt().atOffset(ZoneOffset.UTC)
                : entry.happenedOn().atTime(12, 0).atOffset(ZoneOffset.UTC);
        List<Added> added = library.add(
                        me,
                        kept.circleId(),
                        List.of(new NewItem(
                                named(kept.id(), "item " + shot.id()),
                                mediaId,
                                null,
                                null,
                                taken,
                                located ? entry.lat() : null,
                                located ? entry.lng() : null,
                                kept.withRoute() ? entry.placeName() : null,
                                null,
                                poster,
                                null,
                                null,
                                Audience.ME,
                                null,
                                null,
                                null,
                                null)))
                .items();
        Added one = added.get(0);
        if (one.item() == null) {
            mediaStore.delete(poster == null ? List.of(mediaId) : List.of(mediaId, poster));
            throw new ApiProblem(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "not_kept",
                    one.problem() == null
                            ? "A photo couldn't be kept."
                            : one.problem().message());
        }
        if (album != null && album.audience() != Audience.ME) {
            folders.shareLike(album, things.require(one.item().id(), me), me);
        }
        return one.item().id();
    }

    /** An original that never said where it was taken is told the place of its entry: that is the route on the Places map. */
    private void tellWhere(UUID circleId, UUID itemId, StoryEntry entry, UUID me) {
        if (entry.placeName() == null && entry.lat() == null) {
            return;
        }
        shelf.items(circleId, me, List.of(itemId)).stream()
                .filter(item -> item.thing().canEdit() && item.placeName() == null && item.lat() == null)
                .findFirst()
                .ifPresent(item -> library.change(
                        itemId,
                        me,
                        new LibraryService.ItemChange(
                                null, null, entry.lat(), entry.lng(), entry.placeName(), null, null)));
    }

    /** Stores a picture as this person's own photo: made afresh in three sizes, like one they uploaded. */
    private UUID photo(UUID owner, byte[] picture) {
        UUID id = UUID.randomUUID();
        String key = "photos/journey/" + id + "-" + secret() + ".jpg";
        MediaSizes.Made made = sizes.store(picture, key);
        mediaStore.insert(id, owner, MediaKind.PHOTO, "image/jpeg", null, key, null);
        mediaStore.photoReady(id, key, made.bytes(), made.width(), made.height());
        return id;
    }

    private UUID clip(UUID owner, byte[] file, Integer seconds) {
        UUID id = UUID.randomUUID();
        String key = "videos/journey/" + id + "-" + secret() + ".mp4";
        try {
            storage.put(key, file, "video/mp4");
        } catch (IOException e) {
            throw JourneyPort.unreachable();
        }
        mediaStore.insert(id, owner, MediaKind.VIDEO, "video/mp4", null, key, seconds);
        mediaStore.fileReady(id, file.length);
        return id;
    }

    private static String secret() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    // ---------- reading what was kept ----------

    /** The kept journeys of a circle that this person may see, the last kept first. */
    public Page<KeptResponse> list(UUID circleId, UUID me, Keyset page) {
        circles.require(circleId, me);
        List<KeptRow> rows = store.list(circleId, me, page);
        return page.page(rows, row -> Keyset.cursor(row.keptAt(), row.id())).map(shown -> views(shown, me));
    }

    public KeptResponse get(UUID keptId, UUID me) {
        return views(List.of(store.find(keptId, me).orElseThrow(ThingService::notFound)), me)
                .get(0);
    }

    private List<KeptResponse> views(List<KeptRow> rows, UUID me) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<UUID> pointers = new ArrayList<>();
        rows.forEach(row -> {
            if (row.pageId() != null) {
                pointers.add(row.pageId());
            }
            if (row.albumId() != null) {
                pointers.add(row.albumId());
            }
        });
        Set<UUID> seen =
                thingStore.findAll(pointers, me).stream().map(ThingRow::id).collect(Collectors.toSet());
        Map<UUID, MediaRow> covers =
                mediaStore
                        .findAll(rows.stream()
                                .map(KeptRow::coverMediaId)
                                .filter(id -> id != null)
                                .toList())
                        .stream()
                        .collect(Collectors.toMap(MediaRow::id, Function.identity()));
        Map<UUID, PersonBrief> who = people.of(rows.get(0).circleId());
        MemberRow mine = circles.me(rows.get(0).circleId(), me);
        return rows.stream()
                .map(row -> {
                    MediaRow cover = covers.get(row.coverMediaId());
                    return new KeptResponse(
                            row.id(),
                            row.circleId(),
                            row.journeyId(),
                            row.title(),
                            row.byline(),
                            cover == null ? null : media.urlFor(cover.storageKey(), MediaSize.MEDIUM),
                            seen.contains(row.pageId()) ? row.pageId() : null,
                            seen.contains(row.albumId()) ? row.albumId() : null,
                            row.status(),
                            row.visibility(),
                            new JourneyStats(
                                    row.days(),
                                    row.entries(),
                                    row.photos(),
                                    row.clips(),
                                    row.places(),
                                    row.followers()),
                            new BroughtHome(row.matched(), row.brought(), row.leftBehind()),
                            row.startsOn(),
                            row.endsOn(),
                            row.keptAt(),
                            row.syncedAt(),
                            row.openUrl(),
                            who.get(row.keptBy()),
                            row.keptBy().equals(mine.id()));
                })
                .toList();
    }

    /**
     * The book of a kept journey, laid out as its screen draws it: read from the page as it stands now, so what
     * anyone changed in the page since is what the book says.
     *
     * @param pageId the page in Notes. A page that isn't a kept journey's book is "not found" here.
     */
    public JourneyBookResponse book(UUID pageId, UUID me) {
        ThingRow thing = things.require(pageId, me, ThingKind.PAGE);
        KeptRow kept = store.ofPage(pageId).orElseThrow(ThingService::notFound);
        PageResponse page = pages.get(pageId, me);
        Map<UUID, DayRow> headings = new HashMap<>();
        List<DayRow> dayRows = store.days(kept.id());
        dayRows.stream()
                .filter(day -> day.headingBlock() != null)
                .forEach(day -> headings.put(day.headingBlock(), day));

        Map<LocalDate, List<String>> words = new LinkedHashMap<>();
        Map<LocalDate, List<JourneyBookPhoto>> photos = new LinkedHashMap<>();
        LocalDate current = null;
        for (BlockResponse block : page.blocks()) {
            DayRow starts = headings.get(block.id());
            if (starts != null) {
                current = starts.day();
                continue;
            }
            if (current == null) {
                continue; // the line with the numbers, and whatever someone wrote above the first day
            }
            if (block.kind().isText() && !block.text().isBlank()) {
                words.computeIfAbsent(current, day -> new ArrayList<>()).add(block.text());
            } else if (block.kind() == BlockKind.PHOTO && block.media() != null) {
                photos.computeIfAbsent(current, day -> new ArrayList<>())
                        .add(new JourneyBookPhoto(
                                block.id(), block.media().url(), block.media().thumbUrl(), block.text()));
            }
        }
        List<JourneyBookDay> days = dayRows.stream()
                .map(day -> {
                    List<JourneyBookPhoto> here = photos.getOrDefault(day.day(), List.of());
                    return new JourneyBookDay(
                            day.day(),
                            "Day " + day.number(),
                            day.place(),
                            words.getOrDefault(day.day(), List.of()),
                            here,
                            day.shots(),
                            Math.max(day.shots() - here.size(), 0));
                })
                .toList();
        return new JourneyBookResponse(
                views(List.of(kept), me).get(0),
                thing.canEdit(),
                things.chip(thing),
                days,
                jobs.latest(kept.id(), me).orElse(null));
    }

    /** The routes of the kept journeys this person may see, for the Places map. Fifty journeys at most, in the order they were kept. */
    public List<JourneyRouteResponse> routes(UUID circleId, UUID me) {
        circles.require(circleId, me);
        Set<UUID> seenPages = new HashSet<>();
        List<KeptRow> rows = store.list(circleId, me, Keyset.first(49));
        thingStore
                .findAll(
                        rows.stream()
                                .map(KeptRow::pageId)
                                .filter(id -> id != null)
                                .toList(),
                        me)
                .forEach(row -> seenPages.add(row.id()));
        return rows.stream()
                .filter(KeptRow::withRoute)
                .map(row -> {
                    Map<LocalDate, Integer> numbers =
                            store.days(row.id()).stream().collect(Collectors.toMap(DayRow::day, DayRow::number));
                    List<JourneyRoutePoint> points = store.entries(row.id()).stream()
                            .filter(entry -> entry.lat() != null && entry.lng() != null)
                            .limit(300)
                            .map(entry -> new JourneyRoutePoint(
                                    entry.lat(),
                                    entry.lng(),
                                    entry.place(),
                                    entry.day(),
                                    numbers.getOrDefault(entry.day(), 0)))
                            .toList();
                    return new JourneyRouteResponse(
                            row.id(), row.title(), seenPages.contains(row.pageId()) ? row.pageId() : null, points);
                })
                .filter(route -> !route.points().isEmpty())
                .toList();
    }

    /**
     * Stops keeping a journey: the link is forgotten, and asking again would keep it afresh. The page, the
     * album and the photos stay; each is deleted like any other thing. Only whoever kept it can.
     */
    public void forget(UUID keptId, UUID me) {
        KeptRow kept = store.find(keptId, me).orElseThrow(ThingService::notFound);
        if (!kept.keptBy().equals(circles.me(kept.circleId(), me).id())) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "not_yours", "Only the person who kept this can do that.");
        }
        store.delete(keptId);
    }
}
