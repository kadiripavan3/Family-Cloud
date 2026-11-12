package app.homeport.api.plan;

import app.homeport.api.auth.Me;
import app.homeport.api.plan.EventService.EventChange;
import app.homeport.api.plan.EventService.EventResponse;
import app.homeport.api.plan.EventService.GuestChange;
import app.homeport.api.plan.EventService.GuestResponse;
import app.homeport.api.plan.EventService.NewEvent;
import app.homeport.api.plan.EventService.NewGuest;
import app.homeport.api.plan.EventService.When;
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
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
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
@Tag(name = "events", description = "Events: when, where and who is coming")
class EventController {

    private final EventService events;

    EventController(EventService events) {
        this.events = events;
    }

    record GuestRequest(
            @Schema(description = "Someone of the circle. Leave out for a name from outside it.")
            UUID memberId,

            @Size(max = 50, message = "Keep the name to 50 characters or fewer.")
            String name,

            @Schema(description = "What they do there, after their name: is taking her, drives")
            @Size(max = 80, message = "Keep that to 80 characters or fewer.")
            String part,

            Answer answer) {

        NewGuest guest() {
            return new NewGuest(memberId, name, part, answer);
        }
    }

    record NewEventRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Give it a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @NotNull(message = "Choose a day.") LocalDate day,

            @Schema(type = "string", example = "15:30", description = "Left out: all day")
            LocalTime time,

            @Schema(description = "Left out: the day it starts")
            LocalDate endDay,

            @Schema(type = "string", example = "16:15") LocalTime endTime,

            @Schema(description = "The time zone of the phone, such as Europe/Ljubljana")
            @NotBlank(message = "Something went wrong on our side. Try again.")
            String timeZone,

            @Size(max = 200, message = "Keep the place to 200 characters or fewer.")
            String place,

            @Size(max = 4000, message = "Those notes are too long.")
            String notes,

            UUID coverMediaId,

            @Schema(description = "Push this many minutes before it starts. Left out: no push.") @Min(0) @Max(40320)
            Integer remindMinutes,

            @Valid Recurrence repeat,

            @Schema(description = "Who is coming. The first one of the circle is who it is for.")
            @Size(max = 100, message = "An event takes 100 people at most.")
            List<@Valid GuestRequest> guests,

            @Schema(description = "Whose page it shows on") @Size(max = 30)
            List<UUID> about,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience) {}

    record EventChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Schema(description = "With a day, the whole of when it is changes: day, time, end and time zone together")
            LocalDate day,

            @Schema(type = "string", example = "15:30", description = "With a day and no time: all day")
            LocalTime time,

            LocalDate endDay,
            @Schema(type = "string", example = "16:15") LocalTime endTime,
            String timeZone,

            @Size(max = 200, message = "Keep the place to 200 characters or fewer.")
            String place,

            @Size(max = 4000, message = "Those notes are too long.")
            String notes,

            UUID coverMediaId,
            Boolean removeCover,
            @Min(0) @Max(40320) Integer remindMinutes,
            Boolean stopReminding,
            @Valid Recurrence repeat,
            Boolean stopRepeating) {}

    record GuestChangeRequest(
            @Size(min = 1, max = 50, message = "Keep the name to 50 characters or fewer.")
            String name,

            @Size(max = 80, message = "Keep that to 80 characters or fewer.")
            String part,

            Answer answer,
            Boolean removeAnswer) {}

    record AnswerRequest(
            @NotNull(message = "Choose going, maybe or can't.")
            Answer answer) {}

    record NewGuestRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            UUID memberId,

            @Size(max = 50, message = "Keep the name to 50 characters or fewer.")
            String name,

            @Size(max = 80, message = "Keep that to 80 characters or fewer.")
            String part,

            Answer answer) {}

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createEvent", summary = "Put an event on the calendar")
    EventResponse create(@Me UUID me, @Valid @RequestBody NewEventRequest request) {
        return events.create(
                me,
                new NewEvent(
                        request.circleId(),
                        request.title(),
                        new When(
                                request.day(), request.time(), request.endDay(), request.endTime(), request.timeZone()),
                        request.place(),
                        request.notes(),
                        request.coverMediaId(),
                        request.remindMinutes(),
                        request.repeat(),
                        request.guests() == null
                                ? List.of()
                                : request.guests().stream()
                                        .map(GuestRequest::guest)
                                        .toList(),
                        request.about(),
                        request.audience()),
                request.clientId());
    }

    @GetMapping("/events/{id}")
    @Operation(
            operationId = "getEvent",
            summary = "One event: when and where, who is coming and what they answered, and what is linked to it")
    EventResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone, for the next time it comes round")
                    @RequestParam(required = false)
                    LocalDate day) {
        return events.get(id, me, day);
    }

    @PatchMapping("/events/{id}")
    @Operation(operationId = "changeEvent", summary = "Change an event. What is left out stays as it is.")
    EventResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody EventChangeRequest request) {
        return events.change(
                id,
                me,
                new EventChange(
                        request.title(),
                        request.day() == null
                                ? null
                                : new When(
                                        request.day(),
                                        request.time(),
                                        request.endDay(),
                                        request.endTime(),
                                        request.timeZone()),
                        request.place(),
                        request.notes(),
                        request.coverMediaId(),
                        Boolean.TRUE.equals(request.removeCover()),
                        request.remindMinutes(),
                        Boolean.TRUE.equals(request.stopReminding()),
                        request.repeat(),
                        Boolean.TRUE.equals(request.stopRepeating())));
    }

    @PutMapping("/events/{id}/answer")
    @Operation(
            operationId = "answerEvent",
            summary = "Say going, maybe or can't for yourself. Anyone who can see an event may.")
    EventResponse answer(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody AnswerRequest request) {
        return events.answer(id, me, request.answer());
    }

    @DeleteMapping("/events/{id}/answer")
    @Operation(
            operationId = "unanswerEvent",
            summary = "Take your own answer back: you haven't answered again. Taking back what isn't there is fine.")
    EventResponse unanswer(@Me UUID me, @PathVariable UUID id) {
        return events.unanswer(id, me);
    }

    @PostMapping("/events/{id}/guests")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addEventGuest", summary = "Put someone on an event: one of the circle, or a name")
    GuestResponse addGuest(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewGuestRequest request) {
        return events.addGuest(
                id,
                me,
                new NewGuest(request.memberId(), request.name(), request.part(), request.answer()),
                request.clientId());
    }

    @PatchMapping("/event-guests/{guestId}")
    @Operation(
            operationId = "changeEventGuest",
            summary = "Change what someone does at an event or what they answered, one person at a time")
    GuestResponse changeGuest(@Me UUID me, @PathVariable UUID guestId, @Valid @RequestBody GuestChangeRequest request) {
        return events.changeGuest(
                guestId,
                me,
                new GuestChange(
                        request.name(), request.part(), request.answer(), Boolean.TRUE.equals(request.removeAnswer())));
    }

    @DeleteMapping("/event-guests/{guestId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeEventGuest",
            summary = "Take someone off an event. Taking off someone who is already off is fine.")
    void removeGuest(@Me UUID me, @PathVariable UUID guestId) {
        events.removeGuest(guestId, me);
    }
}
