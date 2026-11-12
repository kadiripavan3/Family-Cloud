package app.homeport.api.library;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.library.AlbumStore.Album;
import app.homeport.api.library.AlbumStore.AlbumRow;
import app.homeport.api.library.AlbumStore.Share;
import app.homeport.api.library.LibraryService.SelectResult;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.library.Moments.Moment;
import app.homeport.api.library.Moments.Shot;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Albums. One is made by hand (things are put in and taken out, and a thing can be in several), or fills
 * itself with every photo and video one member is in. An album's own audience decides who sees the album;
 * each thing in it is still only shown to someone who may see that thing, so the same album can hold 40
 * photos for one person and 37 for another. A folder is an album for files.
 */
@Service
public class AlbumService {

    /** What counts as new on an album's card: added by someone else in the last week. */
    static final int FRESH_DAYS = 7;

    public record AlbumResponse(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "A few words under its name: mostly asleep")
            String note,

            AlbumOrigin origin,

            @Schema(nullable = true, description = "For an album that fills itself: whose photos it gathers")
            PersonBrief person,

            @Schema(description = "True for a folder of files")
            boolean folder,

            @Schema(description = "How many things in it you may see")
            int count,

            @Schema(description = "How many of them someone else added in the last week")
            int fresh,

            @Schema(nullable = true) String coverUrl,

            @Schema(description = "Who added what you see in it, the one who added most first, three at most")
            List<PersonBrief> contributors,

            @Schema(description = "True when everyone in the circle may put things into it")
            boolean everyoneAdds,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    public record NewAlbum(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Give the album a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 80, message = "Keep those words to 80 characters or fewer.")
            String note,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(
                    description =
                            "Someone in the circle, a pet too: the album then fills itself with every photo and video they are in")
            UUID personId,

            @Schema(description = "True for a folder of files")
            Boolean folder,

            @Schema(description = "Things to put into it straight away")
            @Size(max = LibraryService.MAX_SELECTED, message = "Start with 500 at most.")
            List<UUID> itemIds,

