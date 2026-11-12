package app.homeport.api.media;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaStore.MediaRow;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two things cloud storage does, done locally: receive an uploaded file, and serve it back. Both
 * exist only in local mode and are not part of the API the app is generated from.
 */
@RestController
@Hidden
@ConditionalOnProperty(name = "homeport.media.mode", havingValue = "local")
class LocalMediaController {

    private final LocalDiskStorage storage;
    private final MediaStore media;

    LocalMediaController(LocalDiskStorage storage, MediaStore media) {
        this.storage = storage;
        this.media = media;
    }

    @PutMapping("/local-media/{id}")
    ResponseEntity<Void> receive(@PathVariable UUID id, @RequestParam String token, HttpServletRequest request)
            throws IOException {
        MediaRow row = media.find(id).orElse(null);
        // The link is for one upload, until it is done: afterwards there is nothing left to send to.
        if (row == null || !storage.tokenMatches(id, token) || row.status() != MediaStatus.PENDING) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        long bytes;
        try {
            bytes = storage.store(row.storageKey(), request.getInputStream(), MediaService.limitFor(row.kind()));
        } catch (LocalDiskStorage.TooLargeException e) {
            throw new ApiProblem(HttpStatus.CONTENT_TOO_LARGE, "too_large", "That file is too big.");
        }
        if (bytes == 0) {
            throw ApiProblem.badRequest("empty_file", "The file arrived empty. Try again.");
        }
        // The file is here. The app now tells the API the upload is done, and the API checks it and makes it ready.
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/media/{year}/{month}/{file}")
    ResponseEntity<Resource> serve(@PathVariable String year, @PathVariable String month, @PathVariable String file) {
        if (year.equals(MediaService.INCOMING)) {
            return ResponseEntity.notFound().build(); // an upload on its way in is never shown to anyone
        }
        String key = year + "/" + month + "/" + file;
        Path path;
        try {
            path = storage.resolve(key);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
        if (!Files.isRegularFile(path)) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new FileSystemResource(path);
        return ResponseEntity.ok()
                .contentType(MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                .body(resource);
    }
}
