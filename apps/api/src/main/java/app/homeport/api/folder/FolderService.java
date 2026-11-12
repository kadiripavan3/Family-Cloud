package app.homeport.api.folder;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.folder.FolderStore.Counts;
import app.homeport.api.folder.FolderStore.FolderRow;
import app.homeport.api.folder.FolderStore.Gap;
import app.homeport.api.folder.FolderStore.Spot;
import app.homeport.api.folder.FolderStore.Step;
import app.homeport.api.folder.StarterSpaces.Starter;
import app.homeport.api.thing.Access;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.Hidden;
import app.homeport.api.thing.ThingService.PersonAccess;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.HideRow;
import app.homeport.api.thing.ThingStore.ShareRow;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Spaces and folders: where things are filed. A space is a folder at the top. A folder is a thing, so it is
 * shared, hidden and deleted like every other thing; but its audience is only about the folder itself. Who
 * sees a page is decided by the page, wherever it is filed (see the top of V30__notes.sql).
 */
@Service
public class FolderService {

    static final int MAX_DEPTH = 50;
    static final int MAX_PINS = 20;
    static final int MAX_SHARED_AT_ONCE = 500;

    /** One step of "Home / House manual". */
    public record Crumb(UUID id, String title, String emoji) {}

    /** Where a thing is filed, as far as the viewer may see. */
    public record Filing(
            @Schema(nullable = true, description = "The folder it is in. Null when it isn't filed, for you.")
            UUID folderId,

            @Schema(description = "The way to it from its space: Home, House manual. Empty when it isn't filed.")
            List<Crumb> breadcrumb) {}

    public record FolderResponse(
            UUID id,
            UUID circleId,
            String title,
            String emoji,

            @Schema(description = "True for a space: a folder at the top (or one whose parent you can't see)")
            boolean space,

            @Schema(nullable = true, description = "The folder it is in. Null for a space.")
            UUID parentId,

            @Schema(description = "The folders above it, from its space down. Empty for a space.")
            List<Crumb> breadcrumb,

            Instant updatedAt,
            boolean mine,

            @Schema(description = "True when you may rename it, put things into it and change their order")
            boolean canEdit,

            AudienceChip chip,

            @Schema(description = "How many folders are inside it, at any depth, that you may see")
            int folders,

            @Schema(
                    description =
                            "How many pages, lists and other things are inside it, at any depth, that you may see")
            int pages,

            @Schema(description = "True when you pinned it") boolean pinned) {}

    /** What "share everything in it" did. */
    public record SharedInside(
            @Schema(description = "How many things inside now have the folder's audience")
            int changed,

            @Schema(description = "How many things inside you can see but aren't yours to share")
            int notYours) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final FolderStore store;
    private final CircleService circles;
    private final MemberStore members;

    FolderService(
            ThingService things, ThingStore thingStore, FolderStore store, CircleService circles, MemberStore members) {
        this.things = things;
        this.thingStore = thingStore;
        this.store = store;
        this.circles = circles;
        this.members = members;
    }

    // ---------- reading ----------

    public FolderResponse get(UUID id, UUID me) {
        FolderRow row = store.find(id, me).orElseThrow(ThingService::notFound);
        return views(List.of(row), me, true).get(0);
    }

    /** What stands at the top of a circle's Notes for this person. Makes the starter spaces the first time. */
    @Transactional
    public List<FolderResponse> spaces(UUID circleId, UUID me) {
        start(circles.require(circleId, me), me);
        return views(store.top(circleId, me), me, false);
    }

    private List<FolderResponse> views(List<FolderRow> rows, UUID me, boolean withBreadcrumb) {
        List<UUID> ids = rows.stream().map(r -> r.thing().id()).toList();
        Map<UUID, Counts> counts = store.counts(ids, me);
        Map<UUID, AudienceChip> chips =
                things.chips(rows.stream().map(FolderRow::thing).toList());
        Set<UUID> pinned = store.pinnedAmong(ids, me);
        return rows.stream()
                .map(r -> {
                    ThingRow t = r.thing();
                    Counts inside = counts.getOrDefault(t.id(), new Counts(0, 0));
                    return new FolderResponse(
                            t.id(),
                            t.circleId(),
                            t.title(),
                            r.emoji(),
                            r.parentId() == null,
                            r.parentId(),
                            withBreadcrumb ? breadcrumb(t.id(), me) : List.of(),
                            t.updatedAt(),
                            t.mine(),
                            t.canEdit(),
                            chips.get(t.id()),
                            inside.folders(),
                            inside.pages(),
                            pinned.contains(t.id()));
                })
                .toList();
    }

    /** How many folders and other things each of these folders holds for this person. */
    public Map<UUID, Counts> counts(List<UUID> folderIds, UUID me) {
        return store.counts(folderIds, me);
    }

    /**
     * The way to a thing from its space, for this person: the folders above it that they may see, starting
     * from the nearest. One they may not see ends the way there; with the nearest one unseen, the thing
     * isn't filed for them.
     */
    public List<Crumb> breadcrumb(UUID thingId, UUID me) {
        List<Crumb> way = new ArrayList<>();
        for (Step step : store.above(thingId, me)) {
            if (!step.seen()) {
                break;
            }
            way.add(0, new Crumb(step.id(), step.title(), step.emoji()));
        }
        return way;
    }

