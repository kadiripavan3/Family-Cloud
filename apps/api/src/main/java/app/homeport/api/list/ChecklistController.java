package app.homeport.api.list;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.ChecklistRow;
import app.homeport.api.list.ChecklistService.ItemChange;
import app.homeport.api.list.ChecklistService.ItemResponse;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

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
            List<@Size(max = 300) String> items) {}

    record RenameRequest(
            @NotBlank(message = "Give the list a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title) {}

    record NewItemRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Write what to add.")
            @Size(max = 300, message = "Keep a line to 300 characters or fewer.")
            String text,

            @Size(max = 300) String note,
            @Size(max = 60) String section,
            @Min(0) @Max(100000000000L) Long amountCents,
            UUID assignedTo) {}

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

            @Schema(description = "Move it to the end") Boolean toEnd) {}

    @PostMapping("/checklists")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createChecklist", summary = "Start a list")
    ChecklistResponse create(@Me UUID me, @Valid @RequestBody NewChecklistRequest request) {
        return lists.create(
                me, request.circleId(), request.title(), request.audience(), request.items(), request.clientId());
    }

    @GetMapping("/checklists/{id}")
    @Operation(operationId = "getChecklist", summary = "A list with its lines")
    ChecklistResponse get(@Me UUID me, @PathVariable UUID id) {
        return lists.get(id, me);
    }

    @PatchMapping("/checklists/{id}")
    @Operation(operationId = "renameChecklist", summary = "Rename a list")
    ChecklistResponse rename(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody RenameRequest request) {
        return lists.rename(id, me, request.title());
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
        return lists.add(
                id,
                me,
                new NewItem(
                        request.text(), request.note(), request.section(), request.amountCents(), request.assignedTo()),
                request.clientId());
    }

    @PatchMapping("/checklist-items/{itemId}")
    @Operation(operationId = "changeChecklistItem", summary = "Tick a line, change it or move it")
    ItemResponse change(@Me UUID me, @PathVariable UUID itemId, @Valid @RequestBody ItemChangeRequest request) {
        return lists.change(
                itemId,
                me,
                new ItemChange(
                        request.text(),
                        request.note(),
                        request.section(),
                        request.amountCents(),
                        request.removeAmount(),
                        request.assignedTo(),
                        request.unassign(),
                        request.done(),
                        request.before(),
                        request.toEnd()));
    }

    @DeleteMapping("/checklist-items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeChecklistItem", summary = "Remove a line. Removing one that is gone is fine.")
    void remove(@Me UUID me, @PathVariable UUID itemId) {
        lists.remove(itemId, me);
    }

    @DeleteMapping("/checklists/{id}/done")
    @Operation(operationId = "clearDoneItems", summary = "Clear the ticked lines of a list")
    ChecklistResponse clearDone(@Me UUID me, @PathVariable UUID id) {
        return lists.clearDone(id, me);
    }
}
