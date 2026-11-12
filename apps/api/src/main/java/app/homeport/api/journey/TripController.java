package app.homeport.api.journey;

import app.homeport.api.auth.Me;
import app.homeport.api.journey.TripService.TripBrief;
import app.homeport.api.journey.TripService.TripChange;
import app.homeport.api.journey.TripService.TripResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
@Tag(name = "trips", description = "A trip, start to finish: planned here, told in Journey, kept as a book")
class TripController {

    private final TripService trips;

    TripController(TripService trips) {
        this.trips = trips;
    }

    record TripRequest(
            @Schema(description = "Its first day. Needed the first time.")
            LocalDate startsOn,

            @Schema(description = "Its last day. Needed the first time.")
            LocalDate endsOn,

            @Schema(
                    nullable = true,
                    description = "The sheet that is its budget. Left out: the first sheet filed in it.")
            UUID budgetSheetId) {}

    record TripJourneyRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @Schema(description = "What the journey starts as in Journey. Left out: private.")
            JourneyVisibility visibility) {}

    @GetMapping("/circles/{id}/trips")
    @Operation(
            operationId = "getTrips",
            summary = "The trips of a circle that you may see: the folders that were given dates. Fifty at most.")
    List<TripBrief> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return trips.list(id, me, day);
    }

    @GetMapping("/trips/{id}")
    @Operation(
            operationId = "getTrip",
            summary =
                    "A trip: its stage, what is filed in it, the journey it becomes or became, its book and what it cost. The id is its folder's.")
    TripResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return trips.get(id, me, day);
    }

    @PutMapping("/trips/{id}")
    @Operation(
            operationId = "saveTrip",
            summary =
                    "Give a folder its dates (it is a trip from then on), or change them. Only what you send changes.")
    TripResponse save(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) LocalDate day,
            @Valid @RequestBody TripRequest r) {
        return trips.save(id, me, new TripChange(r.startsOn(), r.endsOn(), r.budgetSheetId()), day);
    }

    @DeleteMapping("/trips/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeTrip",
            summary = "The folder stops being a trip. The folder and everything in it stay.")
    void remove(@Me UUID me, @PathVariable UUID id) {
        trips.remove(id, me);
    }

    @PostMapping("/trips/{id}/journey")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "startTripJourney",
            summary =
                    "The trip becomes a journey: Journey is told its title, its first day and who writes in it. A trip becomes a journey once.")
    TripResponse become(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) LocalDate day,
            @Valid @RequestBody TripJourneyRequest r) {
        return trips.become(id, me, r.clientId(), r.visibility(), day);
    }
}
