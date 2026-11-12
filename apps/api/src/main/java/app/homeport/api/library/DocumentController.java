package app.homeport.api.library;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.library.DocumentService.DocumentCard;
import app.homeport.api.library.DocumentService.DocumentChange;
import app.homeport.api.library.DocumentService.DocumentResponse;
import app.homeport.api.library.DocumentService.FilesSummary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "files", description = "Scans and documents, and what was read inside them")
class DocumentController {

    private final DocumentService documents;

    DocumentController(DocumentService documents) {
        this.documents = documents;
    }

    @GetMapping("/circles/{id}/files")
    @Operation(
            operationId = "getFiles",
            summary =
                    "The documents in a circle you can see, the newest first. With nothing chosen: the ones in no folder.")
    Page<DocumentCard> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Only this kind of document") @RequestParam(required = false)
                    DocumentCategory category,
            @Parameter(description = "Only what is in this folder") @RequestParam(required = false) UUID folder,
            @Parameter(description = "Only what has these words in its name or inside it")
                    @RequestParam(name = "q", required = false)
                    String words,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return documents.list(id, me, category, folder, words, day, Keyset.of(cursor, limit, 30));
    }

    @GetMapping("/circles/{id}/files/summary")
    @Operation(
            operationId = "getFilesSummary",
            summary = "What stands above the list of files: how many there are, of which kinds, and the folders")
    FilesSummary summary(@Me UUID me, @PathVariable UUID id) {
        return documents.summary(id, me);
    }

    @GetMapping("/documents/{id}")
    @Operation(
            operationId = "getDocument",
            summary =
                    "One document: what was read from it, the day that matters, a day for a reminder, what it is linked to")
    DocumentResponse get(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return documents.get(id, me, day);
    }

    @PatchMapping("/documents/{id}")
    @Operation(
            operationId = "changeDocument",
            summary =
                    "Rename a document, say what kind it is, send the words inside it again, or correct the day that matters")
    DocumentResponse change(
            @Me UUID me,
            @PathVariable UUID id,
            @Valid @RequestBody DocumentChange request,
            @RequestParam(required = false) LocalDate day) {
        return documents.change(id, me, request, day);
    }
}
