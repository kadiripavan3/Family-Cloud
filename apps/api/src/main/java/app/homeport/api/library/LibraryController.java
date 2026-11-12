package app.homeport.api.library;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.library.LensService.LensesResponse;
import app.homeport.api.library.LensService.PlacesResponse;
import app.homeport.api.library.LensService.StorageResponse;
import app.homeport.api.library.LensService.TimelineResponse;
import app.homeport.api.library.LibraryService.AddedResponse;
import app.homeport.api.library.LibraryService.CheckResponse;
import app.homeport.api.library.LibraryService.CommentResponse;
import app.homeport.api.library.LibraryService.HashCheck;
import app.homeport.api.library.LibraryService.ItemChange;
import app.homeport.api.library.LibraryService.LibraryItemResponse;
import app.homeport.api.library.LibraryService.MomentResponse;
import app.homeport.api.library.LibraryService.NewItems;
import app.homeport.api.library.LibraryService.SelectResult;
import app.homeport.api.library.LibraryService.WallQuery;
import app.homeport.api.library.LibraryService.WallResponse;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.Hidden;
import app.homeport.api.thing.ThingService.PersonAccess;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
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

@RestController
@RequestMapping("/v1")
@Tag(name = "library", description = "Every photo, video and document, from everyone")
class LibraryController {

    private final LibraryService library;
    private final LensService lenses;

    LibraryController(LibraryService library, LensService lenses) {
        this.library = library;
        this.lenses = lenses;
    }

    // ---------- adding ----------

    @PostMapping("/library/check")
    @Operation(
            operationId = "checkLibrary",
            summary =
                    "Which of these files are in your Library already. Ask before uploading, with each file's SHA-256.")
    CheckResponse check(@Me UUID me, @Valid @RequestBody HashCheck request) {
        return library.check(me, request.circleId(), request.hashes());
    }

