package app.homeport.api.journey;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.journey.AtHomeService.AppSwitchResponse;
import app.homeport.api.journey.AtHomeService.AtHomeResponse;
import app.homeport.api.journey.AtHomeService.AwayResponse;
import app.homeport.api.journey.AtHomeService.CircleForJourney;
import app.homeport.api.journey.HomeSettings.HomeSettingsChange;
import app.homeport.api.journey.HomeSettings.HomeSettingsResponse;
import app.homeport.api.journey.JourneyJobs.JourneyJobResponse;
import app.homeport.api.journey.JourneyPort.JourneyBrief;
import app.homeport.api.journey.KeepService.JourneyBookResponse;
import app.homeport.api.journey.KeepService.JourneyRouteResponse;
import app.homeport.api.journey.KeepService.KeepOptions;
import app.homeport.api.journey.KeepService.KeepRequest;
import app.homeport.api.journey.KeepService.KeptResponse;
import app.homeport.api.thing.Audience;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
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
@Tag(name = "journey", description = "With Journey: one account, keeping a journey, Journey at home")
class JourneyController {

    private final JourneyPort port;
    private final AtHomeService atHome;
    private final KeepService keeps;
    private final JourneyJobs jobs;
    private final HomeSettings homes;

    JourneyController(JourneyPort port, AtHomeService atHome, KeepService keeps, JourneyJobs jobs, HomeSettings homes) {
        this.port = port;
        this.atHome = atHome;
        this.keeps = keeps;
        this.jobs = jobs;
        this.homes = homes;
    }

    record KeepJourneyRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotNull(message = "Choose a journey.") UUID journeyId,

            @Schema(description = "The story, as a book: one page in Notes. Left out: yes.")
            Boolean book,

            @Schema(description = "The originals: its photos and clips in the Library, in an album. Left out: yes.")
            Boolean originals,

            @Schema(description = "The route: where each entry was, on what is kept. Left out: yes.")
            Boolean route,

            @Schema(description = "Comments and likes, kept with each day. Left out: no.")
            Boolean words,

            @Schema(nullable = true, description = "The folder to file the book in. Left out: not filed.")
            UUID folderId,

            @Schema(
                    description =
                            "Who can see it. Left out: everyone in the circle, or what the circle starts things as for a private journey.")
            Audience audience,

