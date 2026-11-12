package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.money.Cash;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The kitty: a shared pot for the things nobody wants to count. Everyone pays the same in once a month,
 * whoever shops takes what it cost back out, and what is left is plain arithmetic in whole cents.
 *
 * <p><b>The sums.</b> What is left is everything paid in minus everything bought, ever. "Left over from
 * October" is that same sum up to the last day of last month; this month's lines are listed under it. A
 * purchase may cost more than the pot holds: the pot is then short, and says so, until someone pays in.
 *
 * <p><b>Running low.</b> The flat keeps a short list of its usual things. Tapping one marks it as running
 * low; the things marked are the shopping list of whoever's turn it is. Turns go round the flat in its own
 * order: the next to shop is the person after whoever shopped last.
 *
 * <p>Nothing here is secret: everyone who sees the kitty sees who paid in and what was bought. A line is
 * changed or taken out only by the person who wrote it.
 */
@Component
class Kitty implements BoardRules {

    static final String IN = "in";
    static final String OUT = "out";
    static final String ITEM = "item";
    private static final long MOST = 1_000_000;
    private static final int MAX_ITEMS = 30;
    private static final List<String> USUAL = List.of("Loo roll", "Bin bags", "Oil", "Dish soap");

    // ---------- what is stored ----------

    record KittySettings(
            @Schema(description = "What each person pays in every month, in whole cents")
            long eachCents,

            String currency,

            @Schema(description = "The day of the month it is paid in on: 1")
            int payInDay) {}

    record Bought(String what) {}

    record Item(String name) {}

    // ---------- the sums ----------

    /** One line of the pot: money in or money out, on a day. */
    record Move(boolean in, long cents, LocalDate day) {}

    /**
     * @param leftOver what the pot held when the month began
     * @param paidIn what was paid in since
     * @param spent what was bought since
     * @param balance what it holds now
     */
    record Sums(long leftOver, long paidIn, long spent, long balance) {}

    /** The pot's sums for the month that begins on this day. */
    static Sums sums(List<Move> moves, LocalDate monthStart) {
        long leftOver = 0;
        long paidIn = 0;
        long spent = 0;
        for (Move move : moves) {
            if (move.day().isBefore(monthStart)) {
                leftOver += move.in() ? move.cents() : -move.cents();
            } else if (move.in()) {
                paidIn += move.cents();
            } else {
                spent += move.cents();
            }
        }
        return new Sums(leftOver, paidIn, spent, leftOver + paidIn - spent);
    }

    /** Whose turn it is to shop: the one after whoever shopped last, round the flat. Null in an empty flat. */
    static <T> T nextShopper(List<T> order, T last) {
        if (order.isEmpty()) {
            return null;
        }
        int at = last == null ? -1 : order.indexOf(last);
        return order.get((at + 1) % order.size());
    }

    // ---------- what a person sees ----------

    record KittyViewResponse(
            @Schema(description = "What the pot holds now, in whole cents. Below zero when it is short.")
            long balanceCents,

            String currency,

            @Schema(description = "True when it holds less than one person pays in")
            boolean low,

            long eachCents,
            int payInDay,

            @Schema(description = "The first day of the month shown")
            LocalDate month,

            @Schema(description = "That month's name: November")
            String monthName,

            @Schema(description = "Who has paid in this month")
            List<PersonBrief> paidIn,

            @Schema(description = "Who hasn't yet") List<PersonBrief> notPaidIn,

            @Schema(description = "What was paid in this month, in whole cents")
            long paidInCents,

            boolean youPaidIn,

            @Schema(nullable = true, description = "The viewer's own paying-in of this month, to take it back")
            UUID yourPayInId,

            @Schema(description = "The flat's usual things, with which are running low")
            List<KittyItemResponse> items,

            @Schema(nullable = true, description = "Whose turn it is to shop")
            PersonBrief shopper,

            boolean yourTurn,

            @Schema(description = "What the pot held when the month began")
            long leftOverCents,

            @Schema(description = "The month before: October")
            String leftOverFrom,

            @Schema(description = "This month's lines, newest first. Earlier months are read a page at a time.")
            List<KittyLineResponse> lines) {}

