package app.homeport.api.jot;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.home.HomeService;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.jot.JotStore.JotRow;
import app.homeport.api.jot.JotStore.PlacesRow;
import app.homeport.api.jot.JotStore.WaysRow;
import app.homeport.api.jot.LineReader.Context;
import app.homeport.api.jot.LineReader.FoundAmount;
import app.homeport.api.jot.LineReader.FoundDate;
import app.homeport.api.jot.LineReader.Item;
import app.homeport.api.jot.LineReader.NamedList;
import app.homeport.api.jot.LineReader.Piece;
import app.homeport.api.jot.LineReader.Reading;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.page.PageService;
import app.homeport.api.plan.EventService;
import app.homeport.api.plan.EventService.NewEvent;
import app.homeport.api.plan.EventService.NewGuest;
import app.homeport.api.plan.EventService.When;
import app.homeport.api.plan.EventStore;
import app.homeport.api.plan.EventStore.Event;
import app.homeport.api.plan.PlanPeople;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.plan.ReminderService;
import app.homeport.api.plan.ReminderService.NewReminder;
import app.homeport.api.plan.ReminderStore;
import app.homeport.api.plan.ReminderStore.Reminder;
import app.homeport.api.plan.RepeatResponse;
import app.homeport.api.plan.Words;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Jot: one line that takes anything. The line is read by {@link LineReader} and each thing in it is filed:
 *
 * <ul>
 *   <li>an event or a reminder is made, for whoever the line named;
 *   <li>something to buy is added to the shopping list (the person's own choice of list, else the list the
 *       circle marked, else a new list called Groceries that becomes the circle's);
 *   <li>a line for a named list is added to that list; when the circle has no such list it is kept as a note;
 *   <li>anything else becomes a page in Notes;
 *   <li>something that looks like a code or a password is not filed at all. Its words wait in the jot until
 *       the person says what to do: keep it in the Vault (the phone does that, then removes the jot), or
 *       "it's just a note".
 * </ul>
 *
 * Every jot is remembered, so it can be listed, undone (what it made is removed) and moved (to another kind
 * or list). A jot is its writer's own; what it made is shared like any other thing.
 */
@Service
public class JotService {

    static final int MOST_ADDED_WEEKS = 8;
    static final int CHIPS = 8;
    static final int WIDGET_LINES = 6;
    static final int NEXT = 3;
    static final String SHOPPING_LIST = "Groceries";

    /** Where something to buy would go, or went. A null id means the list isn't there yet and is made on the first jot. */
    public record ListBriefResponse(@Schema(nullable = true) UUID id, String title) {}

    public record PlaceSuggestionResponse(
            @Schema(description = "Barber Miha") String words,

            @Schema(description = "Barber Miha, from last time")
            String label) {}

    /** One thing a line holds, as "Type it" shows its reading. */
    public record ReadItemResponse(
            ReadAs as,

            @Schema(description = "The part of the line this was read from")
            String words,

            String title,
            @Schema(nullable = true) LocalDate day,

            @Schema(nullable = true, type = "string", example = "10:00") @JsonFormat(pattern = "HH:mm")
            LocalTime time,

            @Schema(nullable = true, type = "string", example = "10:30") @JsonFormat(pattern = "HH:mm")
            LocalTime endTime,

            @Schema(nullable = true, description = "Sat 14 Nov · 10:00 to 10:30")
            String whenLabel,

            @Schema(nullable = true, description = "The short way to say when, for a chip: today 18:00, tomorrow 9:00")
            String whenNear,

            @Schema(nullable = true) PersonBrief person,

            @Schema(
                    nullable = true,
                    description = "What the name means: for them, given to them, with them, about them")
            PersonRole personRole,

            @Schema(nullable = true, description = "For Leo")
            String personLabel,

            @Schema(nullable = true) Integer remindMinutes,

            @Schema(nullable = true, description = "1 hour before")
            String remindLabel,

            @Schema(nullable = true) RepeatResponse repeat,

            @Schema(nullable = true, description = "For a line of a list: the list it would go to")
            ListBriefResponse list,

            @Schema(nullable = true, description = "How many: 2, 500 g")
            String quantity,

            @Schema(nullable = true, description = "For something held back: what kind of secret it looks like")
            CodeKind code,

            @Schema(nullable = true, description = "For an event: where the last one like it was")
            PlaceSuggestionResponse place,

            @Schema(description = "How it was read: the pieces of the line that were used and what each became")
            List<Piece> pieces) {}

    public record ReadingResponse(
            @Schema(
                    description =
                            "True for a long text: nothing is read as a line, the days and amounts found are suggestions")
            boolean letter,

            List<ReadItemResponse> items,
            List<FoundDate> dates,
            List<FoundAmount> amounts) {}

    /** One thing a jot became. */
    public record JotResponse(
            UUID id,

            @Schema(description = "The same for everything that came from one line")
            UUID batchId,

            String words,
            JotSource source,

            @Schema(description = "What it became. code: it was held back and hasn't been kept anywhere yet.")
            ReadAs became,

            String title,

            @Schema(
                    description =
                            "Where it went, in a few words: Groceries, Reminder · tomorrow 9:00, Asked Alex · today 18:00")
            String where,

            @Schema(nullable = true, description = "The event, reminder or page it made, or the list it went to")
            UUID thingId,

            @Schema(nullable = true) ThingKind thingKind,

            @Schema(nullable = true, description = "For a line of a list: the line")
            UUID itemId,

            @Schema(description = "True when what it made isn't there any more, or isn't shared with you any more")
            boolean gone,

            Instant createdAt) {}

    public record WaysResponse(
            @Schema(description = "A line to type in, pinned in the notifications")
            boolean pinnedNote,

            boolean voice,
            @Schema(description = "Share from any app") boolean share,

            @Schema(description = "What a jot with a day or a time becomes when the words don't say")
            TimedAs timedAs,

            @Schema(description = "What happens to a jot that looks like a code or a password")
            CodesGo codes,

            @Schema(
                    description =
                            "Where something to buy goes: your own choice, else the circle's list, else a list that will be made")
            ListBriefResponse buyList,

            @Schema(description = "True when that is your own choice and not the circle's list")
            boolean buyListIsYours,

            @Schema(
                    nullable = true,
                    description = "The address to forward email to. Null until receiving email is connected.")
            String forwardAddress) {}

    public record WaysChange(
            Boolean pinnedNote,
            Boolean voice,
            Boolean share,
            TimedAs timedAs,
            CodesGo codes,
            UUID buyListId,
            boolean useCirclesList) {}

    /** A line of a list on a widget. */
    public record WidgetLineResponse(UUID id, String text, boolean done) {}

    public record WidgetListResponse(
            UUID id,
            String title,
            int left,
            int done,

            @Schema(description = "Its first lines: what is left first, then what was ticked")
            List<WidgetLineResponse> lines) {}

    public record ListInUseResponse(
            WidgetListResponse list,

            @Schema(description = "Who is using it") PersonBrief by,
            boolean you,
            Instant since) {}

    public record NextLineResponse(
            @Schema(nullable = true) UUID thingId,
            ThingKind kind,

            @Schema(nullable = true, description = "15:30, €84")
            String lead,

            String title,
            String note,

            @Schema(nullable = true, description = "For something that can be ticked: false. Null otherwise.")
            Boolean done) {}

    public record WidgetsResponse(
            LocalDate day,

            @Schema(description = "What this circle puts on lists most, for one-tap adding: Milk, Eggs, Bread")
            List<String> chips,

            @Schema(nullable = true, description = "The shopping list. Null when there is none yet.")
            WidgetListResponse shopping,

            @Schema(nullable = true, description = "The list someone is using right now, for the Lock Screen")
            ListInUseResponse inUse,

            @Schema(description = "What is next today: three lines at most")
            List<NextLineResponse> next,

            @Schema(description = "How many things you jotted today")
            int addedToday) {}

    private final CircleService circles;
    private final ThingService things;
    private final ThingStore thingStore;
    private final JotStore jots;
    private final PlanPeople people;
    private final EventService events;
    private final EventStore eventStore;
    private final ReminderService reminders;
    private final ReminderStore reminderStore;
    private final ChecklistService checklists;
    private final PageService pages;
    private final HomeService home;

    JotService(
            CircleService circles,
            ThingService things,
            ThingStore thingStore,
            JotStore jots,
            PlanPeople people,
            EventService events,
            EventStore eventStore,
            ReminderService reminders,
            ReminderStore reminderStore,
            ChecklistService checklists,
            PageService pages,
            HomeService home) {
        this.circles = circles;
        this.things = things;
        this.thingStore = thingStore;
        this.jots = jots;
        this.people = people;
        this.events = events;
        this.eventStore = eventStore;
        this.reminders = reminders;
        this.reminderStore = reminderStore;
        this.checklists = checklists;
        this.pages = pages;
        this.home = home;
    }

    // ---------- reading without saving ----------

    /** How a line would be read, without filing anything: what "Type it" and the jot bar show while typing. */
    public ReadingResponse read(UUID circleId, UUID me, String text, LocalDate day, String timeZone) {
        circles.require(circleId, me);
        Told told = told(circleId, me, day, timeZone);
        Reading reading = LineReader.read(text, told.context());
        ListBriefResponse shopping =
                reading.items().stream().anyMatch(Item::shopping) ? buyList(circleId, me, told) : null;
        return new ReadingResponse(
                reading.letter(),
                reading.items().stream()
                        .map(item -> view(item, told, shopping, circleId, me))
                        .toList(),
                reading.dates(),
                reading.amounts());
    }

    private ReadItemResponse view(Item item, Told told, ListBriefResponse shopping, UUID circleId, UUID me) {
        LocalDate today = told.context().today();
        Person person = item.personId() == null ? null : told.circle().get(item.personId());
        String when = item.day() == null
                ? null
                : Words.dots(
                        Words.day(item.day(), today),
                        item.time() == null
                                ? null
                                : Words.time(item.time())
                                        + (item.endTime() == null ? "" : " to " + Words.time(item.endTime())));
        String personLabel = person == null
                ? null
                : switch (item.personRole()) {
                    case FOR -> person.id().equals(told.mine()) ? "For you" : "For " + person.name();
                    case GIVEN_TO -> person.id().equals(told.mine()) ? "For you" : "Given to " + person.name();
                    case WITH -> "With " + person.name();
                    case ABOUT -> "About " + person.name();
                };
        PlaceSuggestionResponse place = item.as() != ReadAs.EVENT
                ? null
                : eventStore
                        .lastPlace(circleId, me, item.title(), today.plusDays(1))
                        .map(words -> new PlaceSuggestionResponse(words, words + ", from last time"))
                        .orElse(null);
        return new ReadItemResponse(
                item.as(),
                item.words(),
                item.title(),
                item.day(),
                item.time(),
                item.endTime(),
                when,
                item.day() == null ? null : Words.when(item.day(), item.time(), today),
                person == null ? null : person.brief(),
                person == null ? null : item.personRole(),
                personLabel,
                item.remindMinutes(),
                item.remindMinutes() == null ? null : Words.before(item.remindMinutes()),
                RepeatResponse.of(item.repeat()),
                item.as() != ReadAs.LIST_ITEM
                        ? null
                        : item.shopping()
                                ? shopping
                                : new ListBriefResponse(item.listId(), item.listName() == null ? "" : item.listName()),
                item.quantity(),
                item.code(),
                place,
                item.pieces());
    }

    /** What the reader is told about one person in one circle. */
    private record Told(Context context, Map<UUID, Person> circle, UUID mine, ZoneId zone, WaysRow ways) {}

    private Told told(UUID circleId, UUID me, LocalDate day, String timeZone) {
        ZoneId zone = zone(timeZone);
        LocalDate nowDay = LocalDate.now(zone);
        LocalDate today = day == null ? nowDay : day;
        Map<UUID, Person> circle = people.in(circleId);
        UUID mine = circles.me(circleId, me).id();
        WaysRow ways = jots.ways(me);
        // The lists a line can be added to: the ones this person may change.
        List<NamedList> lists =
                thingStore.list(circleId, me, ThingKind.CHECKLIST, null, null, Keyset.first(100)).stream()
                        .filter(ThingRow::canEdit)
                        .map(list -> new NamedList(list.id(), list.title()))
                        .toList();
        return new Told(
                new Context(
                        today,
                        // The time is only known when the phone's day is the day it is there now.
                        timeZone != null && today.equals(nowDay) ? LocalTime.now(zone) : null,
                        mine,
                        circle.values().stream()
                                .map(p -> new LineReader.Person(p.id(), p.name()))
                                .toList(),
                        lists,
                        ways.timedAs() == TimedAs.EVENT ? ReadAs.EVENT : ReadAs.REMINDER),
                circle,
                mine,
                zone,
                ways);
    }

    private static ZoneId zone(String timeZone) {
        if (timeZone == null || timeZone.isBlank()) {
            return ZoneId.of("UTC");
        }
        try {
            return ZoneId.of(timeZone.trim());
        } catch (DateTimeException unknown) {
            throw ApiProblem.badRequest("invalid_time_zone", "We don't know that time zone.");
        }
    }

    // ---------- jotting: read and file in one go ----------

    /**
     * Reads a line and files everything in it. Sending the same clientId again files nothing and answers with
     * what was made the first time. All of a line is filed, or none of it.
     */
    @Transactional
    public List<JotResponse> jot(
            UUID circleId,
            UUID me,
            String text,
            LocalDate day,
            String timeZone,
            JotSource source,
            Audience audience,
            UUID clientId) {
        circles.require(circleId, me);
        Told told = told(circleId, me, day, timeZone);
        List<JotRow> before = jots.batch(told.mine(), clientId);
        if (!before.isEmpty()) {
            return views(before, me, told.context().today());
        }
        Reading reading = LineReader.read(text, told.context());
        List<Item> items = reading.items();
        if (reading.letter() || items.isEmpty()) {
            // Too long to be a line: kept whole, as a note. (Sharing a letter reads its days first; see read.)
            String words = text.strip();
            items = List.of(new Item(
                    ReadAs.NOTE,
                    words,
                    words,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    false,
                    null,
                    null,
                    null,
                    null,
                    List.of()));
        }
        JotSource from = source == null ? JotSource.APP : source;
        int position = 0;
        for (Item item : items) {
            Filed filed =
                    file(item, item.as(), null, circleId, me, told, audience, sub(clientId, String.valueOf(position)));
            jots.insert(
                    circleId,
                    told.mine(),
                    clientId,
                    position++,
                    from,
                    shorten(item.words(), 2000),
                    filed.as(),
                    shorten(filed.title(), 300),
                    filed.thingId(),
                    filed.itemId());
        }
        return views(jots.batch(told.mine(), clientId), me, told.context().today());
    }

    /** What filing one thing made. */
    private record Filed(ReadAs as, String title, UUID thingId, UUID itemId) {}

    /**
     * Files one thing as a kind: the kind it was read as, or the kind it is being moved to.
     *
     * @param toList for a line of a list: the list it is being moved to, when the person chose one
     */
    private Filed file(
            Item item, ReadAs as, UUID toList, UUID circleId, UUID me, Told told, Audience audience, UUID clientId) {
        Person person = item.personId() == null ? null : told.circle().get(item.personId());
        boolean someoneElse = person != null && !person.id().equals(told.mine());
        List<UUID> about =
                person != null && (item.personRole() == PersonRole.FOR || item.personRole() == PersonRole.ABOUT)
                        ? List.of(person.id())
                        : null;
        switch (as) {
            case EVENT -> {
                boolean coming =
                        someoneElse && (item.personRole() == PersonRole.FOR || item.personRole() == PersonRole.WITH);
                // "Haircut for Leo" is called "Haircut · Leo", as the calendar shows it.
                String title = someoneElse && item.personRole() == PersonRole.FOR
                        ? item.title() + " · " + person.name()
                        : item.title();
                LocalDate on = item.day() == null ? told.context().today() : item.day();
                UUID id = events.create(
                                me,
                                new NewEvent(
                                        circleId,
                                        shorten(title, 200),
                                        new When(
                                                on,
                                                item.time(),
                                                on,
                                                item.endTime(),
                                                told.zone().getId()),
                                        null,
                                        null,
                                        null,
                                        item.remindMinutes(),
                                        item.repeat(),
                                        coming ? List.of(new NewGuest(person.id(), null, null, null)) : List.of(),
                                        about,
                                        audience),
                                clientId)
                        .id();
                return new Filed(ReadAs.EVENT, title, id, null);
            }
            case REMINDER -> {
                boolean given =
                        someoneElse && item.personRole() == PersonRole.GIVEN_TO && person.kind() != MemberKind.PET;
                UUID id = reminders
                        .create(
                                me,
                                new NewReminder(
                                        circleId,
                                        shorten(item.title(), 200),
                                        null,
                                        item.day(),
                                        item.day() == null ? null : item.time(),
                                        told.zone().getId(),
                                        item.remindMinutes(),
                                        item.day() == null ? null : item.repeat(),
                                        given ? List.of(person.id()) : List.of(),
                                        false,
                                        null,
                                        null,
                                        about,
                                        audience),
                                clientId)
                        .id();
                return new Filed(ReadAs.REMINDER, item.title(), id, null);
            }
            case LIST_ITEM -> {
                UUID listId = toList != null
                        ? toList
                        : item.listId() != null
                                ? item.listId()
                                : item.shopping() || item.as() != ReadAs.LIST_ITEM
                                        ? shoppingList(circleId, me, told)
                                        : null;
                if (listId == null) {
                    // A list the circle doesn't have: nothing is made up, the words are kept as a note.
                    return note(Words.capital(item.words()), circleId, me, audience, clientId);
                }
                String text = item.as() == ReadAs.LIST_ITEM ? item.title() : Words.capital(item.words());
                UUID line = checklists
                        .add(
                                listId,
                                me,
                                new NewItem(
                                        shorten(text, 300),
                                        item.quantity() == null ? null : "×" + item.quantity(),
                                        null,
                                        null,
                                        null),
                                clientId)
                        .id();
                return new Filed(ReadAs.LIST_ITEM, text, listId, line);
            }
            case CODE -> {
                if (told.ways().codes() == CodesGo.NOTE) {
                    return note(item.title(), circleId, me, audience, clientId);
                }
                return new Filed(ReadAs.CODE, item.title(), null, null);
            }
            default -> {
                return note(
                        item.as() == ReadAs.NOTE || item.as() == ReadAs.CODE
                                ? item.title()
                                : Words.capital(item.words()),
                        circleId,
                        me,
                        audience,
                        clientId);
            }
        }
    }

    /** A page in Notes: the words are its title; what doesn't fit a title is its body. */
    private Filed note(String words, UUID circleId, UUID me, Audience audience, UUID clientId) {
        String title = shorten(words, 80);
        UUID id = pages.create(me, circleId, title, title.equals(words) ? "" : words, audience, clientId)
                .id();
        return new Filed(ReadAs.NOTE, title, id, null);
    }

    /** An id that follows from another, so sending a jot twice makes each thing in it once. */
    private static UUID sub(UUID clientId, String part) {
        return UUID.nameUUIDFromBytes((clientId + ":" + part).getBytes(StandardCharsets.UTF_8));
    }

    private static String shorten(String words, int most) {
        String one = words == null ? "" : words.strip();
        return one.length() <= most ? one : one.substring(0, most - 1).stripTrailing() + "…";
    }

    // ---------- the shopping list ----------

    /**
     * The list something to buy goes to, made when it is missing: the person's own choice, else the list the
     * circle marked, else a new list called Groceries, shared with everyone, that becomes the circle's.
     */
    private UUID shoppingList(UUID circleId, UUID me, Told told) {
        ListBriefResponse there = buyList(circleId, me, told);
        if (there.id() != null) {
            return there.id();
        }
        UUID made = checklists
                .create(
                        me,
                        circleId,
                        SHOPPING_LIST,
                        Audience.CIRCLE,
                        List.of(),
                        sub(circleId, "shopping:" + told.mine()))
                .id();
        if (jots.shoppingList(circleId).isEmpty()) {
            jots.markShoppingList(circleId, made, told.mine());
        } else {
            jots.buyList(told.mine(), made); // the circle has one this person can't add to: this one is theirs
        }
        return made;
    }

    /** Where something to buy goes now. With no id: nowhere yet, and a list will be made. */
    private ListBriefResponse buyList(UUID circleId, UUID me, Told told) {
        ThingRow own = usable(jots.places(told.mine()).buyListId(), me);
        if (own != null) {
            return new ListBriefResponse(own.id(), own.title());
        }
        ThingRow shared = usable(jots.shoppingList(circleId).orElse(null), me);
        return shared != null
                ? new ListBriefResponse(shared.id(), shared.title())
                : new ListBriefResponse(null, SHOPPING_LIST);
    }

    /** The checklist, when this person may add to it; null otherwise. */
    private ThingRow usable(UUID listId, UUID me) {
        if (listId == null) {
            return null;
        }
        return thingStore
                .find(listId, me)
                .filter(list -> list.kind() == ThingKind.CHECKLIST && list.canEdit())
                .orElse(null);
    }

    /** Marks a checklist as the circle's shopping list. Whoever may change the list can. */
    @Transactional
    public ListBriefResponse markShoppingList(UUID circleId, UUID me, UUID listId) {
        circles.require(circleId, me);
        ThingRow list = things.requireEdit(listId, me, ThingKind.CHECKLIST);
        if (!list.circleId().equals(circleId)) {
            throw ApiProblem.badRequest("not_in_circle", "Choose a list from this circle.");
        }
        jots.markShoppingList(circleId, listId, circles.me(circleId, me).id());
        return new ListBriefResponse(list.id(), list.title());
    }

    // ---------- what was jotted ----------

    public Page<JotResponse> list(UUID circleId, UUID me, LocalDate day, Keyset page) {
        UUID mine = circles.me(circleId, me).id();
        LocalDate today = day == null ? LocalDate.now() : day;
        return page.page(jots.of(mine, page), row -> Keyset.cursor(row.createdAt(), row.id()))
                .map(shown -> views(shown, me, today));
    }

    /**
     * Undoes a jot: what it made is removed (the event, the reminder, the page, the line of the list), and the
     * jot with it. For something that was held back, this is how its words are forgotten: after the phone
     * kept it in the Vault, or because it wasn't wanted. Undoing what is gone is fine.
     */
    @Transactional
    public void undo(UUID jotId, UUID me) {
        Optional<JotRow> row = jots.find(jotId, me);
        if (row.isEmpty()) {
            return;
        }
        takeBack(row.get(), me);
        jots.delete(jotId);
    }

    /** Removes what a jot made, as far as it is still there. */
    private void takeBack(JotRow row, UUID me) {
        if (row.became() == ReadAs.LIST_ITEM) {
            if (row.itemId() != null) {
                checklists.remove(row.itemId(), me);
            }
        } else if (row.thingId() != null && thingStore.find(row.thingId(), me).isPresent()) {
            things.delete(row.thingId(), me);
        }
    }

    /**
     * Moves a jot: what it made is removed and its words are filed as something else. To a list means the
     * shopping list unless a list is named. This is also "it's just a note" for something that was held back.
     */
    @Transactional
    public JotResponse move(
            UUID jotId, UUID me, ReadAs to, UUID listId, LocalDate day, String timeZone, Audience audience) {
        JotRow row = jots.find(jotId, me).orElseThrow(JotService::jotGone);
        if (to == ReadAs.CODE) {
            throw ApiProblem.badRequest("cant_move_there", "Choose an event, a reminder, a list or a note.");
        }
        Told told = told(row.circleId(), me, day, timeZone);
        boolean already =
                row.became() == to && (to != ReadAs.LIST_ITEM || listId == null || listId.equals(row.thingId()));
        if (already) {
            return views(List.of(row), me, told.context().today()).get(0); // sent twice: moved once
        }
        if (listId != null) {
            ThingRow list = things.requireEdit(listId, me, ThingKind.CHECKLIST);
            if (!list.circleId().equals(row.circleId())) {
                throw ApiProblem.badRequest("not_in_circle", "Choose a list from this circle.");
            }
        }
        // The words are read again, so a day or a name in them still counts in the new kind.
        List<Item> read = LineReader.read(row.words(), told.context()).items();
        Item item = read.size() == 1
                ? read.get(0)
                : new Item(
                        ReadAs.NOTE,
                        row.words(),
                        Words.capital(row.words()),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        false,
                        null,
                        null,
                        null,
                        null,
                        List.of());
        takeBack(row, me);
        Filed filed = file(
                item,
                to,
                to == ReadAs.LIST_ITEM ? listId : null,
                row.circleId(),
                me,
                told,
                audience,
                sub(row.id(), "move:" + (row.moves() + 1)));
        jots.moved(row.id(), filed.as(), shorten(filed.title(), 300), filed.thingId(), filed.itemId());
        return views(
                        List.of(jots.find(jotId, me).orElseThrow()),
                        me,
                        told.context().today())
                .get(0);
    }

    private static ApiProblem jotGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That jot isn't there any more.");
    }

    /** Jots as the app lists them: each with where it went, as that stands now. */
    private List<JotResponse> views(List<JotRow> rows, UUID me, LocalDate today) {
        List<UUID> thingIds = rows.stream()
                .map(JotRow::thingId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, ThingRow> made =
                thingStore.findAll(thingIds, me).stream().collect(Collectors.toMap(ThingRow::id, t -> t));
        Map<UUID, Event> eventsMade = eventStore.findAll(ids(made, ThingKind.EVENT), me).stream()
                .collect(Collectors.toMap(e -> e.thing().id(), e -> e));
        Map<UUID, Reminder> remindersMade = reminderStore.findAll(ids(made, ThingKind.REMINDER), me).stream()
                .collect(Collectors.toMap(r -> r.thing().id(), r -> r));
        Map<UUID, List<UUID>> givenTo = reminderStore.people(List.copyOf(remindersMade.keySet()));
        Map<UUID, Map<UUID, Person>> circleCache = new java.util.HashMap<>();
        List<JotResponse> views = new ArrayList<>();
        for (JotRow row : rows) {
            ThingRow thing = row.thingId() == null ? null : made.get(row.thingId());
            boolean gone = row.became() != ReadAs.CODE
                    && (thing == null || (row.became() == ReadAs.LIST_ITEM && row.itemId() == null));
            String where;
            if (row.became() == ReadAs.CODE) {
                where = "Looks like a code";
            } else if (thing == null) {
                where = "Not there any more";
            } else if (row.became() == ReadAs.LIST_ITEM) {
                where = thing.title();
            } else if (row.became() == ReadAs.EVENT && eventsMade.containsKey(thing.id())) {
                Event event = eventsMade.get(thing.id());
                where = Words.dots(
                        "Event",
                        Words.when(event.detail().startsOn(), event.detail().startTime(), today));
            } else if (row.became() == ReadAs.REMINDER && remindersMade.containsKey(thing.id())) {
                Reminder reminder = remindersMade.get(thing.id());
                Map<UUID, Person> circle = circleCache.computeIfAbsent(row.circleId(), people::in);
                String asked = Words.list(givenTo.getOrDefault(thing.id(), List.of()).stream()
                        .filter(id -> !id.equals(row.memberId()))
                        .map(circle::get)
                        .filter(Objects::nonNull)
                        .map(Person::name)
                        .toList());
                where = Words.dots(
                        asked.isEmpty() ? "Reminder" : "Asked " + asked,
                        reminder.detail().dueOn() == null
                                ? null
                                : Words.when(
                                        reminder.detail().dueOn(),
                                        reminder.detail().dueTime(),
                                        today));
            } else {
                where = "Note";
            }
            views.add(new JotResponse(
                    row.id(),
                    row.batchId(),
                    row.words(),
                    row.source(),
                    row.became(),
                    row.title(),
                    where,
                    thing == null ? null : thing.id(),
                    thing == null ? null : thing.kind(),
                    row.itemId(),
                    gone,
                    row.createdAt()));
        }
        return views;
    }

    private static List<UUID> ids(Map<UUID, ThingRow> things, ThingKind kind) {
        return things.values().stream()
                .filter(t -> t.kind() == kind)
                .map(ThingRow::id)
                .toList();
    }

    // ---------- ways in ----------

    public WaysResponse ways(UUID circleId, UUID me) {
        circles.require(circleId, me);
        UUID mine = circles.me(circleId, me).id();
        WaysRow ways = jots.ways(me);
        ThingRow own = usable(jots.places(mine).buyListId(), me);
        ThingRow list = own != null ? own : usable(jots.shoppingList(circleId).orElse(null), me);
        return new WaysResponse(
                ways.pinnedNote(),
                ways.voice(),
                ways.share(),
                ways.timedAs(),
                ways.codes(),
                list == null
                        ? new ListBriefResponse(null, SHOPPING_LIST)
                        : new ListBriefResponse(list.id(), list.title()),
                own != null,
                null);
    }

    /** Changes the ways in and where jots go. What is left out stays as it is. */
    @Transactional
    public WaysResponse saveWays(UUID circleId, UUID me, WaysChange change) {
        circles.require(circleId, me);
        UUID mine = circles.me(circleId, me).id();
        WaysRow ways = jots.ways(me);
        jots.saveWays(
                me,
                new WaysRow(
                        change.pinnedNote() == null ? ways.pinnedNote() : change.pinnedNote(),
                        change.voice() == null ? ways.voice() : change.voice(),
                        change.share() == null ? ways.share() : change.share(),
                        change.timedAs() == null ? ways.timedAs() : change.timedAs(),
                        change.codes() == null ? ways.codes() : change.codes()));
        if (change.useCirclesList()) {
            jots.buyList(mine, null);
        } else if (change.buyListId() != null) {
            ThingRow list = things.requireEdit(change.buyListId(), me, ThingKind.CHECKLIST);
            if (!list.circleId().equals(circleId)) {
                throw ApiProblem.badRequest("not_in_circle", "Choose a list from this circle.");
            }
            jots.buyList(mine, list.id());
        }
        return ways(circleId, me);
    }

    // ---------- what the phone's own parts ask for ----------

    /** Says which list the signed-in person is using right now (at the shop), or that they stopped. */
    @Transactional
    public void use(UUID circleId, UUID me, UUID listId) {
        circles.require(circleId, me);
        UUID mine = circles.me(circleId, me).id();
        if (listId != null) {
            ThingRow list = things.require(listId, me, ThingKind.CHECKLIST);
            if (!list.circleId().equals(circleId)) {
                throw ApiProblem.badRequest("not_in_circle", "Choose a list from this circle.");
            }
        }
        jots.use(mine, listId);
    }

    /**
     * Everything the widgets, the pinned note and the Lock Screen show, in one answer: the chips of what is
     * added most, the shopping list with its first lines, the list in use, what is next today, and how many
     * things were jotted today.
     */
    public WidgetsResponse widgets(UUID circleId, UUID me, LocalDate day, String timeZone) {
        circles.require(circleId, me);
        ZoneId zone = zone(timeZone);
        LocalDate nowDay = LocalDate.now(zone);
        LocalDate today = day == null ? nowDay : day;
        UUID mine = circles.me(circleId, me).id();
        PlacesRow places = jots.places(mine);
        ThingRow own = usable(places.buyListId(), me);
        ThingRow shopping =
                own != null ? own : usable(jots.shoppingList(circleId).orElse(null), me);
        Map<UUID, Person> circle = people.in(circleId);
        ListInUseResponse inUse = jots.inUseIn(circleId, me)
                .map(use -> {
                    Person by = circle.get(use.memberId());
                    return by == null
                            ? null
                            : new ListInUseResponse(
                                    list(use.listId(), me),
                                    by.brief(),
                                    use.memberId().equals(mine),
                                    use.since());
                })
                .orElse(null);
        // What is still to come: nothing ticked, and no time that passed more than an hour ago.
        int nowMinute = timeZone != null && today.equals(nowDay)
                ? LocalTime.now(zone).getHour() * 60 + LocalTime.now(zone).getMinute()
                : 0;
        List<NextLineResponse> next = home.today(circleId, me, today).items().stream()
                .filter(item -> !Boolean.TRUE.equals(item.done()))
                .filter(item -> item.done() != null || item.minute() >= nowMinute - 60)
                .limit(NEXT)
                .map(JotService::next)
                .toList();
        return new WidgetsResponse(
                today,
                jots.mostAdded(circleId, me, MOST_ADDED_WEEKS, CHIPS),
                shopping == null ? null : list(shopping.id(), me),
                inUse,
                next,
                jots.countSince(mine, today.atStartOfDay(zone).toInstant()));
    }

    private static NextLineResponse next(TodayItem item) {
        String lead = item.lead() != null
                ? item.lead()
                : item.minute() < 1440 ? Words.time(LocalTime.of(item.minute() / 60, item.minute() % 60)) : null;
        return new NextLineResponse(item.thingId(), item.kind(), lead, item.title(), item.note(), item.done());
    }

    private WidgetListResponse list(UUID listId, UUID me) {
        ChecklistResponse list = checklists.get(listId, me);
        List<WidgetLineResponse> lines = new ArrayList<>();
        list.items().stream()
                .filter(line -> !line.done())
                .limit(WIDGET_LINES)
                .forEach(line -> lines.add(new WidgetLineResponse(line.id(), line.text(), false)));
        list.items().stream()
                .filter(line -> line.done())
                .limit(Math.max(0, WIDGET_LINES - lines.size()))
                .forEach(line -> lines.add(new WidgetLineResponse(line.id(), line.text(), true)));
        return new WidgetListResponse(list.id(), list.title(), list.left(), list.done(), lines);
    }
}
