package app.homeport.api.media;

import app.homeport.api.common.PublicUrls;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Local stand-in for cloud storage: files are kept in a folder on this computer and served by the API
 * itself. Addresses are built from the request, so a phone on the same Wi-Fi gets links it can open.
 */
@Component
@ConditionalOnProperty(name = "homeport.media.mode", havingValue = "local")
public class LocalDiskStorage implements MediaStorage {

    private final Path root;
    private final byte[] secret;

    private final PublicUrls urls;

    LocalDiskStorage(
            @Value("${homeport.media.local.dir}") String dir,
            @Value("${homeport.media.local.secret}") String secret,
            PublicUrls urls)
            throws IOException {
        this.urls = urls;
        this.root = Path.of(dir).toAbsolutePath().normalize();
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        Files.createDirectories(root);
    }

    @Override
    public UploadTarget uploadTarget(UUID mediaId, String storageKey, String contentType) {
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/local-media/{id}")
                .queryParam("token", tokenFor(mediaId))
                .buildAndExpand(mediaId)
                .toUriString();
        return new UploadTarget(url, "PUT", Map.of("Content-Type", contentType));
    }

    @Override
    public String publicUrl(String storageKey) {
        if (RequestContextHolder.getRequestAttributes() == null) {
            // Asked for by a scheduled job (the weekly email), with no request to take the address from.
            return urls.to("/media/" + storageKey);
        }
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/media/")
                .path(storageKey)
                .toUriString();
    }

    @Override
    public OptionalLong size(String storageKey) {
        try {
            Path file = resolve(storageKey);
            return Files.isRegularFile(file) ? OptionalLong.of(Files.size(file)) : OptionalLong.empty();
        } catch (IOException | RuntimeException e) {
            return OptionalLong.empty();
        }
    }

    @Override
    public InputStream open(String storageKey) throws IOException {
        return Files.newInputStream(resolve(storageKey));
    }

    @Override
    public void put(String storageKey, byte[] bytes, String contentType) throws IOException {
        store(storageKey, new java.io.ByteArrayInputStream(bytes), Long.MAX_VALUE);
    }

    /** Proof that the API itself issued this upload link. */
    public String tokenFor(UUID mediaId) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(mediaId.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public boolean tokenMatches(UUID mediaId, String token) {
        return MessageDigest.isEqual(
                tokenFor(mediaId).getBytes(StandardCharsets.UTF_8),
                String.valueOf(token).getBytes(StandardCharsets.UTF_8));
    }

    /** Saves a file, stopping once it grows past {@code maxBytes}. Returns its size. */
    public long store(String storageKey, InputStream data, long maxBytes) throws IOException {
        Path target = resolve(storageKey);
        Files.createDirectories(target.getParent());
        Path temp = Files.createTempFile(target.getParent(), "upload-", ".part");
        try {
            long written =
                    Files.copy(new LimitedInputStream(data, maxBytes), temp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            return written;
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            Files.deleteIfExists(resolve(storageKey));
        } catch (IOException e) {
            throw new java.io.UncheckedIOException("Could not delete " + storageKey, e);
        }
    }

    /** The file for a key, or an error if the key points outside the storage folder. */
    public Path resolve(String storageKey) {
        Path path = root.resolve(storageKey).normalize();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("Not a storage key: " + storageKey);
        }
        return path;
    }

    /** Thrown when an upload is bigger than allowed. */
    public static class TooLargeException extends IOException {
        TooLargeException() {
            super("File too large");
        }
    }

    private static final class LimitedInputStream extends java.io.FilterInputStream {
        private long remaining;

        LimitedInputStream(InputStream in, long max) {
            super(in);
            this.remaining = max;
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            if (b >= 0 && --remaining < 0) throw new TooLargeException();
            return b;
        }

        @Override
        public int read(byte[] buffer, int off, int len) throws IOException {
            int n = super.read(buffer, off, len);
            if (n > 0 && (remaining -= n) < 0) throw new TooLargeException();
            return n;
        }
    }
}
