package app.homeport.api.activity;

import app.homeport.api.activity.ActivityStore.Batch;
import app.homeport.api.activity.ActivityStore.Folded;
import app.homeport.api.activity.ActivityStore.Who;
import app.homeport.api.activity.AskStore.AskRow;
import app.homeport.api.activity.AskStore.AskState;
import app.homeport.api.activity.LineLooks.Look;
import app.homeport.api.activity.PhotoBatches.Named;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Names;
import app.homeport.api.home.TodaySource;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.notify.OutboxStore;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Activity as one person reads it: what changed, what is due and who is asking, in one circle, newest first.
 *
 * <p>Three things meet here. The lines that were kept as things changed ({@link ActivityLog}), read through
 * the one sharing rule and folded for reading. What is due today and tomorrow, which is never kept: every
 * place is asked ({@link TodaySource}) and the answer is laid on top. And the questions that wait for this
 * person's answer ({@link AskService}).
 *
 * <p>Every sentence is put together here, in plain English, as parts the app draws: who in bold, the words,
 * the thing's title in bold. The app adds the time ("12 min ago") from {@code at}.
 */
@Service
public class ActivityService {

    static final int MAX_DUE = 20;
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("H:mm", Locale.ENGLISH);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH);

    /** A piece of a sentence: plain words, or a name or a title, which the app draws in bold. */
    public record Part(String text, boolean bold) {}

    /**
     * Something to do right from the line.
     *
     * @param act what kind of act it is, for the app to know what to call
     */
    public record ActivityButton(
            String label,

            @Schema(
                    description = "What the button does. pay: mark your share of the bill paid"
                            + " (PUT /v1/bills/{thingId}/paid with dueOn), or open the bill. allow_ask: share the Vault"
                            + " item with memberId from this phone (PUT /v1/vault/items/{thingId}/sharing, with a key"
                            + " wrapped for them and the until or once that was asked for), then PUT /v1/asks/{askId}"
                            + " with allow true. decline_ask: PUT /v1/asks/{askId} with allow false. open_exports: open"
                            + " Export and leaving. Anything else: open the thing.")
            String act,

            @Schema(nullable = true) UUID thingId,
            @Schema(nullable = true) UUID askId,

            @Schema(nullable = true, description = "For allow_ask: who asked")
            UUID memberId,

            @Schema(nullable = true, description = "For allow_ask: until when they would like it")
            Instant until,

            @Schema(nullable = true, description = "For allow_ask: true when they would like it for one look")
            Boolean once,

            @Schema(nullable = true, description = "For pay: which time it is due")
            LocalDate dueOn) {}

    /** One line of Activity. */
    public record ActivityLine(
            @Schema(description = "Stays the same for this line as the list is read again")
            String id,

            ActivityKind kind,

            @Schema(nullable = true, description = "When it happened last. Null for something that is due.")
            Instant at,

            @Schema(description = "True when it is new since you last opened Activity here")
            boolean fresh,

            @Schema(description = "The sentence, in the order to draw it: names and titles are bold")
            List<Part> sentence,

            @Schema(nullable = true, description = "The small line under it, after the time: 9 things added, 5 ticked")
            String note,

            @Schema(description = "The faces in front: who did it, two at most. Empty for a line with no person.")
            List<PersonBrief> people,

            @Schema(nullable = true, description = "A 3D emoji in front, when there is no face: a bill's own")
            String emoji,

            @Schema(nullable = true, description = "A small picture at the end, when the thing has one")
            String imageUrl,

            @Schema(nullable = true, description = "What the line opens")
            UUID thingId,

            @Schema(nullable = true) ThingKind thingKind,

            @Schema(description = "What can be done right here: Allow and Not now, or Pay. Usually none.")
            List<ActivityButton> buttons) {}

    public record ActivityResponse(
            @Schema(
                    description = "What is due today and tomorrow, to lay under Today. Only with the first page, and"
                            + " only where the chip can hold it (All, Money, Plan).")
            List<ActivityLine> due,

            List<ActivityLine> items,
            @Schema(nullable = true) String nextCursor,

            @Schema(description = "How many questions wait for your answer: the number on the Asks chip")
            int asks,

            @Schema(description = "How many lines are new since you last opened Activity here")
            int fresh,

            @Schema(description = "True when you muted this circle: nothing that happens in it is pushed to you")
            boolean muted) {}

    /** What the dot on the Activity tab needs, and nothing else. */
    public record UnreadResponse(
            @Schema(description = "How many lines are new since you last opened Activity here. It stops at 100.")
            int fresh,

            @Schema(description = "How many questions wait for your answer")
            int asks) {}

    private final ActivityStore store;
    private final AskStore asks;
    private final AskService askService;
    private final CircleService circles;
    private final ThingStore thingStore;
    private final ThingService things;
    private final MediaService media;
    private final OutboxStore reach;
    private final List<TodaySource> todaySources;
    private final List<LineLooks> looks;
    private final ObjectProvider<PhotoBatches> library;

    ActivityService(
            ActivityStore store,
            AskStore asks,
            AskService askService,
            CircleService circles,
            ThingStore thingStore,
            ThingService things,
            MediaService media,
            OutboxStore reach,
            List<TodaySource> todaySources,
            List<LineLooks> looks,
            ObjectProvider<PhotoBatches> library) {
        this.store = store;
        this.asks = asks;
        this.askService = askService;
        this.circles = circles;
        this.thingStore = thingStore;
        this.things = things;
        this.media = media;
        this.reach = reach;
        this.todaySources = todaySources;
        this.looks = looks;
        this.library = library;
    }

    // ---------- reading ----------

    /**
     * A page of a circle's Activity for the signed-in person.
     *
     * @param zone the time zone of the phone, for "it ends at 23:30"; the zone of their newest phone when left out
     * @param day the day on the phone; today in that zone when left out
     */
    public ActivityResponse read(
            UUID circleId, UUID me, ActivityFilter filter, ZoneId zone, LocalDate day, Keyset page) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        ActivityFilter chip = filter == null ? ActivityFilter.ALL : filter;
        ZoneId clock = zone != null ? zone : zoneOf(mine);
        LocalDate today = day != null ? day : LocalDate.now(clock);
        Instant seen = store.seenAt(mine.id());

        List<Folded> rows = store.page(circleId, me, chip.place(), chip == ActivityFilter.ASKS, page);
        var paged = page.page(rows, row -> Keyset.cursor(row.at(), row.id()));
        List<ActivityLine> lines = lines(paged.items(), circleId, me, mine, clock, seen);
        List<ActivityLine> due = page.first() && chip != ActivityFilter.ASKS && chip != ActivityFilter.PHOTOS
                ? due(circleId, me, today, chip)
                : List.of();
        return new ActivityResponse(
                due,
                lines,
                paged.nextCursor(),
                asks.waitingFor(mine.id()),
                store.fresh(circleId, me),
                store.muted(mine.id()));
    }

    public UnreadResponse unread(UUID circleId, UUID me) {
        circles.require(circleId, me);
        return new UnreadResponse(
                store.fresh(circleId, me),
                asks.waitingFor(circles.me(circleId, me).id()));
    }

    /** The signed-in person has looked at Activity here: nothing before this moment is new to them any more. */
    @Transactional
    public void seen(UUID circleId, UUID me) {
        circles.require(circleId, me);
        store.seen(circles.me(circleId, me).id());
    }

    /** Mutes a circle for the signed-in person, or lets it be heard again. Activity still shows everything. */
    @Transactional
    public void mute(UUID circleId, UUID me, boolean muted) {
        circles.require(circleId, me);
        store.mute(circles.me(circleId, me).id(), muted);
    }

    private ZoneId zoneOf(MemberRow mine) {
        var phone = reach.reachable(List.of(mine.id())).get(mine.id());
        return phone == null ? ZoneOffset.UTC : phone.zone();
    }

    // ---------- the lines that were kept ----------

    private List<ActivityLine> lines(
            List<Folded> rows, UUID circleId, UUID me, MemberRow mine, ZoneId clock, Instant seen) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, Who> who =
                store.who(rows.stream().flatMap(row -> row.memberIds().stream()).collect(Collectors.toSet()));
        // Everything below is asked once for the whole page, never once per line.
        Map<UUID, ThingBrief> about = things
                .briefs(
                        thingStore.findAll(
                                rows.stream()
                                        .map(Folded::thingId)
                                        .filter(Objects::nonNull)
                                        .distinct()
                                        .toList(),
                                me),
                        me)
                .stream()
                .collect(Collectors.toMap(ThingBrief::id, Function.identity()));
        Map<UUID, Look> drawn = looks(about.values(), me);
        Map<UUID, AskRow> asked = asks.findAll(
                rows.stream().map(Folded::askId).filter(Objects::nonNull).toList());
        Map<UUID, Batch> batches = store.batches(
                rows.stream()
                        .filter(row -> row.kind() == ActivityKind.PHOTOS)
                        .flatMap(row -> row.lineIds().stream())
                        .toList(),
                me,
                null);

        List<ActivityLine> lines = new ArrayList<>();
        for (Folded row : rows) {
            ThingBrief thing = row.thingId() == null ? null : about.get(row.thingId());
            if (row.thingId() != null && thing == null) {
                continue; // it went, or was taken back, between the two questions
            }
            List<Who> actors = row.memberIds().stream()
                    .map(who::get)
                    .filter(Objects::nonNull)
                    .toList();
            List<Part> sentence = new ArrayList<>(names(actors, row.who()));
            String note = row.note().isBlank() ? null : row.note();
            String image = thing == null || !drawn.containsKey(thing.id())
                    ? null
                    : drawn.get(thing.id()).imageUrl();
            List<ActivityButton> buttons = new ArrayList<>();
            switch (row.kind()) {
                case ADDED -> {
                    sentence.add(words(row.counts().getOrDefault("made", 0L) > 0 ? " added " : " shared "));
                    sentence.add(title(thing));
                    note = dots(label(thing.kind()), thing.glance());
                }
                case LIST -> {
                    sentence.add(words(" changed "));
                    sentence.add(title(thing));
                    long added = row.counts().getOrDefault("added", 0L);
                    long ticked = row.counts().getOrDefault("ticked", 0L);
                    note = commas(
                            added == 0 ? null : added + (added == 1 ? " thing added" : " things added"),
                            ticked == 0 ? null : ticked + " ticked");
                }
                case PHOTOS -> {
                    int count = row.lineIds().stream()
                            .map(batches::get)
                            .filter(Objects::nonNull)
                            .mapToInt(Batch::count)
                            .sum();
                    List<UUID> some = row.lineIds().stream()
                            .map(batches::get)
                            .filter(Objects::nonNull)
                            .flatMap(batch -> batch.some().stream())
                            .toList();
                    if (count == 0) {
                        continue;
                    }
                    Named named = library.stream()
                            .map(names -> names.name(circleId, me, some))
                            .filter(Objects::nonNull)
                            .findFirst()
                            .orElse(new Named(null, null));
                    sentence.add(words(" added " + photos(count) + (named.title() == null ? "" : " to ")));
                    if (named.title() != null) {
                        sentence.add(new Part(named.title(), true));
                    }
                    image = named.imageUrl();
                }
                case PAID -> {
                    sentence.add(words(" paid "));
                    sentence.add(title(thing));
                }
                case BOARD -> {
                    sentence.add(words(" " + (row.words().isBlank() ? "added to" : row.words())
                            + (row.words().isBlank() || row.namesThing() ? " " : "")));
                    if (row.words().isBlank() || row.namesThing()) {
                        sentence.add(title(thing));
                    } else {
                        long times = row.counts().getOrDefault("times", 1L);
                        note = dots(thing.title(), times > 1 ? times + " today" : null);
                    }
                }
                case GUEST_PASS -> {
                    sentence.add(words(" opened their guest pass"));
                    Long ends = row.counts().get("ends");
                    if (ends != null) {
                        Instant end = Instant.ofEpochSecond(ends);
                        note = (end.isAfter(Instant.now()) ? "it ends at " : "it ended at ")
                                + CLOCK.format(end.atZone(clock));
                    }
                }
                case JOINED -> sentence.add(words(" joined the circle"));
                case LEFT -> sentence.add(words(row.words().isBlank() ? " left the circle" : " " + row.words()));
                case ASK -> {
                    AskRow ask = asked.get(row.askId());
                    if (ask == null) {
                        continue;
                    }
                    sentence.add(words(" asks to see "));
                    sentence.add(title(thing));
                    String where = askService.where(thing.kind());
                    if (!where.isEmpty()) {
                        sentence.add(words(" " + where));
                    }
                    note = switch (ask.state()) {
                        case OPEN -> wish(ask, clock);
                        case ALLOWED -> "You said yes";
                        case DECLINED -> "You said not now";
                        case WITHDRAWN -> "They took it back";
                    };
                    if (ask.state() == AskState.OPEN) {
                        buttons.add(new ActivityButton(
                                "Allow",
                                "allow_ask",
                                thing.id(),
                                ask.id(),
                                ask.askerId(),
                                ask.until(),
                                ask.once(),
                                null));
                        buttons.add(new ActivityButton(
                                "Not now", "decline_ask", thing.id(), ask.id(), ask.askerId(), null, null, null));
                    }
                }
                case ASK_ANSWERED -> {
                    AskRow ask = asked.get(row.askId());
                    if (ask == null) {
                        continue;
                    }
                    sentence.add(
                            words(ask.state() == AskState.ALLOWED ? " said yes: you can open " : " said not now to "));
                    sentence.add(title(thing));
                }
                case EXPORT -> {
                    sentence.clear();
                    sentence.add(words("Your export is ready"));
                    buttons.add(new ActivityButton("Get it", "open_exports", null, null, null, null, null, null));
                }
                case KEPT -> {
                    sentence.clear();
                    sentence.add(title(thing));
                    sentence.add(words(" " + (row.words().isBlank() ? "was kept from Journey" : row.words())));
                }
                case DUE -> {
                    continue; // never kept
                }
            }
            lines.add(new ActivityLine(
                    row.id().toString(),
                    row.kind(),
                    row.at(),
                    row.at().isAfter(seen),
                    sentence,
                    note,
                    actors.stream()
                            .limit(2)
                            .map(actor -> new PersonBrief(
                                    actor.memberId(),
                                    Names.first(actor.name()),
                                    media.urlFor(actor.avatarKey(), MediaSize.SMALL)))
                            .toList(),
                    thing == null || !drawn.containsKey(thing.id())
                            ? null
                            : drawn.get(thing.id()).emoji(),
                    image,
                    thing == null ? null : thing.id(),
                    thing == null ? null : thing.kind(),
                    buttons));
        }
        return lines;
    }

    /** "Alex", "Alex and Mia", "Alex, Mia and Leo": each name bold. A guest is named by the name on their pass. */
    private static List<Part> names(List<Who> actors, String guest) {
        List<String> names = new ArrayList<>(
                actors.stream().map(actor -> Names.first(actor.name())).toList());
        if (names.isEmpty() && guest != null && !guest.isBlank()) {
            names.add(Names.first(guest));
        }
        if (names.isEmpty()) {
            names.add("Someone");
        }
        List<Part> parts = new ArrayList<>();
        for (int i = 0; i < names.size(); i++) {
            if (i > 0) {
                parts.add(words(i == names.size() - 1 ? " and " : ", "));
            }
            parts.add(new Part(names.get(i), true));
        }
        return parts;
    }

    private static Part words(String text) {
        return new Part(text, false);
    }

    private static Part title(ThingBrief thing) {
        return new Part(thing.title().isBlank() ? label(thing.kind()).toLowerCase(Locale.ROOT) : thing.title(), true);
    }

    static String photos(int count) {
        return count == 1 ? "1 photo" : count + " photos";
    }

    /** What a kind of thing is called in the small line. */
    static String label(ThingKind kind) {
        return switch (kind) {
            case PAGE -> "Page";
            case CHECKLIST -> "List";
            case PHOTO -> "Photo";
            case VIDEO -> "Video";
            case DOCUMENT -> "Document";
            case ALBUM -> "Album";
            case FOLDER -> "Folder";
            case BOARD -> "Template";
            case VAULT_ITEM -> "In the Vault";
            case EVENT -> "Event";
            case REMINDER -> "Reminder";
            case GOAL -> "Goal";
            case BILL -> "Bill";
            case SHEET -> "Sheet";
            case SPLIT -> "Shared costs";
        };
    }

    /** "for today only", "for one look", "until Fri 13 Nov", or nothing. */
    static String wish(AskRow ask, ZoneId clock) {
        if (ask.once()) {
            return "for one look";
        }
        if (ask.until() == null) {
            return null;
        }
        LocalDate asked = ask.createdAt().atZone(clock).toLocalDate();
        // Until midnight is the end of the day before: "for today only".
        LocalDate until = ask.until().minusSeconds(1).atZone(clock).toLocalDate();
        return until.equals(asked) ? "for today only" : "until " + DAY.format(until);
    }

    private static String blankToNull(String words) {
        return words == null || words.isBlank() ? null : words;
    }

    private static String dots(String... pieces) {
        return join(" · ", pieces);
    }

    private static String commas(String... pieces) {
        return join(", ", pieces);
    }

    private static String join(String with, String... pieces) {
        String joined = java.util.Arrays.stream(pieces)
                .filter(piece -> piece != null && !piece.isBlank())
                .collect(Collectors.joining(with));
        return joined.isEmpty() ? null : joined;
    }

    private Map<UUID, Look> looks(java.util.Collection<ThingBrief> about, UUID me) {
        Map<UUID, Look> drawn = new HashMap<>();
        for (LineLooks source : looks) {
            List<UUID> ofKind = about.stream()
                    .filter(thing -> source.kinds().contains(thing.kind()))
                    .map(ThingBrief::id)
                    .toList();
            if (!ofKind.isEmpty()) {
                drawn.putAll(source.looks(ofKind, me));
            }
        }
        return drawn;
    }

    // ---------- what is due ----------

    /**
     * What is due today and tomorrow, and anything still open from before, as the places say it: each place
     * is asked for both days. Nothing of this is kept; it is as true as the places are at this moment.
     * A line is said in today's words whichever day's question found it.
     */
    private List<ActivityLine> due(UUID circleId, UUID me, LocalDate today, ActivityFilter chip) {
        Map<UUID, TodayItem> open = new LinkedHashMap<>();
        for (LocalDate day : List.of(today, today.plusDays(1))) {
            for (TodaySource source : todaySources) {
                for (TodayItem item : source.today(me, circleId, day)) {
                    // Today, and anything still open from before: everything that is due. Tomorrow: only what
                    // can be done ahead from here (a bill can be paid a day early; a reminder for tomorrow is
                    // tomorrow's news).
                    if (item.due() != null
                            && !Boolean.TRUE.equals(item.done())
                            && (!item.due().on().isAfter(today)
                                    || (item.due().on().equals(today.plusDays(1)) && item.action() != null))
                            && (chip.place() == null || item.kind().place() == chip.place())) {
                        open.putIfAbsent(item.thingId(), item);
                    }
                }
            }
        }
        Set<UUID> ids = new LinkedHashSet<>(open.keySet());
        Map<UUID, ThingBrief> about = things.briefs(thingStore.findAll(List.copyOf(ids), me), me).stream()
                .collect(Collectors.toMap(ThingBrief::id, Function.identity()));
        Map<UUID, Look> drawn = looks(about.values(), me);
        return open.values().stream()
                .filter(item -> about.containsKey(item.thingId()))
                .sorted(java.util.Comparator.comparing(
                                (TodayItem item) -> item.due().on())
                        .thenComparing(TodayItem::title))
                .limit(MAX_DUE)
                .map(item -> {
                    LocalDate on = item.due().on();
                    String amount = item.due().amount();
                    Look look = drawn.get(item.thingId());
                    return new ActivityLine(
                            "due:" + item.thingId() + ":" + on,
                            ActivityKind.DUE,
                            null,
                            false,
                            List.of(
                                    new Part(item.title(), true),
                                    words(" " + dueWords(on, today) + (amount == null ? "" : ", " + amount))),
                            blankToNull(item.due().note() != null ? item.due().note() : item.note()),
                            List.of(),
                            look == null ? null : look.emoji(),
                            look == null ? null : look.imageUrl(),
                            item.thingId(),
                            item.kind(),
                            item.action() == null
                                    ? List.of()
                                    : List.of(new ActivityButton(
                                            item.action().label(),
                                            item.action().act(),
                                            item.thingId(),
                                            null,
                                            null,
                                            null,
                                            null,
                                            on)));
                })
                .toList();
    }

    /** "is due today", "is due tomorrow", "was due yesterday", "was due on Monday", "was due on Mon 2 Nov". */
    static String dueWords(LocalDate on, LocalDate today) {
        long away = ChronoUnit.DAYS.between(today, on);
        if (away == 0) {
            return "is due today";
        }
        if (away == 1) {
            return "is due tomorrow";
        }
        if (away == -1) {
            return "was due yesterday";
        }
        return "was due on " + (away >= -6 ? WEEKDAY.format(on) : DAY.format(on));
    }
}
