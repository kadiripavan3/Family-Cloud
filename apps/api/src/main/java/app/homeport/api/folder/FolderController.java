package app.homeport.api.folder;

import app.homeport.api.auth.Me;
import app.homeport.api.folder.FolderService.Filing;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.folder.FolderService.SharedInside;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "folders", description = "Spaces and folders: where things are filed, and what you pinned")
class FolderController {

    private final FolderService folders;

    FolderController(FolderService folders) {
        this.folders = folders;
    }

    record NewFolderRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @Schema(nullable = true, description = "The folder to make it in. Left out: a new space.")
            UUID parentId,

            @NotBlank(message = "Give it a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 32, message = "Choose one emoji.") String emoji,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience) {}

    record FolderChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 32, message = "Choose one emoji.") String emoji) {}

    record FilingRequest(
            @Schema(
                    nullable = true,
                    description = "The folder to put it in. Null takes it out of its folder; a folder then"
                            + " becomes a space.")
            UUID folderId,

            @Schema(
                    nullable = true,
                    description = "Put it just after this thing. Left out, with atStart left out too: at the"
                            + " end, or where it is when it stays in its folder.")
            UUID after,

            @Schema(description = "True to put it first") Boolean atStart) {}

    @PostMapping("/folders")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createFolder", summary = "Make a space, or a folder inside another")
    FolderResponse create(@Me UUID me, @Valid @RequestBody NewFolderRequest request) {
        return folders.create(
                me,
                request.circleId(),
                request.parentId(),
                request.title(),
                request.emoji(),
                request.audience(),
                request.clientId());
    }

    @GetMapping("/folders/{id}")
    @Operation(
            operationId = "getFolder",
            summary = "A space or folder: its name, who sees it, and how much is in it that you may see")
    FolderResponse get(@Me UUID me, @PathVariable UUID id) {
        return folders.get(id, me);
    }

    @PatchMapping("/folders/{id}")
    @Operation(operationId = "changeFolder", summary = "Rename a space or folder, or change its emoji")
    FolderResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody FolderChangeRequest request) {
        return folders.change(id, me, request.title(), request.emoji());
    }

    @PostMapping("/folders/{id}/share-inside")
    @Operation(
            operationId = "shareFolderContents",
            summary = "Give everything in a folder that is yours the folder's audience. Up to 500 things at once.")
    SharedInside shareInside(@Me UUID me, @PathVariable UUID id) {
        return folders.shareInside(id, me);
    }

    @GetMapping("/things/{id}/folder")
    @Operation(operationId = "getFiling", summary = "Where a thing is filed: the way to it from its space")
    Filing where(@Me UUID me, @PathVariable UUID id) {
        return folders.where(id, me);
    }

    @PutMapping("/things/{id}/folder")
    @Operation(
            operationId = "fileThing",
            summary = "Move a thing into a folder, out of one, or to another place in the order")
    Filing file(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody FilingRequest request) {
        return folders.file(id, me, request.folderId(), request.after(), Boolean.TRUE.equals(request.atStart()));
    }

    @PutMapping("/things/{id}/pin")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "pinThing", summary = "Pin a thing to the top of your Notes. Twenty at most.")
    void pin(@Me UUID me, @PathVariable UUID id) {
        folders.pin(id, me);
    }

    @DeleteMapping("/things/{id}/pin")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "unpinThing", summary = "Take a pin away")
    void unpin(@Me UUID me, @PathVariable UUID id) {
        folders.unpin(id, me);
    }
}
