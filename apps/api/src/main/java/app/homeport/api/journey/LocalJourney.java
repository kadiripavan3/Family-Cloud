package app.homeport.api.journey;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.profile.Profile;
import app.homeport.api.profile.ProfileStore;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.IntConsumer;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Local mode's stand-in for Journey: journeys kept in two small tables of this database, with their photos in
 * this computer's folder. It answers the way the real Journey would, including what it refuses: a private
 * journey is there only for the people who write in it, a story is handed over only to its authors, and
 * nobody learns of a journey they couldn't open in Journey itself.
 *
 * <p>Unlike today's Journey it knows when each photo was taken and the fingerprint of the file the phone had,
 * and it hands over a clip as a file: what the real one is asked to add (docs/10-journey-changes.md). So
 * everything built on the port can be tried here in full.
 *
 * <p>The sample data and the tests fill it through {@link #join}, {@link #start} and {@link #photo}.
 */
@Component
@ConditionalOnProperty(name = "homeport.journey.mode", havingValue = "local")
public class LocalJourney implements JourneyPort {

    /** A journey as the stand-in keeps it: one document. */
    public record Doc(
            UUID id,
            UUID ownerId,
            String title,
            JourneyVisibility visibility,
            JourneyStatus status,
            LocalDate startDate,
            Integer targetDays,
            String closingNote,
            List<UUID> authors,
            int followers,
            Map<String, Instant> readAt,
            Drawn drawn,
            String ref,
            UUID cover,
            List<DocEntry> entries) {

        public Doc with(List<DocEntry> entries) {
            return new Doc(
                    id,
                    ownerId,
                    title,
                    visibility,
                    status,
                    startDate,
                    targetDays,
                    closingNote,
                    authors,
                    followers,
                    readAt,
                    drawn,
                    ref,
                    cover,
                    entries);
        }

        /** The photo the journey shows as its cover: the one chosen, else its first. */
        Optional<DocShot> coverShot() {
            List<DocShot> photos = entries.stream()
                    .flatMap(entry -> entry.shots().stream())
                    .filter(shot -> shot.kind() == MediaKind.PHOTO)
                    .toList();
            return photos.stream()
                    .filter(shot -> shot.id().equals(cover))
                    .findFirst()
                    .or(() -> photos.stream().findFirst());
        }
    }

    /**
     * Numbers a sample journey states although it carries fewer entries and photos than that: the screens
     * draw "62 entries, 214 photos", and the sample brings a believable part of them.
     */
    public record Drawn(Integer days, Integer entries, Integer photos, Integer clips, Integer places) {}

    public record DocEntry(
            UUID id,
            UUID authorId,
            Instant happenedAt,
            LocalDate happenedOn,
            String title,
            String body,
            String place,
            Double lat,
            Double lng,
            List<DocShot> shots,
            int likes,
            List<StoryRemark> remarks,
            Instant createdAt) {}

    /**
     * @param key where the file is in this computer's folder
     * @param posterKey for a clip: its still
     */
    public record DocShot(
            UUID id,
            MediaKind kind,
            String key,
            String posterKey,
            Integer width,
            Integer height,
            Integer durationSeconds,
            Instant takenAt,
            String originalHash) {}

    private static final JsonMapper JSON = JsonMapper.builder().build();
    /** Two folders deep, like every address the local stand-in for storage serves ({@code /media/a/b/file}). */
    private static final String FOLDER = "journey/standin/";

    private final JdbcClient jdbc;
    private final MediaStorage storage;
    private final MediaService media;
    private final ProfileStore profiles;
    private final String open;

    LocalJourney(
            JdbcClient jdbc,
            MediaStorage storage,
            MediaService media,
            ProfileStore profiles,
            @Value("${homeport.journey.open:journey://}") String open) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.media = media;
        this.profiles = profiles;
        this.open = open;
    }

    // ---------- filling it ----------

    /** Gives someone a Journey profile. Their name and picture are the ones they have here: it is one account. */
    public void join(UUID userId, String username, int following, int followers) {
        jdbc.sql("""
            insert into local_journey_people (user_id, username, following, followers)
            values (:id, :username, :following, :followers)
            on conflict (user_id) do update set username = excluded.username, following = excluded.following,
              followers = excluded.followers
            """)
                .param("id", userId)
                .param("username", username)
                .param("following", following)
                .param("followers", followers)
                .update();
    }

    /** Keeps a journey, or keeps it again as it now is. */
    public void start(Doc doc) {
        jdbc.sql("""
            insert into local_journeys (id, owner_id, doc) values (:id, :owner, cast(:doc as jsonb))
            on conflict (id) do update set doc = excluded.doc
            """)
                .param("id", doc.id())
                .param("owner", doc.ownerId())
                .param("doc", JSON.writeValueAsString(doc))
                .update();
    }

    public Optional<Doc> doc(UUID id) {
        return jdbc.sql("select doc from local_journeys where id = :id")
                .param("id", id)
                .query(String.class)
                .optional()
                .map(LocalJourney::read);
    }

    /** Adds an entry to a journey, as posting from the road would. */
    public void add(UUID journeyId, DocEntry entry) {
        Doc doc = doc(journeyId).orElseThrow(JourneyPort::notFound);
        List<DocEntry> entries = new ArrayList<>(doc.entries());
        entries.add(entry);
        start(doc.with(entries));
    }

    /** Stores a photo as Journey would have it, and says what Journey would know of it. */
    public DocShot photo(byte[] jpeg, Instant takenAt, String originalHash) {
        UUID id = UUID.randomUUID();
        String key = FOLDER + id + ".jpg";
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(jpeg));
            storage.put(key, jpeg, "image/jpeg");
            return new DocShot(
                    id,
                    MediaKind.PHOTO,
                    key,
                    null,
                    image == null ? null : image.getWidth(),
                    image == null ? null : image.getHeight(),
                    null,
                    takenAt,
                    originalHash);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Stores a clip and its still. */
    public DocShot clip(byte[] file, byte[] still, int seconds, Instant takenAt, String originalHash) {
        UUID id = UUID.randomUUID();
        String key = FOLDER + id + ".mp4";
        String posterKey = FOLDER + id + "-still.jpg";
        try {
            storage.put(key, file, "video/mp4");
            storage.put(posterKey, still, "image/jpeg");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return new DocShot(id, MediaKind.VIDEO, key, posterKey, null, null, seconds, takenAt, originalHash);
    }

    private static Doc read(String json) {
        return JSON.readValue(json, Doc.class);
    }

    private List<Doc> all() {
        return jdbc.sql("select doc from local_journeys order by created_at, id").query(String.class).list().stream()
                .map(LocalJourney::read)
                .toList();
    }

    // ---------- Journey's own rules ----------

    private static boolean writesIn(Doc doc, UUID viewer) {
        return doc.ownerId().equals(viewer) || doc.authors().contains(viewer);
    }

    /** Journey's rule: a public or unlisted journey can be opened; a private one is there for its authors only. */
    private static boolean sees(Doc doc, UUID viewer) {
        return doc.visibility() != JourneyVisibility.PRIVATE || writesIn(doc, viewer);
    }

    // ---------- the port ----------

    @Override
    public JourneyMode mode() {
        return JourneyMode.LOCAL;
    }

    @Override
    public List<NotYet> notYet() {
        return List.of();
    }

    @Override
    public Optional<Traveller> profile(Caller as) {
        record Row(String username, int following, int followers) {}
        Optional<Row> row = jdbc.sql(
                        "select username, following, followers from local_journey_people where user_id = :id")
                .param("id", as.userId())
                .query((rs, n) -> new Row(rs.getString("username"), rs.getInt("following"), rs.getInt("followers")))
                .optional();
        if (row.isEmpty()) {
            return Optional.empty();
        }
        JourneyPerson person = person(as.userId());
        int journeys =
                (int) all().stream().filter(doc -> writesIn(doc, as.userId())).count();
        return Optional.of(new Traveller(
                as.userId(),
                row.get().username(),
                person.name(),
                person.avatarUrl(),
                journeys,
                row.get().followers(),
                row.get().following(),
                open + "profile/" + row.get().username()));
    }

    @Override
    public Page<JourneyBrief> journeys(Caller as, String cursor, int limit) {
        Keyset page = Keyset.of(cursor, limit, 20);
        int from;
        try {
            from = page.first() ? 0 : Integer.parseInt(page.text(0));
        } catch (NumberFormatException notOurs) {
            throw Keyset.badCursor();
        }
        List<JourneyBrief> mine = all().stream()
                .filter(doc -> writesIn(doc, as.userId()))
                .sorted(Comparator.comparing(Doc::startDate).reversed().thenComparing(Doc::id))
                .map(doc -> brief(doc, as.userId()))
                .toList();
        int to = Math.min(mine.size(), from + page.limit());
        return new Page<>(mine.subList(Math.min(from, to), to), to < mine.size() ? Keyset.cursor(to) : null);
    }

    @Override
    public Optional<JourneyBrief> journey(Caller as, UUID journeyId) {
        return doc(journeyId).filter(doc -> sees(doc, as.userId())).map(doc -> brief(doc, as.userId()));
    }

    @Override
    public Story story(Caller as, UUID journeyId) {
        // The whole story, with when each photo was taken, is its authors' alone.
        Doc doc = doc(journeyId).filter(found -> writesIn(found, as.userId())).orElseThrow(JourneyPort::notFound);
        return new Story(brief(doc, as.userId()), entries(doc));
    }

    @Override
    public List<StoryRemark> remarks(Caller as, UUID entryId) {
        return all().stream()
                .filter(doc -> sees(doc, as.userId()))
                .flatMap(doc -> doc.entries().stream())
                .filter(entry -> entry.id().equals(entryId))
                .findFirst()
                .map(entry -> entry.remarks().stream().limit(50).toList())
                .orElseThrow(JourneyPort::notFound);
    }

    @Override
    public byte[] file(Caller as, StoryShot shot) {
        return bytes(own(as, shot).key());
    }

    @Override
    public byte[] still(Caller as, StoryShot shot) {
        DocShot found = own(as, shot);
        return bytes(found.kind() == MediaKind.PHOTO ? found.key() : found.posterKey());
    }

    @Override
    public Optional<byte[]> cover(Caller as, JourneyBrief journey) {
        return doc(journey.id())
                .filter(doc -> sees(doc, as.userId()))
                .flatMap(Doc::coverShot)
                .map(shot -> bytes(shot.key()));
    }

    /** A photo or clip of a journey this person writes in. Nobody else is handed its file. */
    private DocShot own(Caller as, StoryShot shot) {
        return all().stream()
                .filter(doc -> writesIn(doc, as.userId()))
                .flatMap(doc -> doc.entries().stream())
                .flatMap(entry -> entry.shots().stream())
                .filter(one -> one.id().equals(shot.id()))
                .findFirst()
                .orElseThrow(JourneyPort::notFound);
    }

    private byte[] bytes(String key) {
        try (InputStream in = storage.open(key)) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw JourneyPort.unreachable();
        }
    }

    @Override
    public List<AwayJourney> away(Caller as, Collection<UUID> userIds) {
        return all().stream()
                .filter(doc -> doc.status() == JourneyStatus.ACTIVE
                        && !writesIn(doc, as.userId())
                        && sees(doc, as.userId())
                        && (userIds.contains(doc.ownerId())
                                || doc.authors().stream().anyMatch(userIds::contains))
                        && !doc.entries().isEmpty())
                .map(doc -> {
                    List<StoryEntry> entries = entries(doc);
                    Instant read = doc.readAt() == null
                            ? null
                            : doc.readAt().get(as.userId().toString());
                    int fresh = (int) doc.entries().stream()
                            .filter(entry -> read == null || entry.createdAt().isAfter(read))
                            .count();
                    return new AwayJourney(brief(doc, as.userId()), fresh, entries.get(entries.size() - 1));
                })
                .toList();
    }

    @Override
    public PostedJourney post(Caller as, LeavingHome.Checked draft, IntConsumer sent) {
        if (profile(as).isEmpty()) {
            throw ApiProblem.conflict(
                    "no_journey_profile", "Open Journey once first, so there is somewhere to tell it.");
        }
        // The draft's id names the journey: sending the same draft twice makes one.
        UUID id = UUID.nameUUIDFromBytes(("journey of draft " + draft.draftId()).getBytes(StandardCharsets.UTF_8));
        List<DocEntry> entries = new ArrayList<>();
        int shots = 0;
        for (LeavingHome.Checked.Day day : draft.days()) {
            List<DocShot> media = new ArrayList<>();
            for (LeavingHome.Checked.Leaving leaving : day.shots()) {
                byte[] file = bytes(leaving.storageKey());
                media.add(
                        leaving.kind() == MediaKind.VIDEO
                                ? clip(
                                        file,
                                        new byte[0],
                                        leaving.durationSeconds() == null ? 0 : leaving.durationSeconds(),
                                        null,
                                        null)
                                : photo(file, null, null));
                sent.accept(++shots);
            }
            entries.add(new DocEntry(
                    UUID.nameUUIDFromBytes((id + " " + day.day()).getBytes(StandardCharsets.UTF_8)),
                    as.userId(),
                    day.day().atTime(12, 0).toInstant(java.time.ZoneOffset.UTC),
                    day.day(),
                    "",
                    day.line(),
                    day.place(),
                    day.lat(),
                    day.lng(),
                    media,
                    0,
                    List.of(),
                    Instant.now()));
        }
        List<String> said = new ArrayList<>();
        List<UUID> authors = new ArrayList<>();
        for (UUID coAuthor : draft.coAuthors()) {
            if (profile(new Caller(coAuthor, null)).isPresent()) {
                authors.add(coAuthor);
            } else {
                said.add(person(coAuthor).name() + " isn't on Journey yet, so they couldn't be added as an author.");
            }
        }
        start(new Doc(
                id,
                as.userId(),
                draft.title(),
                draft.visibility(),
                JourneyStatus.ACTIVE,
                draft.startsOn() == null ? LocalDate.now() : draft.startsOn(),
                null,
                null,
                authors,
                0,
                Map.of(),
                null,
                null,
                null,
                entries));
        return new PostedJourney(id, open + "journey/" + id, entries.size(), shots, said);
    }

    @Override
    public Optional<ChallengeDays> challenge(Caller as, String ref) {
        return all().stream()
                .filter(doc -> sees(doc, as.userId())
                        && (ref.equals(doc.ref()) || ref.equals(doc.id().toString())))
                .findFirst()
                .map(doc -> new ChallengeDays(
                        doc.id(),
                        doc.title(),
                        (int) doc.entries().stream()
                                .map(DocEntry::happenedOn)
                                .distinct()
                                .count(),
                        doc.targetDays()));
    }

    // ---------- how it tells things ----------

    private JourneyPerson person(UUID userId) {
        Optional<Profile> profile = profiles.find(userId);
        return new JourneyPerson(
                userId,
                profile.map(Profile::displayName).orElse("Someone"),
                profile.map(p -> media.urlFor(p.avatarKey(), MediaSize.SMALL)).orElse(null));
    }

    private JourneyBrief brief(Doc doc, UUID viewer) {
        List<DocEntry> entries = doc.entries();
        LocalDate lastDay = entries.stream()
                .map(DocEntry::happenedOn)
                .max(Comparator.naturalOrder())
                .orElse(null);
        int days = lastDay == null ? 0 : (int) ChronoUnit.DAYS.between(doc.startDate(), lastDay) + 1;
        int photos = (int) entries.stream()
                .flatMap(e -> e.shots().stream())
                .filter(s -> s.kind() == MediaKind.PHOTO)
                .count();
        int clips = (int) entries.stream().flatMap(e -> e.shots().stream()).count() - photos;
        int places = (int) entries.stream()
                .map(DocEntry::place)
                .filter(p -> p != null)
                .distinct()
                .count();
        Drawn drawn = doc.drawn() == null ? new Drawn(null, null, null, null, null) : doc.drawn();
        int latest = lastDay == null ? 0 : Math.max(days, 1);
        List<JourneyPerson> authors = new ArrayList<>(List.of(person(doc.ownerId())));
        doc.authors().forEach(author -> authors.add(person(author)));
        String cover =
                doc.coverShot().map(shot -> storage.publicUrl(shot.key())).orElse(null);
        return new JourneyBrief(
                doc.id(),
                doc.title(),
                doc.status(),
                doc.visibility(),
                cover,
                doc.startDate(),
                lastDay,
                doc.targetDays(),
                latest,
                latest == 0
                        ? "Not started"
                        : doc.targetDays() == null ? "Day " + latest : "Day " + latest + " of " + doc.targetDays(),
                drawn.days() != null ? drawn.days() : days,
                drawn.entries() != null ? drawn.entries() : entries.size(),
                drawn.photos() != null ? drawn.photos() : photos,
                drawn.clips() != null ? drawn.clips() : clips,
                drawn.places() != null ? drawn.places() : places,
                doc.followers(),
                authors.get(0),
                authors,
                writesIn(doc, viewer),
                doc.closingNote(),
                entries.stream()
                        .map(DocEntry::happenedAt)
                        .max(Comparator.naturalOrder())
                        .orElse(null),
                open + "journey/" + doc.id());
    }

    /** The entries in the order things happened, each with its day number. */
    private List<StoryEntry> entries(Doc doc) {
        return doc.entries().stream()
                .sorted(Comparator.comparing(DocEntry::happenedAt).thenComparing(DocEntry::id))
                .map(entry -> {
                    int number = (int) ChronoUnit.DAYS.between(doc.startDate(), entry.happenedOn()) + 1;
                    return new StoryEntry(
                            entry.id(),
                            person(entry.authorId()),
                            entry.happenedAt(),
                            entry.happenedOn(),
                            number,
                            "Day " + number,
                            entry.title(),
                            entry.body(),
                            entry.place(),
                            entry.lat(),
                            entry.lng(),
                            entry.shots().stream()
                                    .map(shot -> new StoryShot(
                                            shot.id(),
                                            shot.kind(),
                                            storage.publicUrl(
                                                    shot.kind() == MediaKind.PHOTO ? shot.key() : shot.posterKey()),
                                            storage.publicUrl(shot.key()),
                                            shot.width(),
                                            shot.height(),
                                            shot.durationSeconds(),
                                            shot.takenAt(),
                                            shot.originalHash()))
                                    .toList(),
                            entry.likes(),
                            entry.remarks().size(),
                            entry.createdAt());
                })
                .toList();
    }

    /** The fingerprint a phone would have computed for a file: its SHA-256, in hex. */
    public static String fingerprint(byte[] file) {
        return MediaSizes.sha256(file);
    }
}
