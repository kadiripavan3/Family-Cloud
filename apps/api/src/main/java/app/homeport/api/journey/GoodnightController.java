package app.homeport.api.journey;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.journey.GoodnightService.GoodnightResponse;
import app.homeport.api.journey.GoodnightService.NewGoodnight;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.OffsetDateTime;
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
@Tag(name = "goodnights", description = "Goodnight from far away: a clip for the circle, never part of a journey")
class GoodnightController {

    private final GoodnightService goodnights;

    GoodnightController(GoodnightService goodnights) {
        this.goodnights = goodnights;
    }

    record NewGoodnightRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @Schema(description = "The clip: an upload of kind video")
            @NotNull(message = "The clip didn't finish uploading. Record it again.")
            UUID mediaId,

            @Schema(nullable = true, description = "A still to show before it plays: an upload of kind photo")
            UUID posterMediaId,

            @Size(max = 200, message = "Keep those words to 200 characters or fewer.")
            String title,

            @Schema(description = "When it was recorded, with the offset of the clock there: 2026-11-11T19:10:00+01:00")
            @JsonFormat(without = JsonFormat.Feature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE)
            OffsetDateTime recordedAt,

            @Schema(description = "The day at home it is meant for. Left out: the day it was recorded.")
            LocalDate forDay,

            @Size(max = 80, message = "Keep the place's name to 80 characters or fewer.")
            String place,

            @Schema(description = "Where the sender's journey stands: Day 6") @Size(max = 40)
            String dayLabel,

            @Schema(nullable = true, description = "The journey the sender is on, as Journey names it")
            UUID journeyId,

            @Schema(nullable = true, description = "The goodnight this one answers, when it is one sent back")
            UUID replyTo) {}

    @PostMapping("/goodnights")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "sendGoodnight",
            summary =
                    "Send a goodnight to a circle, or one back in answer. It is shared with the circle and never goes to Journey.")
    GoodnightResponse create(@Me UUID me, @Valid @RequestBody NewGoodnightRequest r) {
        return goodnights.create(
                me,
                new NewGoodnight(
                        r.clientId(),
                        r.circleId(),
                        r.mediaId(),
                        r.posterMediaId(),
                        r.title(),
                        r.recordedAt(),
                        r.forDay(),
                        r.place(),
                        r.dayLabel(),
                        r.journeyId(),
                        r.replyTo()));
    }

    @GetMapping("/goodnights/{id}")
    @Operation(operationId = "getGoodnight", summary = "One goodnight: the clip, who sent it from where, who loved it")
    GoodnightResponse get(@Me UUID me, @PathVariable UUID id) {
        return goodnights.get(id, me);
    }

    @GetMapping("/circles/{id}/goodnights")
    @Operation(operationId = "getGoodnights", summary = "The goodnights of a circle that you may see, the newest first")
    Page<GoodnightResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return goodnights.list(id, me, Keyset.of(cursor, limit, 20));
    }

    @PutMapping("/goodnights/{id}/love")
    @Operation(operationId = "loveGoodnight", summary = "Give a goodnight a heart")
    GoodnightResponse love(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "A child or someone else without a phone the heart is from. Left out: yourself.")
                    @RequestParam(required = false)
                    UUID as) {
        return goodnights.love(id, me, as, true);
    }

    @DeleteMapping("/goodnights/{id}/love")
    @Operation(operationId = "unloveGoodnight", summary = "Take that heart back")
    GoodnightResponse unlove(@Me UUID me, @PathVariable UUID id, @RequestParam(required = false) UUID as) {
        return goodnights.love(id, me, as, false);
    }
}
