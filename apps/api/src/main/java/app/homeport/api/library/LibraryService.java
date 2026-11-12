package app.homeport.api.library;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Names;
import app.homeport.api.common.Page;
import app.homeport.api.library.AlbumStore.AlbumRow;
import app.homeport.api.library.DocumentReader.FoundDate;
import app.homeport.api.library.DocumentReader.Reading;
import app.homeport.api.library.LibraryStore.CommentRow;
import app.homeport.api.library.LibraryStore.Filter;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.library.LibraryStore.Known;
import app.homeport.api.library.LibraryStore.LoveRow;
import app.homeport.api.library.LibraryStore.Position;
import app.homeport.api.library.LibraryStore.Span;
import app.homeport.api.library.Moments.Moment;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The Library: every photo, video and document, from everyone. Each one is a thing, so who sees it is decided
 * where that is decided for everything. What the phone says about a file (when and where it was taken, the
 * words inside a scan) is kept and shown, and never decides who sees what.
 */
@Service
public class LibraryService {

    static final List<ThingKind> ON_THE_WALL = List.of(ThingKind.PHOTO, ThingKind.VIDEO);
    static final List<ThingKind> KEPT = List.of(ThingKind.PHOTO, ThingKind.VIDEO, ThingKind.DOCUMENT);
    static final int MAX_AT_ONCE = 100;
    static final int MAX_SELECTED = 500;

    // ---------- what the app is told ----------

