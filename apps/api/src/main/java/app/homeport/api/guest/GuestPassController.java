package app.homeport.api.guest;

import app.homeport.api.auth.Me;
import app.homeport.api.guest.GuestPassService.GuestPassResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "guest passes", description = "Chosen things for someone outside the circle, for a set time")
class GuestPassController {

    private final GuestPassService passes;

    GuestPassController(GuestPassService passes) {
        this.passes = passes;
    }

    record NewGuestPassRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Say who the pass is for.") @Size(max = 50, message = "Use 50 characters or fewer.")
            String guestName,

            @Schema(description = "When it starts. Now, when left out.")
            Instant startsAt,

            @NotNull(message = "Choose when the pass ends.") Instant endsAt,

            @NotNull(message = "Choose what the guest can open.")
            List<UUID> thingIds) {}

    @PostMapping("/circles/{id}/guest-passes")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createGuestPass", summary = "Give a guest pass: a link and a code for chosen things")
    GuestPassResponse create(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody NewGuestPassRequest request) {
        return passes.create(
                me,
                id,
                request.guestName(),
                request.startsAt(),
                request.endsAt(),
                request.thingIds(),
                request.clientId());
    }

    @GetMapping("/circles/{id}/guest-passes")
    @Operation(operationId = "getGuestPasses", summary = "A circle's guest passes, the latest first. Fifty at most.")
    List<GuestPassResponse> list(@Me UUID me, @PathVariable UUID id) {
        return passes.list(id, me);
    }

    @GetMapping("/guest-passes/{id}")
    @Operation(operationId = "getGuestPass", summary = "One guest pass")
    GuestPassResponse get(@Me UUID me, @PathVariable UUID id) {
        return passes.get(id, me);
    }

    @DeleteMapping("/guest-passes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "endGuestPass", summary = "End a guest pass now")
    void end(@Me UUID me, @PathVariable UUID id) {
        passes.end(id, me);
    }
}
