package app.homeport.api.page;

import app.homeport.api.auth.Me;
import app.homeport.api.folder.FolderService.SharedInside;
import app.homeport.api.list.ChangeOp;
import app.homeport.api.page.BlockService.BlockChange;
import app.homeport.api.page.BlockService.BlockResponse;
import app.homeport.api.page.BlockService.NewBlock;
import app.homeport.api.page.BlockService.QueuedBlockChange;
import app.homeport.api.page.PageService.BlockAnswers;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "pages", description = "Pages: a title, and blocks in order")
class BlockController {

    private final BlockService blocks;
    private final PageService pages;

    BlockController(BlockService blocks, PageService pages) {
        this.blocks = blocks;
        this.pages = pages;
    }

    record NewBlockRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Say what kind of block it is.")
            BlockKind kind,

            @Schema(description = "The words: of a text block, under a photo or a file, or naming a place")
            @Size(max = 100000, message = "That is too long for one block.")
            String text,

            @Schema(description = "For text: what is bold, a link or a name") @Size(max = 200)
            List<Mark> marks,

            @Schema(
                    nullable = true,
                    description =
                            "Put it just after this block (its id, or the clientId it was added with). Left out, or"
                                    + " when that block is gone: at the end.")
            UUID after,

            @Schema(description = "True to put it first") Boolean atStart,

            @Schema(
                    nullable = true,
                    description = "For a live block: the thing to show. For a list: an existing list to draw"
                            + " here; left out, a new list is started in the page.")
            UUID thingId,

            @Schema(
                    nullable = true,
                    description = "For a photo or a file: your own finished upload, made for this block")
            UUID mediaId,

            @Schema(nullable = true, description = "For a place: its point on the map, with lng")
            Double lat,

            @Schema(nullable = true) Double lng,

            @Schema(description = "For a new list: its name. Left out: the page's title.") @Size(max = 200)
            String title,

            @Schema(description = "For a new list: lines to start with") @Size(max = 100)
            List<@Size(max = 300) String> items) {

        NewBlock block() {
            return new NewBlock(kind, text, marks, after, atStart, thingId, mediaId, lat, lng, title, items);
        }
    }

    record BlockChangeRequest(
            @Schema(nullable = true, description = "A paragraph, a heading and a bullet can become one another")
            BlockKind kind,

            @Size(max = 100000, message = "That is too long for one block.")
            String text,

            @Schema(description = "Send the marks with the text they belong to. New text without marks has none.")
            @Size(max = 200)
            List<Mark> marks,

            @Schema(nullable = true) Double lat,
            @Schema(nullable = true) Double lng,

            @Schema(description = "True to take the point of a place away and keep its words")
            Boolean removePoint,

            @Schema(
                    nullable = true,
                    description = "Move it to just after this block (its id, or the clientId it was added with)")
            UUID after,

            @Schema(description = "True to move it to the top")
            Boolean atStart) {

        BlockChange change() {
            return new BlockChange(kind, text, marks, lat, lng, removePoint, after, atStart);
        }
    }

    /** One change from a phone's queue. Its parts are read when its turn comes, so a wrong one doesn't stop the rest. */
    record LateBlockChange(
            @NotNull(message = "Say what kind of change it is.")
            ChangeOp op,

            @Schema(
                    nullable = true,
                    description = "For change and remove: the block, by its id or by the clientId it was added with")
            UUID blockId,

            @Schema(nullable = true, description = "For add: the new block, as it would be sent to add it")
            NewBlockRequest add,

            @Schema(nullable = true, description = "For change: what to change, as it would be sent to change it")
            BlockChangeRequest change) {}

    record LateBlockChanges(
            @NotNull(message = "Send the changes that waited.")
            @Size(max = BlockService.MAX_CHANGES, message = "Send 200 changes at most at once.")
            List<@Valid @NotNull LateBlockChange> changes) {}

    @PostMapping("/pages/{id}/blocks")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addBlock", summary = "Add a block to a page: after another block, first, or at the end")
    BlockResponse add(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewBlockRequest request) {
        return blocks.add(id, me, request.block(), request.clientId());
    }

    @PatchMapping("/page-blocks/{blockId}")
    @Operation(operationId = "changeBlock", summary = "Change one block of a page, or move it")
    BlockResponse change(@Me UUID me, @PathVariable UUID blockId, @Valid @RequestBody BlockChangeRequest request) {
        return blocks.change(blockId, me, request.change());
    }

    @DeleteMapping("/page-blocks/{blockId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeBlock", summary = "Remove a block. Removing one that is gone is fine.")
    void remove(@Me UUID me, @PathVariable UUID blockId) {
        blocks.remove(blockId, me);
    }

    @PostMapping("/pages/{id}/changes")
    @Operation(
            operationId = "sendPageChanges",
            summary = "Send the changes a phone kept while it had no signal, in order. Each gets its own answer;"
                    + " one for a block that was removed doesn't stop the rest. 200 at most.")
    BlockAnswers changes(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody LateBlockChanges request) {
        return pages.changes(
                id,
                me,
                request.changes().stream()
                        .map(c -> new QueuedBlockChange(
                                c.op(),
                                c.add() == null ? null : c.add().clientId(),
                                c.blockId(),
                                c.add() == null ? null : c.add().block(),
                                c.change() == null ? null : c.change().change()))
                        .toList());
    }

    @PostMapping("/pages/{id}/share-lists")
    @Operation(
            operationId = "sharePageLists",
            summary = "Give the lists drawn in a page that are yours the page's audience")
    SharedInside shareLists(@Me UUID me, @PathVariable UUID id) {
        return blocks.shareLists(id, me);
    }
}
