package app.homeport.api.library;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.library.AlbumService.AlbumChange;
import app.homeport.api.library.AlbumService.AlbumResponse;
import app.homeport.api.library.AlbumService.NewAlbum;
import app.homeport.api.library.AlbumService.Selection;
import app.homeport.api.library.LibraryService.SelectResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@Tag(name = "albums", description = "Albums made by hand, albums that fill themselves, and folders of files")
class AlbumController {

    private final AlbumService albums;

    AlbumController(AlbumService albums) {
        this.albums = albums;
    }

    @PostMapping("/albums")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createAlbum",
            summary =
                    "Start an album: by hand, from a moment, or one that fills itself for a person. Or a folder of files.")
    AlbumResponse create(@Me UUID me, @Valid @RequestBody NewAlbum request) {
        return albums.create(me, request);
    }

    @GetMapping("/albums/{id}")
    @Operation(
            operationId = "getAlbum",
            summary = "One album, counted for you. What is in it comes from the wall, asked with `album`.")
    AlbumResponse get(@Me UUID me, @PathVariable UUID id) {
        return albums.get(id, me);
    }

    @PatchMapping("/albums/{id}")
    @Operation(operationId = "changeAlbum", summary = "Rename an album, change the words under it or its cover")
    AlbumResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody AlbumChange request) {
        return albums.change(id, me, request);
    }

    @GetMapping("/circles/{id}/albums")
    @Operation(operationId = "getAlbums", summary = "The albums in a circle you can see, last changed first")
    Page<AlbumResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "One of the three tabs: shared, mine or journey. Left out: all of them.")
                    @RequestParam(required = false)
                    AlbumTab tab,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return albums.list(id, me, tab, Keyset.of(cursor, limit, 30));
    }

    @PostMapping("/albums/{id}/items")
    @Operation(
            operationId = "addToAlbum",
            summary = "Put photos, videos or files into an album, many at once. Says how many it could put in.")
    SelectResult add(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody Selection request) {
        return albums.add(id, me, request.itemIds());
    }

    @DeleteMapping("/albums/{id}/items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeFromAlbum", summary = "Take one thing out of an album. The thing itself stays.")
    void remove(@Me UUID me, @PathVariable UUID id, @PathVariable UUID itemId) {
        albums.remove(id, me, itemId);
    }
}
