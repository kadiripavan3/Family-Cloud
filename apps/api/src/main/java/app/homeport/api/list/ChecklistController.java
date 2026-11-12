package app.homeport.api.list;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.ChecklistRow;
import app.homeport.api.list.ChecklistService.ItemChange;
import app.homeport.api.list.ChecklistService.ItemResponse;
import app.homeport.api.list.ChecklistService.LineAnswers;
import app.homeport.api.list.ChecklistService.LineChange;
import app.homeport.api.list.ChecklistService.ListChange;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.list.ChecklistService.NewList;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

@RestController
@RequestMapping("/v1")
@Tag(name = "checklists", description = "Lists you tick, changed one line at a time")
class ChecklistController {

    private final ChecklistService lists;
    private final CircleService circles;

    ChecklistController(ChecklistService lists, CircleService circles) {
        this.lists = lists;
        this.circles = circles;
    }

    record NewChecklistRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Give the list a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(description = "Lines to start with") @Size(max = 100, message = "Start with 100 lines at most.")
            List<@Size(max = 300) String> items,

            @Schema(nullable = true, description = "The folder to file it in. Left out: not filed.")
            UUID folderId,

            @Size(max = 32, message = "Choose one emoji.") String emoji,

            @Schema(description = "The currency of its amounts, three letters. Left out: EUR.") @Size(max = 3)
            String currency,

