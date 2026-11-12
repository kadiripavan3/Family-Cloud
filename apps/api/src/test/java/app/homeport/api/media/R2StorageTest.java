package app.homeport.api.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The R2 adapter, against a small stand-in that behaves like S3 for the five things the API does. */
class R2StorageTest {

    private HttpServer s3;
    private final Map<String, byte[]> objects = new ConcurrentHashMap<>();
    private final Map<String, String> types = new ConcurrentHashMap<>();
    private R2Storage storage;

    @BeforeEach
    void start() throws Exception {
        s3 = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        s3.createContext("/", exchange -> {
            String key = exchange.getRequestURI().getPath(); // "/bucket/key"
            switch (exchange.getRequestMethod()) {
                case "PUT" -> {
                    byte[] sent = exchange.getRequestBody().readAllBytes();
                    // Like R2: a link is good only with every header it was signed for.
                    if (!signedHeadersPresent(exchange)) {
                        exchange.sendResponseHeaders(403, -1);
                        exchange.close();
                        return;
                    }
                    // Over plain http the client wraps the file in signed chunks; over https (the real R2) it doesn't.
                    boolean chunked = exchange.getRequestHeaders().containsKey("X-amz-decoded-content-length");
                    objects.put(key, chunked ? unwrap(sent) : sent);
                    types.put(key, String.valueOf(exchange.getRequestHeaders().getFirst("Content-Type")));
                    exchange.getResponseHeaders().add("ETag", "\"etag\"");
                    exchange.sendResponseHeaders(200, -1);
                }
                case "GET", "HEAD" -> {
                    byte[] body = objects.get(key);
                    if (body == null) {
                        exchange.sendResponseHeaders(404, -1);
                    } else if (exchange.getRequestMethod().equals("HEAD")) {
                        exchange.getResponseHeaders().add("Content-Length", String.valueOf(body.length));
                        exchange.sendResponseHeaders(200, -1);
                    } else {
                        exchange.sendResponseHeaders(200, body.length);
                        exchange.getResponseBody().write(body);
                    }
                }
                case "DELETE" -> {
                    objects.remove(key);
                    exchange.sendResponseHeaders(204, -1);
                }
                default -> exchange.sendResponseHeaders(405, -1);
            }
            exchange.close();
        });
        s3.start();
        storage = new R2Storage(
                "http://localhost:" + s3.getAddress().getPort(),
                "journey",
                "key-id",
                "secret",
                "https://photos.example.com/");
    }

    @AfterEach
    void stop() {
        s3.stop(0);
    }

    /** The names in a signed link's X-Amz-SignedHeaders. */
    private static java.util.List<String> signedHeaders(String url) {
        String query = URI.create(url).getRawQuery();
        if (query == null) {
            return java.util.List.of();
        }
        for (String pair : query.split("&")) {
            if (pair.startsWith("X-Amz-SignedHeaders=")) {
                return java.util.List.of(java.net.URLDecoder.decode(
                                pair.substring("X-Amz-SignedHeaders=".length()), StandardCharsets.UTF_8)
                        .split(";"));
            }
        }
        return java.util.List.of();
    }

    private static boolean signedHeadersPresent(com.sun.net.httpserver.HttpExchange exchange) {
        return signedHeaders("http://localhost" + exchange.getRequestURI()).stream()
                .allMatch(name -> exchange.getRequestHeaders().containsKey(name));
    }

    @Test
    void thePhoneGetsALinkForOneFileAndTheFileIsReadFromThePublicAddress() throws Exception {
        MediaStorage.UploadTarget target = storage.uploadTarget(UUID.randomUUID(), "2026/11/photo.jpg", "image/jpeg");
        assertThat(target.method()).isEqualTo("PUT");
        assertThat(target.url())
                .contains("/journey/2026/11/photo.jpg")
                .contains("X-Amz-Signature=")
                .contains("X-Amz-Expires=900");
        assertThat(target.headers()).containsEntry("Content-Type", "image/jpeg");
        // The kind of file is part of what was signed: the link can't be used to put something else there.
        assertThat(signedHeaders(target.url())).contains("content-type", "cache-control", "host");
        assertThat(target.headers().keySet())
                .map(name -> name.toLowerCase(java.util.Locale.ROOT))
                .containsAll(signedHeaders(target.url()).stream()
                        .filter(name -> !name.equals("host"))
                        .toList());
        HttpURLConnection bare =
                (HttpURLConnection) URI.create(target.url()).toURL().openConnection();
        bare.setRequestMethod("PUT");
        bare.setDoOutput(true);
        bare.getOutputStream().write("something else".getBytes(StandardCharsets.UTF_8));
        assertThat(bare.getResponseCode()).isEqualTo(403);

        // The phone sends the file to the link, with the headers it was told to use.
        HttpURLConnection upload =
                (HttpURLConnection) URI.create(target.url()).toURL().openConnection();
        upload.setRequestMethod("PUT");
        upload.setDoOutput(true);
        target.headers().forEach(upload::setRequestProperty);
        upload.getOutputStream().write("a photo".getBytes(StandardCharsets.UTF_8));
        assertThat(upload.getResponseCode()).isEqualTo(200);

        assertThat(storage.size("2026/11/photo.jpg")).hasValue(7);
        try (InputStream in = storage.open("2026/11/photo.jpg")) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("a photo");
        }
        assertThat(storage.publicUrl("2026/11/photo.jpg")).isEqualTo("https://photos.example.com/2026/11/photo.jpg");
    }

    @Test
    void theApiStoresTheSmallerVersionsItMakesAndCanRemoveThem() throws Exception {
        assertThat(storage.size("2026/11/none.jpg")).isEmpty();
        storage.put("2026/11/photo.jpg.w320.jpg", new byte[] {1, 2, 3}, "image/jpeg");
        assertThat(storage.size("2026/11/photo.jpg.w320.jpg")).hasValue(3);
        assertThat(types).containsEntry("/journey/2026/11/photo.jpg.w320.jpg", "image/jpeg");

        storage.delete("2026/11/photo.jpg.w320.jpg");
        storage.delete("2026/11/photo.jpg.w320.jpg"); // already gone: nothing happens
        assertThat(storage.size("2026/11/photo.jpg.w320.jpg")).isEmpty();
    }

    @Test
    void incompleteSettingsAreSaidPlainly() {
        assertThatThrownBy(() -> new R2Storage("https://account.r2.cloudflarestorage.com", "journey", "", "", ""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("R2_ACCESS_KEY_ID");
    }

    /** Takes a file out of the client's "aws-chunked" wrapping: lines of "size;signature", each followed by that many bytes. */
    private static byte[] unwrap(byte[] wrapped) {
        java.io.ByteArrayOutputStream file = new java.io.ByteArrayOutputStream();
        int at = 0;
        while (at < wrapped.length) {
            int lineEnd = at;
            while (wrapped[lineEnd] != '\r') {
                lineEnd++;
            }
            String header = new String(wrapped, at, lineEnd - at, StandardCharsets.US_ASCII);
            int size = Integer.parseInt(header.split(";")[0].trim(), 16);
            if (size == 0) {
                break;
            }
            file.write(wrapped, lineEnd + 2, size);
            at = lineEnd + 2 + size + 2;
        }
        return file.toByteArray();
    }
}
