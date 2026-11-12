package app.homeport.api.media;

import app.homeport.api.auth.Me;
import app.homeport.api.media.MediaService.NewUpload;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/media")
@Tag(name = "media", description = "Uploading photos, videos, documents and recordings")
class MediaController {

    private final MediaService media;

    MediaController(MediaService media) {
        this.media = media;
    }

    record StartUploadRequest(
            @NotNull(message = "Choose what you are adding.")
            MediaKind kind,

            @NotBlank String contentType,

            @Schema(description = "What the file is called on the phone, for documents")
            @Size(max = 200, message = "That file's name is too long.")
            String fileName,

            @Schema(description = "For a video or a recording: how long it is, in whole seconds")
            Integer durationSeconds,

            @Schema(
                    description =
                            "True for a photo going into the Library: the file is kept as it arrives, at full size, next to the sizes made from it")
            Boolean keepOriginal) {}

    record UploadResponse(
            @Schema(description = "Use this id when saving what the file belongs to")
            UUID mediaId,

            @Schema(description = "Send the file's bytes here")
            String uploadUrl,

            String method,
            Map<String, String> headers) {}

    @PostMapping("/uploads")
    @Operation(operationId = "startUpload", summary = "Get a place to upload one file")
    UploadResponse startUpload(@Me UUID me, @Valid @RequestBody StartUploadRequest request) {
        NewUpload upload = media.startUpload(
                me,
                request.kind(),
                request.contentType(),
                request.fileName(),
                request.durationSeconds(),
                Boolean.TRUE.equals(request.keepOriginal()));
        return new UploadResponse(
                upload.mediaId(),
                upload.target().url(),
                upload.target().method(),
                upload.target().headers());
    }

    @PostMapping("/uploads/{id}/complete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "completeUpload",
            summary = "Say that the file has been sent. The API checks it and makes it ready to use.")
    void completeUpload(@Me UUID me, @PathVariable UUID id) {
        media.completeUpload(id, me);
    }
}
