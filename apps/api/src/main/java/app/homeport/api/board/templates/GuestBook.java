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
import app.homeport.api.common.PublicUrls;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * The guest book: a code by the front door. A guest scans it and leaves a line and a photo on a web page,
 * with no app and no account (see {@link GuestBookPages}).
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sees}, and only there. A web page can't prove who is
 * writing, so what arrives through the door waits: it is shown to the people who live here and to nobody
 * else, until one of them says yes. Before that it is not on the door's page for the next guest, not in what
 * someone with a guest pass is shown, not found by anyone else, and not counted. A flatmate can also say no,
 * which removes it and its photo. What a flatmate writes into the book in the app is there at once.
 *
 * <p><b>The code</b> is a link with an end nobody can guess; the app draws it as a code to print. Whoever has
 * it can write one line at a time and read the last few lines that were let in, and learns nothing else
 * about the flat. A flatmate can change the code, and the old one stops working.
 */
@Component
class GuestBook implements BoardRules {

    static final String LINE = "line";
    static final String DOOR = "door";
    /** How many lines may wait for a yes at once: a door that is flooded stops taking more. */
    static final int MOST_WAITING = 30;

    record GuestBookSettings() {}

    /**
     * @param about who they are, in a few words: "from Leeds", "Lena's sister"
     * @param pending the photo their page was given a place for, until it is said to have arrived
     * @param fromDoor true for a line that came through the door's page
     */
    record Line(String name, String about, String text, UUID pending, Boolean fromDoor) {
        boolean door() {
            return Boolean.TRUE.equals(fromDoor);
        }
    }

    record GuestBookViewResponse(
            @Schema(description = "How many guests are in the book")
            int guests,

            @Schema(description = "The nights they stayed, added up")
            long nights,

            @Schema(nullable = true, description = "The year of the first line")
            Integer since,

            @Schema(
                    nullable = true,
                    description = "The link behind the code by the door, for the people who live here. The app draws it"
                            + " as a code to print.")
            String link,

            @Schema(description = "True when this person is one of the people who live here and decides what is let in")
            boolean decides,

            @Schema(description = "Lines from the door that wait for a yes. Empty for everyone who doesn't decide.")
            List<GuestBookLineResponse> waiting,

            @Schema(description = "The newest thirty lines in the book. The rest is read a page at a time.")
            List<GuestBookLineResponse> latest) {}

    record GuestBookLineResponse(
            UUID id,
            String text,
            String name,

            @Schema(nullable = true, description = "Who they are, in a few words: from Leeds")
            String about,

            @Schema(nullable = true) Integer nights,
            LocalDate day,
            @Schema(nullable = true) BoardMedia photo,

            @Schema(description = "True while it waits for a flatmate's yes")
            boolean waiting,

            @Schema(description = "True when it came through the code by the door")
            boolean fromTheDoor,

            @Schema(nullable = true, description = "The flatmate who let it in, or wrote it down")
            PersonBrief letInBy) {}

    private final PublicUrls urls;

    GuestBook(PublicUrls urls) {
        this.urls = urls;
    }

    @Override
    public Template template() {
        return Template.GUEST_BOOK;
    }

