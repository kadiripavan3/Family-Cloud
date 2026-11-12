package app.homeport.api.media;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;

/**
 * Where photos and clips are kept. The phone never sends a file through the API's own endpoints: it
 * asks for an upload target, sends the file there, and then tells the API it is done. That is how cloud
 * storage works (pre-signed links), and the local stand-in behaves the same way, so the app doesn't change
 * when the real storage is connected.
 */
public interface MediaStorage {

    /** Where and how the phone uploads one file. */
    record UploadTarget(String url, String method, Map<String, String> headers) {}

    UploadTarget uploadTarget(UUID mediaId, String storageKey, String contentType);

    /** The address a stored file is served from. */
    String publicUrl(String storageKey);

    /** How big a stored file is, or empty when nothing has arrived under that key. */
    OptionalLong size(String storageKey);

    /** Reads a stored file. The caller closes the stream. */
    InputStream open(String storageKey) throws IOException;

    /** Stores a file the API made itself (a photo in one of its sizes). */
    void put(String storageKey, byte[] bytes, String contentType) throws IOException;

    /**
     * Stores a file the API made itself that is too big to hold in memory (an export). Unless the storage
     * knows better, the file is read whole.
     */
    default void put(String storageKey, Path file, String contentType) throws IOException {
        put(storageKey, Files.readAllBytes(file), contentType);
    }

    /**
     * Removes the file for good. Nothing happens if it is already gone. Throws when the file couldn't be
     * removed, so whoever asked can try again later.
     */
    void delete(String storageKey);
}
