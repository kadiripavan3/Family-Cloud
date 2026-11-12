package app.homeport.api.board;

import app.homeport.api.auth.Me;
import app.homeport.api.board.BoardService.BoardCard;
import app.homeport.api.board.BoardService.BoardEntriesResponse;
import app.homeport.api.board.BoardService.BoardResponse;
import app.homeport.api.board.BoardService.EntryAddedResponse;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Map;
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
@Tag(
        name = "boards",
        description = "Templates that do work: a meal plan, a chore wheel, a time capsule. The same routes for every"
                + " template; what each one takes and gives is listed under x-board-templates.")
class BoardController {

    static final String DAY = "The day on the person's phone. The API's own day when left out.";

    private final BoardService boards;
    private final CircleService circles;

    BoardController(BoardService boards, CircleService circles) {
        this.boards = boards;
        this.circles = circles;
    }

    record NewBoardRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotNull(message = "Choose a template.") Template template,

            @Schema(description = "Left out: the template's own name")
            @Size(max = 200, message = "Keep the title to 200 characters or fewer.")
            String title,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(description = "What the template needs to begin: names, dates, numbers. See x-board-templates.")
            Map<String, Object> settings) {}

    record BoardChangeRequest(
            @Size(max = 200, message = "Keep the title to 200 characters or fewer.")
            String title,

            @Schema(description = "The settings to change. A name that is left out keeps its value.")
            Map<String, Object> settings) {}

    record NewBoardEntryRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @Schema(description = "The template's word for what is added: meal, letter, mark")
            @NotBlank(message = "Say what you are adding.")
            @Size(max = 40)
            String kind,

            @Schema(description = "What the template takes for this kind. See x-board-templates.")
            Map<String, Object> fields) {}

    record EntryChangeRequest(
            @Schema(
                    description = "The fields to change. A name that is left out keeps its value; a name sent as null"
                            + " is taken away.")
            @NotNull(message = "Say what to change.")
            Map<String, Object> fields) {}

    record ActRequest(
            @Schema(description = "The template's own verb: seal, open, tick")
            @NotBlank(message = "Say what to do.")
            @Size(max = 40)
            String verb,

            @Schema(description = "What the verb needs. See x-board-templates.")
            Map<String, Object> body) {}

    @PostMapping("/boards")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createBoard", summary = "Start a board from a template that does work")
    BoardResponse create(
            @Me UUID me,
            @Valid @RequestBody NewBoardRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return boards.create(
                me,
                request.circleId(),
                request.template(),
                request.title(),
                request.audience(),
                request.settings(),
                request.clientId(),
                day);
    }

    @GetMapping("/boards/{id}")
    @Operation(
            operationId = "getBoard",
            summary =
                    "A board: its settings, and what this person sees on it today. The template decides what that is.")
    BoardResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day,
            @Parameter(
                            description =
                                    "Which part, for templates with more than one: a week, a year. See x-board-templates.")
                    @RequestParam(required = false)
                    String show) {
        return boards.get(id, me, day, show);
    }

    @PatchMapping("/boards/{id}")
    @Operation(operationId = "changeBoard", summary = "Rename a board or change its settings")
    BoardResponse change(
            @Me UUID me,
            @PathVariable UUID id,
            @Valid @RequestBody BoardChangeRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return boards.change(id, me, request.title(), request.settings(), day);
    }

    @GetMapping("/circles/{id}/boards")
    @Operation(
            operationId = "getBoards",
            summary = "The boards in a circle you can see, last changed first. With a template, only its boards.")
    Page<BoardCard> list(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) Template template,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return boards.list(id, me, template, Keyset.of(cursor, limit, 30));
    }

    @GetMapping("/boards/{id}/entries")
    @Operation(
            operationId = "getBoardEntries",
            summary = "A board's entries a page at a time, newest first, each as this person may see it")
    BoardEntriesResponse entries(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Only entries of this kind") @RequestParam(required = false) String kind,
            @Parameter(description = "Only entries for this member") @RequestParam(required = false) UUID member,
            @Parameter(description = "One of the template's own filters, such as voice") @RequestParam(required = false)
                    String filter,
            @Parameter(description = "Only entries with these words, in what this person may read")
                    @RequestParam(name = "q", required = false)
                    String words,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return boards.entries(id, me, kind, member, filter, words, Keyset.of(cursor, limit, 30), day);
    }

    @PostMapping("/boards/{id}/entries")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addBoardEntry", summary = "Add one entry to a board")
    EntryAddedResponse add(
            @Me UUID me,
            @PathVariable UUID id,
            @Valid @RequestBody NewBoardEntryRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return boards.add(id, me, request.kind(), request.fields(), request.clientId(), day);
    }

    @PatchMapping("/board-entries/{entryId}")
    @Operation(operationId = "changeBoardEntry", summary = "Change one entry of a board")
    BoardResponse changeEntry(
            @Me UUID me,
            @PathVariable UUID entryId,
            @Valid @RequestBody EntryChangeRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return boards.changeEntry(entryId, me, request.fields(), day);
    }

    @DeleteMapping("/board-entries/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeBoardEntry",
            summary = "Remove one entry of a board. Removing one that is gone is fine.")
    void removeEntry(@Me UUID me, @PathVariable UUID entryId) {
        boards.removeEntry(entryId, me);
    }

    @PostMapping("/boards/{id}/act")
    @Operation(
            operationId = "actOnBoard",
            summary = "Do one of the template's own verbs (seal, open, tick) and get the board back")
    BoardResponse act(
            @Me UUID me,
            @PathVariable UUID id,
            @Valid @RequestBody ActRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return boards.act(id, me, request.verb(), request.body(), day);
    }
}
