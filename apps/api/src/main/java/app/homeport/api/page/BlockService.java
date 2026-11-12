package app.homeport.api.page;

import app.homeport.api.circle.CircleService;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.People;
import app.homeport.api.list.ChangeOp;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.NewList;
import app.homeport.api.list.Outcome;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaService.MediaResponse;
import app.homeport.api.media.MediaStore;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.page.BlockStore.BlockRow;
import app.homeport.api.page.BlockStore.Gap;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The blocks of a page. Each is added, changed, moved and removed by itself, so two people writing on one
 * page both keep what they did: the block is the unit, not the letter (two people in the same block at the
 * same moment, and the later one wins that block). Adding carries a clientId, so sending it twice adds one;
 * a phone that had no signal sends what it kept in one go ({@link #changes}).
 *
 * <p>After every change the page's plain words (pages.body) are written again from its blocks, so the search
 * inside pages and what a guest reads never fall behind.
 */
@Service
public class BlockService {

    static final int MAX_BLOCKS = 500;
    static final int MAX_WORDS = 100000;
    static final int MAX_CHANGES = 200;

    public record BlockResponse(
            UUID id,
            BlockKind kind,

            @Schema(description = "The words: of a text block, under a photo or a file, or naming a place")
            String text,

            @Schema(description = "For text: what is bold, a link or a name, as ranges over the text")
            List<Mark> marks,

            @Schema(
                    nullable = true,
                    description = "For a list or a live block: the thing it shows, as it stands now. Null when you"
                            + " may not see it.")
            ThingBrief thing,

            @Schema(
                    nullable = true,
                    description = "For a list you may see: the list with its lines, to draw and tick here")
            ChecklistResponse checklist,

            @Schema(description = "True when it shows something you can't see: draw a quiet placeholder, nothing more")
            boolean unseen,

            @Schema(nullable = true, description = "For a photo or a file")
            MediaResponse media,

            @Schema(nullable = true) Double lat,
            @Schema(nullable = true) Double lng,
            Instant updatedAt) {}

    /** A block to add. Which fields matter depends on its kind. */
    public record NewBlock(
            BlockKind kind,
            String text,
            List<Mark> marks,
            UUID after,
            Boolean atStart,
            UUID thingId,
            UUID mediaId,
            Double lat,
            Double lng,
            String title,
            List<String> items) {}

    public record BlockChange(
            BlockKind kind,
            String text,
            List<Mark> marks,
            Double lat,
            Double lng,
            Boolean removePoint,
            UUID after,
            Boolean atStart) {}

    /** One change from a queue a phone kept while it had no signal. */
    public record QueuedBlockChange(ChangeOp op, UUID clientId, UUID blockId, NewBlock add, BlockChange change) {}

    public record BlockAnswer(
            Outcome outcome,

            @Schema(nullable = true, description = "The block it was about, when there is one")
            UUID blockId,

            @Schema(nullable = true, description = "What happened, in a sentence, when it wasn't simply done")
            String said) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final BlockStore blocks;
    private final PageStore pages;
    private final CircleService circles;
    private final People people;
    private final ChecklistService lists;
    private final FolderService folders;
    private final MediaService media;
    private final MediaStore mediaStore;
    private final TransactionTemplate transaction;

    BlockService(
            ThingService things,
            ThingStore thingStore,
            BlockStore blocks,
            PageStore pages,
            CircleService circles,
            People people,
            ChecklistService lists,
            FolderService folders,
            MediaService media,
            MediaStore mediaStore,
            TransactionTemplate transaction) {
        this.things = things;
        this.thingStore = thingStore;
        this.blocks = blocks;
        this.pages = pages;
        this.circles = circles;
        this.people = people;
        this.lists = lists;
        this.folders = folders;
        this.media = media;
        this.mediaStore = mediaStore;
        this.transaction = transaction;
    }

    // ---------- reading ----------

    /** The blocks of a page as this person is shown them. The caller has checked that they may see the page. */
    public List<BlockResponse> of(UUID pageId, UUID me) {
        return views(blocks.of(pageId), me);
    }

    private BlockResponse view(BlockRow block, UUID me) {
        return views(List.of(block), me).get(0);
    }

    /**
     * What a block points at is asked for once, with the one rule about who may see a thing: a list or a
     * live thing this person may not see comes back as "unseen" and nothing else, not even its name.
     */
    private List<BlockResponse> views(List<BlockRow> rows, UUID me) {
        List<UUID> thingIds = rows.stream()
                .map(BlockRow::thingId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, ThingBrief> seen = things.briefs(thingStore.findAll(thingIds, me), me).stream()
                .collect(Collectors.toMap(ThingBrief::id, Function.identity()));
        Map<UUID, MediaRow> files =
                mediaStore
                        .findAll(rows.stream()
                                .map(BlockRow::mediaId)
                                .filter(Objects::nonNull)
                                .distinct()
                                .toList())
                        .stream()
                        .collect(Collectors.toMap(MediaRow::id, Function.identity()));
        return rows.stream()
                .map(b -> {
                    ThingBrief thing = b.thingId() == null ? null : seen.get(b.thingId());
                    MediaRow file = b.mediaId() == null ? null : files.get(b.mediaId());
                    return new BlockResponse(
                            b.id(),
                            b.kind(),
                            b.text(),
                            b.marks(),
                            thing,
                            b.kind() == BlockKind.CHECKLIST && thing != null
                                    ? lists.find(thing.id(), me).orElse(null)
                                    : null,
                            b.thingId() != null && thing == null,
                            file == null ? null : media.view(file),
                            b.lat(),
                            b.lng(),
                            b.updatedAt());
                })
                .toList();
    }

    // ---------- one block at a time ----------

    @Transactional
    public BlockResponse add(UUID pageId, UUID me, NewBlock block, UUID clientId) {
        ThingRow page = things.requireEdit(pageId, me, ThingKind.PAGE);
        Optional<BlockRow> sentBefore = clientId == null ? Optional.empty() : blocks.sentBefore(pageId, clientId);
        if (sentBefore.isPresent()) {
            return view(sentBefore.get(), me);
        }
        if (block.kind() == null) {
            throw ApiProblem.badRequest("invalid_block", "That isn't a kind of block we know.");
        }
        if (blocks.count(pageId) >= MAX_BLOCKS) {
            throw ApiProblem.conflict("page_full", "A page holds 500 blocks at most. Start another page for the rest.");
        }
        UUID mine = circles.me(page.circleId(), me).id();
        String text = words(block.text());
        List<Mark> marks = List.of();
        UUID thingId = null;
        UUID mediaId = null;
        boolean point = false;
        switch (block.kind()) {
            case PARAGRAPH, HEADING, BULLET -> marks = marks(page, text, block.marks());
            case CHECKLIST -> {
                text = "";
                thingId = block.thingId() == null
                        ? newList(page, me, block, clientId)
                        : shown(page, block.thingId(), me, ThingKind.CHECKLIST).id();
            }
            case LIVE -> {
                text = "";
                thingId = shown(page, block.thingId(), me, null).id();
            }
            case PHOTO -> mediaId = upload(block.mediaId(), me, MediaKind.PHOTO);
            case FILE -> mediaId = upload(block.mediaId(), me, MediaKind.FILE);
            case PLACE -> {
                if (text.isBlank()) {
                    throw ApiProblem.badRequest("no_place", "Write where it is.");
                }
                point = point(block.lat(), block.lng());
            }
        }
        boolean atStart = Boolean.TRUE.equals(block.atStart());
        UUID id = blocks.insert(
                pageId,
                block.kind(),
                text,
                marks,
                thingId,
                mediaId,
                point ? block.lat() : null,
                point ? block.lng() : null,
                position(pageId, block.after(), atStart, null),
                mine,
                clientId);
        edited(page, mine);
        return view(blocks.find(id).orElseThrow(), me);
    }

    @Transactional
    public BlockResponse change(UUID blockId, UUID me, BlockChange change) {
        BlockRow block = blocks.find(blockId).orElseThrow(BlockService::blockGone);
        ThingRow page = pageOf(block, me);
        UUID mine = circles.me(page.circleId(), me).id();
        BlockKind kind = block.kind();
        if (change.kind() != null && change.kind() != kind) {
            if (!kind.isText() || !change.kind().isText()) {
                throw ApiProblem.badRequest("cant_become", "A block of that kind can't become this one.");
            }
            kind = change.kind();
        }
        String text = change.text() == null ? block.text() : words(change.text());
        if (kind == BlockKind.CHECKLIST || kind == BlockKind.LIVE) {
            text = "";
        }
        if (kind == BlockKind.PLACE && text.isBlank()) {
            throw ApiProblem.badRequest("no_place", "Write where it is.");
        }
        // Marks belong to the text they were made for: new words without new marks have none.
        List<Mark> marks = !kind.isText()
                ? List.of()
                : change.marks() != null
                        ? marks(page, text, change.marks())
                        : change.text() == null ? block.marks() : List.of();
        Double lat = block.lat();
        Double lng = block.lng();
        if (kind == BlockKind.PLACE) {
            if (Boolean.TRUE.equals(change.removePoint())) {
                lat = null;
                lng = null;
            } else if (point(change.lat(), change.lng())) {
                lat = change.lat();
                lng = change.lng();
            }
        }
        blocks.change(blockId, kind, text, marks, lat, lng);
        boolean atStart = Boolean.TRUE.equals(change.atStart());
        if (change.after() != null || atStart) {
            blocks.move(blockId, position(block.pageId(), change.after(), atStart, blockId));
        }
        edited(page, mine);
        return view(blocks.find(blockId).orElseThrow(), me);
    }

    /** Removes a block. Removing one that is gone is fine: two people may remove the same block. */
    @Transactional
    public void remove(UUID blockId, UUID me) {
        BlockRow block = blocks.find(blockId).orElse(null);
        if (block == null) {
            return;
        }
        ThingRow page = pageOf(block, me);
        blocks.delete(blockId);
        edited(page, circles.me(page.circleId(), me).id());
    }

    /**
     * The old way of changing a page, all its words at once: its text blocks make way for one paragraph of
     * the new words, at the top. Photos, lists and live blocks stay.
     */
    @Transactional
    public void replaceWords(ThingRow page, String body, UUID mine) {
        blocks.deleteText(page.id());
        if (!body.isBlank()) {
            blocks.insert(
                    page.id(),
                    BlockKind.PARAGRAPH,
                    body,
                    List.of(),
                    null,
                    null,
                    null,
                    null,
                    blocks.start(page.id()),
                    mine,
                    null);
        }
        edited(page, mine);
    }

    /** A page changed: its plain words are written again from its blocks, and it is the latest thing its editor did. */
    void edited(ThingRow page, UUID by) {
        String words = blocks.words(page.id());
        if (words.length() > MAX_WORDS) {
            throw ApiProblem.conflict("page_full", "This page is full. Start another page for the rest.");
        }
        pages.edited(page.id(), words, by);
        thingStore.touch(page.id());
    }

    private ThingRow pageOf(BlockRow block, UUID me) {
        try {
            return things.requireEdit(block.pageId(), me, ThingKind.PAGE);
        } catch (ApiProblem problem) {
            // A block of a page this person may not see isn't there for them either.
            throw problem.status() == HttpStatus.NOT_FOUND ? blockGone() : problem;
        }
    }

    private static String words(String text) {
        String words = text == null ? "" : text;
        if (words.length() > MAX_WORDS) {
            throw ApiProblem.badRequest("too_long", "That is too long for one block.");
        }
        return words;
    }

    private List<Mark> marks(ThingRow page, String text, List<Mark> given) {
        List<Mark> marks = Marks.clean(text, given);
        if (!people.of(page.circleId()).keySet().containsAll(Marks.named(marks))) {
            throw ApiProblem.badRequest("not_in_circle", "Choose someone from this circle.");
        }
        return marks;
    }

    /** True when both parts of a point were given; one without the other can't be put on a map. */
    private static boolean point(Double lat, Double lng) {
        if (lat == null && lng == null) {
            return false;
        }
        if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            throw ApiProblem.badRequest("invalid_point", "That place isn't on the map.");
        }
        return true;
    }

    /** Something to show on a page: in the page's circle, seen by whoever puts it there, and not the page itself. */
    private ThingRow shown(ThingRow page, UUID thingId, UUID me, ThingKind kind) {
        if (thingId == null) {
            throw ApiProblem.badRequest("nothing_chosen", "Choose what to show here.");
        }
        ThingRow thing = things.require(thingId, me);
        if (!thing.circleId().equals(page.circleId())
                || thing.id().equals(page.id())
                || (kind != null && thing.kind() != kind)) {
            throw ApiProblem.badRequest("cant_show", "That can't be shown on this page.");
        }
        return thing;
    }

    /**
     * A list started inside a page. It is a list like any other, made by whoever adds the block, and it
     * starts with the audience the page has at that moment, so whoever reads the page reads it too. From
     * then on it is shared by itself (see {@link #shareLists}).
     */
    private UUID newList(ThingRow page, UUID me, NewBlock block, UUID clientId) {
        String title = block.title() == null || block.title().isBlank()
                ? page.title().isBlank() ? "List" : page.title()
                : block.title().trim();
        UUID listClientId = clientId == null
                ? null
                : UUID.nameUUIDFromBytes(("a list in a page " + clientId).getBytes(StandardCharsets.UTF_8));
        UUID listId = lists.create(
                        me,
                        page.circleId(),
                        new NewList(title, Audience.ME, block.items(), null, null, null, null),
                        listClientId)
                .id();
        folders.shareLike(page, things.require(listId, me, ThingKind.CHECKLIST), me);
        return listId;
    }

    /** An upload for a photo or file block: this person's own, finished, of the right kind, and in no other block. */
    private UUID upload(UUID mediaId, UUID me, MediaKind kind) {
        if (mediaId == null) {
            throw ApiProblem.badRequest("nothing_chosen", "Choose what to show here.");
        }
        media.requireOwn(mediaId, me, kind);
        if (blocks.holds(mediaId)) {
            throw ApiProblem.badRequest("media_in_use", "That file is already on a page. Add it again.");
        }
        return mediaId;
    }

    /** Where a block goes: first, just after another block, or (also when that block is gone) at the end. */
    private double position(UUID pageId, UUID afterId, boolean atStart, UUID moving) {
        if (atStart) {
            return blocks.start(pageId);
        }
        UUID after = afterId == null
                ? null
                : inPage(afterId, pageId).map(BlockRow::id).orElse(null);
        if (after == null || after.equals(moving)) {
            return blocks.end(pageId);
        }
        Optional<Gap> gap = blocks.gapAfter(pageId, after, moving);
        if (gap.isPresent()
                && gap.get().to() != null
                && gap.get().to() - gap.get().from() < 1e-9) {
            // So many blocks were put between the same two that no number is left between them.
            blocks.respace(pageId);
            gap = blocks.gapAfter(pageId, after, moving);
        }
        return gap.map(g -> g.to() == null ? g.from() + 1 : (g.from() + g.to()) / 2)
                .orElseGet(() -> blocks.end(pageId));
    }

    static ApiProblem blockGone() {
        return new ApiProblem(
                HttpStatus.NOT_FOUND, "block_gone", "That part of the page isn't there any more. Someone removed it.");
    }

    // ---------- the lists in a page ----------

    /**
     * Gives the lists drawn in a page the page's audience: each one that is this person's to share. For after
     * a page was shared with someone new, so they can read the lists in it too. A copy made once, like "share
     * everything in it" for a folder; a live block from another place (a bill, a password) is never touched.
     */
    @Transactional
    public FolderService.SharedInside shareLists(UUID pageId, UUID me) {
        ThingRow page = things.require(pageId, me, ThingKind.PAGE);
        List<UUID> listIds = blocks.of(pageId).stream()
                .filter(b -> b.kind() == BlockKind.CHECKLIST)
                .map(BlockRow::thingId)
                .distinct()
                .toList();
        int changed = 0;
        int notYours = 0;
        for (ThingRow list : thingStore.findAll(listIds, me)) {
            if (list.mine()) {
                folders.shareLike(page, list, me);
                changed++;
            } else {
                notYours++;
            }
        }
        return new FolderService.SharedInside(changed, notYours);
    }

    // ---------- changes that waited on a phone ----------

    /**
     * Takes the changes a phone kept while it had no signal, in the order it made them. Each is done by
     * itself and gets its own answer: a change to a block that was removed in the meantime says so, gently,
     * and the rest still go in. Sending the same queue again is safe.
     */
    public List<BlockAnswer> changes(UUID pageId, UUID me, List<QueuedBlockChange> changes) {
        things.requireEdit(pageId, me, ThingKind.PAGE);
        List<BlockAnswer> answers = new ArrayList<>();
        for (QueuedBlockChange change : changes) {
            try {
                answers.add(transaction.execute(status -> apply(pageId, me, change)));
            } catch (ApiProblem problem) {
                answers.add(
                        problem.status() == HttpStatus.NOT_FOUND
                                ? gone(change.blockId())
                                : new BlockAnswer(Outcome.REFUSED, change.blockId(), problem.getMessage()));
            }
        }
        return answers;
    }

    private BlockAnswer apply(UUID pageId, UUID me, QueuedBlockChange change) {
        switch (change.op()) {
            case ADD -> {
                if (change.clientId() == null || change.add() == null) {
                    throw ApiProblem.badRequest("invalid_input", "A block to add needs to say what it is.");
                }
                return new BlockAnswer(
                        Outcome.DONE,
                        add(pageId, me, change.add(), change.clientId()).id(),
                        null);
            }
            case CHANGE -> {
                if (change.blockId() == null || change.change() == null) {
                    throw ApiProblem.badRequest("invalid_input", "A change needs the block it is for.");
                }
                Optional<BlockRow> block = inPage(change.blockId(), pageId);
                if (block.isEmpty()) {
                    return gone(change.blockId());
                }
                change(block.get().id(), me, change.change());
                return new BlockAnswer(Outcome.DONE, block.get().id(), null);
            }
            case REMOVE -> {
                Optional<BlockRow> block =
                        change.blockId() == null ? Optional.empty() : inPage(change.blockId(), pageId);
                block.ifPresent(found -> remove(found.id(), me));
                return new BlockAnswer(Outcome.DONE, block.map(BlockRow::id).orElse(change.blockId()), null);
            }
        }
        throw new IllegalStateException();
    }

    /**
     * A block of this page, named by its id or by the clientId it was added with: a phone that added a block
     * without signal knows it only by that, and may have changed it since or put another block after it.
     */
    private Optional<BlockRow> inPage(UUID blockId, UUID pageId) {
        Optional<BlockRow> byId = blocks.find(blockId).filter(b -> b.pageId().equals(pageId));
        return byId.isPresent() ? byId : blocks.sentBefore(pageId, blockId);
    }

    private static BlockAnswer gone(UUID blockId) {
        return new BlockAnswer(
                Outcome.GONE,
                blockId,
                "That part of the page was removed while you were away, so there was nothing to change.");
    }
}
