package app.homeport.api.seed;

import app.homeport.api.auth.LocalUsers;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The sample people, circles and photos, by short names, so every place's sample data can say "nora" and
 * "linds" instead of carrying ids around. Filled by {@link SpineSeed}; read by the seeders that follow.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
public class SeedWorld {

    private static final Logger log = LoggerFactory.getLogger(SeedWorld.class);

    private final LocalUsers users;
    private final MediaStore media;
    private final MediaSizes sizes;
    private final JdbcClient jdbc;
    private final Path images;

    private final Map<String, UUID> people = new HashMap<>();
    private final Map<String, UUID> circles = new HashMap<>();
    private final Map<String, UUID> members = new HashMap<>();

    SeedWorld(
            LocalUsers users,
            MediaStore media,
            MediaSizes sizes,
            JdbcClient jdbc,
            @Value("${homeport.seed.images:../../design/hub/img}") String images) {
        this.users = users;
        this.media = media;
        this.sizes = sizes;
        this.jdbc = jdbc;
        this.images = Path.of(images).toAbsolutePath().normalize();
    }

    public JdbcClient jdbc() {
        return jdbc;
    }

    /** A sample person who can sign in with this email address and the test code. */
    public UUID person(String key, String email) {
        // Asked for every time the sample data is made: the id belongs to the sign-in as it is now.
        UUID id = users.idFor(email);
        people.put(key, id);
        return id;
    }

    /** The user id of a sample person. */
    public UUID user(String key) {
        return require(people, key);
    }

    public void circle(String key, UUID id) {
        circles.put(key, id);
    }

    public UUID circle(String key) {
        return require(circles, key);
    }

    public void member(String circle, String key, UUID id) {
        members.put(circle + "/" + key, id);
    }

    /** A sample person's place in a circle: {@code member("linds", "mia")}. */
    public UUID member(String circle, String key) {
        return require(members, circle + "/" + key);
    }

    private static UUID require(Map<String, UUID> map, String key) {
        UUID id = map.get(key);
        if (id == null) {
            throw new IllegalStateException("The sample data has no \"" + key + "\" yet.");
        }
        return id;
    }

    /**
     * One of the photos of the screens, stored as this person's upload. Returns its media id, or null when the
     * photo isn't on this computer (the sample data then simply has fewer pictures).
     */
    public UUID photo(String ownerKey, String file) {
        Path path = images.resolve(file);
        if (!Files.isRegularFile(path)) {
            log.warn("Sample photo {} isn't there; carrying on without it.", path);
            return null;
        }
        try {
            UUID id = UUID.randomUUID();
            String key = "photos/seed/" + id + "-" + file.replaceAll("[^a-z0-9.-]", "");
            MediaSizes.Made made = sizes.store(Files.readAllBytes(path), key);
            media.insert(id, user(ownerKey), MediaKind.PHOTO, "image/jpeg", file, key, null);
            media.photoReady(id, key, made.bytes(), made.width(), made.height());
            return id;
        } catch (IOException | RuntimeException e) {
            log.warn("Sample photo {} couldn't be stored: {}", file, e.toString());
            return null;
        }
    }
}
