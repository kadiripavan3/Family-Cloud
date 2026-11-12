package app.homeport.api.auth;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * The stand-ins (sign in with any email and a fixed code, files on this computer's disk, sample people) are
 * for building and testing. One setting must never be enough to switch them on where real people are: they
 * work only together with the {@code local} or {@code test} profile, and the API refuses to start otherwise.
 *
 * <p>It also refuses a switch set to a word it doesn't know ({@code journey.video.mode=muxx}): otherwise that part
 * of the API would quietly not exist.
 *
 * <p>It runs as soon as the settings are known, before anything connects to the database (it is listed in
 * {@code META-INF/spring.factories}).
 */
public class LocalModeGuard implements ApplicationListener<ApplicationEnvironmentPreparedEvent> {

    @Override
    public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
        check(event.getEnvironment());
        SettingsCheck.check(event.getEnvironment());
    }

    /** Every switch and the words it understands. A word it doesn't know is a typing mistake, not "off". */
    private static final Map<String, List<String>> MODES = Map.of(
            "homeport.journey.mode", List.of("http", "off", "local"),
            "homeport.auth.mode", List.of("supabase", "local"),
            "homeport.media.mode", List.of("r2", "local"),
            "homeport.video.mode", List.of("mux", "off", "local"),
            "homeport.places.mode", List.of("device", "local"),
            "homeport.push.mode", List.of("expo", "off", "local"),
            "homeport.email.mode", List.of("resend", "off", "local"),
            "homeport.moderation.mode", List.of("rekognition", "off", "local"),
            "homeport.apple.mode", List.of("apple", "off"));

    static void check(Environment environment) {
        List<String> unknown = new ArrayList<>();
        new TreeMap<>(MODES).forEach((setting, words) -> {
            String value = environment.getProperty(setting);
            if (value != null && !words.contains(value)) {
                unknown.add("%s=%s (it can be: %s)".formatted(setting, value, String.join(", ", words)));
            }
        });
        if (!unknown.isEmpty()) {
            throw new IllegalStateException(
                    "These settings have a value the API doesn't know: " + String.join("; ", unknown) + ".");
        }
        if (environment.acceptsProfiles(Profiles.of("local", "test"))) {
            return;
        }
        List<String> on = new ArrayList<>();
        if ("local".equals(environment.getProperty("homeport.auth.mode"))) {
            on.add("homeport.auth.mode=local (anyone can sign in as anyone)");
        }
        if ("local".equals(environment.getProperty("homeport.media.mode"))) {
            on.add("homeport.media.mode=local (uploads on this computer's disk)");
        }
        if ("local".equals(environment.getProperty("homeport.places.mode"))) {
            on.add("homeport.places.mode=local (a place search from a bundled list)");
        }
        if ("local".equals(environment.getProperty("homeport.video.mode"))) {
            on.add("homeport.video.mode=local (clips served from this computer's disk, unconverted)");
        }
        if ("local".equals(environment.getProperty("homeport.moderation.mode"))) {
            on.add("homeport.moderation.mode=local (no photo is ever checked)");
        }
        if (environment.getProperty("homeport.seed.enabled", Boolean.class, false)) {
            on.add("homeport.seed.enabled=true (sample people and journeys)");
        }
        if ("local".equals(environment.getProperty("homeport.push.mode"))) {
            on.add("homeport.push.mode=local (pushes are only written to the log; nobody's phone gets them)");
        }
        if ("local".equals(environment.getProperty("homeport.email.mode"))) {
            on.add("homeport.email.mode=local (emails are only written to the log)");
        }
        if ("local".equals(environment.getProperty("homeport.journey.mode"))) {
            on.add("homeport.journey.mode=local (sample journeys stand in for Journey; nothing is asked of it)");
        }
        if (!on.isEmpty()) {
            throw new IllegalStateException(
                    "These settings are for building and testing only and need the 'local' profile: "
                            + String.join("; ", on)
                            + ". Start with -Dspring.profiles.active=local on your own computer, or remove them here.");
        }
    }
}
