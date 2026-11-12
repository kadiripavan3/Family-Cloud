package app.homeport.api.share;

import io.swagger.v3.oas.annotations.Hidden;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two small files that let a shared link open the app instead of the web page, once the app is in the
 * stores. Apple reads the first, Google the second, from the same address the links use. They are built from
 * settings and don't exist until those are filled in:
 *
 * <ul>
 *   <li>{@code journey.links.ios-app-id}: the Apple team id, a dot, and the app's bundle id
 *       ({@code ABCDE12345.app.homeport})
 *   <li>{@code journey.links.android-package} and {@code journey.links.android-fingerprints}: the app's package
 *       name and the SHA-256 fingerprints of the keys it is signed with, separated by commas
 * </ul>
 */
@RestController
@Hidden
class AppLinkFiles {

    /** The pages the app can show itself: a journey, an entry, a person and an invitation. */
    private static final List<String> PATHS = List.of("/j/*", "/e/*", "/u/*", "/i/*");

    private final String iosAppId;
    private final String androidPackage;
    private final List<String> androidFingerprints;

    AppLinkFiles(
            @Value("${homeport.links.ios-app-id:}") String iosAppId,
            @Value("${homeport.links.android-package:}") String androidPackage,
            @Value("${homeport.links.android-fingerprints:}") String androidFingerprints) {
        this.iosAppId = iosAppId.trim();
        this.androidPackage = androidPackage.trim();
        this.androidFingerprints = Arrays.stream(androidFingerprints.split(","))
                .map(String::trim)
                .filter(print -> !print.isEmpty())
                .toList();
    }

    @GetMapping(value = "/.well-known/apple-app-site-association", produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String, Object>> apple() {
        if (iosAppId.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        List<Map<String, String>> components =
                PATHS.stream().map(path -> Map.of("/", path)).toList();
        return ResponseEntity.ok(Map.of(
                "applinks", Map.of("details", List.of(Map.of("appIDs", List.of(iosAppId), "components", components)))));
    }

    @GetMapping(value = "/.well-known/assetlinks.json", produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<List<Map<String, Object>>> android() {
        if (androidPackage.isEmpty() || androidFingerprints.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(List.of(Map.of(
                "relation",
                List.of("delegate_permission/common.handle_all_urls"),
                "target",
                Map.of(
                        "namespace",
                        "android_app",
                        "package_name",
                        androidPackage,
                        "sha256_cert_fingerprints",
                        androidFingerprints))));
    }
}