    @Override
    public Class<?> settingsType() {
        return GuestBookSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return GuestBookViewResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return GuestBookLineResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry line (written in the app by someone who lives here; it is in the book at once): text, name,"
                        + " about, nights, day (left out: today), mediaId (a photo upload)",
                "changing a line: name, about, nights, day; text only for a line you wrote down yourself",
                "verb let_in: entryId (a line from the door joins the book)",
                "verb new_code: the door gets a new link and the old one stops working",
                "removing a line: anyone who lives here. That is also how a line from the door is turned away.",
                "entries list: filter waiting (only lines that wait for a yes)");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new GuestBookSettings();
    }

    /** A new book gets its door: the link guests write through. */
    @Override
    public void started(Scene scene) {
        scene.add(EntryDraft.of(DOOR).token(Scene.newToken()), Scene.derivedId(scene.boardId(), "door"));
    }

    // ---------- who sees what ----------

    /** The people who live here decide what is let in: everyone in the flat except someone who is only a guest in it. */
    private static boolean decides(Scene scene) {
        return scene.iRunTheCircle();
    }

    /** The one place that decides whether a line is there for this person. */
    private static boolean sees(Scene scene, EntryRow line) {
        return line.done() || decides(scene);
    }

    private static List<EntryRow> inTheBook(Scene scene) {
        return scene.entries(LINE).stream()
                .filter(EntryRow::done)
                .sorted(Comparator.comparingDouble(EntryRow::position)
                        .thenComparing(EntryRow::id)
                        .reversed())
                .toList();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        List<EntryRow> book = inTheBook(scene);
        boolean decides = decides(scene);
        String link = scene.entries(DOOR).stream()
                .filter(door -> decides && scene.canEdit() && door.token() != null)
                .map(door -> urls.to("/book/" + door.token()))
                .findFirst()
                .orElse(null);
        return new GuestBookViewResponse(
                book.size(),
                book.stream().mapToLong(line -> line.amountOr(0)).sum(),
                book.stream()
                        .map(EntryRow::day)
                        .min(Comparator.naturalOrder())
                        .map(LocalDate::getYear)
                        .orElse(null),
                link,
                decides,
                scene.entries(LINE).stream()
                        .filter(line -> !line.done() && sees(scene, line))
                        .map(line -> line(scene, line))
                        .toList(),
                book.stream().limit(30).map(line -> line(scene, line)).toList());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(LINE) && sees(scene, entry) ? line(scene, entry) : null;
    }

    @Override
    public boolean passes(Scene scene, EntryRow entry, String filter) {
        return !filter.equals("waiting") || !entry.done();
    }

    private static GuestBookLineResponse line(Scene scene, EntryRow row) {
        Line line = row.as(Line.class);
        return new GuestBookLineResponse(
                row.id(),
                line.text(),
                line.name(),
                line.about(),
                row.amount() == null ? null : row.amount().intValue(),
                row.day(),
                scene.media(row.mediaId()),
                !row.done(),
                line.door(),
                scene.brief(row.doneBy()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(LINE) || !sees(scene, entry)) {
            return null;
        }
        Line line = entry.as(Line.class);
        return line.text() + " · " + line.name() + (line.about() == null ? "" : ", " + line.about());
    }

    // ---------- changing it ----------

    private static void needsToLiveHere(Scene scene) {
        if (!decides(scene)) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "not_yours",
                    "Only the people who live here do that. Guests write through the code by the door.");
        }
    }

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day they were here. It can't be after today.");
        }
        return day;
    }

    private static Long nights(Fields sent, Long otherwise) {
        return sent.whole("nights", 1, 3650, otherwise);
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(LINE)) {
            throw BoardRules.unknownKind();
        }
        needsToLiveHere(scene);
        LocalDate day = day(scene, sent, scene.today());
        return scene.add(
                EntryDraft.of(LINE)
                        .by(scene.myId())
                        .day(day)
                        .position(scene.positionOn(day))
                        .amount(nights(sent, null))
                        .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                        .done(scene.now(), scene.myId())
                        .doc(new Line(
                                sent.need("name", 50, "Say who the guest was."),
                                sent.text("about", 80),
                                sent.need("text", 300, "Write the line they left."),
                                null,
                                false)),
                clientId);
    }

    /** The facts of a stay can be put right. A guest's own words stay as they wrote them. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(LINE)) {
            throw BoardRules.unknownKind();
        }
        needsToLiveHere(scene);
        Line now = entry.as(Line.class);
        String name = sent.text("name", 50, now.name());
        String text = sent.text("text", 300, now.text());
        if (name == null || text == null) {
            throw ApiProblem.badRequest("missing_text", "A line needs a name and a few words.");
        }
        if (!text.equals(now.text()) && !scene.isMe(entry.authorId())) {
            throw ApiProblem.conflict("their_words", "These are a guest's own words. They stay as they wrote them.");
        }
        LocalDate day = sent.has("day") ? day(scene, sent, entry.day()) : entry.day();
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .day(day)
                        .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                        .amount(nights(sent, entry.amount()))
                        .doc(new Line(name, sent.text("about", 80, now.about()), text, now.pending(), now.fromDoor())));
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!entry.is(LINE)) {
            throw BoardRules.unknownKind();
        }
        needsToLiveHere(scene);
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        needsToLiveHere(scene);
        switch (verb) {
            case "let_in" -> {
                EntryRow line = scene.need(sent.id("entryId"));
                if (!line.is(LINE)) {
                    throw Scene.entryGone();
                }
                if (!line.done()) {
                    scene.save(line, EntryDraft.from(line).done(scene.now(), scene.myId()));
                }
            }
            case "new_code" -> {
                scene.entries(DOOR).forEach(door -> scene.remove(door.id()));
                scene.add(EntryDraft.of(DOOR).token(Scene.newToken()), null);
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    // ---------- what it brings to the rest ----------

    private static long waiting(Scene scene) {
        return decides(scene)
                ? scene.entries(LINE).stream().filter(line -> !line.done()).count()
                : 0;
    }

    @Override
    public String glance(Scene scene) {
        List<EntryRow> book = inTheBook(scene);
        long nights = book.stream().mapToLong(line -> line.amountOr(0)).sum();
        long waiting = waiting(scene);
        return (book.isEmpty()
                        ? "Nobody has written in it yet"
                        : Words.count(book.size(), "guest")
                                + (nights == 0 ? "" : " · " + Words.count(nights, "night") + " on the sofa"))
                + (waiting == 0 ? "" : " · " + waiting + " waiting for a yes");
    }

    /** For the people who live here, while a line from the door waits for their yes. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        long waiting = waiting(scene);
        if (waiting == 0) {
            return List.of();
        }
        Line first = scene.entries(LINE).stream()
                .filter(line -> !line.done())
                .findFirst()
                .orElseThrow()
                .as(Line.class);
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                waiting == 1
                        ? "A guest wrote in the guest book"
                        : Say.upperFirst(Say.spell((int) waiting)) + " guests wrote in the guest book",
                first.name() + (first.about() == null ? "" : ", " + first.about()) + " · waiting for a yes",
                null,
                null,
                "Look",
                40));
    }

    /** Someone with a guest pass reads what is in the book, never what is waiting. */
    @Override
    public String guest(Scene scene) {
        List<EntryRow> book = inTheBook(scene);
        if (book.isEmpty()) {
            return "Nobody has written in it yet.";
        }
        return book.stream()
                .limit(5)
                .map(row -> "“" + row.as(Line.class).text() + "” "
                        + row.as(Line.class).name())
                .collect(Collectors.joining("\n"));
    }
}
