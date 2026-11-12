package app.homeport.api.digest;

import app.homeport.api.auth.Me;
import app.homeport.api.digest.DigestService.SummaryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "summary", description = "The Sunday summary")
class DigestController {

    private final DigestService digests;

    DigestController(DigestService digests) {
        this.digests = digests;
    }

    @GetMapping("/circles/{id}/summary")
    @Operation(
            operationId = "getSummary",
            summary = "Your week in a circle: the best photo, what got done, what next week holds",
            description = "Made from what you may see, so it can differ from someone else's summary of the same week.")
    SummaryResponse week(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Any day of the week you want. This week when left out.")
                    @RequestParam(required = false)
                    LocalDate week) {
        return digests.week(id, me, week);
    }
}
