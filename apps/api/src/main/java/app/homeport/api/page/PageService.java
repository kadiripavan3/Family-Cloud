package app.homeport.api.page;

import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.Crumb;
import app.homeport.api.folder.People;
import app.homeport.api.page.BlockService.BlockAnswer;
import app.homeport.api.page.BlockService.BlockResponse;
import app.homeport.api.page.BlockService.QueuedBlockChange;
import app.homeport.api.page.PageStore.PageDetails;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pages: a title, and blocks in order (see {@link BlockService}). A page still has its plain words (body):
 * they are written from the blocks, and a page made the old way, from a title and words, is one block of text.
 */
@Service
public class PageService {

    public record PageResponse(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "The page's plain words, written from its blocks. Search and guests read these.")
            String body,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip,
            String emoji,

            @Schema(
                    description = "Changes whenever anything in this answer would. It is also the answer's ETag: send"
                            + " that back as If-None-Match to be told 304 while nothing has changed.")
            String version,

            @Schema(nullable = true, description = "Who changed it last")
            PersonBrief editedBy,

            @Schema(nullable = true) Instant editedAt,

            @Schema(nullable = true, description = "The folder it is in, when you may see that folder")
            UUID folderId,

            @Schema(description = "The way to it from its space: Home, House manual")
            List<Crumb> breadcrumb,

            @Schema(description = "True when you pinned it") boolean pinned,

            @Schema(description = "What the page is made of, in order. 500 at most.")
            List<BlockResponse> blocks) {}

    /** A page in a list: its title and how it starts. */
    public record PageRow(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "The first words of the page")
            String start,

            Instant updatedAt,
            boolean mine,
            AudienceChip chip) {}

    /** What a new page starts with. Everything can be left out. */
    public record NewPage(String title, String body, Audience audience, UUID folderId, String emoji) {}

    public record BlockAnswers(
            @Schema(description = "One answer for each change, in the order they were sent")
            List<BlockAnswer> answers,

            @Schema(description = "The page as it stands now")
            PageResponse page) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final PageStore pages;
    private final BlockStore blockStore;
    private final BlockService blocks;
    private final CircleService circles;
    private final People people;
    private final FolderService folders;

    PageService(
            ThingService things,
            ThingStore thingStore,
            PageStore pages,
            BlockStore blockStore,
            BlockService blocks,
            CircleService circles,
            People people,
            FolderService folders) {
        this.things = things;
        this.thingStore = thingStore;
        this.pages = pages;
        this.blockStore = blockStore;
        this.blocks = blocks;
        this.circles = circles;
        this.people = people;
        this.folders = folders;
    }

    @Transactional
    public PageResponse create(UUID me, UUID circleId, String title, String body, Audience audience, UUID clientId) {
        return create(me, circleId, new NewPage(title, body, audience, null, null), clientId);
    }

    @Transactional
    public PageResponse create(UUID me, UUID circleId, NewPage page, UUID clientId) {
        UUID id = things.create(me, circleId, ThingKind.PAGE, page.title(), page.audience(), clientId);
        if (thingStore.isNew(id, "pages")) {
            String words = page.body() == null ? "" : page.body();
            UUID mine = circles.me(circleId, me).id();
            pages.insert(id, words);
            pages.setEmoji(id, page.emoji() == null ? "" : page.emoji().trim());
            if (!words.isBlank()) {
                // A page made from a title and words is one block of text.
                blockStore.insert(id, BlockKind.PARAGRAPH, words, List.of(), null, null, null, null, 1, mine, null);
            }
            pages.edited(id, words, mine);
            if (page.folderId() != null) {
                folders.fileNew(id, circleId, page.folderId(), me);
            }
        }
        return get(id, me);
    }

    public PageResponse get(UUID id, UUID me) {
        ThingRow row = things.require(id, me, ThingKind.PAGE);
        PageDetails details = pages.details(id);
        Map<UUID, PersonBrief> who = people.of(row.circleId());
        List<Crumb> way = folders.breadcrumb(id, me);
        return new PageResponse(
                row.id(),
                row.circleId(),
                row.title(),
                details.body(),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row),
                details.emoji(),
                version(id, me),
                details.editedBy() == null ? null : who.get(details.editedBy()),
                details.editedAt(),
                way.isEmpty() ? null : way.get(way.size() - 1).id(),
                way,
                folders.pinned(id, me),
                blocks.of(id, me));
    }

    /**
     * Where a page stands for this person, as a short text ({@link PageStore#state}). To someone who may not
     * see the page, it isn't there.
     */
    public String version(UUID id, UUID me) {
        return pages.state(id, me).orElseThrow(ThingService::notFound);
    }

    @Transactional
    public PageResponse change(UUID id, UUID me, String title, String body) {
        return change(id, me, title, body, null);
    }

    /**
     * Changes a page's title or emoji, or (the old way) all its words at once. New words take the place of
     * the page's text blocks; to change one part of a page, change its block.
     */
    @Transactional
    public PageResponse change(UUID id, UUID me, String title, String body, String emoji) {
        ThingRow row = things.requireEdit(id, me, ThingKind.PAGE);
        PageDetails details = pages.details(id);
        UUID mine = circles.me(row.circleId(), me).id();
        if (emoji != null) {
            pages.setEmoji(id, emoji.trim());
        }
        if (body != null && !body.equals(details.body())) {
            blocks.replaceWords(row, body, mine);
        } else {
            pages.edited(id, details.body(), mine);
        }
        thingStore.retitle(id, title == null ? row.title() : title.trim());
        return get(id, me);
    }

    /** The changes a phone kept for a page while it had no signal: see {@link BlockService#changes}. */
    public BlockAnswers changes(UUID id, UUID me, List<QueuedBlockChange> changes) {
        List<BlockAnswer> answers = blocks.changes(id, me, changes);
        return new BlockAnswers(answers, get(id, me));
    }

    public Page<PageRow> list(UUID circleId, UUID me, Keyset page) {
        List<ThingRow> rows = thingStore.list(circleId, me, ThingKind.PAGE, null, null, page);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        Map<UUID, String> starts = pages.starts(rows.stream().map(ThingRow::id).toList());
        return page.page(rows, row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> shown.stream()
                        .map(r -> new PageRow(
                                r.id(),
                                r.circleId(),
                                r.title(),
                                starts.getOrDefault(r.id(), ""),
                                r.updatedAt(),
                                r.mine(),
                                chips.get(r.id())))
                        .toList());
    }
}
