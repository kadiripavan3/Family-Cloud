package app.homeport.api.export;

import app.homeport.api.auth.Me;
import app.homeport.api.export.ExportService.ExportResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
@Tag(name = "export", description = "Everything, in ordinary files")
class ExportController {

    private final ExportService exports;

    ExportController(ExportService exports) {
        this.exports = exports;
    }

    record ExportRequest(
            @NotNull(message = "A request needs a clientId.")
            UUID clientId,

            @Schema(description = "mine: what you made here. everything: all you can see here. Mine when left out.")
            ExportScope scope) {}

    @PostMapping("/circles/{id}/exports")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "askForExport",
            summary = "Ask for an export of a circle: one zip of ordinary files",
            description = "Pages as text and web pages, lists as text, photos and files full size in dated folders,"
                    + " sheets as CSV with their formulas written out, events and reminders as a calendar file,"
                    + " bills and splits as CSV, and a README. The Vault is not in it: only your phone can open"
                    + " that. It is made in the background and you are told when it is ready.")
    ExportResponse ask(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody ExportRequest request) {
        return exports.ask(id, me, request.scope(), request.clientId());
    }

    @GetMapping("/circles/{id}/exports")
    @Operation(
            operationId = "getExports",
            summary = "Your exports of a circle, newest first. Ten at most: each is kept for seven days.")
    List<ExportResponse> list(@Me UUID me, @PathVariable UUID id) {
        return exports.list(id, me);
    }

    @GetMapping("/exports/{id}")
    @Operation(operationId = "getExport", summary = "Where an export stands, and its address once it is ready")
    ExportResponse get(@Me UUID me, @PathVariable UUID id) {
        return exports.get(id, me);
    }

    @DeleteMapping("/exports/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeExport", summary = "Remove an export before its seven days are over")
    void remove(@Me UUID me, @PathVariable UUID id) {
        exports.remove(id, me);
    }
}
