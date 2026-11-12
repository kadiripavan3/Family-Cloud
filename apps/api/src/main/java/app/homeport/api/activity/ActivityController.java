package app.homeport.api.activity;

import app.homeport.api.activity.ActivityService.ActivityResponse;
import app.homeport.api.activity.ActivityService.UnreadResponse;
import app.homeport.api.activity.AskService.AskResponse;
import app.homeport.api.activity.AskService.AskStanding;
import app.homeport.api.auth.Me;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
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
@Tag(name = "activity", description = "What changed, what is due and who is asking")
class ActivityController {

    private final ActivityService activity;
    private final AskService asks;

    ActivityController(ActivityService activity, AskService asks) {
        this.activity = activity;
        this.asks = asks;
    }

    @GetMapping("/circles/{id}/activity")
    @Operation(
            operationId = "getActivity",
            summary = "A circle's Activity, newest first: what changed, what is due and who is asking",
            description = "Only what you may see: a line about a thing is there while that thing is shared with"
                    + " you, and never your own changes. Lines about the same thing on the same day are one.")
    ActivityResponse read(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Which chip: all, asks, photos, money or plan. All when left out.")
                    @RequestParam(required = false)
                    ActivityFilter filter,
            @Parameter(description = "The phone's time zone, such as Europe/Ljubljana: for times inside sentences")
                    @RequestParam(required = false)
                    String zone,
            @Parameter(description = "The day on the phone. Today in that time zone when left out.")
                    @RequestParam(required = false)
                    LocalDate day,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return activity.read(id, me, filter, zone(zone), day, Keyset.of(cursor, limit, 30));
    }

    @GetMapping("/circles/{id}/activity/unread")
    @Operation(
            operationId = "getUnreadActivity",
            summary = "How many lines are new since you last opened Activity here: the dot on the tab")
    UnreadResponse unread(@Me UUID me, @PathVariable UUID id) {
        return activity.unread(id, me);
    }

    @PutMapping("/circles/{id}/activity/seen")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "markActivitySeen",
            summary = "You have looked at Activity here: nothing before now is new")
    void seen(@Me UUID me, @PathVariable UUID id) {
        activity.seen(id, me);
    }

    record MuteRequest(
            @NotNull(message = "Say whether to mute it.") Boolean muted) {}

    @PutMapping("/circles/{id}/mute")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "muteCircle",
            summary = "Mute a circle, or let it be heard again",
            description = "Nothing that happens in a muted circle is pushed to you. Activity still shows it all,"
                    + " and news about your own safety (your Vault) is told whatever you muted.")
    void mute(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody MuteRequest request) {
        activity.mute(id, me, request.muted());
    }

    // ---------- asking to see something ----------

    record AskToSeeRequest(
            @NotNull(message = "A request needs a clientId.")
            UUID clientId,

            @Schema(nullable = true, description = "You would like it until this moment: for today only")
            Instant until,

            @Schema(nullable = true, description = "You would like it for one look")
            Boolean once) {}

    @GetMapping("/things/{id}/ask")
    @Operation(
            operationId = "getAsk",
            summary = "Whether you can ask to see this thing, and what became of the last time you asked",
            description = "You can ask when you may see that it exists and have no way to open it: a Vault item"
                    + " whose key was for one look, has stopped working or hasn't reached you yet.")
    AskStanding standing(@Me UUID me, @PathVariable UUID id) {
        return asks.standing(id, me);
    }

    @PostMapping("/things/{id}/asks")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "askToSee",
            summary = "Ask a thing's owner to open it to you",
            description = "They see the question in Activity and are told on their phone, without the thing being"
                    + " named. Asking again while a question is open keeps the one there is.")
    AskResponse ask(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody AskToSeeRequest request) {
        return asks.ask(id, me, request.until(), Boolean.TRUE.equals(request.once()), request.clientId());
    }

    record AskAnswerRequest(
            @NotNull(message = "Say yes or not now.") Boolean allow) {}

    @PutMapping("/asks/{id}")
    @Operation(
            operationId = "answerAsk",
            summary = "The owner's answer to an ask: allow, or not now",
            description = "Allowing has two steps, because only your phone can open a Vault item to someone:"
                    + " first share the item with them (PUT /v1/vault/items/{id}/sharing, with a key wrapped for"
                    + " them and the until or once they asked for), then say allow here. Until they can really"
                    + " open it, allow is refused with not_opened_yet.")
    AskResponse answer(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody AskAnswerRequest request) {
        return asks.answer(id, me, request.allow());
    }

    @DeleteMapping("/asks/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "withdrawAsk", summary = "Take back something you asked")
    void withdraw(@Me UUID me, @PathVariable UUID id) {
        asks.withdraw(id, me);
    }

    private static ZoneId zone(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        try {
            return ZoneId.of(name.trim());
        } catch (RuntimeException unknown) {
            throw ApiProblem.badRequest("invalid_zone", "That isn't a time zone we know.");
        }
    }
}
