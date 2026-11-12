package app.homeport.api.board.gallery;

import app.homeport.api.auth.Me;
import app.homeport.api.board.Template;
import app.homeport.api.board.gallery.GalleryService.StartedResponse;
import app.homeport.api.board.gallery.GalleryService.TemplateGalleryResponse;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "templates", description = "The gallery of templates, and starting one")
class GalleryController {

    private final GalleryService gallery;

    GalleryController(GalleryService gallery) {
        this.gallery = gallery;
    }

    record StartTemplateRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @Schema(description = "Left out: the template's own name")
            @Size(max = 200, message = "Keep the title to 200 characters or fewer.")
            String title,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(description = "For a template that does work: what it needs to begin. See x-board-templates.")
            Map<String, Object> settings) {}

    @GetMapping("/circles/{id}/templates")
    @Operation(
            operationId = "getTemplates",
            summary = "The gallery for a circle: its own kind's templates first, then the rest. 67 cards, always all"
                    + " of them.")
    TemplateGalleryResponse gallery(@Me UUID me, @PathVariable UUID id) {
        return gallery.gallery(id, me);
    }

    @PostMapping("/circles/{id}/templates/{template}/start")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "startTemplate",
            summary = "Start a template in a circle: its pages and checklists, or its board")
    StartedResponse start(
            @Me UUID me,
            @PathVariable UUID id,
            @PathVariable Template template,
            @Valid @RequestBody StartTemplateRequest request,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return gallery.start(
                me, id, template, request.title(), request.audience(), request.settings(), request.clientId(), day);
    }
}
