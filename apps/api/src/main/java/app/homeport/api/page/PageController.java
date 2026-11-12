package app.homeport.api.page;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.page.PageService.NewPage;
import app.homeport.api.page.PageService.PageResponse;
import app.homeport.api.page.PageService.PageRow;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
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
import org.springframework.web.context.request.WebRequest;

@RestController
@RequestMapping("/v1")
@Tag(name = "pages", description = "Pages: a title, and blocks in order")
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

            @Schema(description = "Words to start with: they become the page's first block of text")
            @Size(max = 100000, message = "That page is too long.")
            String body,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(nullable = true, description = "The folder to file it in. Left out: not filed.")
            UUID folderId,

            @Size(max = 32, message = "Choose one emoji.") String emoji) {}

    record PageChangeRequest(
            @Size(max = 200, message = "Keep the title to 200 characters or fewer.")
            String title,

            @Schema(
                    description = "All the page's words at once: they take the place of its text blocks. To"
                            + " change one part of a page, change that block.")
            @Size(max = 100000, message = "That page is too long.")
            String body,

            @Size(max = 32, message = "Choose one emoji.") String emoji) {}

    @PostMapping("/pages")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createPage", summary = "Write a new page")
    PageResponse create(@Me UUID me, @Valid @RequestBody NewPageRequest request) {
        return pages.create(
                me,
                request.circleId(),
                new NewPage(request.title(), request.body(), request.audience(), request.folderId(), request.emoji()),
                request.clientId());
    }

    @GetMapping("/pages/{id}")
    @Operation(
            operationId = "getPage",
            summary = "One page with its blocks. Ask again with If-None-Match to hear 304 while nothing changed.",
            parameters =
                    @Parameter(
                            name = "If-None-Match",
                            in = ParameterIn.HEADER,
                            description = "The ETag of the answer you already have, as it came (in double quotes)",
                            schema = @Schema(type = "string")))
    @ApiResponse(responseCode = "200", description = "OK")
    @ApiResponse(
            responseCode = "304",
            description = "Nothing changed since the version you sent. There is no body.",
            content = @Content)
    PageResponse get(@Me UUID me, @PathVariable UUID id, WebRequest request) {
        if (request.checkNotModified(pages.version(id, me))) {
            return null;
        }
        return pages.get(id, me);
    }

    @PatchMapping("/pages/{id}")
    @Operation(operationId = "changePage", summary = "Change a page's title or emoji, or all its words at once")
    PageResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody PageChangeRequest request) {
        return pages.change(id, me, request.title(), request.body(), request.emoji());
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