    public Filing where(UUID thingId, UUID me) {
        things.require(thingId, me);
        List<Crumb> way = breadcrumb(thingId, me);
        return new Filing(way.isEmpty() ? null : way.get(way.size() - 1).id(), way);
    }

    // ---------- making and changing ----------

    /**
     * Makes a space (no parent) or a folder inside another. It starts as everything in the circle does: yours
     * alone in a family, shared among equals. Sharing the folder shares the shelf, not what is put on it.
     */
    @Transactional
    public FolderResponse create(
            UUID me, UUID circleId, UUID parentId, String title, String emoji, Audience audience, UUID clientId) {
        if (parentId != null) {
            ThingRow parent = things.requireEdit(parentId, me, ThingKind.FOLDER);
            if (!parent.circleId().equals(circleId)) {
                throw otherCircle();
            }
            if (store.chain(parentId).size() >= MAX_DEPTH) {
                throw tooDeep();
            }
        }
        UUID id = things.create(me, circleId, ThingKind.FOLDER, title, audience, clientId);
        if (thingStore.isNew(id, "folders")) {
            store.insert(id, clean(emoji));
            store.put(id, parentId, store.end(parentId));
        }
        return get(id, me);
    }

    @Transactional
    public FolderResponse change(UUID id, UUID me, String title, String emoji) {
        ThingRow row = things.requireEdit(id, me, ThingKind.FOLDER);
        if (emoji != null) {
            store.setEmoji(id, clean(emoji));
        }
        thingStore.retitle(id, title == null ? row.title() : title.trim());
        return get(id, me);
    }

    private static String clean(String emoji) {
        return emoji == null ? "" : emoji.trim();
    }

    /**
     * Makes the spaces a circle of this kind begins with, once. They belong to the circle's owner and are
     * shared from the start (a space only shares the shelf: a page put on it is still its writer's until they
     * share it). "Kids" in a family is for the adults.
     */
    private void start(CircleRow circle, UUID me) {
        List<Starter> starters = StarterSpaces.of(circle.kind());
        if (starters.isEmpty() || !store.claimStart(circle.id())) {
            return;
        }
        List<MemberRow> people = members.of(List.of(circle.id()));
        MemberRow owner = people.stream()
                .filter(m -> m.role() == Role.OWNER)
                .findFirst()
                .orElseGet(() -> circles.me(circle.id(), me));
        List<MemberRow> otherAdults = people.stream()
                .filter(m -> m.grownUp() && m.kind() == MemberKind.PERSON && !m.id().equals(owner.id()))
                .toList();
        for (Starter starter : starters) {
            boolean everyone = starter.audience() == StarterSpaces.For.EVERYONE;
            Audience audience = everyone ? Audience.CIRCLE : otherAdults.isEmpty() ? Audience.ME : Audience.SOME;
            UUID id = thingStore.insert(circle.id(), owner.id(), ThingKind.FOLDER, starter.name(), audience, null);
            store.insert(id, starter.emoji());
            store.put(id, null, store.end(null));
            if (audience == Audience.SOME) {
                otherAdults.forEach(adult -> thingStore.share(id, adult.id(), true));
            }
        }
    }

    // ---------- filing ----------

    /**
     * Files a thing that was just made at the end of a folder. Whoever may change the folder can put things
     * into it; the thing keeps its own audience.
     */
    public void fileNew(UUID thingId, UUID circleId, UUID folderId, UUID me) {
        ThingRow folder = requireRoomIn(folderId, me);
        if (!folder.circleId().equals(circleId)) {
            throw otherCircle();
        }
        store.put(thingId, folderId, store.end(folderId));
    }