    /** A photo, video or document in a grid. */
    public record ItemRow(
            UUID id,
            UUID circleId,
            ThingKind kind,

            @Schema(description = "Its caption, or a document's name. May be empty.")
            String title,

            @Schema(
                    nullable = true,
                    description = "Its picture, small, for a grid. A video's is a still. Null for a file.")
            String thumbUrl,

            @Schema(nullable = true, description = "The same picture at a size for a card")
            String url,

            @Schema(description = "The file itself, as it was sent: the original photo, the video, the document")
            String fileUrl,

            @Schema(nullable = true) Integer width,
            @Schema(nullable = true) Integer height,

            @Schema(nullable = true, description = "A video's length, in seconds")
            Integer durationSeconds,

            Instant takenAt,

            @Schema(description = "The clock where it was taken. Days, months and years are read from this.")
            LocalDateTime takenLocal,

            @Schema(nullable = true) String placeName,

            @Schema(nullable = true, description = "Who added it. Null when they have left the circle.")
            PersonBrief addedBy,

            @Schema(description = "True when you gave it a heart")
            boolean loved,

            @Schema(nullable = true, description = "The moment it belongs to. Null for a document.")
            UUID momentId,

            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** One person's share of a moment. */
    public record MomentPerson(
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl,
            boolean you,

            @Schema(description = "How many of its photos and videos they added")
            int count) {}

    /** Photos and videos taken on the same day at the same place, by whoever was there. */
    public record MomentResponse(
            @Schema(
                    description =
                            "Ask for the moment by this: the id of its newest photo. Any of its photos' ids works.")
            UUID id,

            UUID circleId,

            @Schema(description = "Saturday at Lake Bled when several people were there, otherwise the day: Thursday")
            String title,

            LocalDate day,
            @Schema(nullable = true) String placeName,
            int total,
            int photos,
            int videos,

            @Schema(description = "True when more than one person added to it")
            boolean shared,

            @Schema(description = "Who added how many, the one who added most first")
            List<MomentPerson> people,

            @Schema(nullable = true) String coverUrl,

            @Schema(
                    description =
                            "Everyone when all of it is shared with everyone, only you when none is, otherwise some")
            Audience audience) {}

    /** A page of the wall, with the moments its photos belong to. */
    public record WallResponse(
            List<ItemRow> items,

            @Schema(
                    nullable = true,
                    description = "Send this back as `cursor` to get the next page. Null on the last page.")
            String nextCursor,

            @Schema(description = "The moments the photos of this page belong to, the newest first")
            List<MomentResponse> moments) {}

    public record AlbumBrief(UUID id, String title) {}

    /** What stands either side of a photo, for swiping. */
    public record Neighbours(
            @Schema(description = "Taken after it, the nearest first")
            List<ItemRow> newer,

            @Schema(description = "Taken before it, the nearest first")
            List<ItemRow> older,

            @Schema(
                    nullable = true,
                    description = "Its place counted from the newest, starting at 1. Only inside a moment or an album.")
            Integer position,

            @Schema(nullable = true, description = "How many there are. Only inside a moment or an album.")
            Integer total) {}

    /** One photo, video or document with everything its screen shows. */
    public record ItemResponse(
            ItemRow item,

            @Schema(nullable = true, description = "Its picture at full size")
            String largeUrl,

            @Schema(nullable = true) String fileName,
            String contentType,

            @Schema(description = "How much is kept for it, in bytes")
            long bytes,

            @Schema(nullable = true) Double lat,
            @Schema(nullable = true) Double lng,
            @Schema(nullable = true) String country,
            Instant addedAt,

            @Schema(description = "Who is in it, as tagged by hand")
            List<PersonBrief> about,

            @Schema(description = "The albums it is in that you may see")
            List<AlbumBrief> albums,

            int loves,
            List<PersonBrief> lovedBy,
            int comments,
            Neighbours neighbours) {}

    public record CommentResponse(
            UUID id,
            String body,
            Instant createdAt,
            @Schema(nullable = true) PersonBrief by,

            @Schema(description = "True when you may remove it: you wrote it, or it is under your photo")
            boolean canRemove) {}

    public record Problem(String code, String message) {}

    public record Added(
            UUID clientId,
            @Schema(nullable = true) ItemRow item,

            @Schema(description = "True when this file was in your Library already: nothing new was made")
            boolean alreadyThere,

            @Schema(nullable = true, description = "Why this one could not be added. The others were.")
            Problem problem) {}

    public record AddedResponse(List<Added> items) {}

    public record KnownHash(String hash, UUID id) {}

    public record CheckResponse(
            @Schema(description = "The fingerprints you already have here, each with the thing it is")
            List<KnownHash> known) {}

    public record SelectResult(
            @Schema(description = "How many it was done to") int applied,

            @Schema(description = "How many were left as they are: not yours to change, or no longer there")
            int skipped) {}

    // ---------- what the phone sends ----------

    /**
     * What the phone tells the API about one file it has uploaded. {@code takenAt} is read with the offset it
     * was sent with: 11:42 at the lake stays 11:42, wherever the API runs.
     */
    public record NewItem(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "A file didn't finish uploading. Add it again.")
            UUID mediaId,

            @Schema(
                    description =
                            "Left out: a photo, a video or a document, as the upload is. Say document for a photo that is a scan.")
            ThingKind kind,

            @Size(max = 200, message = "Keep the caption to 200 characters or fewer.")
            String title,

            @Schema(
                    description =
                            "When it was taken, with the offset of the clock where it was taken: 2026-11-07T11:42:00+01:00")
            @JsonFormat(without = JsonFormat.Feature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE)
            OffsetDateTime takenAt,

            @DecimalMin("-90") @DecimalMax("90") Double lat,
            @DecimalMin("-180") @DecimalMax("180") Double lng,

            @Schema(description = "The name of the place, as the phone looked it up: Lake Bled")
            @Size(max = 80, message = "Keep the place's name to 80 characters or fewer.")
            String placeName,

            @Size(max = 60) String country,

            @Schema(description = "For a video or a file: a still or a first page, uploaded as a photo")
            UUID posterMediaId,

            @Schema(description = "The file's SHA-256, in hex, so the same file is recognised when it is sent again")
            @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "That isn't a file's fingerprint.")
            String contentHash,

            @Schema(description = "A child or someone else without a phone it is added for. Left out: yourself.")
            UUID addedBy,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(description = "Who is in it") @Size(max = 30)
            List<UUID> about,

            @Schema(description = "For a document: the words the phone read inside it")
            @Size(max = 200000, message = "That is more text than a document can keep.")
            String text,

            @Schema(description = "For a document: how many pages it has") @Min(1) @Max(5000)
            Integer pages,

