package app.homeport.api.journey;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.common.Keyset;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.Crumb;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.folder.People;
import app.homeport.api.journey.JourneyPort.JourneyBrief;
import app.homeport.api.journey.JourneyPort.PostedJourney;
import app.homeport.api.journey.KeepService.KeptResponse;
import app.homeport.api.journey.TripStore.TripRow;
import app.homeport.api.money.sheet.SheetService;
import app.homeport.api.money.sheet.SheetService.NamedTotal;
import app.homeport.api.notes.NotesService;
import app.homeport.api.notes.NotesService.NoteItem;
import app.homeport.api.page.BlockKind;
import app.homeport.api.page.BlockService;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A trip, start to finish: one space with three stages. It is <b>planned</b> here (the pages, lists and the
 * budget that are filed in it), <b>told</b> in Journey while it happens (on its first day it becomes a
 * journey, with its title, its dates and the other adults as authors), and <b>kept</b> afterwards as a book
 * next to what it really cost.
 *
 * <p>A trip is a folder in Notes that was given dates. Nothing else is new: who sees the trip is who sees the
 * folder, what is in it is what was filed there, the budget's numbers are read from its sheet in Money
 * ({@link SheetService#total}), and the book is a kept journey ({@link KeepService}).
 */
@Service
public class TripService {

    private static final Logger log = LoggerFactory.getLogger(TripService.class);

    /** How many of a trip's pages are read for the places they name. */
    static final int PAGES_READ = 20;

    static final int MOST_STOPS = 30;

    public enum TripStage {
        PLAN,
        GO,
        KEEP;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }
    }

    public record TripBecomes(
            @Schema(description = "The day it becomes a journey: its first day")
            LocalDate on,

            @Schema(description = "What is set up: the title")
            String title,

            @Schema(description = "The other adults of the circle: they would write in it too")
            List<PersonBrief> coAuthors,

            @Schema(
                    description =
                            "The places the plan names, in the order its pages name them. They stay here: Journey is told the title and the dates.")
            List<String> route,

            @Schema(description = "True when you can make it a journey now")
            boolean canBecome,

            @Schema(nullable = true, description = "Why not, when you can't: a sentence")
            String note) {}

    public record TripJourney(
            UUID journeyId,
            @Schema(nullable = true) String openUrl,

            @Schema(
                    nullable = true,
                    description = "How it stands in Journey now, when Journey could be asked and lets you see it")
            JourneyBrief journey) {}

    public record TripMoney(
            UUID sheetId,
            String title,

            @Schema(nullable = true, description = "What the budget planned, in cents")
            Long plannedCents,

            @Schema(nullable = true, description = "What was paid, in cents")
            Long paidCents,

            String currency) {}

    public record TripResponse(
            UUID id,
            UUID circleId,
            String title,
            String emoji,

            @Schema(nullable = true, description = "The space it is in: Trips")
            String space,

            LocalDate startsOn,
            LocalDate endsOn,

            @Schema(description = "Where it stands on the day asked about: plan, go or keep")
            TripStage stage,

            @Schema(description = "What is filed in it that you may see, in its order. Fifty at most.")
            List<NoteItem> items,

            @Schema(nullable = true, description = "While it hasn't become a journey: what would be set up")
            TripBecomes becomes,

            @Schema(nullable = true, description = "The journey it became")
            TripJourney journey,

            @Schema(nullable = true, description = "The journey, kept as a book, when you may see it")
            KeptResponse book,

            @Schema(nullable = true, description = "Its budget's totals, when it has a sheet you may see")
            TripMoney money,

            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    public record TripChange(LocalDate startsOn, LocalDate endsOn, UUID budgetSheetId) {}

    /** A trip in a list: enough to draw its folder as a trip. */
    public record TripBrief(UUID id, String title, LocalDate startsOn, LocalDate endsOn, TripStage stage) {}

    private final TripStore store;
    private final KeepStore keeps;
    private final KeepService keepService;
    private final TellService tell;
    private final JourneyPort port;
    private final ThingService things;
    private final ThingStore thingStore;
    private final FolderService folders;
    private final NotesService notes;
    private final BlockService blocks;
    private final SheetService sheets;
    private final CircleService circles;
    private final MemberStore members;
    private final People people;
    private final HomeSettings homes;
    private final ApplicationEventPublisher events;

    TripService(
            TripStore store,
            KeepStore keeps,
            KeepService keepService,
            TellService tell,
            JourneyPort port,
            ThingService things,
            ThingStore thingStore,
            FolderService folders,
            NotesService notes,
            BlockService blocks,
            SheetService sheets,
            CircleService circles,
            MemberStore members,
            People people,
            HomeSettings homes,
            ApplicationEventPublisher events) {
        this.store = store;
        this.keeps = keeps;
        this.keepService = keepService;
        this.tell = tell;
        this.port = port;
        this.things = things;
        this.thingStore = thingStore;
        this.folders = folders;
        this.notes = notes;
        this.blocks = blocks;
        this.sheets = sheets;
        this.circles = circles;
        this.members = members;
        this.people = people;
        this.homes = homes;
        this.events = events;
    }

    private static ApiProblem notATrip() {
        return ThingService.notFound();
    }

    /** Gives a folder its dates (it is a trip from then on), or changes them and which sheet is its budget. */
    @Transactional
    public TripResponse save(UUID folderId, UUID me, TripChange change, LocalDate day) {
        ThingRow folder = things.requireEdit(folderId, me, ThingKind.FOLDER);
        TripRow now = store.find(folderId).orElse(null);
        LocalDate starts = change.startsOn() != null ? change.startsOn() : now == null ? null : now.startsOn();
        LocalDate ends = change.endsOn() != null ? change.endsOn() : now == null ? null : now.endsOn();
        if (starts == null || ends == null) {
            throw ApiProblem.badRequest("no_dates", "Say when the trip starts and when it ends.");
        }
        if (ends.isBefore(starts) || ends.isAfter(starts.plusYears(2))) {
            throw ApiProblem.badRequest("invalid_dates", "A trip ends on or after the day it starts.");
        }
        UUID sheet = change.budgetSheetId() != null ? change.budgetSheetId() : now == null ? null : now.sheetId();
        if (change.budgetSheetId() != null
                && !things.require(sheet, me, ThingKind.SHEET).circleId().equals(folder.circleId())) {
            throw ApiProblem.badRequest("other_circle", "That sheet is in another circle.");
        }
        store.save(folderId, starts, ends, sheet);
        return get(folderId, me, day);
    }

    /** The trips of a circle that this person may see: the folders that have dates. Fifty at most, the latest to start first. */
    public List<TripBrief> list(UUID circleId, UUID me, LocalDate day) {
        circles.require(circleId, me);
        LocalDate today = day == null ? LocalDate.now() : day;
        return store.list(circleId, me).stream()
                .map(trip -> new TripBrief(
                        trip.folderId(),
                        trip.title(),
                        trip.startsOn(),
                        trip.endsOn(),
                        stage(today, trip.startsOn(), trip.endsOn(), trip.journeyId() != null, trip.keptId() != null)))
                .toList();
    }

    /** Planned until its first day (or until it became a journey), told until its last, kept from then on or once its book is home. */
    private static TripStage stage(LocalDate today, LocalDate startsOn, LocalDate endsOn, boolean told, boolean kept) {
        return kept || today.isAfter(endsOn)
                ? TripStage.KEEP
                : told || !today.isBefore(startsOn) ? TripStage.GO : TripStage.PLAN;
    }

    /** The folder stops being a trip. The folder and everything in it stay. */
    @Transactional
    public void remove(UUID folderId, UUID me) {
        things.requireEdit(folderId, me, ThingKind.FOLDER);
        store.delete(folderId);
    }

    /**
     * A trip as its screen draws it.
     *
     * @param day the day on the person's phone; the API's own day when null
     */
    public TripResponse get(UUID folderId, UUID me, LocalDate day) {
        ThingRow thing = things.require(folderId, me, ThingKind.FOLDER);
        TripRow trip = store.find(folderId).orElseThrow(TripService::notATrip);
        FolderResponse folder = folders.get(folderId, me);
        LocalDate today = day == null ? LocalDate.now() : day;
        List<NoteItem> items = notes.inFolder(folderId, me, Keyset.first(50)).items();
        Caller as = Caller.of(me);

        KeptResponse book = trip.keptId() == null
                ? null
                : keeps.find(trip.keptId(), me)
                        .map(kept -> keepService.get(kept.id(), me))
                        .orElse(null);
        TripJourney journey = null;
        if (trip.journeyId() != null) {
            journey = new TripJourney(trip.journeyId(), trip.journeyOpenUrl(), asked(as, trip.journeyId()));
        }
        TripStage stage = stage(today, trip.startsOn(), trip.endsOn(), trip.journeyId() != null, book != null);
        List<Crumb> way = folder.breadcrumb();
        return new TripResponse(
                folderId,
                thing.circleId(),
                thing.title(),
                folder.emoji(),
                way.isEmpty() ? null : way.get(0).title(),
                trip.startsOn(),
                trip.endsOn(),
                stage,
                items,
                trip.journeyId() == null ? becomes(thing, trip, items, as) : null,
                journey,
                book,
                money(trip, items, me),
                thing.mine(),
                thing.canEdit(),
                things.chip(thing));
    }

    /** The journey as Journey has it now. Null when Journey can't be asked just now, or doesn't show it to this person. */
    private JourneyBrief asked(Caller as, UUID journeyId) {
        try {
            return port.journey(as, journeyId).orElse(null);
        } catch (ApiProblem problem) {
            log.debug("Journey couldn't be asked about a trip's journey: {}", problem.code());
            return null;
        }
    }

    private TripBecomes becomes(ThingRow thing, TripRow trip, List<NoteItem> items, Caller as) {
        String note = null;
        if (port.mode() == JourneyMode.OFF) {
            note = "Journey isn't connected here.";
        } else if (!thing.canEdit()) {
            note = "Only someone who can change this trip can make it a journey.";
        } else {
            try {
                if (port.profile(as).isEmpty()) {
                    note = "Open Journey once first, so there is somewhere to tell it.";
                }
            } catch (ApiProblem problem) {
                note = problem.getMessage();
            }
        }
        Map<UUID, PersonBrief> who = people.of(thing.circleId());
        return new TripBecomes(
                trip.startsOn(),
                journeyTitle(thing.title()),
                coAuthors(thing.circleId(), as.userId()).stream()
                        .map(member -> who.get(member.id()))
                        .filter(person -> person != null)
                        .toList(),
                route(items, as.userId()),
                note == null,
                note);
    }

    private static String journeyTitle(String title) {
        String clean = title.isBlank() ? "A trip" : title.trim();
        return clean.length() > 80 ? clean.substring(0, 80) : clean;
    }

    /** The other adults of the circle who have a sign-in of their own. */
    private List<MemberRow> coAuthors(UUID circleId, UUID me) {
        return members.of(List.of(circleId)).stream()
                .filter(member -> member.userId() != null
                        && !member.userId().equals(me)
                        && member.status() == MemberStatus.JOINED
                        && member.kind() == MemberKind.PERSON
                        && member.grownUp())
                .toList();
    }

    /** The places a trip's pages name, in the order they stand. */
    private List<String> route(List<NoteItem> items, UUID me) {
        List<String> stops = new ArrayList<>();
        items.stream()
                .filter(item -> item.kind() == ThingKind.PAGE)
                .limit(PAGES_READ)
                .forEach(page -> blocks.of(page.id(), me).stream()
                        .filter(block ->
                                block.kind() == BlockKind.PLACE && !block.text().isBlank())
                        .map(block -> block.text().trim())
                        .filter(stop -> !stops.contains(stop) && stops.size() < MOST_STOPS)
                        .forEach(stops::add));
        return stops;
    }

    /** The budget's totals: of the sheet the trip names, or failing that the first sheet filed in it. */
    private TripMoney money(TripRow trip, List<NoteItem> items, UUID me) {
        Optional<ThingRow> sheet = trip.sheetId() == null
                ? Optional.empty()
                : thingStore.find(trip.sheetId(), me).filter(row -> row.kind() == ThingKind.SHEET);
        if (sheet.isEmpty()) {
            sheet = items.stream()
                    .filter(item -> item.kind() == ThingKind.SHEET)
                    .findFirst()
                    .flatMap(item -> thingStore.find(item.id(), me));
        }
        if (sheet.isEmpty()) {
            return null;
        }
        UUID id = sheet.get().id();
        Optional<NamedTotal> planned = sheets.total(id, "Planned", me);
        Optional<NamedTotal> paid = sheets.total(id, "Paid", me);
        return new TripMoney(
                id,
                sheet.get().title(),
                planned.map(NamedTotal::cents).orElse(null),
                paid.map(NamedTotal::cents).orElse(null),
                planned.or(() -> paid).map(NamedTotal::currency).orElse("EUR"));
    }

    /**
     * The trip becomes a journey: Journey is told its title, its first day and who writes in it, and nothing
     * else. Like everything that leaves, it goes through {@link LeavingHome}; a plan has no photos, so what
     * the check lets through is the title and the dates. Sending the same clientId again changes nothing.
     */
    public TripResponse become(UUID folderId, UUID me, UUID clientId, JourneyVisibility visibility, LocalDate day) {
        ThingRow thing = things.requireEdit(folderId, me, ThingKind.FOLDER);
        TripRow trip = store.find(folderId).orElseThrow(TripService::notATrip);
        if (trip.journeyId() == null) {
            Caller as = Caller.of(me);
            LeavingHome.Checked checked = LeavingHome.check(
                            // Named by the trip, so asking twice makes one journey whatever the clientId.
                            UUID.nameUUIDFromBytes(
                                    ("the journey of trip " + folderId).getBytes(StandardCharsets.UTF_8)),
                            journeyTitle(thing.title()),
                            visibility == null ? JourneyVisibility.PRIVATE : visibility,
                            List.of(),
                            List.of(),
                            LeavingHome.Switches.CAREFUL,
                            homes.home(thing.circleId()).orElse(null),
                            coAuthors(thing.circleId(), me).stream()
                                    .map(MemberRow::userId)
                                    .toList(),
                            trip.startsOn(),
                            true)
                    .draft();
            PostedJourney posted = tell.send(as, checked, sent -> {});
            if (store.became(folderId, posted.journeyId(), posted.openUrl())) {
                events.publishEvent(new JourneyHappened.TripBecameJourney(
                        thing.circleId(),
                        circles.me(thing.circleId(), me).id(),
                        folderId,
                        posted.journeyId(),
                        thing.title()));
            }
        }
        return get(folderId, me, day);
    }
}