            @Schema(
                    nullable = true,
                    description = "A trip (its folder) this journey belongs to: the trip then shows the book")
            UUID tripId) {}

    record HomeSettingsRequest(
            @DecimalMin("-90") @DecimalMax("90") Double homeLat,
            @DecimalMin("-180") @DecimalMax("180") Double homeLng,

            @Schema(description = "True to forget where home is")
            Boolean removeHome,

            @Min(value = 25, message = "Home is at least 25 metres around.")
            @Max(value = 5000, message = "Home is at most 5 kilometres around.")
            Integer homeRadiusM,

            @Schema(type = "string", example = "20:00", description = "When a goodnight is shown at home")
            @JsonFormat(pattern = "HH:mm")
            LocalTime bedtime,

            @Schema(description = "The clock home keeps, as the phone names it: Europe/Ljubljana") @Size(max = 64)
            String timeZone) {}

    // ---------- one account, two apps ----------

    @GetMapping("/journey/me")
    @Operation(
            operationId = "getJourneySwitch",
            summary =
                    "What the switch between the two apps shows: whether you have a Journey profile, its name, picture and counts")
    AppSwitchResponse me(@Me UUID me) {
        return atHome.me(me);
    }

    @GetMapping("/journey/circles")
    @Operation(
            operationId = "getCirclesForJourney",
            summary =
                    "For Journey: the circles you are in and who is in them. Nothing of what a circle keeps. As many as you are in.")
    List<CircleForJourney> circles(@Me UUID me) {
        return atHome.circlesForJourney(me);
    }

    // ---------- keep a journey ----------

    @GetMapping("/journey/journeys")
    @Operation(
            operationId = "getMyJourneys",
            summary = "Your own journeys in Journey, active and completed, newest first")
    Page<JourneyBrief> journeys(
            @Me UUID me, @RequestParam(required = false) String cursor, @RequestParam(required = false) Integer limit) {
        return port.journeys(Caller.of(me), cursor, Keyset.of(null, limit, 20).limit());
    }

    @GetMapping("/journey/journeys/{journeyId}/keep-options")
    @Operation(
            operationId = "getKeepOptions",
            summary =
                    "What \"Keep this journey\" shows: the journey, how many of its photos are in your Library already, where it would be kept")
    KeepOptions options(@Me UUID me, @PathVariable UUID journeyId, @RequestParam UUID circleId) {
        return keeps.options(me, circleId, journeyId);
    }

    @PostMapping("/journey/keeps")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "keepJourney",
            summary =
                    "Keep a journey, or bring home what was added to one you kept. Answers at once with a job; ask the job how far it is.")
    JourneyJobResponse keep(@Me UUID me, @Valid @RequestBody KeepJourneyRequest r) {
        return keeps.keep(
                me,
                new KeepRequest(
                        r.clientId(),
                        r.circleId(),
                        r.journeyId(),
                        r.book(),
                        r.originals(),
                        r.route(),
                        r.words(),
                        r.folderId(),
                        r.audience(),
                        r.tripId()));
    }

    @GetMapping("/journey/jobs/{id}")
    @Operation(operationId = "getJourneyJob", summary = "How far keeping a journey, or sending a draft, has got")
    JourneyJobResponse job(@Me UUID me, @PathVariable UUID id) {
        return jobs.get(id, me);
    }

    @GetMapping("/circles/{id}/journey/kept")
    @Operation(
            operationId = "getKeptJourneys",
            summary = "The journeys kept in a circle that you may see, the last kept first")
    Page<KeptResponse> kept(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return keeps.list(id, me, Keyset.of(cursor, limit, 30));
    }

    @GetMapping("/journey/kept/{id}")
    @Operation(operationId = "getKeptJourney", summary = "One kept journey: its numbers, its book and its album")
    KeptResponse keptOne(@Me UUID me, @PathVariable UUID id) {
        return keeps.get(id, me);
    }

    @DeleteMapping("/journey/kept/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "stopKeepingJourney",
            summary =
                    "Forget that a journey was kept. Its page, album and photos stay; each is deleted like any other thing.")
    void forget(@Me UUID me, @PathVariable UUID id) {
        keeps.forget(id, me);
    }

    @GetMapping("/journey/books/{id}")
    @Operation(
            operationId = "getJourneyBook",
            summary =
                    "A kept journey laid out as a book: its numbers, then each day with its words and photos, read from its page as it stands. The id is the page's.")
    JourneyBookResponse book(@Me UUID me, @PathVariable UUID id) {
        return keeps.book(id, me);
    }

    @GetMapping("/circles/{id}/journey/routes")
    @Operation(
            operationId = "getJourneyRoutes",
            summary = "The routes of the kept journeys you may see, for the Places map. Fifty journeys at most.")
    List<JourneyRouteResponse> routes(@Me UUID me, @PathVariable UUID id) {
        return keeps.routes(id, me);
    }

    // ---------- Journey, at home ----------

    @GetMapping("/circles/{id}/journey/at-home")
    @Operation(
            operationId = "getJourneyAtHome",
            summary =
                    "Who of the circle is away on a journey you may see, a day from a kept journey of an earlier year, and the goodnights that wait for bedtime")
    AtHomeResponse atHome(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return atHome.atHome(id, me, day);
    }

    @PutMapping("/circles/{id}/journey/entries/{entryId}/love")
    @Operation(
            operationId = "loveJourneyEntry",
            summary =
                    "Give a heart at home to the latest entry of someone who is away. It stays here: Journey is not told.")
    List<AwayResponse> love(
            @Me UUID me,
            @PathVariable UUID id,
            @PathVariable UUID entryId,
            @Parameter(description = "A child or someone else without a phone the heart is from. Left out: yourself.")
                    @RequestParam(required = false)
                    UUID as) {
        return atHome.love(id, me, entryId, as, true);
    }

    @DeleteMapping("/circles/{id}/journey/entries/{entryId}/love")
    @Operation(operationId = "unloveJourneyEntry", summary = "Take that heart back")
    List<AwayResponse> unlove(
            @Me UUID me, @PathVariable UUID id, @PathVariable UUID entryId, @RequestParam(required = false) UUID as) {
        return atHome.love(id, me, entryId, as, false);
    }

    @GetMapping("/circles/{id}/journey/settings")
    @Operation(
            operationId = "getHomeSettings",
            summary =
                    "Where home is (photos taken there stay home when a journey is told) and when bedtime is (a goodnight waits until then)")
    HomeSettingsResponse settings(@Me UUID me, @PathVariable UUID id) {
        return homes.get(id, me);
    }

    @PutMapping("/circles/{id}/journey/settings")
    @Operation(
            operationId = "changeHomeSettings",
            summary =
                    "Say where home is, or when bedtime is. Only what you send changes. For the people who run the circle.")
    HomeSettingsResponse changeSettings(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody HomeSettingsRequest r) {
        return homes.change(
                id,
                me,
                new HomeSettingsChange(
                        r.homeLat(), r.homeLng(), r.removeHome(), r.homeRadiusM(), r.bedtime(), r.timeZone()));
    }
}
