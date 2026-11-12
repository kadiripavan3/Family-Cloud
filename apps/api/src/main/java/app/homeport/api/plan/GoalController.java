package app.homeport.api.plan;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.plan.GoalService.EntryResponse;
import app.homeport.api.plan.GoalService.GoalChange;
import app.homeport.api.plan.GoalService.GoalResponse;
import app.homeport.api.plan.GoalService.GoalRowResponse;
import app.homeport.api.plan.GoalService.NewGoal;
import app.homeport.api.plan.GoalService.Source;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "goals", description = "Goals: a target, a ring, and who put in what")
class GoalController {

    private final GoalService goals;
    private final CircleService circles;

    GoalController(GoalService goals, CircleService circles) {
        this.goals = goals;
        this.circles = circles;
    }

    record SourceRequest(
            @NotNull(message = "Choose where the goal reads its number from.")
            GoalSource kind,

            @Schema(
                    description = "Where the number is, as the place that owns it names it. For a sheet: the sheet's"
                            + " id, a slash, and the name of one of its totals (GET /v1/sheets/{id}/totals).")
            @NotBlank(message = "Choose where the goal reads its number from.")
            @Size(max = 300)
            String ref,

            @Schema(description = "What to call it until that place can be read: “Saved” in Norway budget")
            @Size(max = 120)
            String words) {

        Source source() {
            return new Source(kind, ref, words);
        }
    }

    record NewGoalRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Give the goal a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 300, message = "Keep that to 300 characters or fewer.")
            String blurb,

            @Size(max = 16) String emoji,
            UUID coverMediaId,

            @Schema(description = "Left out: a plain number")
            GoalUnit unit,

            @Schema(description = "For money. Left out: EUR.")
            @Pattern(regexp = "[A-Z]{3}", message = "That isn't a currency we know.")
            String currency,

            @Schema(description = "What is counted, when it isn't money: books, stars")
            @Size(max = 20, message = "Keep that to 20 characters or fewer.")
            String unitWords,

            @Schema(description = "In the goal's unit: cents for money. Not needed for a goal that counts ticks.")
            @Min(value = 1, message = "A goal needs a target above zero.")
            @Max(100000000000L)
            Long target,

            @Schema(description = "What there is already, put in as a first entry")
            @Min(-100000000000L)
            @Max(100000000000L)
            Long current,

            @Schema(description = "Left out: a number, or elsewhere when a source is named")
            HowFar how,

            @Schema(description = "When it began. Left out: today.")
            LocalDate startDay,

            LocalDate targetDay,
            @Valid SourceRequest source,

            @Schema(description = "Steps to start with: they become a checklist linked to the goal")
            @Size(max = 100, message = "Start with 100 steps at most.")
            List<@Size(max = 300) String> steps,

            @Schema(description = "Or a checklist that is there already")
            UUID stepsListId,

            @Schema(description = "The day on the phone") LocalDate day,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience) {}

    record GoalChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 300, message = "Keep that to 300 characters or fewer.")
            String blurb,

            @Size(max = 16) String emoji,
            UUID coverMediaId,
            Boolean removeCover,

            @Size(max = 20, message = "Keep that to 20 characters or fewer.")
            String unitWords,

            @Min(value = 1, message = "A goal needs a target above zero.") @Max(100000000000L)
            Long target,

            HowFar how,
            LocalDate startDay,
            LocalDate targetDay,
            Boolean removeTargetDay,
            @Valid SourceRequest source,
            Boolean removeSource,
            UUID stepsListId,
            @Schema(description = "The day on the phone") LocalDate day) {}

    record NewEntryRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @Schema(description = "In the goal's unit: cents for money. Below zero to take something out.")
            @NotNull(message = "Say how much.")
            @Min(-100000000000L)
            @Max(100000000000L)
            Long amount,

            @Schema(description = "A few words: payday, from her pocket money")
            @Size(max = 200, message = "Keep the note to 200 characters or fewer.")
            String note,

            @Schema(description = "Left out: today") LocalDate day,

            @Schema(description = "Who put it in, when not you: a child's pocket money")
            UUID memberId) {}

    @PostMapping("/goals")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createGoal", summary = "Start a goal")
    GoalResponse create(@Me UUID me, @Valid @RequestBody NewGoalRequest request) {
        return goals.create(
                me,
                new NewGoal(
                        request.circleId(),
                        request.title(),
                        request.blurb(),
                        request.emoji(),
                        request.coverMediaId(),
                        request.unit(),
                        request.currency(),
                        request.unitWords(),
                        request.target(),
                        request.current(),
                        request.how(),
                        request.startDay(),
                        request.targetDay(),
                        request.source() == null ? null : request.source().source(),
                        request.steps(),
                        request.stepsListId(),
                        request.audience()),
                request.clientId(),
                request.day());
    }

    @GetMapping("/goals/{id}")
    @Operation(
            operationId = "getGoal",
            summary = "One goal: the ring, the pace, who put in what lately, and each month of a year")
    GoalResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day,
            @Parameter(description = "The year the twelve months are of. Left out: this year.")
                    @RequestParam(required = false)
                    Integer year) {
        return goals.get(id, me, day, year);
    }

    @PatchMapping("/goals/{id}")
    @Operation(operationId = "changeGoal", summary = "Change a goal. What is left out stays as it is.")
    GoalResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody GoalChangeRequest request) {
        return goals.change(
                id,
                me,
                new GoalChange(
                        request.title(),
                        request.blurb(),
                        request.emoji(),
                        request.coverMediaId(),
                        Boolean.TRUE.equals(request.removeCover()),
                        request.unitWords(),
                        request.target(),
                        request.how(),
                        request.startDay(),
                        request.targetDay(),
                        Boolean.TRUE.equals(request.removeTargetDay()),
                        request.source() == null ? null : request.source().source(),
                        Boolean.TRUE.equals(request.removeSource()),
                        request.stepsListId()),
                request.day());
    }

    @GetMapping("/circles/{id}/goals")
    @Operation(
            operationId = "getGoals",
            summary = "The goals of a circle you can see, each with its ring and its line. A hundred at most.")
    List<GoalRowResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        circles.require(id, me);
        return goals.list(id, me, day);
    }

    @PostMapping("/goals/{id}/entries")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addGoalEntry", summary = "Put something into a goal: Add money")
    EntryResponse addEntry(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewEntryRequest request) {
        return goals.addEntry(
                id, me, request.amount(), request.note(), request.day(), request.memberId(), request.clientId());
    }

    @GetMapping("/goals/{id}/entries")
    @Operation(operationId = "getGoalEntries", summary = "Who put what into a goal, the latest first")
    Page<EntryResponse> entries(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return goals.entries(id, me, Keyset.of(cursor, limit, 30));
    }

    @DeleteMapping("/goal-entries/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeGoalEntry", summary = "Take an entry back. Removing one that is gone is fine.")
    void removeEntry(@Me UUID me, @PathVariable UUID entryId) {
        goals.removeEntry(entryId, me);
    }
}
