package app.homeport.api.page;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.page.PageService.PageResponse;
import app.homeport.api.page.PageService.PageRow;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "pages", description = "Pages of words")
class PageController {

    private final PageService pages;
    private final CircleService circles;

    PageController(PageService pages, CircleService circles) {
        this.pages = pages;
        this.circles = circles;
    }

    record NewPageRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @Size(max = 200, message = "Keep the title to 200 characters or fewer.")
            String title,

            @Size(max = 100000, message = "That page is too long.")
            String body,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience) {}

    record PageChangeRequest(
            @Size(max = 200, message = "Keep the title to 200 characters or fewer.")
            String title,

            @Size(max = 100000, message = "That page is too long.")
            String body) {}

    @PostMapping("/pages")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createPage", summary = "Write a new page")
    PageResponse create(@Me UUID me, @Valid @RequestBody NewPageRequest request) {
        return pages.create(
                me, request.circleId(), request.title(), request.body(), request.audience(), request.clientId());
    }

    @GetMapping("/pages/{id}")
    @Operation(operationId = "getPage", summary = "One page")
    PageResponse get(@Me UUID me, @PathVariable UUID id) {
        return pages.get(id, me);
    }

    @PatchMapping("/pages/{id}")
    @Operation(operationId = "changePage", summary = "Change a page's title or its words")
    PageResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody PageChangeRequest request) {
        return pages.change(id, me, request.title(), request.body());
    }

    @GetMapping("/circles/{id}/pages")
    @Operation(operationId = "getPages", summary = "The pages in a circle you can see, last changed first")
    Page<PageRow> list(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return pages.list(id, me, Keyset.of(cursor, limit, 30));
    }
}
