package app.homeport.api.notes;

import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.folder.FolderStore.Counts;
import app.homeport.api.folder.People;
import app.homeport.api.list.ChecklistService.ListHand;
import app.homeport.api.list.ChecklistStore;
import app.homeport.api.list.ChecklistStore.HandRow;
import app.homeport.api.list.ChecklistStore.Tally;
import app.homeport.api.notes.NotesStore.Extra;
import app.homeport.api.notes.NotesStore.Filed;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What the Notes screens list: the home of Notes (spaces, pins, what changed lately), what is in a folder,
 * what isn't filed, and what can be put on a page as a live block.
 */
@Service
public class NotesService {

    static final int MAX_PINNED = 20;
    static final int RECENT = 10;

    /**
     * One row of a folder, of the pins or of "lately": a page, a list, a folder, or a thing from another place
     * that was filed here (a sheet). What every thing has, and what Notes knows on top.
     */
    public record NoteItem(
            UUID id,
            UUID circleId,
            ThingKind kind,
            Place place,
            String title,
            String emoji,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip,

            @Schema(nullable = true, description = "Where it stands, in a few words: 4 of 9 done, €12,400")
            String glance,

            @Schema(nullable = true, description = "For a page or a list: who changed it last")
            PersonBrief editedBy,

            @Schema(nullable = true) Instant editedAt,

            @Schema(nullable = true, description = "For a list: how many lines are left, of those you may see")
            Integer left,

            @Schema(nullable = true, description = "For a list: how many lines are ticked")
            Integer done,

            @Schema(description = "For a list: who else is in it right now")
            List<ListHand> here,

            @Schema(nullable = true, description = "For a folder: how many folders are inside it that you may see")
            Integer folders,

            @Schema(
                    nullable = true,
                    description = "For a folder: how many pages and lists are inside it that you may see")
            Integer pages,

            @Schema(description = "True when you pinned it") boolean pinned) {}

    public record NotesHome(
            @Schema(description = "The circle's spaces that you may see, in their order. A hundred at most.")
            List<FolderResponse> spaces,

            @Schema(description = "What you pinned, in the order you pinned it. Twenty at most.")
            List<NoteItem> pinned,

            @Schema(description = "The ten pages and lists that changed last")
            List<NoteItem> recent,

            @Schema(description = "How many pages and lists aren't filed in any folder you may see")
            int unfiled) {}

    private final NotesStore store;
    private final ThingService things;
    private final ThingStore thingStore;
    private final CircleService circles;
    private final FolderService folders;
    private final ChecklistStore lists;
    private final People people;

    NotesService(
            NotesStore store,
            ThingService things,
            ThingStore thingStore,
            CircleService circles,
            FolderService folders,
            ChecklistStore lists,
            People people) {
        this.store = store;
        this.things = things;
        this.thingStore = thingStore;
        this.circles = circles;
        this.folders = folders;
        this.lists = lists;
        this.people = people;
    }

    /** The home of Notes for one circle. The first time anyone opens it, the circle's starter spaces are made. */
    @Transactional
    public NotesHome home(UUID circleId, UUID me) {
        List<FolderResponse> spaces = folders.spaces(circleId, me);
        return new NotesHome(
                spaces,
                items(store.pinned(circleId, me, MAX_PINNED), me),
                items(store.recent(circleId, me, RECENT), me),
                store.countUnfiled(circleId, me));
    }

    /** What is in a space or folder that this person may see, in the order people gave it. */
    public Page<NoteItem> inFolder(UUID folderId, UUID me, Keyset page) {
        things.require(folderId, me, ThingKind.FOLDER);
        return page.page(
                        store.children(folderId, me, page),
                        row -> Keyset.cursor(row.position(), row.thing().id()))
                .map(shown -> items(shown.stream().map(Filed::thing).toList(), me));
    }

    /** The pages and lists that aren't filed, for this person, last changed first. */
    public Page<NoteItem> unfiled(UUID circleId, UUID me, Keyset page) {
        circles.require(circleId, me);
        return page.page(store.unfiled(circleId, me, page), row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> items(shown, me));
    }

    /**
     * What can be put on a page as a live block: the circle's things this person may see, of one kind or of
     * any, with words from the title. The block picker searches here.
     */
    public Page<ThingBrief> linkable(UUID circleId, UUID me, ThingKind kind, String words, Keyset page) {
        circles.require(circleId, me);
        return page.page(
                        thingStore.list(circleId, me, kind, null, words, page),
                        row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> things.briefs(shown, me));
    }

    /**
     * Rows for things the viewer may see (the caller read them with the sharing rule). Everything Notes adds
     * is asked for once for the whole list, however long it is.
     */
    private List<NoteItem> items(List<ThingRow> rows, UUID me) {
        if (rows.isEmpty()) {
            return List.of();
        }
        UUID circleId = rows.get(0).circleId();
        List<UUID> ids = rows.stream().map(ThingRow::id).toList();
        List<UUID> listIds = ids(rows, ThingKind.CHECKLIST);
        Map<UUID, ThingBrief> briefs =
                things.briefs(rows, me).stream().collect(Collectors.toMap(ThingBrief::id, b -> b));
        Map<UUID, Extra> extras = store.extras(ids);
        Map<UUID, PersonBrief> who = people.of(circleId);
        UUID mine = circles.me(circleId, me).id();
        Map<UUID, Tally> tallies = lists.tallies(listIds, me);
        Map<UUID, List<HandRow>> hands = lists.hands(listIds).stream().collect(Collectors.groupingBy(HandRow::listId));
        Map<UUID, Counts> inside = folders.counts(ids(rows, ThingKind.FOLDER), me);
        Set<UUID> pinned = folders.pinnedAmong(ids, me);
        return rows.stream()
                .map(row -> {
                    ThingBrief brief = briefs.get(row.id());
                    Extra extra = extras.getOrDefault(row.id(), new Extra("", null, null));
                    boolean list = row.kind() == ThingKind.CHECKLIST;
                    boolean folder = row.kind() == ThingKind.FOLDER;
                    Tally tally = tallies.getOrDefault(row.id(), new Tally(0, 0));
                    Counts counts = inside.getOrDefault(row.id(), new Counts(0, 0));
                    return new NoteItem(
                            row.id(),
                            row.circleId(),
                            row.kind(),
                            row.place(),
                            row.title(),
                            extra.emoji(),
                            row.updatedAt(),
                            row.mine(),
                            row.canEdit(),
                            brief.chip(),
                            brief.glance(),
                            extra.editedBy() == null ? null : who.get(extra.editedBy()),
                            extra.editedAt(),
                            list ? tally.left() : null,
                            list ? tally.done() : null,
                            hands.getOrDefault(row.id(), List.of()).stream()
                                    .filter(h -> !h.memberId().equals(mine) && who.containsKey(h.memberId()))
                                    .map(h -> new ListHand(who.get(h.memberId()), h.did(), h.at()))
                                    .toList(),
                            folder ? counts.folders() : null,
                            folder ? counts.pages() : null,
                            pinned.contains(row.id()));
                })
                .toList();
    }

    private static List<UUID> ids(List<ThingRow> rows, ThingKind kind) {
        return rows.stream().filter(r -> r.kind() == kind).map(ThingRow::id).toList();
    }
}