    @PostMapping("/library")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "addToLibrary",
            summary = "Add uploaded photos, videos and documents, a hundred at a time at most. Each carries its own"
                    + " clientId, and a file that is there already is answered with what it became.")
    AddedResponse add(@Me UUID me, @Valid @RequestBody NewItems request) {
        return library.add(me, request.circleId(), request.items());
    }

    // ---------- the wall and its lenses ----------

    @GetMapping("/circles/{id}/library")
    @Operation(
            operationId = "getWall",
            summary =
                    "The wall: every photo and video you may see, the newest taken first, with the moments they belong to")
    WallResponse wall(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Only photos, or only videos") @RequestParam(required = false) ThingKind kind,
            @Parameter(description = "Only what you gave a heart") @RequestParam(defaultValue = "false") boolean loved,
            @Parameter(description = "Only what this member added") @RequestParam(required = false) UUID by,
            @Parameter(description = "Only what this member is in") @RequestParam(required = false) UUID about,
            @Parameter(description = "Only what was taken at the place with this name") @RequestParam(required = false)
                    String place,
            @Parameter(description = "Only what is in this album") @RequestParam(required = false) UUID album,
            @Parameter(description = "Only the moment this photo belongs to") @RequestParam(required = false)
                    UUID moment,
            @Parameter(description = "Start at this day and go back from there: how the strip at the side jumps")
                    @RequestParam(required = false)
                    LocalDate until,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return library.wall(
                id,
                me,
                new WallQuery(kind, loved, by, about, place, album, moment),
                until,
                Keyset.of(cursor, limit, 60));
    }

    @GetMapping("/circles/{id}/library/timeline")
    @Operation(
            operationId = "getTimeline",
            summary = "The years and months of the wall with their counts, and one year's months with their newest"
                    + " pictures. Takes the wall's narrowing.")
    TimelineResponse timeline(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) ThingKind kind,
            @RequestParam(defaultValue = "false") boolean loved,
            @RequestParam(required = false) UUID by,
            @RequestParam(required = false) UUID about,
            @RequestParam(required = false) String place,
            @RequestParam(required = false) UUID album,
            @Parameter(description = "The year to open. Left out: the newest with anything in it.")
                    @RequestParam(required = false)
                    Integer year,
            @Parameter(description = "How many pictures to give for each month of that year, 24 at most")
                    @RequestParam(defaultValue = "16")
                    int tiles) {
        return lenses.timeline(
                id, me, new WallQuery(kind, loved, by, about, place, album, null), year, Math.clamp(tiles, 0, 24));
    }

    @GetMapping("/circles/{id}/library/lenses")
    @Operation(
            operationId = "getLenses",
            summary =
                    "What the chips above the wall lead to: how many albums, places and files, and the people who are in photos")
    LensesResponse lenses(@Me UUID me, @PathVariable UUID id) {
        return lenses.lenses(id, me);
    }

    @GetMapping("/circles/{id}/library/places")
    @Operation(
            operationId = "getPlaces",
            summary = "The places photos were taken at, each with its count and a cover. Five hundred at most.")
    PlacesResponse places(@Me UUID me, @PathVariable UUID id) {
        return lenses.places(id, me);
    }

    @GetMapping("/circles/{id}/storage")
    @Operation(
            operationId = "getStorage",
            summary = "How much a circle keeps: by photos, videos and files, and by person")
    StorageResponse storage(@Me UUID me, @PathVariable UUID id) {
        return lenses.storage(id, me);
    }

    // ---------- one photo ----------

    @GetMapping("/library/{id}")
    @Operation(
            operationId = "getLibraryItem",
            summary = "One photo, video or document with everything its screen shows, and what stands either side of"
                    + " it under the wall's narrowing you came from")
    LibraryItemResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) ThingKind kind,
            @RequestParam(defaultValue = "false") boolean loved,
            @RequestParam(required = false) UUID by,
            @RequestParam(required = false) UUID about,
            @RequestParam(required = false) String place,
            @RequestParam(required = false) UUID album,
            @Parameter(description = "A photo of the moment to stay inside while swiping: usually this one")
                    @RequestParam(required = false)
                    UUID moment) {
        return library.get(id, me, new WallQuery(kind, loved, by, about, place, album, moment));
    }

    @PatchMapping("/library/{id}")
    @Operation(operationId = "changeLibraryItem", summary = "Change a caption, or when and where it was taken")
    LibraryItemResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ItemChange request) {
        return library.change(id, me, request);
    }

    @GetMapping("/library/{id}/moment")
    @Operation(
            operationId = "getMoment",
            summary = "The moment a photo belongs to: what was taken that day at that place, by whom")
    MomentResponse moment(@Me UUID me, @PathVariable UUID id) {
        return library.moment(id, me);
    }

    @PutMapping("/library/{id}/love")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "loveLibraryItem", summary = "Give it a heart")
    void love(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "A child or a pet of the circle to give the heart for. Left out: yourself.")
                    @RequestParam(required = false)
                    UUID as) {
        library.love(id, me, as, true);
    }

    @DeleteMapping("/library/{id}/love")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "unloveLibraryItem", summary = "Take your heart back")
    void unlove(@Me UUID me, @PathVariable UUID id, @RequestParam(required = false) UUID as) {
        library.love(id, me, as, false);
    }

    record NewCommentRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Write something first.")
            @Size(max = 1000, message = "Keep a comment to 1,000 characters or fewer.")
            String body) {}

    @GetMapping("/library/{id}/comments")
    @Operation(operationId = "getLibraryComments", summary = "What people said under it, the oldest first")
    Page<CommentResponse> comments(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return library.comments(id, me, Keyset.of(cursor, limit, 30));
    }

    @PostMapping("/library/{id}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addLibraryComment", summary = "Say something under it")
    CommentResponse comment(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewCommentRequest request) {
        return library.comment(id, me, request.body(), request.clientId());
    }

    @DeleteMapping("/library/comments/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeLibraryComment",
            summary = "Remove a comment: your own, or one under your photo. Removing one that is gone is fine.")
    void removeComment(@Me UUID me, @PathVariable UUID commentId) {
        library.removeComment(commentId, me);
    }

    // ---------- many at once ----------

    record ShareSelected(
            @NotEmpty(message = "Choose what to share.")
            @Size(max = LibraryService.MAX_SELECTED, message = "Choose 500 at a time at most.")
            List<@NotNull UUID> ids,

            @NotNull(message = "Choose only you, some people or everyone.")
            Audience audience,

            Boolean everyoneEdits,
            List<PersonAccess> people,
            List<Hidden> hiddenFrom) {}

    record HideSelected(
            @NotEmpty(message = "Choose what to hide.")
            @Size(max = LibraryService.MAX_SELECTED, message = "Choose 500 at a time at most.")
            List<@NotNull UUID> ids,

            @NotNull(message = "Choose who to hide it from.")
            UUID memberId,

            @Schema(description = "The last day it is hidden. Left out: for good.")
            LocalDate through) {}

    record DeleteSelected(
            @NotEmpty(message = "Choose what to delete.")
            @Size(max = LibraryService.MAX_SELECTED, message = "Choose 500 at a time at most.")
            List<@NotNull UUID> ids) {}

    @PostMapping("/library/select/share")
    @Operation(
            operationId = "shareSelected",
            summary = "Set who can see many things at once. Done to the ones that are yours; says how many.")
    SelectResult share(@Me UUID me, @Valid @RequestBody ShareSelected request) {
        return library.share(
                me,
                request.ids(),
                new AudienceChange(
                        request.audience(), request.everyoneEdits(), request.people(), request.hiddenFrom()));
    }

    @PostMapping("/library/select/hide")
    @Operation(
            operationId = "hideSelected",
            summary = "Hide many things from one person. Done to the ones that are yours and shared; says how many.")
    SelectResult hide(@Me UUID me, @Valid @RequestBody HideSelected request) {
        return library.hide(me, request.ids(), request.memberId(), request.through());
    }

    @PostMapping("/library/select/delete")
    @Operation(
            operationId = "deleteSelected",
            summary = "Delete many things for good. Done to the ones that are yours; says how many.")
    SelectResult delete(@Me UUID me, @Valid @RequestBody DeleteSelected request) {
        return library.delete(me, request.ids());
    }
}