    record KittyItemResponse(
            UUID id,
            String name,

            @Schema(description = "True while it is marked as running low")
            boolean low,

            @Schema(nullable = true, description = "Who marked it")
            PersonBrief tappedBy) {}

    record KittyLineResponse(
            UUID id,

            @Schema(description = "in for money paid in, out for something bought")
            String kind,

            @Schema(description = "What was bought, or: Paid in for November")
            String title,

            @Schema(nullable = true, description = "Who paid in, or who shopped")
            PersonBrief who,

            LocalDate day,

            @Schema(description = "Whole cents: above zero for money in, below for money out")
            long cents,

            @Schema(nullable = true, description = "The receipt, when one was kept")
            BoardMedia receipt,

            boolean mine) {}

    @Override
    public Template template() {
        return Template.KITTY;
    }

    @Override
    public Class<?> settingsType() {
        return KittySettings.class;
    }

    @Override
    public Class<?> viewType() {
        return KittyViewResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return KittyLineResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: eachCents (what each pays in a month, whole cents; left out: 1000), currency (left out:"
                        + " EUR), payInDay (1 to 28; left out: 1)",
                "entry in: cents (left out: eachCents), day (left out: today). Your own paying in.",
                "entry out: what (what was bought), cents, day (left out: today), mediaId (a photo of the receipt),"
                        + " itemIds (usual things this bought: they stop running low)",
                "entry item: name (one of the flat's usual things)",
                "verb low: itemId, low (true or false; left out: true)",
                "entries list: every line there ever was, newest first; kind in or out");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        KittySettings now = scene.isNew() ? new KittySettings(1000, Cash.EUR, 1) : scene.settings(KittySettings.class);
        Long each = sent.whole("eachCents", 0, MOST, now.eachCents());
        Integer payInDay = sent.count("payInDay", 1, 28, now.payInDay());
        return new KittySettings(
                each == null ? now.eachCents() : each,
                sent.has("currency") ? Cash.currency(sent.text("currency", 3)) : now.currency(),
                payInDay == null ? now.payInDay() : payInDay);
    }

    /** A new kitty knows the usual things, so there is something to tap on the first day. */
    @Override
    public void started(Scene scene) {
        for (String name : USUAL) {
            scene.add(
                    EntryDraft.of(ITEM).by(scene.myId()).doc(new Item(name)),
                    Scene.derivedId(scene.boardId(), "usual " + name));
        }
    }

    // ---------- reading ----------

    private static List<EntryRow> lines(Scene scene) {
        return scene.entries().stream()
                .filter(e -> (e.is(IN) || e.is(OUT)) && e.day() != null)
                .toList();
    }

    private static Sums sums(Scene scene) {
        return sums(
                lines(scene).stream()
                        .map(e -> new Move(e.is(IN), e.amountOr(0), e.day()))
                        .toList(),
                scene.today().withDayOfMonth(1));
    }

    private static String monthName(LocalDate day) {
        return day.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
    }

    private static List<UUID> paidInThisMonth(Scene scene) {
        LocalDate monthStart = scene.today().withDayOfMonth(1);
        return lines(scene).stream()
                .filter(e -> e.is(IN) && !e.day().isBefore(monthStart) && e.forId() != null)
                .map(EntryRow::forId)
                .distinct()
                .toList();
    }

    private static UUID shopper(Scene scene) {
        UUID last = lines(scene).stream()
                .filter(e -> e.is(OUT))
                .max(Comparator.comparing(EntryRow::day).thenComparingDouble(EntryRow::position))
                .map(EntryRow::forId)
                .orElse(null);
        return nextShopper(Say.voiceIds(scene), last);
    }

    private static List<EntryRow> runningLow(Scene scene) {
        return scene.entries(ITEM).stream().filter(EntryRow::done).toList();
    }