    /**
     * Moves a thing: into a folder, out of one (folderId null; a folder then becomes a space), or to another
     * place in the order of where it already is. Putting a thing somewhere else takes the right to change
     * the thing and the folder it goes into; changing the order inside a folder takes the right to change
     * that folder. Any kind of thing can be filed.
     *
     * @param afterId the thing it should come just after; when that one isn't there (any more) it goes to the end
     */
    @Transactional
    public Filing file(UUID thingId, UUID me, UUID folderId, UUID afterId, boolean atStart) {
        ThingRow thing = things.require(thingId, me);
        Optional<Spot> spot = store.spot(thingId);
        boolean staying = spot.isPresent() && Objects.equals(spot.get().folderId(), folderId);
        if (folderId != null) {
            ThingRow folder = requireRoomIn(folderId, me);
            if (!folder.circleId().equals(thing.circleId())) {
                throw otherCircle();
            }
        }
        if ((!staying || folderId == null) && !thing.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        if (staying && afterId == null && !atStart) {
            return where(thingId, me);
        }
        if (thing.kind() == ThingKind.FOLDER && !staying) {
            store.oneMoveAtATime(thing.circleId());
            if (folderId != null) {
                List<UUID> above = store.chain(folderId);
                if (above.contains(thingId)) {
                    throw ApiProblem.badRequest("inside_itself", "A folder can't go inside itself.");
                }
                if (above.size() >= MAX_DEPTH) {
                    throw tooDeep();
                }
            }
        }
        store.put(thingId, folderId, position(folderId, afterId, atStart, thingId));
        return where(thingId, me);
    }

    private ThingRow requireRoomIn(UUID folderId, UUID me) {
        ThingRow folder = things.require(folderId, me, ThingKind.FOLDER);
        if (!folder.canEdit()) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN, "view_only", "You can look into that folder, but not change what is in it.");
        }
        return folder;
    }

    private double position(UUID folderId, UUID afterId, boolean atStart, UUID moving) {
        if (atStart) {
            return store.start(folderId);
        }
        if (afterId == null || afterId.equals(moving)) {
            return store.end(folderId);
        }
        Optional<Gap> gap = store.gapAfter(folderId, afterId, moving);
        if (gap.isPresent()
                && gap.get().to() != null
                && gap.get().to() - gap.get().from() < 1e-9) {
            // So much was put between the same two things that no number is left between them.
            store.respace(folderId);
            gap = store.gapAfter(folderId, afterId, moving);
        }
        return gap.map(g -> g.to() == null ? g.from() + 1 : (g.from() + g.to()) / 2)
                .orElseGet(() -> store.end(folderId));
    }

    private static ApiProblem otherCircle() {
        return ApiProblem.badRequest("other_circle", "That folder is in another circle.");
    }

    private static ApiProblem tooDeep() {
        return ApiProblem.conflict("too_deep", "Folders go 50 deep at most. Put this one a little higher up.");
    }

    // ---------- share everything in it ----------

    /**
     * Gives everything inside a folder the folder's own audience, at any depth: each page, list and folder in
     * it that is this person's to share. Afterwards each of them carries that audience itself, exactly as if
     * its owner had set it by hand; nothing ties them to the folder. Things inside that belong to someone
     * else are left alone and counted.
     */
    @Transactional
    public SharedInside shareInside(UUID folderId, UUID me) {
        ThingRow folder = things.require(folderId, me, ThingKind.FOLDER);
        int changed = 0;
        int notYours = 0;
        for (ThingRow inside : store.inside(folderId, me, MAX_SHARED_AT_ONCE)) {
            if (inside.mine()) {
                shareLike(folder, inside, me);
                changed++;
            } else {
                notYours++;
            }
        }
        return new SharedInside(changed, notYours);
    }

    /**
     * Gives one thing (which must be this person's own) the audience another thing has now: the same choice
     * of only you, some people or everyone, the same people by name, hidden from the same people. Whoever
     * owns the other thing is among "some people" too. It is a copy made once, through the one way there is
     * to share a thing.
     */
    @Transactional
    public void shareLike(ThingRow like, ThingRow mine, UUID me) {
        Set<UUID> canBeNamed = members.of(List.of(mine.circleId())).stream()
                .filter(m -> m.kind() != MemberKind.PET && !m.id().equals(mine.ownerId()))
                .map(MemberRow::id)
                .collect(Collectors.toSet());
        List<PersonAccess> people = new ArrayList<>();
        List<Hidden> hidden = new ArrayList<>();
        if (like.audience() != Audience.ME) {
            for (ShareRow share : thingStore.shares(List.of(like.id()))) {
                if (canBeNamed.contains(share.memberId())) {
                    people.add(new PersonAccess(share.memberId(), share.canEdit() ? Access.EDIT : Access.VIEW));
                }
            }
            if (like.audience() == Audience.SOME && canBeNamed.contains(like.ownerId())) {
                people.add(new PersonAccess(like.ownerId(), Access.EDIT));
            }
            for (HideRow hide : thingStore.hides(List.of(like.id()))) {
                if (hide.today() && canBeNamed.contains(hide.memberId())) {
                    hidden.add(new Hidden(hide.memberId(), hide.through()));
                }
            }
        }
        Audience audience = like.audience() == Audience.SOME && people.isEmpty() ? Audience.ME : like.audience();
        things.share(mine.id(), me, new AudienceChange(audience, like.everyoneEdits(), people, hidden));
    }

    // ---------- pins ----------

    /** Pins a thing for this person only. Pinning what is pinned is fine. */
    @Transactional
    public void pin(UUID thingId, UUID me) {
        ThingRow thing = things.require(thingId, me);
        UUID mine = circles.me(thing.circleId(), me).id();
        if (!pinned(thingId, me) && store.pins(mine) >= MAX_PINS) {
            throw ApiProblem.conflict("too_many_pins", "You can pin 20 things at most. Unpin one first.");
        }
        store.pin(mine, thingId);
    }

    @Transactional
    public void unpin(UUID thingId, UUID me) {
        ThingRow thing = things.require(thingId, me);
        store.unpin(circles.me(thing.circleId(), me).id(), thingId);
    }

    public boolean pinned(UUID thingId, UUID me) {
        return !store.pinnedAmong(List.of(thingId), me).isEmpty();
    }

    public Set<UUID> pinnedAmong(List<UUID> thingIds, UUID me) {
        return store.pinnedAmong(thingIds, me);
    }
}
