package app.homeport.api.seed;

import app.homeport.api.auth.LocalUsers;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The sample people, circles and photos, by short names, so every place's sample data can say "nora" and
 * "linds" instead of carrying ids around. Filled by {@link SpineSeed}; read by the seeders that follow.
 *
 * <p>A place can also name something it made ({@code thing("bill/electricity", id)}), so that another
 * place's sample data can point at it: link to it, show it on a page, read its number. Neither place has to
 * run first, and neither needs the other to run at all: {@link #link} and {@link #whenThing} do their part
 * now when the thing is already there, later when it is named, and never when its place's sample data isn't
 * added. The names in use are listed where each is given: search for {@code w.thing("}.
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
    private final Map<String, UUID> things = new HashMap<>();
    private final Map<String, List<Consumer<UUID>>> waiting = new HashMap<>();

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

    /**
     * Forgets everything named so far. The people and circles are the first to be added and begin with this,
     * so sample data that is added again (a test does that) never meets the names of the time before.
     */
    public void afresh() {
        people.clear();
        circles.clear();
        members.clear();
        things.clear();
        waiting.clear();
    }

    /**
     * Names something a place's sample data made, as {@code "<what>/<which>"}: {@code "bill/electricity"},
     * {@code "vault/home-wifi"}. Whoever was waiting for that name is told now. A null id (a photo that
     * isn't on this computer, so nothing was made) names nothing.
     */
    public void thing(String key, UUID id) {
        if (id == null) {
            return;
        }
        things.put(key, id);
        List<Consumer<UUID>> told = waiting.remove(key);
        if (told != null) {
            told.forEach(then -> then.accept(id));
        }
    }

    /** What a place's sample data made under this name, when it has been added already. */
    public Optional<UUID> thing(String key) {
        return Optional.ofNullable(things.get(key));
    }

    /**
     * Does something with a thing another place names: now when it is there, as soon as it is named when it
     * isn't yet, and never when that place's sample data isn't added. So it doesn't matter which place's
     * sample data comes first.
     */
    public void whenThing(String key, Consumer<UUID> then) {
        UUID id = things.get(key);
        if (id != null) {
            then.accept(id);
        } else {
            waiting.computeIfAbsent(key, name -> new ArrayList<>()).add(then);
        }
    }

    /**
     * Links two things by their names, as someone does with "link to" in the app, once both are there:
     * {@code link("bill/electricity", "vault/elektro-login")}. Either place may ask, and asking twice links once.
     */
    public void link(String from, String to) {
        whenThing(
                from,
                one -> whenThing(
                        to,
                        other -> jdbc.sql(
                                        "insert into thing_links (from_id, to_id) values (:from, :to) on conflict do nothing")
                                .param("from", one)
                                .param("to", other)
                                .update()));
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