    @Override
    public Object view(Scene scene, String show) {
        KittySettings settings = scene.settings(KittySettings.class);
        LocalDate monthStart = scene.today().withDayOfMonth(1);
        Sums sums = sums(scene);
        List<UUID> paid = paidInThisMonth(scene);
        UUID shopper = shopper(scene);
        return new KittyViewResponse(
                sums.balance(),
                settings.currency(),
                sums.balance() < settings.eachCents(),
                settings.eachCents(),
                settings.payInDay(),
                monthStart,
                monthName(monthStart),
                paid.stream().map(scene::brief).filter(Objects::nonNull).toList(),
                Say.voiceIds(scene).stream()
                        .filter(id -> !paid.contains(id))
                        .map(scene::brief)
                        .toList(),
                sums.paidIn(),
                scene.myId() != null && paid.contains(scene.myId()),
                lines(scene).stream()
                        .filter(e -> e.is(IN) && !e.day().isBefore(monthStart) && scene.isMe(e.authorId()))
                        .map(EntryRow::id)
                        .findFirst()
                        .orElse(null),
                scene.entries(ITEM).stream()
                        .map(e -> new KittyItemResponse(
                                e.id(), e.as(Item.class).name(), e.done(), e.done() ? scene.brief(e.doneBy()) : null))
                        .toList(),
                scene.brief(shopper),
                scene.isMe(shopper),
                sums.leftOver(),
                monthName(monthStart.minusMonths(1)),
                lines(scene).stream()
                        .filter(e -> !e.day().isBefore(monthStart))
                        .sorted(Comparator.comparing(EntryRow::day)
                                .thenComparingDouble(EntryRow::position)
                                .reversed())
                        .map(e -> line(scene, e))
                        .toList());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return (entry.is(IN) || entry.is(OUT)) && entry.day() != null ? line(scene, entry) : null;
    }

