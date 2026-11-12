package app.homeport.api.journey;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Page;
import app.homeport.api.media.MediaKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.IntConsumer;
import org.springframework.http.HttpStatus;

/**
 * Everything this app asks of Journey, the sister app. Always as the signed-in person: their own sign-in is
 * passed along ({@link Caller}), so this app never sees more of Journey than that person does, and Journey's
 * own rules decide every answer.
 *
 * <p>Behind {@code homeport.journey.mode}: {@code http} is Journey's real API ({@link HttpJourney}),
 * {@code local} a stand-in with sample journeys ({@link LocalJourney}), {@code off} no Journey at all
 * ({@link NoJourney}). What Journey doesn't offer yet is said in {@link #notYet()}, and a call that needs it
 * answers with {@link #notYet(String)}: the screens say so instead of pretending.
 */
public interface JourneyPort {

    /** Which Journey this is. */
    JourneyMode mode();

    /**
     * What this Journey can't do yet, each with a sentence a screen can show. Empty when it offers
     * everything that is asked of it.
     */
    List<NotYet> notYet();

    /** The person's Journey profile. Empty when they have none: they never opened Journey. */
    Optional<Traveller> profile(Caller as);

    /** The person's own journeys, active and completed, of every visibility, newest first. */
    Page<JourneyBrief> journeys(Caller as, String cursor, int limit);

    /** One journey with its numbers, if this person may see it in Journey. */
    Optional<JourneyBrief> journey(Caller as, UUID journeyId);

    /**
     * A journey's whole story, for one of its authors: every entry in the order things happened, with its
     * day, words, place, and photos and clips at the best size Journey has. Not found for anyone else.
     */
    Story story(Caller as, UUID journeyId);

    /** The kind words under an entry, oldest first, fifty at most. */
    List<StoryRemark> remarks(Caller as, UUID entryId);

    /**
     * The file of a photo or clip of the person's own story. Answers {@link #notYet(String)} for a clip
     * Journey can only play, not hand over.
     */
    byte[] file(Caller as, StoryShot shot);

    /** The picture that stands for a photo or clip of the person's own story: the photo itself, a clip's still. */
    byte[] still(Caller as, StoryShot shot);

    /** The picture a journey shows as its cover, for someone who may see it. Empty for a journey without one. */
    Optional<byte[]> cover(Caller as, JourneyBrief journey);

    /**
     * The journeys these people are on right now that this person may see in Journey, each with how much is
     * new and its latest entry. Their own journeys are not among them.
     */
    List<AwayJourney> away(Caller as, Collection<UUID> userIds);

    /**
     * Makes a journey from a draft. The draft has been through "Before it leaves home" ({@link LeavingHome}):
     * there is no other way to build one, so nothing reaches Journey that wasn't checked.
     *
     * @param sent told how many photos and clips have gone so far
     */
    PostedJourney post(Caller as, LeavingHome.Checked draft, IntConsumer sent);

    /** A challenge the person may see, with how many days were ticked. {@code ref} is what a goal stored. */
    Optional<ChallengeDays> challenge(Caller as, String ref);

    // ---------- what Journey says ----------

    /** Someone in Journey. The id is the one they sign in with: the same in both apps. */
    record JourneyPerson(
            UUID id, String name, @Schema(nullable = true) String avatarUrl) {}

    /** The person's own Journey profile, for the switch between the apps. */
    record Traveller(
            UUID id,
            String username,
            String displayName,
            @Schema(nullable = true) String avatarUrl,
            int journeys,
            int followers,
            int following,

            @Schema(description = "Opens their profile in the Journey app")
            String openUrl) {}

    record JourneyBrief(
            UUID id,
            String title,
            JourneyStatus status,
            JourneyVisibility visibility,
            @Schema(nullable = true) String coverUrl,
            LocalDate startDate,

            @Schema(nullable = true, description = "The day of its last entry")
            LocalDate lastDay,

            @Schema(nullable = true, description = "For a challenge: how many days it runs")
            Integer targetDays,

            @Schema(description = "The day or part number of its latest entry; 0 before the first")
            int latestNumber,

            @Schema(description = "Ready to show: Day 6 of 9, Day 14, Part 5")
            String progressLabel,

            @Schema(description = "From its first day to its last entry, counting both")
            int days,

            int entries,

            @Schema(nullable = true, description = "Null where Journey doesn't count them in a list")
            Integer photos,

            @Schema(nullable = true) Integer clips,
            @Schema(nullable = true) Integer places,
            int followers,
            JourneyPerson owner,

            @Schema(description = "Everyone who writes in it, the owner first")
            List<JourneyPerson> authors,

            @Schema(description = "True when the person asking writes in it")
            boolean mine,

            @Schema(nullable = true) String closingNote,
            @Schema(nullable = true) Instant lastEntryAt,

            @Schema(description = "Opens it in the Journey app")
            String openUrl) {}

    record Story(JourneyBrief journey, List<StoryEntry> entries) {}

    record StoryEntry(
            UUID id,
            JourneyPerson author,
            Instant happenedAt,
            LocalDate happenedOn,
            int number,
            String label,
            String title,
            String body,
            String placeName,
            Double lat,
            Double lng,
            List<StoryShot> shots,
            int likes,
            int comments,
            Instant createdAt) {}

    /**
     * A photo or clip of an entry.
     *
     * @param url a picture to show: the photo, or a clip's still
     * @param fileUrl the file itself at its best size; null for a clip that can only be played
     * @param takenAt when the phone says it was taken; null where Journey doesn't keep that
     * @param originalHash the fingerprint of the file the phone had (SHA-256, hex); null where Journey has none
     */
    record StoryShot(
            UUID id,
            MediaKind kind,
            String url,
            String fileUrl,
            Integer width,
            Integer height,
            Integer durationSeconds,
            Instant takenAt,
            String originalHash) {}

    record StoryRemark(String by, String body) {}

    record AwayJourney(JourneyBrief journey, int newCount, StoryEntry latest) {}

    record ChallengeDays(UUID journeyId, String title, int checkIns, Integer targetDays) {}

    /**
     * @param said what could not be done, in sentences: "Invite Alex in Journey: co-authors can't be set from
     *     here yet."
     */
    record PostedJourney(UUID journeyId, String openUrl, int entries, int shots, List<String> said) {}

    record NotYet(
            @Schema(description = "originals, clips, co_authors, not_followed")
            String code,

            @Schema(description = "A sentence for the screen")
            String says) {}

    // ---------- the answers every Journey gives the same way ----------

    /** Journey has no such journey for this person. */
    static ApiProblem notFound() {
        return new ApiProblem(
                HttpStatus.NOT_FOUND, "journey_not_found", "That journey isn't there, or it isn't yours to see.");
    }

    /** Asked for something Journey doesn't offer yet. */
    static ApiProblem notYet(String says) {
        return new ApiProblem(HttpStatus.NOT_IMPLEMENTED, "journey_not_yet", says);
    }

    /** Journey is switched off here. */
    static ApiProblem off() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "journey_off", "Journey isn't connected here.");
    }

    /** Journey didn't answer, or answered with something unexpected. */
    static ApiProblem unreachable() {
        return new ApiProblem(
                HttpStatus.SERVICE_UNAVAILABLE, "journey_unreachable", "Journey didn't answer. Try again in a moment.");
    }
}
