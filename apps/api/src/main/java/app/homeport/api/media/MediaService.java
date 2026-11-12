package app.homeport.api.media;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaStore.MediaRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Uploads: photos, videos, documents and recordings. The phone asks for somewhere to send a file, sends it
 * there, and says it is done; only then is it ready to be put on something.
 *
 * <p>A photo is made afresh from what was uploaded (see {@link MediaSizes}): really a picture, the right way
 * up, in three sizes, under an address the phone never had a link to. Other files are kept as they arrive,
 * under an address that can't be guessed. A photo for the Library also keeps its upload, untouched and at
 * full size, next to the three sizes.
 */
@Service
public class MediaService {

    public static final long MAX_PHOTO_BYTES = 25L * 1024 * 1024;
    public static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    public static final long MAX_AUDIO_BYTES = 25L * 1024 * 1024;
    public static final long MAX_VIDEO_BYTES = 500L * 1024 * 1024;

    /** Where a photo waits between arriving and being made into the one that is kept. Never served. */
    static final String INCOMING = "incoming";

    /** How many uploads one person may have started and not finished, and how many they may send in a day. */
    static final int MAX_UNFINISHED = 200;

    static final int MAX_A_DAY = 5000;

    private static final Map<String, String> PHOTO_TYPES = Map.of("image/jpeg", "jpg", "image/png", "png");
    // Phones record MP4 and MOV; a browser (the web preview) records WebM.
    private static final Map<String, String> VIDEO_TYPES =
            Map.of("video/mp4", "mp4", "video/quicktime", "mov", "video/webm", "webm");
    private static final Map<String, String> AUDIO_TYPES = Map.of(
            "audio/mp4",
            "m4a",
            "audio/x-m4a",
            "m4a",
            "audio/m4a",
            "m4a",
            "audio/mpeg",
            "mp3",
            "audio/webm",
            "webm",
            "audio/wav",
            "wav",
            "audio/aac",
            "aac",
            "audio/ogg",
            "ogg");
    private static final Map<String, String> FILE_TYPES = Map.of(
            "application/pdf", "pdf",
            "text/plain", "txt",
            "text/csv", "csv",
            "image/jpeg", "jpg",
            "image/png", "png",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx");

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    /** A file as the app shows it. */
    public record MediaResponse(
            UUID id,
            MediaKind kind,

            @Schema(description = "A picture: the photo itself, or null for a file with no picture")
            String url,

            @Schema(nullable = true, description = "The same picture, small, for lists and grids")
            String thumbUrl,

            @Schema(nullable = true, description = "For a video, a document or a recording: the file itself")
            String fileUrl,

            @Schema(nullable = true) String fileName,
            String contentType,
            @Schema(nullable = true) Integer width,
            @Schema(nullable = true) Integer height,
            @Schema(nullable = true) Integer durationSeconds,
            @Schema(nullable = true) Long bytes) {}

    public record NewUpload(UUID mediaId, MediaStorage.UploadTarget target) {}

    private final MediaStore store;
    private final MediaStorage storage;
    private final MediaSizes sizes;
    private final TransactionTemplate transaction;

    MediaService(MediaStore store, MediaStorage storage, MediaSizes sizes, TransactionTemplate transaction) {
        this.store = store;
        this.storage = storage;
        this.sizes = sizes;
        this.transaction = transaction;
    }

    static long limitFor(MediaKind kind) {
        return switch (kind) {
            case PHOTO -> MAX_PHOTO_BYTES;
            case VIDEO -> MAX_VIDEO_BYTES;
            case AUDIO -> MAX_AUDIO_BYTES;
            case FILE -> MAX_FILE_BYTES;
        };
    }

    private static ApiProblem tooBig(MediaKind kind) {
        return new ApiProblem(
                HttpStatus.CONTENT_TOO_LARGE,
                "too_large",
                switch (kind) {
                    case PHOTO -> "That photo is too big.";
                    case VIDEO -> "That video is too big. Keep videos under 500 MB.";
                    case AUDIO -> "That recording is too big.";
                    case FILE -> "That file is too big. Keep files under 50 MB.";
                });
    }

    /** Starts an upload: a record of the file to come, and where the phone sends it. Nobody may pile up uploads without end. */
    public NewUpload startUpload(
            UUID ownerId, MediaKind kind, String contentType, String fileName, Integer durationSeconds) {
        return startUpload(ownerId, kind, contentType, fileName, durationSeconds, false);
    }

    /**
     * The same, and with {@code keepOriginal} a photo's upload is kept as it arrived next to the sizes made
     * from it: what the Library asks for. Anything that isn't a photo is kept as it arrives either way.
     */
    public NewUpload startUpload(
            UUID ownerId,
            MediaKind kind,
            String contentType,
            String fileName,
            Integer durationSeconds,
            boolean keepOriginal) {
        String type = contentType == null
                ? ""
                : contentType.toLowerCase(Locale.ROOT).split(";")[0].trim();
        String extension = switch (kind) {
            case PHOTO -> PHOTO_TYPES.get(type);
            case VIDEO -> VIDEO_TYPES.get(type);
            case AUDIO -> AUDIO_TYPES.get(type);
            case FILE -> FILE_TYPES.get(type);
        };
        if (extension == null) {
            throw ApiProblem.badRequest(
                    "unsupported_media",
                    switch (kind) {
                        case PHOTO -> "That photo's format isn't supported. Use JPEG or PNG.";
                        case VIDEO -> "That video's format isn't supported. Use MP4 or MOV.";
                        case AUDIO -> "That recording's format isn't supported.";
                        case FILE ->
                            "That kind of file isn't supported yet. Use a PDF, a picture, or a Word, Excel or text file.";
                    });
        }
        MediaStore.Recent recent = store.recentOf(ownerId);
        if (recent.unfinished() >= MAX_UNFINISHED || recent.today() >= MAX_A_DAY) {
            throw new ApiProblem(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "too_many_uploads",
                    "That's a lot of uploads at once. Give it a moment and try again.");
        }
        UUID id = UUID.randomUUID();
        LocalDate today = LocalDate.now();
        String month = "%d-%02d".formatted(today.getYear(), today.getMonthValue());
        // A photo is made into its kept version, under another address, when it is done. Anything else stays
        // where it arrives, so its address carries a part nobody can guess from the start.
        String key = kind == MediaKind.PHOTO
                ? "%s/%s/%s.%s".formatted(INCOMING, month, id, extension)
                : "%s/%s/%s-%s.%s".formatted(folder(kind), month, id, secretPart(), extension);
        store.insert(
                id,
                ownerId,
                kind,
                type,
                clean(fileName),
                key,
                durationSeconds,
                keepOriginal && kind == MediaKind.PHOTO);
        return new NewUpload(id, storage.uploadTarget(id, key, type));
    }

    private static String folder(MediaKind kind) {
        return switch (kind) {
            case PHOTO -> "photos";
            case VIDEO -> "videos";
            case AUDIO -> "audio";
            case FILE -> "files";
        };
    }

    private static String secretPart() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    private static String clean(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return null;
        }
        String name = fileName.replaceAll("[\\\\/\\p{Cntrl}]", " ").trim();
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    /**
     * The app says an upload is done. A photo is opened and made into the one that is kept; anything else is
     * checked for having arrived. Saying "done" twice is fine. No database connection is held while a file
     * is read.
     */
    public void completeUpload(UUID id, UUID ownerId) {
        MediaRow row = store.find(id)
                .filter(found -> found.ownerId().equals(ownerId))
                .orElseThrow(
                        () -> ApiProblem.badRequest("unknown_media", "That upload couldn't be found. Add it again."));
        if (row.ready()) {
            return;
        }
        if (row.status() == MediaStatus.FAILED) {
            throw ApiProblem.badRequest("media_not_ready", "That upload couldn't be used. Add it again.");
        }
        if (!store.claim(id)) {
            // Another "done" for the same file is being worked on right now.
            throw new ApiProblem(
                    HttpStatus.SERVICE_UNAVAILABLE, "busy", "We're still getting that ready. Try again in a moment.");
        }
        try {
            long bytes = storage.size(row.storageKey()).orElse(0);
            if (bytes == 0) {
                throw ApiProblem.badRequest("upload_missing", "The file didn't arrive. Try again.");
            }
            if (bytes > limitFor(row.kind())) {
                quietly(() -> storage.delete(row.storageKey()));
                throw tooBig(row.kind());
            }
            if (row.kind() == MediaKind.PHOTO) {
                String kept =
                        row.storageKey()
                                        .replaceFirst("^" + INCOMING + "/", "photos/")
                                        .replaceFirst("\\.[a-z]+$", "") + "-" + secretPart() + ".jpg";
                if (row.keepOriginal()) {
                    // The upload moves from where it arrived to an address nobody was ever told.
                    String original = row.storageKey()
                            .replaceFirst("^" + INCOMING + "/", "originals/")
                            .replaceFirst("(\\.[a-z]+)$", "-" + secretPart() + "$1");
                    MediaSizes.Made made = sizes.make(row.storageKey(), kept, original, row.contentType());
                    store.photoReady(
                            row.id(),
                            kept,
                            made.bytes(),
                            made.width(),
                            made.height(),
                            made.original().key(),
                            made.original().bytes(),
                            made.original().hash());
                } else {
                    MediaSizes.Made made = sizes.make(row.storageKey(), kept);
                    store.photoReady(row.id(), kept, made.bytes(), made.width(), made.height());
                }
            } else {
                store.fileReady(row.id(), bytes);
            }
        } catch (RuntimeException failed) {
            store.release(id);
            throw failed;
        }
    }

    private static void quietly(Runnable work) {
        try {
            work.run();
        } catch (RuntimeException ignored) {
            log.debug("Tidying up after a refused upload failed: {}", ignored.toString());
        }
    }

    /** These uploads, which must all be this person's own, ready, and of this kind (or of any kind when null). */
    public List<MediaRow> requireOwn(List<UUID> ids, UUID ownerId, MediaKind kind) {
        List<MediaRow> rows = store.findAll(ids);
        boolean allThere = rows.size() == ids.stream().distinct().count();
        if (!allThere
                || rows.stream()
                        .anyMatch(row -> !row.ownerId().equals(ownerId)
                                || !row.ready()
                                || (kind != null && row.kind() != kind))) {
            throw ApiProblem.badRequest("media_not_ready", "A file didn't finish uploading. Add it again.");
        }
        return rows;
    }

    public MediaRow requireOwn(UUID id, UUID ownerId, MediaKind kind) {
        return requireOwn(List.of(id), ownerId, kind).get(0);
    }

    /** The address of a stored file, or null when there is none. */
    public String urlFor(String storageKey) {
        return storageKey == null ? null : storage.publicUrl(storageKey);
    }

    /** The address of one size of a stored photo, or null when there is none. */
    public String urlFor(String storageKey, MediaSize size) {
        return storageKey == null ? null : storage.publicUrl(size.keyFor(storageKey));
    }

    /** These uploads, whoever sent them: for a place that has already checked who may see what they belong to. */
    public List<MediaRow> rows(List<UUID> ids) {
        return store.findAll(ids);
    }

    public MediaResponse view(MediaRow row) {
        boolean photo = row.kind() == MediaKind.PHOTO;
        return new MediaResponse(
                row.id(),
                row.kind(),
                photo ? urlFor(row.storageKey(), MediaSize.MEDIUM) : null,
                photo ? urlFor(row.storageKey(), MediaSize.SMALL) : null,
                urlFor(row.storageKey()),
                row.fileName(),
                row.contentType(),
                row.width(),
                row.height(),
                row.durationS(),
                row.bytes());
    }

    /** Removes uploads for good: their records now, their files a moment later. */
    @Transactional
    public void remove(List<UUID> ids) {
        store.delete(ids);
    }

    /** Deletes everything a person uploaded: the records now, the files right after. */
    @Transactional
    public void deleteAllOwnedBy(UUID ownerId) {
        store.deleteOwnedBy(ownerId);
    }

    /**
     * Tidies up. Uploads that were never finished lose their record, and every file whose record is gone is
     * removed from storage, and tried again later if that fails. Returns how many files were removed.
     */
    public int sweep() {
        transaction.executeWithoutResult(status -> store.delete(store.neverFinished(500)));
        int removed = 0;
        List<MediaStore.Removal> batch;
        // Taken in a short transaction of its own; the files are then removed with no transaction open.
        while (!(batch = take()).isEmpty()) {
            for (MediaStore.Removal file : batch) {
                try {
                    if (file.hasSizes()) {
                        sizes.remove(file.storageKey());
                    } else {
                        storage.delete(file.storageKey());
                    }
                    store.removed(file.id());
                    removed++;
                } catch (RuntimeException failed) {
                    log.warn(
                            "Couldn't remove {} (try {}); it will be tried again: {}",
                            file.storageKey(),
                            file.attempts(),
                            failed.toString());
                }
            }
        }
        return removed;
    }

    private List<MediaStore.Removal> take() {
        List<MediaStore.Removal> taken = transaction.execute(status -> store.takeRemovals(200));
        return taken == null ? List.of() : taken;
    }
}