            @Schema(description = "For a document: what it is. Left out: guessed from its name and its words.")
            DocumentCategory category) {}

    public record NewItems(
            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotEmpty(message = "Choose what to add.") @Size(max = MAX_AT_ONCE, message = "Add 100 at a time at most.")
            List<@Valid @NotNull NewItem> items) {}

    public record HashCheck(
            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotNull @Size(max = 500, message = "Ask about 500 files at a time at most.")
            List<@Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "That isn't a file's fingerprint.") String> hashes) {}

    public record ItemChange(
            @Size(max = 200, message = "Keep the caption to 200 characters or fewer.")
            String title,

            @JsonFormat(without = JsonFormat.Feature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE)
            OffsetDateTime takenAt,

            @DecimalMin("-90") @DecimalMax("90") Double lat,
            @DecimalMin("-180") @DecimalMax("180") Double lng,

            @Size(max = 80, message = "Keep the place's name to 80 characters or fewer.")
            String placeName,

            @Size(max = 60) String country,

            @Schema(description = "True to forget where it was taken")
            Boolean removePlace) {}

    /** Which part of the wall is wanted. Everything that is set narrows it. */
    public record WallQuery(ThingKind kind, boolean loved, UUID by, UUID about, String place, UUID album, UUID moment) {

        static final WallQuery EVERYTHING = new WallQuery(null, false, null, null, null, null, null);

        boolean bounded() {
            return album != null || moment != null;
        }
    }

    private final LibraryStore store;
    private final AlbumStore albums;
    private final DocumentStore documents;
    private final ThingService things;
    private final ThingStore thingStore;
    private final CircleService circles;
    private final MemberStore members;
    private final MediaService media;
    private final TransactionTemplate transaction;

    LibraryService(
            LibraryStore store,
            AlbumStore albums,
            DocumentStore documents,
            ThingService things,
            ThingStore thingStore,
            CircleService circles,
            MemberStore members,
            MediaService media,
            TransactionTemplate transaction) {
        this.store = store;
        this.albums = albums;
        this.documents = documents;
        this.things = things;
        this.thingStore = thingStore;
        this.circles = circles;
        this.members = members;
        this.media = media;
        this.transaction = transaction;
    }

    // ---------- adding ----------

    /** Which of these files this person already has in this circle's Library, before they send them again. */
    public CheckResponse check(UUID me, UUID circleId, List<String> hashes) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        List<String> asked =
                hashes.stream().map(h -> h.toLowerCase(Locale.ROOT)).distinct().toList();
        return new CheckResponse(store.known(circleId, mine.id(), asked).stream()
                .map(k -> new KnownHash(k.hash(), k.thingId()))
                .toList());
    }

    /**
     * Adds uploaded files to a circle's Library, many at once: a phone backing up its camera roll sends a
     * hundred at a time. Each is added by itself, so one that can't be (its upload never finished) doesn't
     * hold the others back, and the whole call can be sent again: what was added the first time is answered
     * with, not added twice.
     */
    public AddedResponse add(UUID me, UUID circleId, List<NewItem> items) {
        CircleRow circle = circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        List<Added> added = new ArrayList<>();
        Map<UUID, UUID> made = new LinkedHashMap<>();
        for (NewItem item : items) {
            try {
                // One short transaction each: a file that is refused undoes nothing but itself.
                Made one = transaction.execute(status -> addOne(me, circle, mine, item));
                made.put(item.clientId(), one.id());
                added.add(new Added(item.clientId(), null, one.alreadyThere(), null));
            } catch (ApiProblem problem) {
                added.add(new Added(item.clientId(), null, false, new Problem(problem.code(), problem.getMessage())));
            }
        }
        Map<UUID, ItemRow> rows = rows(circleId, me, store.items(List.copyOf(made.values()), me, mine.id())).stream()
                .collect(Collectors.toMap(ItemRow::id, Function.identity()));
        return new AddedResponse(added.stream()
                .map(a -> a.problem() != null
                        ? a
                        : new Added(a.clientId(), rows.get(made.get(a.clientId())), a.alreadyThere(), null))
                .toList());
    }

    private record Made(UUID id, boolean alreadyThere) {}

    private Made addOne(UUID me, CircleRow circle, MemberRow mine, NewItem item) {
        MediaRow file = media.requireOwn(item.mediaId(), me, null);
        if (file.kind() == MediaKind.AUDIO) {
            throw ApiProblem.badRequest("not_for_the_library", "The Library keeps photos, videos and documents.");
        }
        ThingKind kind = kindOf(file, item.kind());

        // The same upload again (a second send that lost its answer): what it became the first time.
        UUID sameUpload = store.ofMedia(file.id()).orElse(null);
        if (sameUpload != null) {
            if (!things.require(sameUpload, me).circleId().equals(circle.id())) {
                throw ApiProblem.conflict(
                        "in_another_circle",
                        "That upload is already in another circle's Library. Send the file again to add it here.");
            }
            return new Made(sameUpload, false);
        }
        // The same file in another upload: it is in the Library already, and the new copy isn't kept.
        String hash = file.contentHash() != null
                ? file.contentHash()
                : item.contentHash() == null ? null : item.contentHash().toLowerCase(Locale.ROOT);
        if (hash != null) {
            List<Known> known = store.known(circle.id(), mine.id(), List.of(hash));
            // A fingerprint the API took itself is proof. One the phone only said (a video, a file) is believed
            // when the two files are also the same size: a phone that got it wrong doesn't lose a file for it.
            if (!known.isEmpty()
                    && (file.contentHash() != null
                            || sameSize(file, known.get(0).mediaId()))) {
                List<UUID> copies = new ArrayList<>(List.of(file.id()));
                if (item.posterMediaId() != null) {
                    copies.add(media.requireOwn(item.posterMediaId(), me, MediaKind.PHOTO)
                            .id());
                }
                media.remove(copies);
                return new Made(known.get(0).thingId(), true);
            }
        }

        UUID addedBy = actingFor(circle, mine, item.addedBy());
        UUID poster = null;
        if (item.posterMediaId() != null && file.kind() != MediaKind.PHOTO) {
            poster = media.requireOwn(item.posterMediaId(), me, MediaKind.PHOTO).id();
        }
        if ((item.lat() == null) != (item.lng() == null)) {
            throw ApiProblem.badRequest("invalid_place", "A place needs both its latitude and its longitude.");
        }
        String title = item.title() != null && !item.title().isBlank()
                ? item.title().trim()
                : kind == ThingKind.DOCUMENT ? nameOf(file.fileName()) : "";
        UUID id = things.create(me, circle.id(), kind, title, item.audience(), item.clientId());
        if (things.require(id, me).kind() != kind) {
            throw ApiProblem.conflict("sent_before", "That was added before as something else. Try again.");
        }
        if (thingStore.isNew(id, "library_items")) {
            OffsetDateTime taken = item.takenAt() == null ? OffsetDateTime.now(ZoneOffset.UTC) : item.takenAt();
            store.insert(
                    id,
                    circle.id(),
                    kind,
                    file.id(),
                    poster,
                    addedBy.equals(mine.id()) ? null : addedBy,
                    taken.toInstant(),
                    taken.toLocalDateTime(),
                    item.lat(),
                    item.lng(),
                    blankToNull(item.placeName()),
                    blankToNull(item.country()),
                    hash);
            if (kind == ThingKind.DOCUMENT) {
                String text = item.text() == null ? "" : item.text();
                Reading reading = DocumentReader.read(text, LocalDate.now());
                FoundDate key = reading.key(LocalDate.now());
                documents.insert(
                        id,
                        text,
                        item.pages(),
                        item.category() != null
                                ? item.category()
                                : DocumentReader.category(title, text, reading.mrz() != null),
                        key == null ? null : key.date(),
                        key == null ? null : key.label(),
                        reading.amount() == null ? null : reading.amount().cents(),
                        reading.amount() == null ? null : reading.amount().currency());
            }
            if (item.about() != null && !item.about().isEmpty()) {
                things.setAbout(id, me, item.about());
            }
        }
        return new Made(id, false);
    }

    private boolean sameSize(MediaRow file, UUID otherMediaId) {
        return media.rows(List.of(otherMediaId)).stream()
                .anyMatch(
                        other -> other.kind() == file.kind() && java.util.Objects.equals(other.bytes(), file.bytes()));
    }

    /** What a file becomes: what its upload is, except that a photo may be said to be a scan of a document. */
    private static ThingKind kindOf(MediaRow file, ThingKind asked) {
        ThingKind natural = switch (file.kind()) {
            case PHOTO -> ThingKind.PHOTO;
            case VIDEO -> ThingKind.VIDEO;
            default -> ThingKind.DOCUMENT;
        };
        if (asked == null || asked == natural) {
            return natural;
        }
        if (asked == ThingKind.DOCUMENT && natural == ThingKind.PHOTO) {
            return ThingKind.DOCUMENT;
        }
        throw ApiProblem.badRequest("wrong_kind", "That file isn't that kind of thing.");
    }

    private static String nameOf(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "";
        }
        String name = fileName.replaceFirst("\\.[A-Za-z0-9]{1,5}$", "").trim();
        return name.length() > 200 ? name.substring(0, 200) : name;
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }

    /**
     * The member something is done for: the signed-in person's own, or someone in the circle who has no phone
     * (a child, whose tablet is signed in as a parent). Only the people who run the circle act for them.
     */
    UUID actingFor(CircleRow circle, MemberRow mine, UUID memberId) {
        if (memberId == null || memberId.equals(mine.id())) {
            return mine.id();
        }
        MemberRow other = members.find(memberId)
                .filter(m -> m.circleId().equals(circle.id()))
                .orElseThrow(() -> ApiProblem.badRequest("not_in_circle", "Choose someone from this circle."));
        if (other.status() != MemberStatus.NO_PHONE || !CircleService.runs(circle, mine)) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "not_yours_to_do",
                    "You can do that for a child or a pet of the circle, not for someone with a phone of their own.");
        }
        return other.id();
    }

    // ---------- the wall ----------

    public WallResponse wall(UUID circleId, UUID me, WallQuery query, LocalDate until, Keyset page) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        Filter filter = filter(circleId, me, mine, query);
        List<Item> found = store.wall(
                circleId,
                me,
                mine.id(),
                filter,
                until == null ? null : until.plusDays(1).atStartOfDay(),
                page);
        Page<Item> shown = page.page(found, item -> Keyset.cursor(item.takenLocal(), item.id()));
        List<Moment> moments = momentsOf(circleId, me, shown.items());
        List<Moment> here = moments.stream()
                .filter(m -> shown.items().stream().anyMatch(i -> m.has(i.id())))
                .toList();
        Map<UUID, PersonBrief> people = people(circleId);
        return new WallResponse(
                rows(shown.items(), moments, people),
                shown.nextCursor(),
                moments(circleId, me, mine, here, people, shown.items()));
    }

    /**
     * Turns what the app asked for into what the store reads. An album and a moment are looked up first: one
     * that isn't there for this person is "not found", like anything else.
     */
    Filter filter(UUID circleId, UUID me, MemberRow mine, WallQuery query) {
        List<ThingKind> kinds = query.kind() != null ? List.of(query.kind()) : ON_THE_WALL;
        List<UUID> about = new ArrayList<>();
        if (query.about() != null) {
            about.add(query.about());
        }
        UUID album = null;
        boolean nothing = false;
        if (query.album() != null) {
            ThingRow row = things.require(query.album(), me, ThingKind.ALBUM);
            AlbumRow details = albums.find(row.id()).orElseThrow(ThingService::notFound);
            if (!row.circleId().equals(circleId)) {
                throw ThingService.notFound();
            }
            if (details.origin() == AlbumOrigin.PERSON) {
                // An album that fills itself holds every photo and video its person is in.
                if (details.personId() == null) {
                    nothing = true;
                } else if (!about.contains(details.personId())) {
                    about.add(details.personId());
                }
            } else {
                album = row.id();
                if (query.kind() == null) {
                    kinds = KEPT; // a folder holds documents
                }
            }
        }
        Span span = null;
        if (query.moment() != null) {
            Item anchor = requireItem(query.moment(), me);
            if (!anchor.thing().circleId().equals(circleId)) {
                throw ThingService.notFound();
            }
            Moment moment = momentOf(anchor, me);
            span = new Span(
                    moment.oldest().taken(),
                    moment.oldest().id(),
                    moment.newest().taken(),
                    moment.newest().id());
        }
        return new Filter(
                kinds.stream().map(ThingKind::code).toList(),
                query.loved() ? mine.id() : null,
                query.by(),
                about,
                blankToNull(query.place()),
                album,
                span,
                null,
                null,
                false,
                nothing);
    }

    /** The moments of the days these items count for, as this person sees them. */
    List<Moment> momentsOf(UUID circleId, UUID me, List<Item> items) {
        List<LocalDate> days = items.stream()
                .filter(i -> ON_THE_WALL.contains(i.thing().kind()))
                .map(Item::day)
                .distinct()
                .toList();
        return Moments.group(store.shots(circleId, me, days));
    }

    private Moment momentOf(Item item, UUID me) {
        if (!ON_THE_WALL.contains(item.thing().kind())) {
            throw ThingService.notFound();
        }
        Moment moment = Moments.of(item.id(), momentsOf(item.thing().circleId(), me, List.of(item)));
        if (moment == null) {
            throw ThingService.notFound();
        }
        return moment;
    }

    /** The moment a photo or video belongs to. */
    public MomentResponse moment(UUID itemId, UUID me) {
        Item item = requireItem(itemId, me);
        UUID circleId = item.thing().circleId();
        Moment moment = momentOf(item, me);
        return moments(circleId, me, circles.me(circleId, me), List.of(moment), people(circleId), List.of(item))
                .get(0);
    }

    /**
     * Moments as the app shows them.
     *
     * @param known items already read, so a cover among them isn't read again
     */
    List<MomentResponse> moments(
            UUID circleId,
            UUID me,
            MemberRow mine,
            List<Moment> moments,
            Map<UUID, PersonBrief> people,
            List<Item> known) {
        Map<UUID, Item> covers = known.stream().collect(Collectors.toMap(Item::id, Function.identity(), (a, b) -> a));
        List<UUID> missing = moments.stream()
                .map(Moment::id)
                .filter(id -> !covers.containsKey(id))
                .toList();
        store.items(missing, me, mine.id()).forEach(item -> covers.put(item.id(), item));
        return moments.stream()
                .map(m -> new MomentResponse(
                        m.id(),
                        circleId,
                        m.title(),
                        m.day(),
                        m.place(),
                        m.shots().size(),
                        m.photos(),
                        m.videos(),
                        m.shared(),
                        m.people().entrySet().stream()
                                .map(e -> {
                                    PersonBrief person = people.get(e.getKey());
                                    return new MomentPerson(
                                            e.getKey(),
                                            person == null ? "Someone" : person.name(),
                                            person == null ? null : person.avatarUrl(),
                                            e.getKey().equals(mine.id()),
                                            e.getValue());
                                })
                                .toList(),
                        covers.containsKey(m.id())
                                ? media.urlFor(covers.get(m.id()).pictureKey(), MediaSize.MEDIUM)
                                : null,
                        m.audience()))
                .toList();
    }

    // ---------- one photo ----------

    /** A photo, video or document, for someone who may see it. To everyone else it isn't there. */
    Item requireItem(UUID id, UUID me) {
        ThingRow row = things.require(id, me);
        if (!KEPT.contains(row.kind())) {
            throw ThingService.notFound();
        }
        return store.item(id, me, circles.me(row.circleId(), me).id()).orElseThrow(ThingService::notFound);
    }

    private Item requireEdit(UUID id, UUID me) {
        Item item = requireItem(id, me);
        if (!item.thing().canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        return item;
    }

    /**
     * Everything the photo's screen shows, and what stands either side of it for swiping: in the wall's order,
     * under the same narrowing the person came from (a moment, an album, only videos).
     */
    public ItemResponse get(UUID id, UUID me, WallQuery query) {
        Item item = requireItem(id, me);
        UUID circleId = item.thing().circleId();
        MemberRow mine = circles.me(circleId, me);
        Map<UUID, PersonBrief> people = people(circleId);
        List<LoveRow> loves = store.loves(List.of(id));

        Filter filter = filter(circleId, me, mine, query);
        if (query.kind() == null && !filter.kinds().contains(item.thing().kind().code())) {
            // A document is looked at among documents.
            filter = Filter.of(List.of(item.thing().kind()));
        }
        List<Item> newer = store.beside(circleId, me, mine.id(), filter, item, true, 3);
        List<Item> older = store.beside(circleId, me, mine.id(), filter, item, false, 3);
        Position position = query.bounded() ? store.position(circleId, me, filter, item) : null;
        List<Item> all = new ArrayList<>(newer);
        all.add(item);
        all.addAll(older);
        Map<UUID, ItemRow> rows =
                rows(circleId, me, all).stream().collect(Collectors.toMap(ItemRow::id, Function.identity()));

        return new ItemResponse(
                rows.get(id),
                media.urlFor(item.fullKey()),
                item.fileName(),
                item.contentType(),
                item.storedBytes(),
                item.lat(),
                item.lng(),
                item.country(),
                item.addedAt(),
                store.about(List.of(id)).getOrDefault(id, List.of()).stream()
                        .map(people::get)
                        .filter(java.util.Objects::nonNull)
                        .toList(),
                albums.holding(id, me).stream()
                        .map(a -> new AlbumBrief(a.id(), a.title()))
                        .toList(),
                loves.size(),
                loves.stream()
                        .map(l -> people.get(l.memberId()))
                        .filter(java.util.Objects::nonNull)
                        .toList(),
                store.countComments(id),
                new Neighbours(
                        newer.stream().map(i -> rows.get(i.id())).toList(),
                        older.stream().map(i -> rows.get(i.id())).toList(),
                        position == null ? null : position.newer() + 1,
                        position == null ? null : position.total()));
    }

    /** Changes a caption, or when and where it was taken. Whoever may change the thing can. */
    @Transactional
    public ItemResponse change(UUID id, UUID me, ItemChange change) {
        Item item = requireEdit(id, me);
        if (change.title() != null) {
            thingStore.retitle(id, change.title().trim());
        }
        boolean forget = Boolean.TRUE.equals(change.removePlace());
        if ((change.lat() == null) != (change.lng() == null)) {
            throw ApiProblem.badRequest("invalid_place", "A place needs both its latitude and its longitude.");
        }
        if (change.takenAt() != null
                || change.lat() != null
                || change.placeName() != null
                || change.country() != null
                || forget) {
            boolean moved = change.lat() != null;
            store.retake(
                    id,
                    change.takenAt() == null ? item.takenAt() : change.takenAt().toInstant(),
                    change.takenAt() == null
                            ? item.takenLocal()
                            : change.takenAt().toLocalDateTime(),
                    forget ? null : moved ? change.lat() : item.lat(),
                    forget ? null : moved ? change.lng() : item.lng(),
                    forget ? null : change.placeName() == null ? item.placeName() : blankToNull(change.placeName()),
                    forget ? null : change.country() == null ? item.country() : blankToNull(change.country()));
            thingStore.touch(id);
        }
        return get(id, me, WallQuery.EVERYTHING);
    }

    // ---------- hearts and comments ----------

    /** Gives a heart, or takes it back. A heart is one member's; an adult can give one for a child without a phone. */
    @Transactional
    public void love(UUID id, UUID me, UUID as, boolean on) {
        Item item = requireItem(id, me);
        UUID circleId = item.thing().circleId();
        UUID member = actingFor(circles.require(circleId, me), circles.me(circleId, me), as);
        if (on) {
            store.love(id, member);
        } else {
            store.unlove(id, member);
        }
    }

    public Page<CommentResponse> comments(UUID id, UUID me, Keyset page) {
        Item item = requireItem(id, me);
        UUID circleId = item.thing().circleId();
        UUID mine = circles.me(circleId, me).id();
        Map<UUID, PersonBrief> people = people(circleId);
        return page.page(store.comments(id, page), c -> Keyset.cursor(c.createdAt(), c.id()))
                .map(shown -> shown.stream()
                        .map(c -> said(c, people, mine, item.thing().mine()))
                        .toList());
    }

    /** Anyone who may see a photo may say something under it. */
    @Transactional
    public CommentResponse comment(UUID id, UUID me, String body, UUID clientId) {
        Item item = requireItem(id, me);
        UUID circleId = item.thing().circleId();
        UUID mine = circles.me(circleId, me).id();
        UUID commentId = store.comment(id, mine, body.trim(), clientId);
        return said(
                store.findComment(commentId).orElseThrow(),
                people(circleId),
                mine,
                item.thing().mine());
    }

    /** Removes a comment: whoever wrote it can, and so can the owner of the photo it is under. */
    @Transactional
    public void removeComment(UUID commentId, UUID me) {
        CommentRow comment = store.findComment(commentId).orElse(null);
        if (comment == null) {
            return; // removing what is gone is fine
        }
        Item item;
        try {
            item = requireItem(comment.thingId(), me);
        } catch (ApiProblem hidden) {
            throw new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That comment isn't there any more.");
        }
        UUID mine = circles.me(item.thing().circleId(), me).id();
        if (!comment.memberId().equals(mine) && !item.thing().mine()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "not_yours", "Only the person who wrote this can remove it.");
        }
        store.deleteComment(commentId);
    }

    private static CommentResponse said(CommentRow c, Map<UUID, PersonBrief> people, UUID mine, boolean myPhoto) {
        return new CommentResponse(
                c.id(),
                c.body(),
                c.createdAt(),
                people.get(c.memberId()),
                myPhoto || c.memberId().equals(mine));
    }

    // ---------- many at once ----------

    /** The selected things the person may see, as far as they are photos, videos or documents. */
    private List<ThingRow> selected(List<UUID> ids, UUID me) {
        return thingStore.findAll(ids.stream().distinct().toList(), me).stream()
                .filter(row -> KEPT.contains(row.kind()))
                .toList();
    }

    private static SelectResult result(List<UUID> ids, int applied) {
        return new SelectResult(applied, (int) ids.stream().distinct().count() - applied);
    }

    /** Sets who can see every selected thing that is the person's own. The others are left as they are. */
    @Transactional
    public SelectResult share(UUID me, List<UUID> ids, AudienceChange change) {
        int applied = 0;
        for (ThingRow row : selected(ids, me)) {
            if (row.mine()) {
                things.share(row.id(), me, change);
                applied++;
            }
        }
        return result(ids, applied);
    }

    /**
     * Hides every selected thing that is the person's own and shared from one member, through a day or for
     * good. What is only theirs has nobody to be hidden from, and is left as it is.
     */
    @Transactional
    public SelectResult hide(UUID me, List<UUID> ids, UUID memberId, LocalDate through) {
        MemberRow member = members.find(memberId)
                .filter(m -> m.kind() != MemberKind.PET)
                .orElseThrow(() -> ApiProblem.badRequest("not_in_circle", "Choose people from this circle."));
        int applied = 0;
        for (ThingRow row : selected(ids, me)) {
            if (!row.mine() || row.audience() == Audience.ME) {
                continue;
            }
            if (!member.circleId().equals(row.circleId()) || member.id().equals(row.ownerId())) {
                throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
            }
            thingStore.hide(row.id(), member.id(), through);
            thingStore.touch(row.id());
            applied++;
        }
        return result(ids, applied);
    }

    /** Deletes every selected thing that is the person's own, for good. */
    @Transactional
    public SelectResult delete(UUID me, List<UUID> ids) {
        int applied = 0;
        for (ThingRow row : selected(ids, me)) {
            if (row.mine()) {
                things.delete(row.id(), me);
                applied++;
            }
        }
        return result(ids, applied);
    }

    // ---------- shared with the other services of the Library ----------

    /** Everyone in a circle by their member id, as a first name and a picture. */
    Map<UUID, PersonBrief> people(UUID circleId) {
        return members.of(List.of(circleId)).stream()
                .collect(Collectors.toMap(
                        MemberRow::id,
                        m -> new PersonBrief(
                                m.id(), Names.first(m.name()), media.urlFor(m.avatarKey(), MediaSize.SMALL)),
                        (a, b) -> a));
    }

    /** Items as the app shows them in a grid, each with the moment it belongs to. */
    List<ItemRow> rows(UUID circleId, UUID me, List<Item> items) {
        return rows(items, momentsOf(circleId, me, items), people(circleId));
    }

    List<ItemRow> rows(List<Item> items, List<Moment> moments, Map<UUID, PersonBrief> people) {
        Map<UUID, AudienceChip> chips =
                things.chips(items.stream().map(Item::thing).toList());
        Map<UUID, UUID> momentOf = new LinkedHashMap<>();
        for (Moment moment : moments) {
            moment.shots().forEach(shot -> momentOf.put(shot.id(), moment.id()));
        }
        return items.stream()
                .map(item -> new ItemRow(
                        item.id(),
                        item.thing().circleId(),
                        item.thing().kind(),
                        item.thing().title(),
                        media.urlFor(item.pictureKey(), MediaSize.SMALL),
                        media.urlFor(item.pictureKey(), MediaSize.MEDIUM),
                        media.urlFor(item.fileKey()),
                        item.width(),
                        item.height(),
                        item.durationS(),
                        item.takenAt(),
                        item.takenLocal(),
                        item.placeName(),
                        people.get(item.addedBy()),
                        item.loved(),
                        momentOf.get(item.id()),
                        item.thing().mine(),
                        item.thing().canEdit(),
                        chips.get(item.id())))
                .toList();
    }
}
