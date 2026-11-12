package app.homeport.api.thing;

import app.homeport.api.auth.Me;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.AudienceResponse;
import app.homeport.api.thing.ThingService.ThingBrief;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "things", description = "What every kind of thing shares: who can see it")
class ThingController {

    private final ThingService things;

    ThingController(ThingService things) {
        this.things = things;
    }

    @GetMapping("/things/{id}")
    @Operation(operationId = "getThing", summary = "A thing of any kind, as far as its title and who sees it")
    ThingBrief get(@Me UUID me, @PathVariable UUID id) {
        return things.briefs(List.of(things.require(id, me))).get(0);
    }

    @GetMapping("/things/{id}/audience")
    @Operation(operationId = "getAudience", summary = "Who can see a thing: what the audience sheet shows")
    AudienceResponse audience(@Me UUID me, @PathVariable UUID id) {
        return things.audience(id, me);
    }

    @PutMapping("/things/{id}/audience")
    @Operation(operationId = "saveAudience", summary = "Change who can see a thing. Only its owner can.")
    AudienceResponse share(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody AudienceChange change) {
        return things.share(id, me, change);
    }

    @DeleteMapping("/things/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteThing", summary = "Delete a thing for good. Only its owner can.")
    void delete(@Me UUID me, @PathVariable UUID id) {
        things.delete(id, me);
    }
}
