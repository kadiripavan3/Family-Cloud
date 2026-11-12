package app.homeport.api.jot;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.jot.JotService.JotResponse;
import app.homeport.api.jot.JotService.ListBriefResponse;
import app.homeport.api.jot.JotService.ReadingResponse;
import app.homeport.api.jot.JotService.WaysChange;
import app.homeport.api.jot.JotService.WaysResponse;
import app.homeport.api.jot.JotService.WidgetsResponse;
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
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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
@Tag(name = "jot", description = "One line that takes anything: read it, file it, undo it, move it")
class JotController {

    private final JotService jots;
    private final CircleService circles;

    JotController(JotService jots, CircleService circles) {
        this.jots = jots;
        this.circles = circles;
    }

    record ReadRequest(
            @NotBlank(message = "Write something first.")
            @Size(max = 20000, message = "That is too long to read. Send a shorter part.")
            String text,

            @Schema(description = "The day on the phone. The API's own day in that time zone when left out.")
            LocalDate day,

            @Schema(description = "The time zone of the phone, such as Europe/Ljubljana")
            String timeZone) {}

    record JotRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Write something first.")
            @Size(max = 2000, message = "Keep a jot to 2,000 characters or fewer.")
            String text,

            @Schema(description = "The day on the phone") LocalDate day,

            @Schema(description = "The time zone of the phone, such as Europe/Ljubljana")
            String timeZone,

            @Schema(description = "Where it came from. Left out: the app.")
            JotSource source,

            @Schema(description = "Who sees what it makes. Left out: what the circle's kind starts things as.")
            Audience audience) {}

    record MoveRequest(
            @Schema(description = "What it becomes: an event, a reminder, a line of a list, or a note")
            @NotNull(message = "Choose where it goes.")
            ReadAs to,

            @Schema(description = "For a list: which one. Left out: the shopping list.")
            UUID listId,

            LocalDate day,
            String timeZone,
            Audience audience) {}

    record WaysRequest(
            Boolean pinnedNote,
            Boolean voice,
            Boolean share,
            TimedAs timedAs,
            CodesGo codes,

            @Schema(description = "The list your shopping goes to in this circle")
            UUID buyListId,

            @Schema(description = "True: back to the circle's own shopping list")
            Boolean useCirclesList) {}

    record ListRequest(@NotNull(message = "Choose a list.") UUID listId) {}

    @PostMapping("/circles/{id}/read")
    @Operation(
            operationId = "readLine",
            summary = "How a line would be read, without saving anything: the things in it, and the pieces of"
                    + " the line each was read from. A long text gives back the days and amounts found in it.")
    ReadingResponse read(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ReadRequest request) {
        return jots.read(id, me, request.text(), request.day(), request.timeZone());
    }

    @PostMapping("/circles/{id}/jots")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "jot",
            summary = "Read a line and file everything in it: an event, a reminder, a line on the shopping"
                    + " list, a note. Answers with what was made and where. A code is held back, not filed.")
    List<JotResponse> jot(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody JotRequest request) {
        return jots.jot(
                id,
                me,
                request.text(),
                request.day(),
                request.timeZone(),
                request.source(),
                request.audience(),
                request.clientId());
    }

    @GetMapping("/circles/{id}/jots")
    @Operation(operationId = "getJots", summary = "What you jotted in a circle and what each became, the latest first")
    Page<JotResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone, for words like tomorrow")
                    @RequestParam(required = false)
                    LocalDate day,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return jots.list(id, me, day, Keyset.of(cursor, limit, 30));
    }

    @DeleteMapping("/jots/{jotId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "undoJot",
            summary = "Undo a jot: what it made is removed. For a code that was held back: forget it (after the"
                    + " phone kept it in the Vault, or because it isn't wanted). Undoing what is gone is fine.")
    void undo(@Me UUID me, @PathVariable UUID jotId) {
        jots.undo(jotId, me);
    }

    @PutMapping("/jots/{jotId}/move")
    @Operation(
            operationId = "moveJot",
            summary = "Move a jot to another kind or another list: what it made is removed and its words are"
                    + " filed again. Also how a held-back code becomes just a note.")
    JotResponse move(@Me UUID me, @PathVariable UUID jotId, @Valid @RequestBody MoveRequest request) {
        return jots.move(
                jotId, me, request.to(), request.listId(), request.day(), request.timeZone(), request.audience());
    }

    @GetMapping("/circles/{id}/jot-ways")
    @Operation(
            operationId = "getJotWays",
            summary = "The ways in you switched on, and where your jots go in this circle when it isn't obvious")
    WaysResponse ways(@Me UUID me, @PathVariable UUID id) {
        return jots.ways(id, me);
    }

    @PutMapping("/circles/{id}/jot-ways")
    @Operation(operationId = "saveJotWays", summary = "Change the ways in and where jots go. What is left out stays.")
    WaysResponse saveWays(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody WaysRequest request) {
        return jots.saveWays(
                id,
                me,
                new WaysChange(
                        request.pinnedNote(),
                        request.voice(),
                        request.share(),
                        request.timedAs(),
                        request.codes(),
                        request.buyListId(),
                        Boolean.TRUE.equals(request.useCirclesList())));
    }

    @PutMapping("/circles/{id}/shopping-list")
    @Operation(
            operationId = "markShoppingList",
            summary = "Mark a checklist as the circle's shopping list: what reads like shopping lands in it")
    ListBriefResponse markShoppingList(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ListRequest request) {
        return jots.markShoppingList(id, me, request.listId());
    }

    @PutMapping("/circles/{id}/list-in-use")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "useList",
            summary = "Say which list you are using right now (at the shop). It shows on the Lock Screen of"
                    + " everyone who may see it, for eight hours.")
    void use(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ListRequest request) {
        jots.use(id, me, request.listId());
    }

    @DeleteMapping("/circles/{id}/list-in-use")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "stopUsingList", summary = "Say you are done with the list you were using")
    void stopUsing(@Me UUID me, @PathVariable UUID id) {
        jots.use(id, me, null);
    }

    @GetMapping("/circles/{id}/widgets")
    @Operation(
            operationId = "getWidgets",
            summary = "What the widgets, the pinned note and the Lock Screen show: chips of what is added most"
                    + " (eight at most), the shopping list, the list in use, what is next today, how many jotted today")
    WidgetsResponse widgets(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone") @RequestParam(required = false) LocalDate day,
            @Parameter(description = "The time zone of the phone, such as Europe/Ljubljana")
                    @RequestParam(required = false)
                    String timeZone) {
        return jots.widgets(id, me, day, timeZone);
    }
}
