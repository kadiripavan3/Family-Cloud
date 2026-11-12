package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.JourneyStatus;
import app.homeport.api.journey.JourneyVisibility;
import app.homeport.api.journey.LocalJourney;
import app.homeport.api.journey.LocalJourney.Doc;
import app.homeport.api.journey.LocalJourney.DocEntry;
import app.homeport.api.journey.LocalJourney.DocShot;
import com.jayway.jsonpath.JsonPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * What the tests of the link with Journey share: the stand-in for Journey, filled the way a test needs it,
 * and waiting for work that runs after its request has answered.
 */
abstract class JourneyApiTest extends LibraryApiTest {

    /** The stand-in for Journey. A test puts people and journeys into it; the API then asks it as each person. */
    @Autowired
    protected LocalJourney journey;

    protected UUID userId(String token) throws Exception {
        return UUID.fromString(JsonPath.read(fetch("/v1/me", token), "$.id"));
    }

    /** Gives someone a Journey profile. */
    protected void onJourney(String token, String username) throws Exception {
        journey.join(userId(token), username, 58, 12);
    }

    /** Journey's lighter copy of a picture: half the size, the same shape. */
    protected static byte[] lighter(byte[] original) throws Exception {
        BufferedImage full = ImageIO.read(new ByteArrayInputStream(original));
        BufferedImage small = new BufferedImage(full.getWidth() / 2, full.getHeight() / 2, BufferedImage.TYPE_INT_RGB);
        small.createGraphics().drawImage(full, 0, 0, small.getWidth(), small.getHeight(), null);
        return jpeg(small);
    }

    protected DocEntry entry(
            UUID author,
            LocalDate day,
            int hour,
            String title,
            String body,
            String place,
            Double lat,
            Double lng,
            DocShot... shots) {
        Instant at = day.atTime(hour, 0).toInstant(ZoneOffset.UTC);
        return new DocEntry(
                UUID.randomUUID(), author, at, day, title, body, place, lat, lng, List.of(shots), 0, List.of(), at);
    }

    /** A journey in the stand-in. Returns its id. */
    protected UUID journeyOf(
            String ownerToken,
            String title,
            JourneyVisibility visibility,
            JourneyStatus status,
            LocalDate start,
            List<UUID> authors,
            DocEntry... entries)
            throws Exception {
        UUID id = UUID.randomUUID();
        journey.start(new Doc(
                id,
                userId(ownerToken),
                title,
                visibility,
                status,
                start,
                null,
                null,
                authors,
                58,
                Map.of(),
                null,
                null,
                null,
                List.of(entries)));
        return id;
    }

    /** Waits for a job to finish, one way or the other. Returns it as it stands then. */
    protected String finished(String token, String job) throws Exception {
        String id = JsonPath.read(job, "$.id");
        for (int tries = 0; tries < 300; tries++) {
            String now = fetch("/v1/journey/jobs/" + id, token);
            String status = JsonPath.read(now, "$.status");
            if (status.equals("done") || status.equals("failed")) {
                return now;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("The job never finished: " + fetch("/v1/journey/jobs/" + id, token));
    }

    /** Keeps a journey and waits until it is home. Returns the finished job. */
    protected String keep(String token, String circle, UUID journeyId, String more) throws Exception {
        String job = finished(
                token,
                send(
                        HttpMethod.POST,
                        "/v1/journey/keeps",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"journeyId\":\"%s\"%s}"
                                .formatted(id(), circle, journeyId, more),
                        201));
        assertThat(JsonPath.<String>read(job, "$.status")).as(job).isEqualTo("done");
        return job;
    }
}
