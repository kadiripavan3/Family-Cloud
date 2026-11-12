package app.homeport.api.journey;

import app.homeport.api.auth.Me;
import app.homeport.api.journey.JourneyJobs.JourneyJobResponse;
import app.homeport.api.journey.TellService.DayLine;
import app.homeport.api.journey.TellService.DraftChange;
import app.homeport.api.journey.TellService.JourneyDraftResponse;
import app.homeport.api.journey.TellService.LeavingCheckChange;
import app.homeport.api.journey.TellService.LeavingCheckResponse;
import app.homeport.api.journey.TellService.Move;
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
@Tag(
        name = "journey-drafts",
        description = "Tell it as a journey: a draft from the Library, and the check before it leaves home")
class TellController {

    private final TellService tell;

    TellController(TellService tell) {
        this.tell = tell;
    }

    record NewJourneyDraftRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @Schema(
                    nullable = true,
                    description =
                            "A photo or video: its moment, and the days next to it that have photos too, become the draft")
            UUID momentOf,

            @Schema(nullable = true, description = "Or an album: its photos and videos become the draft")
            UUID albumId) {}

    record JourneyDraftChangeRequest(
            @Size(min = 1, max = 80, message = "Give it a title of 80 characters or fewer.")
            String title,

            @Schema(description = "New first lines for days of the draft") @Size(max = 400)
            List<@Valid JourneyDraftDayRequest> days,

            @Schema(description = "Photos to put on another day") @Size(max = 500)
            List<@Valid JourneyDraftMoveRequest> move,

            @Schema(description = "Photos to take out of the draft") @Size(max = 500)
            List<@NotNull UUID> drop,

            @Schema(description = "Dropped photos to put back") @Size(max = 500)
            List<@NotNull UUID> restore) {}

    record JourneyDraftDayRequest(
            @NotNull java.time.LocalDate day,

            @Size(max = 2000, message = "Keep a day's words to 2,000 characters or fewer.")
            String line) {}

    record JourneyDraftMoveRequest(
            @NotNull UUID itemId, @NotNull java.time.LocalDate day) {}

    record LeavingCheckRequest(
            @Schema(description = "Leave out photos and videos that are about a child")
            Boolean leaveOutChildren,

            @Schema(description = "Show the town, not the spot")
            Boolean townOnly,

            @Schema(description = "Skip what was taken at home")
            Boolean skipHome,

            @Schema(description = "What the journey starts as in Journey: private, unlisted or public")
            JourneyVisibility visibility,

            @Schema(description = "Things to send after all, although a rule left them out") @Size(max = 500)
            List<@NotNull UUID> backOn,

            @Schema(description = "Things to leave to the rules again") @Size(max = 500)
            List<@NotNull UUID> backOff) {}

    record PostJourneyDraftRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId) {}

    @PostMapping("/journey/drafts")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "draftJourney",
            summary =
                    "Draft a journey from a moment or an album: its photos sorted into days, a title, a first line for each day. Nothing is sent.")
    JourneyDraftResponse create(@Me UUID me, @Valid @RequestBody NewJourneyDraftRequest r) {
        return tell.create(me, r.circleId(), r.momentOf(), r.albumId(), r.clientId());
    }

    @GetMapping("/journey/drafts/{id}")
    @Operation(operationId = "getJourneyDraft", summary = "A draft of a journey. It is its writer's alone.")
    JourneyDraftResponse get(@Me UUID me, @PathVariable UUID id) {
        return tell.get(id, me);
    }

    @PatchMapping("/journey/drafts/{id}")
    @Operation(
            operationId = "changeJourneyDraft",
            summary = "Change a draft: its title, a day's first line, which day a photo is in, what is dropped")
    JourneyDraftResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody JourneyDraftChangeRequest r) {
        return tell.change(
                id,
                me,
                new DraftChange(
                        r.title(),
                        r.days() == null
                                ? null
                                : r.days().stream()
                                        .map(day -> new DayLine(day.day(), day.line()))
                                        .toList(),
                        r.move() == null
                                ? null
                                : r.move().stream()
                                        .map(move -> new Move(move.itemId(), move.day()))
                                        .toList(),
                        r.drop(),
                        r.restore()));
    }

    @DeleteMapping("/journey/drafts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteJourneyDraft", summary = "Throw a draft away. Nothing of it ever left.")
    void delete(@Me UUID me, @PathVariable UUID id) {
        tell.delete(id, me);
    }

    @GetMapping("/journey/drafts/{id}/check")
    @Operation(
            operationId = "checkJourneyDraft",
            summary =
                    "Before it leaves home: what a journey would show, what is left out and why, and what to look at twice")
    LeavingCheckResponse check(@Me UUID me, @PathVariable UUID id) {
        return tell.check(id, me);
    }

    @PutMapping("/journey/drafts/{id}/check")
    @Operation(
            operationId = "changeJourneyDraftCheck",
            summary =
                    "Turn a switch of \"Before it leaves home\", switch single photos back on, or choose what the journey starts as. Only what you send changes.")
    LeavingCheckResponse setCheck(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody LeavingCheckRequest r) {
        return tell.setCheck(
                id,
                me,
                new LeavingCheckChange(
                        r.leaveOutChildren(), r.townOnly(), r.skipHome(), r.visibility(), r.backOn(), r.backOff()));
    }

    @PostMapping("/journey/drafts/{id}/post")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "postJourneyDraft",
            summary =
                    "Create the journey: send what the check lets through to Journey. Answers at once with a job; ask the job how far it is.")
    JourneyJobResponse post(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody PostJourneyDraftRequest r) {
        return tell.post(id, me, r.clientId());
    }
}