            @Schema(description = "A photo: everything in its moment that you may see goes into the album")
            UUID momentOf) {}

    public record AlbumChange(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 80, message = "Keep those words to 80 characters or fewer.")
            String note,

            @Schema(description = "A photo to show on its card")
            UUID coverItemId,

            @Schema(description = "True to go back to showing its newest photo")
            Boolean removeCover) {}

    public record Selection(
            @NotEmpty(message = "Choose what to add.")
            @Size(max = LibraryService.MAX_SELECTED, message = "Choose 500 at a time at most.")
            List<@NotNull UUID> itemIds) {}

    private final AlbumStore albums;
    private final LibraryStore library;
    private final LibraryService items;
    private final ThingService things;
    private final ThingStore thingStore;
    private final CircleService circles;
    private final MemberStore members;
    private final MediaService media;

    AlbumService(
            AlbumStore albums,
            LibraryStore library,
            LibraryService items,
            ThingService things,
            ThingStore thingStore,
            CircleService circles,
            MemberStore members,
            MediaService media) {
        this.albums = albums;
        this.library = library;
        this.items = items;
        this.things = things;
        this.thingStore = thingStore;
        this.circles = circles;
        this.members = members;
        this.media = media;
    }

    @Transactional
    public AlbumResponse create(UUID me, NewAlbum album) {
        circles.require(album.circleId(), me);
        boolean folder = Boolean.TRUE.equals(album.folder());
        UUID person = null;
        if (album.personId() != null) {
            if (folder) {
                throw ApiProblem.badRequest("invalid_album", "A folder is filled by hand.");
            }
            person = members.find(album.personId())
                    .filter(m -> m.circleId().equals(album.circleId()))
                    .map(MemberRow::id)
                    .orElseThrow(() -> ApiProblem.badRequest("not_in_circle", "Choose someone from this circle."));
        }
        UUID id =
                things.create(me, album.circleId(), ThingKind.ALBUM, album.title(), album.audience(), album.clientId());
        if (things.require(id, me).kind() != ThingKind.ALBUM) {
            throw ApiProblem.conflict("sent_before", "That was added before as something else. Try again.");
        }
        if (thingStore.isNew(id, "albums")) {
            albums.insert(
                    id,
                    album.note() == null ? "" : album.note().trim(),
                    person == null ? AlbumOrigin.HAND : AlbumOrigin.PERSON,
                    person,
                    folder);
            if (person == null) {
                List<UUID> start = new ArrayList<>(album.itemIds() == null ? List.of() : album.itemIds());
                if (album.momentOf() != null) {
                    Item anchor = items.requireItem(album.momentOf(), me);
                    Moment moment = Moments.of(
                            anchor.id(), items.momentsOf(anchor.thing().circleId(), me, List.of(anchor)));
                    if (moment != null) {
                        moment.shots().stream().map(Shot::id).forEach(start::add);
                    }
                }
                albums.add(
                        id,
                        album.circleId(),
                        start.stream().distinct().toList(),
                        circles.me(album.circleId(), me).id(),
                        me);
            }
        }
        return get(id, me);
    }

    public AlbumResponse get(UUID id, UUID me) {
        ThingRow row = things.require(id, me, ThingKind.ALBUM);
        return views(row.circleId(), me, List.of(new Album(row, details(id)))).get(0);
    }

    private AlbumRow details(UUID id) {
        return albums.find(id).orElseThrow(ThingService::notFound);
    }

    @Transactional
    public AlbumResponse change(UUID id, UUID me, AlbumChange change) {
        ThingRow row = things.requireEdit(id, me, ThingKind.ALBUM);
        AlbumRow details = details(id);
        UUID cover = Boolean.TRUE.equals(change.removeCover()) ? null : details.coverItemId();
        if (change.coverItemId() != null) {
            Item chosen = items.requireItem(change.coverItemId(), me);
            if (!chosen.thing().circleId().equals(row.circleId()) || chosen.pictureKey() == null) {
                throw ApiProblem.badRequest("invalid_cover", "Choose a photo from this circle's Library.");
            }
            cover = chosen.id();
        }
        albums.update(id, change.note() == null ? details.note() : change.note().trim(), cover);
        thingStore.retitle(
                id, change.title() == null ? row.title() : change.title().trim());
        return get(id, me);
    }

    /** The albums of a circle under one tab, last changed first. */
    public Page<AlbumResponse> list(UUID circleId, UUID me, AlbumTab tab, Keyset page) {
        circles.require(circleId, me);
        List<Album> rows = albums.list(circleId, me, tab, false, page);
        return page.page(
                        rows,
                        album -> Keyset.cursor(
                                album.thing().updatedAt(), album.thing().id()))
                .map(shown -> views(circleId, me, shown));
    }

    /** The folders of files in a circle that this person may see. A hundred at most. */
    List<AlbumResponse> folders(UUID circleId, UUID me) {
        return views(circleId, me, albums.list(circleId, me, null, true, Keyset.first(99)));
    }

    /**
     * Puts things into an album made by hand. Whoever may change the album can, with anything of the circle's
     * Library they may see; the others in the album still see only what is shared with them.
     */
    @Transactional
    public SelectResult add(UUID id, UUID me, List<UUID> itemIds) {
        ThingRow row = byHand(id, me);
        List<UUID> chosen = itemIds.stream().distinct().toList();
        int applied = albums.add(
                id, row.circleId(), chosen, circles.me(row.circleId(), me).id(), me);
        if (applied > 0) {
            thingStore.touch(id);
        }
        return new SelectResult(applied, chosen.size() - applied);
    }

    @Transactional
    public void remove(UUID id, UUID me, UUID itemId) {
        byHand(id, me);
        albums.remove(id, itemId);
        thingStore.touch(id);
    }

    private ThingRow byHand(UUID id, UUID me) {
        ThingRow row = things.requireEdit(id, me, ThingKind.ALBUM);
        if (details(id).origin() != AlbumOrigin.HAND) {
            throw ApiProblem.badRequest(
                    "fills_itself", "This album fills itself. Say who is in a photo and it shows up here.");
        }
        return row;
    }

    /** The albums in which someone else added something lately, the one with most news first. */
    List<AlbumResponse> withNews(UUID circleId, UUID me, int limit) {
        return views(circleId, me, albums.list(circleId, me, null, false, Keyset.first(99))).stream()
                .filter(album -> album.fresh() > 0)
                .sorted(Comparator.comparingInt(AlbumResponse::fresh).reversed())
                .limit(limit)
                .toList();
    }

    /** Albums as the app shows them: each counted, and given a cover, from what this viewer may see. */
    private List<AlbumResponse> views(UUID circleId, UUID me, List<Album> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        UUID mine = circles.me(circleId, me).id();
        Map<UUID, PersonBrief> people = items.people(circleId);
        Map<UUID, AudienceChip> chips =
                things.chips(rows.stream().map(Album::thing).toList());
        Map<UUID, List<Share>> shares =
                albums.shares(rows.stream().map(a -> a.thing().id()).toList(), me, mine, FRESH_DAYS).stream()
                        .collect(Collectors.groupingBy(Share::albumId));

        // A cover chosen by hand is shown to those who may see that photo; everyone else gets the newest they may see.
        Map<UUID, UUID> newest = new HashMap<>();
        shares.forEach((albumId, parts) -> parts.stream()
                .max(Comparator.comparing(Share::newestTaken).thenComparing(Share::newestId))
                .ifPresent(part -> newest.put(albumId, part.newestId())));
        List<UUID> wanted = new ArrayList<>(newest.values());
        rows.stream()
                .map(a -> a.details().coverItemId())
                .filter(Objects::nonNull)
                .forEach(wanted::add);
        Map<UUID, Item> covers = library.items(wanted.stream().distinct().toList(), me, mine).stream()
                .collect(Collectors.toMap(Item::id, Function.identity()));

        return rows.stream()
                .map(album -> {
                    ThingRow thing = album.thing();
                    AlbumRow details = album.details();
                    List<Share> parts = shares.getOrDefault(thing.id(), List.of());
                    Item cover = covers.get(details.coverItemId());
                    if (cover == null || cover.pictureKey() == null) {
                        cover = covers.get(newest.get(thing.id()));
                    }
                    return new AlbumResponse(
                            thing.id(),
                            thing.circleId(),
                            thing.title(),
                            details.note(),
                            details.origin(),
                            details.personId() == null ? null : people.get(details.personId()),
                            details.folder(),
                            parts.stream().mapToInt(Share::count).sum(),
                            parts.stream().mapToInt(Share::fresh).sum(),
                            cover == null ? null : media.urlFor(cover.pictureKey(), MediaSize.MEDIUM),
                            parts.stream()
                                    .sorted(Comparator.comparingInt(Share::count)
                                            .reversed())
                                    .map(part -> people.get(part.addedBy()))
                                    .filter(Objects::nonNull)
                                    .limit(3)
                                    .toList(),
                            details.origin() == AlbumOrigin.HAND
                                    && thing.audience() == Audience.CIRCLE
                                    && thing.everyoneEdits(),
                            thing.updatedAt(),
                            thing.mine(),
                            thing.canEdit(),
                            chips.get(thing.id()));
                })
                .toList();
    }
}
