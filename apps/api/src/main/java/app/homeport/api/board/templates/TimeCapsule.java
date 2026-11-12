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
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.Hidden;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The time capsule: letters, photos and recordings sealed until a date.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sight}, and only there:
 *
 * <ul>
 *   <li>Something that is being written and isn't sealed yet is its writer's alone. Nobody else is told it
 *       exists.
 *   <li>Once sealed, nobody reads it before the day, the writer included. What everyone sees is the envelope:
 *       who it is from, what is written on the outside (its title and a line), how long it is, and when it was
 *       sealed. The words, the recording and the pictures don't leave the API.
 *   <li>From the day on, it opens to the people it is for. When one of them has no sign-in of their own (a
 *       child), it opens on the phones of the adults who look after them. A capsule that is for nobody in
 *       particular opens to everyone who can see it. To everyone else it stays an envelope.
 * </ul>
 *
 * <p>The day is the viewer's own day, but never more than a day from the API's (see {@code Today}): a phone
 * set to 2035 opens nothing.
 *
 * <p>Keeping the capsule itself from the person it is for (they don't even see that it exists) is the shared
 * "hidden from, until" of the audience sheet, not a rule of its own. A capsule made as a surprise
 * ({@code hideFromThem}) and shared from the start sets that for its maker, through the day before it opens;
 * this class only decides what is read inside.
 *
 * <p>Sealed means sealed: a sealed thing can't be changed, and the date and who it is for can't be changed
 * once something is sealed inside. Its writer, or whoever made the capsule, can still take it out unread.
 */
@Component
class TimeCapsule implements BoardRules {

    static final String LETTER = "letter";
    static final String VOICE = "voice";
    static final String PHOTO = "photo";
    static final String PHOTOS = "photos";
    private static final Set<String> KINDS = Set.of(LETTER, VOICE, PHOTO, PHOTOS);
    private static final int LETTERS_ON_A_PAGE = 1800;

    // ---------- what is stored ----------

    record TimeCapsuleSettings(
            @Schema(description = "The day it opens") LocalDate opensOn,

            @Schema(description = "The day the wait is counted from, for the bar: the day it was made, or a birthday")
            LocalDate countFrom,

            @Schema(description = "The members it is for. Empty: everyone who can see it.")
            List<UUID> forMemberIds,

            @Schema(description = "True when it was made as a surprise: hidden from the people it is for until the day")
            boolean hideFromThem) {
        TimeCapsuleSettings {
            forMemberIds = forMemberIds == null ? List.of() : List.copyOf(forMemberIds);
        }
    }

    /** @param title and note are written on the outside; text is inside */
    record Item(String title, String note, String text, String fromName) {}

    // ---------- what a person sees ----------

    /** What one person may know of one thing in the capsule. */
    enum Sight {
        /** It isn't there for them: someone else's unsealed draft. */
        NOTHING,
        /** Their own, not sealed yet: they read and change it. */
        DRAFT,
        /** Sealed: the envelope only. */
        ENVELOPE,
        /** The day has come and it is for them: everything. */
        OPEN
    }

    record TimeCapsuleView(
            LocalDate opensOn,

            @Schema(description = "True from the day it opens")
            boolean open,

            @Schema(description = "True when it has opened and this person may read what is inside")
            boolean openForYou,

            @Schema(description = "Days until it opens; 0 from the day it does")
            long daysToGo,

            @Schema(description = "How much of the wait is over, 0 to 100")
            int progress,

            @Schema(description = "Who it is for. Empty: everyone who can see it.")
            List<PersonBrief> forPeople,

            @Schema(description = "How many things are sealed inside")
            int sealedInside,

            List<TimeCapsuleItem> items) {}

    record TimeCapsuleItem(
            UUID id,

            @Schema(description = "letter, voice, photo or photos")
            String kind,

            @Schema(description = "What is written on the outside: A letter from Nora")
            String title,

            @Schema(nullable = true, description = "A line on the outside: In her handwriting, with a photo")
            String note,

            @Schema(nullable = true, description = "The member it is from. Null when it is from someone outside.")
            PersonBrief from,

            @Schema(nullable = true, description = "Who it is from, when that is someone outside the circle")
            String fromName,

            boolean mine,

            @Schema(description = "True for the viewer's own, not sealed yet")
            boolean draft,

            @Schema(description = "True while this person may not read what is inside")
            boolean sealed,

            @Schema(nullable = true) Instant sealedAt,

            @Schema(nullable = true, description = "A letter's length in pages")
            Integer pages,

            @Schema(nullable = true, description = "A recording's length in seconds")
            Integer seconds,

            @Schema(nullable = true, description = "How many photos a bundle holds")
            Integer photos,

            @Schema(nullable = true, description = "The letter's words. Null while it is sealed for this person.")
            String text,

            @Schema(
                    nullable = true,
                    description = "The recording or the photo. Null while it is sealed for this person.")
            BoardMedia media,

            @Schema(description = "A bundle's photos. Empty while it is sealed for this person.")
            List<BoardMedia> pictures) {}

    private final ThingService things;

    TimeCapsule(ThingService things) {
        this.things = things;
    }

    @Override
    public Template template() {
        return Template.TIME_CAPSULE;
    }

    @Override
    public Class<?> settingsType() {
        return TimeCapsuleSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return TimeCapsuleView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: opensOn (a date after today), forMemberIds (member ids; left out: everyone who sees it),"
                        + " countFrom (a date; left out: today), hideFromThem (when making it: true hides it from the"
                        + " people it is for until the day, with the shared hidden-from)",
                "entry letter: text, title, note, fromName, seal (left out: true; false keeps it a draft only you see)",
                "entry voice: mediaId (an audio upload), title, note, fromName, seal",
                "entry photo: mediaId (a photo upload), title, note, fromName, seal; or parentId (a photos bundle)",
                "entry photos: title, note (a bundle; add its photos as entries of kind photo with parentId)",
                "verb seal: entryId (your own draft)");
    }

    // ---------- who sees what ----------

    /** True from the day the capsule opens, for someone it is for. */
    private static boolean openFor(Scene scene, TimeCapsuleSettings settings) {
        if (scene.today().isBefore(settings.opensOn())) {
            return false;
        }
        return settings.forMemberIds().isEmpty()
                ? scene.me() != null
                : settings.forMemberIds().stream().anyMatch(scene::iStandInFor);
    }

    /** The one place that decides what a person may know of a thing in the capsule. */
    private static Sight sight(Scene scene, TimeCapsuleSettings settings, EntryRow item) {
        if (!item.done()) {
            return scene.isMe(item.authorId()) ? Sight.DRAFT : Sight.NOTHING;
        }
        return openFor(scene, settings) ? Sight.OPEN : Sight.ENVELOPE;
    }

    /** A photo inside a bundle is seen as its bundle is. */
    private static EntryRow outer(Scene scene, EntryRow item) {
        if (item.parentId() == null) {
            return item;
        }
        return scene.entries().stream()
                .filter(e -> e.id().equals(item.parentId()))
                .findFirst()
                .orElse(item);
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        TimeCapsuleSettings now = scene.isNew()
                ? new TimeCapsuleSettings(null, scene.today(), List.of(), false)
                : scene.settings(TimeCapsuleSettings.class);
        LocalDate opensOn = sent.day("opensOn", now.opensOn());
        List<UUID> forPeople = sent.ids("forMemberIds", 30);
        if (forPeople == null) {
            forPeople = now.forMemberIds();
        }
        LocalDate countFrom = sent.day("countFrom", now.countFrom());
        boolean moved = !Objects.equals(opensOn, now.opensOn()) || !forPeople.equals(now.forMemberIds());
        if (!scene.isNew() && moved && scene.entries().stream().anyMatch(EntryRow::done)) {
            throw ApiProblem.conflict(
                    "sealed", "Something is sealed inside already. The date and who it is for can't change now.");
        }
        if (opensOn == null || (moved && !opensOn.isAfter(scene.today()))) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day it opens. It has to be after today.");
        }
        forPeople.forEach(scene::inCircle);
        return new TimeCapsuleSettings(
                opensOn,
                countFrom == null || countFrom.isAfter(scene.today()) ? scene.today() : countFrom,
                forPeople,
                scene.isNew() ? sent.flag("hideFromThem", false) : now.hideFromThem());
    }

    /** A surprise: from the first moment the people it is for don't see that it exists, until the day before it opens. */
    @Override
    public void started(Scene scene) {
        TimeCapsuleSettings settings = scene.settings(TimeCapsuleSettings.class);
        List<Hidden> from = settings.forMemberIds().stream()
                .filter(member -> !scene.isMe(member))
                .map(member -> new Hidden(member, settings.opensOn().minusDays(1)))
                .toList();
        // Something that is only its maker's is hidden from everyone already.
        if (settings.hideFromThem() && !from.isEmpty() && scene.audience() != Audience.ME) {
            things.share(scene.boardId(), scene.me().userId(), new AudienceChange(null, null, null, from));
        }
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        TimeCapsuleSettings settings = scene.settings(TimeCapsuleSettings.class);
        boolean open = !scene.today().isBefore(settings.opensOn());
        long whole = Math.max(1, ChronoUnit.DAYS.between(settings.countFrom(), settings.opensOn()));
        long gone = ChronoUnit.DAYS.between(settings.countFrom(), scene.today());
        List<EntryRow> top =
                scene.entries().stream().filter(e -> e.parentId() == null).toList();
        return new TimeCapsuleView(
                settings.opensOn(),
                open,
                openFor(scene, settings),
                Math.max(0, ChronoUnit.DAYS.between(scene.today(), settings.opensOn())),
                Math.clamp(gone * 100 / whole, 0, 100),
                settings.forMemberIds().stream()
                        .map(scene::brief)
                        .filter(Objects::nonNull)
                        .toList(),
                (int) top.stream().filter(EntryRow::done).count(),
                top.stream()
                        .map(e -> item(scene, settings, e))
                        .filter(Objects::nonNull)
                        .toList());
    }

    /** One thing of the capsule as this person may see it, or null when it isn't there for them. */
    private TimeCapsuleItem item(Scene scene, TimeCapsuleSettings settings, EntryRow row) {
        Sight sight = sight(scene, settings, row);
        if (sight == Sight.NOTHING) {
            return null;
        }
        boolean inside = sight == Sight.OPEN || sight == Sight.DRAFT;
        Item item = row.as(Item.class);
        BoardMedia media = scene.media(row.mediaId());
        List<EntryRow> photos = row.is(PHOTOS) ? scene.under(row.id()) : List.of();
        return new TimeCapsuleItem(
                row.id(),
                row.kind(),
                item.title(),
                item.note(),
                item.fromName() == null ? scene.brief(row.authorId()) : null,
                item.fromName(),
                scene.isMe(row.authorId()),
                sight == Sight.DRAFT,
                !inside,
                row.doneAt(),
                row.is(LETTER) ? pages(item.text()) : null,
                row.is(VOICE) && media != null ? media.seconds() : null,
                row.is(PHOTOS) ? photos.size() : null,
                inside ? item.text() : null,
                inside ? media : null,
                inside
                        ? photos.stream()
                                .map(p -> scene.media(p.mediaId()))
                                .filter(Objects::nonNull)
                                .toList()
                        : List.of());
    }

    static int pages(String text) {
        return text == null ? 1 : Math.max(1, (text.length() + LETTERS_ON_A_PAGE - 1) / LETTERS_ON_A_PAGE);
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        TimeCapsuleSettings settings = scene.settings(TimeCapsuleSettings.class);
        Item item = entry.as(Item.class);
        return switch (sight(scene, settings, outer(scene, entry))) {
            case NOTHING -> null;
            // What is written on the outside is there for everyone to read; what is inside is not.
            case ENVELOPE -> entry.parentId() == null ? outside(item) : null;
            case DRAFT, OPEN -> outside(item) + (item.text() == null ? "" : " · " + item.text());
        };
    }

    private static String outside(Item item) {
        return (item.title() == null ? "" : item.title()) + (item.note() == null ? "" : " · " + item.note());
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!KINDS.contains(kind)) {
            throw BoardRules.unknownKind();
        }
        TimeCapsuleSettings settings = scene.settings(TimeCapsuleSettings.class);
        if (!scene.today().isBefore(settings.opensOn())) {
            throw ApiProblem.conflict("opened", "This capsule has opened. Start a new one for what comes next.");
        }
        UUID parent = sent.id("parentId");
        if (parent != null) {
            // A photo for a bundle: it is sealed with the bundle, and seen as the bundle is.
            EntryRow bundle = scene.need(parent);
            if (!kind.equals(PHOTO) || !bundle.is(PHOTOS) || sight(scene, settings, bundle) == Sight.NOTHING) {
                throw Scene.entryGone();
            }
            return scene.add(
                    EntryDraft.of(PHOTO)
                            .under(parent)
                            .by(scene.myId())
                            .media(needUpload(scene, sent, MediaKind.PHOTO))
                            .done(scene.now(), scene.myId()),
                    clientId);
        }
        String fromName = sent.text("fromName", 80);
        String from = fromName == null ? scene.firstName(scene.myId()) : fromName;
        String title = sent.text("title", 120);
        EntryDraft draft = EntryDraft.of(kind).by(scene.myId());
        String text = null;
        switch (kind) {
            case LETTER -> text = sent.need("text", 20000, "Write the letter first.");
            case VOICE -> draft.media(needUpload(scene, sent, MediaKind.AUDIO));
            case PHOTO -> draft.media(needUpload(scene, sent, MediaKind.PHOTO));
            default -> {}
        }
        if (title == null) {
            title = switch (kind) {
                case LETTER -> "A letter from " + from;
                case VOICE -> "A voice message from " + from;
                case PHOTO -> "A photo from " + from;
                default -> "Photos from " + from;
            };
        }
        // A bundle is sealed from the start: its photos are added blind.
        boolean seal = kind.equals(PHOTOS) || sent.flag("seal", true);
        return scene.add(
                draft.doc(new Item(title, sent.text("note", 200), text, fromName))
                        .done(seal ? scene.now() : null, seal ? scene.myId() : null),
                clientId);
    }

    private static UUID needUpload(Scene scene, Fields sent, MediaKind kind) {
        UUID media = scene.upload(sent.id("mediaId"), kind);
        if (media == null) {
            throw ApiProblem.badRequest(
                    "missing_file", kind == MediaKind.AUDIO ? "Add the recording first." : "Add the photo first.");
        }
        return media;
    }

    private static ApiProblem sealed() {
        return ApiProblem.conflict("sealed", "Sealed means sealed. It can't be read or changed before the day.");
    }

    /** Only its writer changes something, and only until it is sealed. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (entry.done() || entry.parentId() != null) {
            throw sealed();
        }
        if (!scene.isMe(entry.authorId())) {
            throw Scene.entryGone(); // someone else's draft isn't there for this person
        }
        Item now = entry.as(Item.class);
        String title = sent.text("title", 120, now.title());
        EntryDraft draft = EntryDraft.from(entry);
        if (sent.has("mediaId") && !entry.is(LETTER)) {
            draft.media(needUpload(scene, sent, entry.is(VOICE) ? MediaKind.AUDIO : MediaKind.PHOTO));
        }
        String text = entry.is(LETTER) ? sent.text("text", 20000, now.text()) : null;
        if (entry.is(LETTER) && text == null) {
            throw ApiProblem.badRequest("missing_text", "Write the letter first.");
        }
        boolean seal = sent.flag("seal", false);
        scene.save(
                entry,
                draft.doc(new Item(
                                title == null ? now.title() : title,
                                sent.text("note", 200, now.note()),
                                text,
                                sent.text("fromName", 80, now.fromName())))
                        .done(seal ? scene.now() : null, seal ? scene.myId() : null));
    }

    /** Its writer, or whoever made the capsule, can take something out, unread. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!scene.isMe(entry.authorId())
                && !(scene.mine() && outer(scene, entry).done())) {
            if (sight(scene, scene.settings(TimeCapsuleSettings.class), outer(scene, entry)) == Sight.NOTHING) {
                throw Scene.entryGone();
            }
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("seal")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow entry = scene.need(sent.id("entryId"));
        if (!scene.isMe(entry.authorId())) {
            throw entry.done() ? BoardRules.notYours() : Scene.entryGone();
        }
        if (!entry.done()) {
            scene.save(entry, EntryDraft.from(entry).done(scene.now(), scene.myId()));
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        TimeCapsuleSettings settings = scene.settings(TimeCapsuleSettings.class);
        long inside = scene.entries().stream()
                .filter(e -> e.parentId() == null && e.done())
                .count();
        return scene.today().isBefore(settings.opensOn())
                ? inside + " sealed inside · opens " + Words.day(settings.opensOn())
                : "Opened " + Words.day(settings.opensOn()) + " · " + inside + " inside";
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        TimeCapsuleSettings settings = scene.settings(TimeCapsuleSettings.class);
        if (!scene.today().equals(settings.opensOn())) {
            return List.of();
        }
        return List.of(new TodayItem(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                openFor(scene, settings) ? "The time capsule opens today" : "The time capsule opens today, for them",
                null,
                null,
                1440,
                scene.avatars(settings.forMemberIds().toArray(UUID[]::new))));
    }
}