            @Schema(description = "True for a shopping list: each new line finds its aisle")
            Boolean aisles) {}

    record ChecklistChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 32, message = "Choose one emoji.") String emoji,

            @Size(max = 3) String currency,
            Boolean aisles) {}

    record LookRequest(
            @NotNull(message = "Say whether to show ticked lines.")
            Boolean showTicked) {}

    record NewItemRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Write what to add.")
            @Size(max = 300, message = "Keep a line to 300 characters or fewer.")
            String text,

            @Size(max = 300) String note,

            @Schema(
                    description = "The heading to put it under. Left out: where this line went last time, or its"
                            + " aisle in a shopping list.")
            @Size(max = 60)
            String section,

            @Min(0) @Max(100000000000L) Long amountCents,
            UUID assignedTo,

            @Schema(nullable = true, description = "Set for a line that comes back after it was ticked")
            Repeats repeats,

            @Schema(description = "Members to keep this line from. They don't get the line at all.") @Size(max = 30)
            List<UUID> hideFrom) {

        NewItem line() {
            return new NewItem(text, note, section, amountCents, assignedTo, repeats, hideFrom);
        }
    }

    record ItemChangeRequest(
            @Size(min = 1, max = 300, message = "Keep a line to 300 characters or fewer.")
            String text,

            @Size(max = 300) String note,
            @Size(max = 60) String section,
            @Min(0) @Max(100000000000L) Long amountCents,
            Boolean removeAmount,
            UUID assignedTo,
            Boolean unassign,

            @Schema(description = "True to tick it, false to take the tick away")
            Boolean done,

            @Schema(description = "Move it to just before this line")
            UUID before,

            @Schema(description = "Move it to the end") Boolean toEnd,

            @Schema(nullable = true, description = "Make it come back after it was ticked")
            Repeats repeats,

            @Schema(description = "True to stop it coming back")
            Boolean stopRepeating,

            @Schema(description = "Members to keep this line from. An empty list shows it to everyone again.")
            @Size(max = 30)
            List<UUID> hideFrom) {

        ItemChange change() {
            return new ItemChange(
                    text,
                    note,
                    section,
                    amountCents,
                    removeAmount,
                    assignedTo,
                    unassign,
                    done,
                    before,
                    toEnd,
                    repeats,
                    stopRepeating,
                    hideFrom);
        }
    }

    /** One change from a phone's queue. Its parts are read when its turn comes, so a wrong one doesn't stop the rest. */
    record LateLineChange(
            @NotNull(message = "Say what kind of change it is.")
            ChangeOp op,

            @Schema(
                    nullable = true,
                    description = "For change and remove: the line, by its id or by the clientId it was added with")
            UUID itemId,

            @Schema(nullable = true, description = "For add: the new line, as it would be sent to add it")
            NewItemRequest add,

            @Schema(nullable = true, description = "For change: what to change, as it would be sent to change it")
            ItemChangeRequest change) {}

    record LateLineChanges(
            @NotNull(message = "Send the changes that waited.")
            @Size(max = ChecklistService.MAX_CHANGES, message = "Send 200 changes at most at once.")
            List<@Valid @NotNull LateLineChange> changes) {}

    @PostMapping("/checklists")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createChecklist", summary = "Start a list")
    ChecklistResponse create(@Me UUID me, @Valid @RequestBody NewChecklistRequest request) {
        return lists.create(
                me,
                request.circleId(),
                new NewList(
                        request.title(),
                        request.audience(),
                        request.items(),
                        request.folderId(),
                        request.emoji(),
                        request.currency(),
                        request.aisles()),
                request.clientId());
    }

    @GetMapping("/checklists/{id}")
    @Operation(
            operationId = "getChecklist",
            summary = "A list with its lines. Ask again with If-None-Match to hear 304 while nothing changed.",
            parameters =
                    @Parameter(
                            name = "If-None-Match",
                            in = ParameterIn.HEADER,
                            description = "The ETag of the answer you already have, as it came (in double quotes)",
                            schema = @Schema(type = "string")))
    @ApiResponse(responseCode = "200", description = "OK")
    @ApiResponse(
            responseCode = "304",
            description = "Nothing changed since the version you sent. There is no body.",
            content = @Content)
    ChecklistResponse get(@Me UUID me, @PathVariable UUID id, WebRequest request) {
        // While someone has a list open, their phone asks again every few seconds: "the same as before" is one
        // small question to the database and an answer with nothing in it.
        if (request.checkNotModified(lists.version(id, me))) {
            return null;
        }
        return lists.get(id, me);
    }

    @PatchMapping("/checklists/{id}")
    @Operation(
            operationId = "renameChecklist",
            summary = "Rename a list, or change its emoji, its currency or whether it is a shopping list")
    ChecklistResponse rename(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ChecklistChangeRequest request) {
        return lists.change(
                id, me, new ListChange(request.title(), request.emoji(), request.currency(), request.aisles()));
    }

    @PutMapping("/checklists/{id}/look")
    @Operation(operationId = "lookAtChecklist", summary = "Show or hide the ticked lines of a list, for you only")
    ChecklistResponse look(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody LookRequest request) {
        return lists.look(id, me, request.showTicked());
    }

    @GetMapping("/circles/{id}/checklists")
    @Operation(operationId = "getChecklists", summary = "The lists in a circle you can see, last changed first")
    Page<ChecklistRow> list(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return lists.list(id, me, Keyset.of(cursor, limit, 30));
    }

    @PostMapping("/checklists/{id}/items")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addChecklistItem", summary = "Add a line to the end of a list")
    ItemResponse add(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewItemRequest request) {
        return lists.add(id, me, request.line(), request.clientId());
    }

    @PatchMapping("/checklist-items/{itemId}")
    @Operation(operationId = "changeChecklistItem", summary = "Tick a line, change it or move it")
    ItemResponse change(@Me UUID me, @PathVariable UUID itemId, @Valid @RequestBody ItemChangeRequest request) {
        return lists.change(itemId, me, request.change());
    }

    @DeleteMapping("/checklist-items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeChecklistItem", summary = "Remove a line. Removing one that is gone is fine.")
    void remove(@Me UUID me, @PathVariable UUID itemId) {
        lists.remove(itemId, me);
    }

    @DeleteMapping("/checklists/{id}/done")
    @Operation(
            operationId = "clearDoneItems",
            summary = "Clear the ticked lines of a list. A line that repeats stays, to come back.")
    ChecklistResponse clearDone(@Me UUID me, @PathVariable UUID id) {
        return lists.clearDone(id, me);
    }

    @PostMapping("/checklists/{id}/changes")
    @Operation(
            operationId = "sendChecklistChanges",
            summary = "Send the changes a phone kept while it had no signal, in order. Each gets its own answer;"
                    + " one that came too late doesn't stop the rest. 200 at most.")
    LineAnswers changes(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody LateLineChanges request) {
        return lists.changes(
                id,
                me,
                request.changes().stream()
                        .map(c -> new LineChange(
                                c.op(),
                                c.add() == null ? null : c.add().clientId(),
                                c.itemId(),
                                c.add() == null ? null : c.add().line(),
                                c.change() == null ? null : c.change().change()))
                        .toList());
    }
}
