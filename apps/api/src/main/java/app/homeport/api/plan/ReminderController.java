package app.homeport.api.plan;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.plan.ReminderService.DoneResponse;
import app.homeport.api.plan.ReminderService.NewReminder;
import app.homeport.api.plan.ReminderService.Place;
import app.homeport.api.plan.ReminderService.ReminderChange;
import app.homeport.api.plan.ReminderService.ReminderResponse;
import app.homeport.api.plan.ReminderService.RemindersResponse;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
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
@Tag(name = "reminders", description = "Reminders: yours, the ones you gave to someone, and whose turn it is")
class ReminderController {

    private final ReminderService reminders;
    private final CircleService circles;

    ReminderController(ReminderService reminders, CircleService circles) {
        this.reminders = reminders;
        this.circles = circles;
    }

    record PlaceRequest(
            @Schema(description = "The place in words: the post office")
            @NotBlank(message = "Say what the place is: the post office, the shop.")
            @Size(max = 200, message = "Keep the place to 200 characters or fewer.")
            String words,

            @DecimalMin("-90") @DecimalMax("90") Double lat,
            @DecimalMin("-180") @DecimalMax("180") Double lng,

            @Schema(description = "How near counts, in metres. Left out: 200.") @Min(50) @Max(5000)
            Integer radiusM) {

        Place place() {
            return new Place(words, lat, lng, radiusM);
        }
    }

    record NewReminderRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Write what to remember.")
            @Size(max = 200, message = "Keep it to 200 characters or fewer.")
            String title,

            @Size(max = 4000, message = "Those notes are too long.")
            String notes,

            @Schema(description = "Left out: no day. It waits for a place, or for some time.")
            LocalDate dueOn,

            @Schema(type = "string", example = "19:00", description = "Left out: any time that day")
            LocalTime dueTime,

            @Schema(description = "The time zone of the phone, such as Europe/Ljubljana")
            @NotBlank(message = "Something went wrong on our side. Try again.")
            String timeZone,

            @Schema(description = "Push this many minutes before it is due. Left out: when it is due.")
            @Min(0)
            @Max(40320)
            Integer remindMinutes,

            @Valid Recurrence repeat,

            @Schema(description = "Who it is given to, in the order they take turns. Giving it shows it to them.")
            @Size(max = 30, message = "Give it to 30 people at most.")
            List<UUID> givenTo,

            @Schema(description = "True: one of them has it at a time, and each tick hands it on")
            Boolean takesTurns,

            @Valid PlaceRequest place,

            @Schema(description = "How many stars doing it earns") @Min(0) @Max(20)
            Integer stars,

            @Schema(description = "Whose page it shows on") @Size(max = 30)
            List<UUID> about,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience) {}

    record ReminderChangeRequest(
            @Size(min = 1, max = 200, message = "Keep it to 200 characters or fewer.")
            String title,

            @Size(max = 4000, message = "Those notes are too long.")
            String notes,

            @Schema(description = "With a day, the day and the time change together")
            LocalDate dueOn,

            @Schema(type = "string", example = "19:00") LocalTime dueTime,
            String timeZone,

            @Schema(description = "True: no day any more (and it stops repeating)")
            Boolean removeDue,

            @Min(0) @Max(40320) Integer remindMinutes,
            @Valid Recurrence repeat,
            Boolean stopRepeating,

            @Schema(description = "Everyone it is given to, in order. An empty list takes it back.")
            @Size(max = 30, message = "Give it to 30 people at most.")
            List<UUID> givenTo,

            Boolean takesTurns,

            @Schema(description = "Whose turn it is now: one of the people it is given to")
            UUID turn,

            @Valid PlaceRequest place,
            Boolean removePlace,
            @Min(0) @Max(20) Integer stars) {}

    record TickRequest(
            @Schema(description = "True to tick it, false to take the tick away")
            @NotNull(message = "Something went wrong on our side. Try again.")
            Boolean done,

            @Schema(
                    description = "The due day you were looking at. A tick that already arrived for it changes"
                            + " nothing, so sending this twice ticks once.")
            LocalDate dueOn,

            @Schema(description = "The day on the phone. One that repeats is next due after it.")
            LocalDate day) {}

    @PostMapping("/reminders")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createReminder", summary = "Write down something to do")
    ReminderResponse create(@Me UUID me, @Valid @RequestBody NewReminderRequest request) {
        return reminders.create(
                me,
                new NewReminder(
                        request.circleId(),
                        request.title(),
                        request.notes(),
                        request.dueOn(),
                        request.dueTime(),
                        request.timeZone(),
                        request.remindMinutes(),
                        request.repeat(),
                        request.givenTo(),
                        Boolean.TRUE.equals(request.takesTurns()),
                        request.place() == null ? null : request.place().place(),
                        request.stars(),
                        request.about(),
                        request.audience()),
                request.clientId());
    }

    @GetMapping("/reminders/{id}")
    @Operation(operationId = "getReminder", summary = "One reminder: when, who has it, and whether it is done")
    ReminderResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return reminders.get(id, me, day);
    }

    @PatchMapping("/reminders/{id}")
    @Operation(operationId = "changeReminder", summary = "Change a reminder. What is left out stays as it is.")
    ReminderResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ReminderChangeRequest request) {
        return reminders.change(
                id,
                me,
                new ReminderChange(
                        request.title(),
                        request.notes(),
                        request.dueOn(),
                        request.dueTime(),
                        request.timeZone(),
                        Boolean.TRUE.equals(request.removeDue()),
                        request.remindMinutes(),
                        request.repeat(),
                        Boolean.TRUE.equals(request.stopRepeating()),
                        request.givenTo(),
                        request.takesTurns(),
                        request.turn(),
                        request.place() == null ? null : request.place().place(),
                        Boolean.TRUE.equals(request.removePlace()),
                        request.stars()));
    }

    @PutMapping("/reminders/{id}/done")
    @Operation(
            operationId = "tickReminder",
            summary = "Tick a reminder or take the tick away. One that repeats moves to its next day;"
                    + " one that takes turns goes to the next person.")
    ReminderResponse tick(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody TickRequest request) {
        return reminders.tick(id, me, request.done(), request.dueOn(), request.day());
    }

    @PostMapping("/reminders/{id}/nudge")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "nudgeReminder",
            summary = "A gentle push to whoever has a reminder you made. Once an hour at most.")
    void nudge(@Me UUID me, @PathVariable UUID id) {
        reminders.nudge(id, me);
    }

    @GetMapping("/circles/{id}/reminders")
    @Operation(
            operationId = "getReminders",
            summary = "The Reminders screen: yours by day, what you gave to others, and the ones that wait for"
                    + " a place. Five hundred open reminders at most.")
    RemindersResponse list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        circles.require(id, me);
        return reminders.list(id, me, day);
    }

    @GetMapping("/circles/{id}/reminders/done")
    @Operation(operationId = "getDoneReminders", summary = "What was ticked in a circle, last ticked first")
    Page<DoneResponse> done(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return reminders.done(id, me, Keyset.of(cursor, limit, 30));
    }
}
