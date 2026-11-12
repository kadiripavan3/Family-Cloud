package app.homeport.api.notes;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.notes.NotesService.NoteItem;
import app.homeport.api.notes.NotesService.NotesHome;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.ThingBrief;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "notes", description = "What the Notes screens list")
class NotesController {

    private final NotesService notes;

    NotesController(NotesService notes) {
        this.notes = notes;
    }

    @GetMapping("/circles/{id}/notes")
    @Operation(
            operationId = "getNotes",
            summary = "The home of Notes: the circle's spaces with their counts, your pins, and what changed lately")
    NotesHome home(@Me UUID me, @PathVariable UUID id) {
        return notes.home(id, me);
    }

    @GetMapping("/folders/{id}/items")
    @Operation(
            operationId = "getFolderItems",
            summary = "What is in a space or folder that you may see, in the order people gave it")
    Page<NoteItem> inFolder(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return notes.inFolder(id, me, Keyset.of(cursor, limit, 50));
    }

    @GetMapping("/circles/{id}/notes/unfiled")
    @Operation(
            operationId = "getUnfiledNotes",
            summary = "The pages and lists that aren't filed in any folder you may see, last changed first")
    Page<NoteItem> unfiled(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return notes.unfiled(id, me, Keyset.of(cursor, limit, 30));
    }

    @GetMapping("/circles/{id}/linkable")
    @Operation(
            operationId = "getLinkable",
            summary = "What can be put on a page as a live block: the circle's things you may see, by kind and words")
    Page<ThingBrief> linkable(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Only this kind of thing: a bill, an event, a sheet. Left out: every kind.")
                    @RequestParam(required = false)
                    ThingKind kind,
            @Parameter(description = "Words from its title") @RequestParam(name = "q", required = false) String words,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return notes.linkable(id, me, kind, words, Keyset.of(cursor, limit, 30));
    }
}