    private static KittyLineResponse line(Scene scene, EntryRow row) {
        boolean in = row.is(IN);
        return new KittyLineResponse(
                row.id(),
                row.kind(),
                in
                        ? "Paid in for " + monthName(row.day())
                        : row.as(Bought.class).what(),
                scene.brief(row.forId()),
                row.day(),
                in ? row.amountOr(0) : -row.amountOr(0),
                in ? null : scene.media(row.mediaId()),
                scene.isMe(row.authorId()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case OUT -> entry.as(Bought.class).what();
            case ITEM -> entry.as(Item.class).name();
            default -> null;
        };
    }

    // ---------- changing it ----------

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null
                || day.isAfter(scene.today())
                || day.isBefore(scene.today().minusDays(92))) {
            throw ApiProblem.badRequest("invalid_day", "Choose today or a day in the last three months.");
        }
        return day;
    }

    private static long cents(Fields sent, Long otherwise, String whenMissing) {
        Long cents = sent.whole("cents", 1, MOST, otherwise);
        if (cents == null || cents < 1) {
            throw ApiProblem.badRequest("missing_cents", whenMissing);
        }
        return cents;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        KittySettings settings = scene.settings(KittySettings.class);
        switch (kind) {
            case IN -> {
                LocalDate day = day(scene, sent, scene.today());
                return scene.add(
                        EntryDraft.of(IN)
                                .by(scene.myId())
                                .forMember(scene.myId())
                                .day(day)
                                .position(scene.positionOn(day))
                                .amount(cents(sent, settings.eachCents(), "Say how much you paid in.")),
                        clientId);
            }
            case OUT -> {
                LocalDate day = day(scene, sent, scene.today());
                UUID id = scene.add(
                        EntryDraft.of(OUT)
                                .by(scene.myId())
                                .forMember(scene.myId())
                                .day(day)
                                .position(scene.positionOn(day))
                                .amount(cents(sent, null, "Say what it cost."))
                                .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                                .doc(new Bought(sent.need("what", 120, "Say what was bought."))),
                        clientId);
                List<UUID> bought = sent.ids("itemIds", MAX_ITEMS);
                for (EntryRow item : scene.entries(ITEM)) {
                    if (bought != null && bought.contains(item.id()) && item.done()) {
                        scene.save(item, EntryDraft.from(item).done(null, null));
                    }
                }
                return id;
            }
            case ITEM -> {
                if (scene.entries(ITEM).size() >= MAX_ITEMS) {
                    throw ApiProblem.conflict("too_many", "Thirty usual things is as many as a kitty keeps.");
                }
                return scene.add(
                        EntryDraft.of(ITEM).by(scene.myId()).doc(new Item(sent.need("name", 60, "Say what it is."))),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    /** A line of the pot is changed only by the person who wrote it. Anyone renames a usual thing. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (entry.is(ITEM)) {
            String name = sent.text("name", 60, entry.as(Item.class).name());
            if (name == null) {
                throw ApiProblem.badRequest("missing_name", "Say what it is.");
            }
            scene.save(entry, EntryDraft.from(entry).doc(new Item(name)));
            return;
        }
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        LocalDate day = sent.has("day") ? day(scene, sent, entry.day()) : entry.day();
        EntryDraft draft = EntryDraft.from(entry)
                .day(day)
                .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                .amount(cents(sent, entry.amount(), "Say how much it was."));
        if (entry.is(OUT)) {
            String what = sent.text("what", 120, entry.as(Bought.class).what());
            if (what == null) {
                throw ApiProblem.badRequest("missing_what", "Say what was bought.");
            }
            draft.doc(new Bought(what));
            if (sent.has("mediaId")) {
                draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
            }
        }
        scene.save(entry, draft);
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!entry.is(ITEM) && !scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("low")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow item = scene.need(sent.id("itemId"));
        if (!item.is(ITEM)) {
            throw Scene.entryGone();
        }
        boolean low = sent.flag("low", true);
        if (low != item.done()) {
            scene.save(item, EntryDraft.from(item).done(low ? scene.now() : null, low ? scene.myId() : null));
        }
    }

    // ---------- what it brings to the rest ----------

    private static String holds(Sums sums, KittySettings settings) {
        if (sums.balance() < 0) {
            return "The kitty is " + Cash.exact(-sums.balance(), settings.currency()) + " short";
        }
        return (sums.balance() < settings.eachCents() ? "The kitty is down to " : "The kitty holds ")
                + Cash.exact(sums.balance(), settings.currency());
    }

    @Override
    public String glance(Scene scene) {
        KittySettings settings = scene.settings(KittySettings.class);
        Sums sums = sums(scene);
        List<UUID> paid = paidInThisMonth(scene);
        List<String> waiting = Say.names(
                scene,
                Say.voiceIds(scene).stream().filter(id -> !paid.contains(id)).toList());
        String left = sums.balance() < 0
                ? Cash.exact(-sums.balance(), settings.currency()) + " short"
                : Cash.exact(sums.balance(), settings.currency()) + " left";
        if (settings.eachCents() == 0 || waiting.isEmpty()) {
            return left;
        }
        return left + " · " + Say.upperFirst(Say.list(waiting))
                + (waiting.size() == 1 && !waiting.get(0).equals("you") ? " hasn't" : " haven't") + " paid in yet";
    }

    /** On Today while there is something to do about it: it is low, something is running out, or you owe your share. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        if (scene.me() == null) {
            return List.of();
        }
        KittySettings settings = scene.settings(KittySettings.class);
        Sums sums = sums(scene);
        List<String> low = runningLow(scene).stream()
                .map(e -> Say.lowerFirst(e.as(Item.class).name()))
                .toList();
        boolean owes = settings.eachCents() > 0
                && Say.voiceIds(scene).contains(scene.myId())
                && !paidInThisMonth(scene).contains(scene.myId());
        if (sums.balance() >= settings.eachCents() && low.isEmpty() && !owes) {
            return List.of();
        }
        List<String> line = new ArrayList<>();
        if (owes) {
            line.add("You haven't paid in for " + monthName(scene.today()) + " yet");
        }
        if (!low.isEmpty()) {
            UUID shopper = shopper(scene);
            line.add("Running low: " + Say.list(low));
            if (shopper != null) {
                line.add(scene.isMe(shopper) ? "your turn to shop" : scene.firstName(shopper) + "'s turn to shop");
            }
        }
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                holds(sums, settings),
                line.isEmpty()
                        ? Cash.exact(settings.eachCents(), settings.currency()) + " each on the "
                                + Words.ordinal(settings.payInDay())
                        : String.join(" · ", line),
                null,
                null,
                owes ? "Pay in" : null,
                10));
    }
}
