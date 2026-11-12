package app.homeport.api.circle;

import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.PublicUrls;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.profile.Profile;
import app.homeport.api.profile.ProfileStore;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.media.Schema;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The rules for circles and the people in them. */
@Service
public class CircleService {

    static final int MAX_CIRCLES = 20;
    static final int MAX_MEMBERS = 30;

    private static final Logger log = LoggerFactory.getLogger(CircleService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String CODE_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

    /** Someone in a circle, as the app shows them. */
    public record MemberResponse(
            UUID id,
            UUID circleId,
            String name,
            MemberKind kind,
            Role role,
            MemberStatus status,
            @Schema(nullable = true) String avatarUrl,
            @Schema(nullable = true) LocalDate birthday,

            @Schema(description = "A few words under the name of someone without a phone, such as Dog")
            String about,

            @Schema(description = "Short facts kept about them: Shoes 33, Class 4B")
            List<String> facts,

            @Schema(description = "Which of the five tints tells them apart in a calendar or a chart, 1 to 5")
            int tint,

            @Schema(description = "True for the signed-in person's own place in the circle")
            boolean you,

            boolean seesLibrary,
            boolean seesPlan,
            boolean seesPages) {}

    public record CircleResponse(
            UUID id,
            CircleKind kind,
            String name,
            @Schema(nullable = true) String coverUrl,

            @Schema(description = "What a new thing starts as in this circle")
            Audience startsAs,

            @Schema(description = "Only a family has roles") boolean hasRoles,
            UUID myMemberId,
            Role myRole,

            @Schema(description = "True when the signed-in person may add and remove people and change the circle")
            boolean iRunIt,

            Instant createdAt,

            @Schema(
                    description = "The link that lets someone join. Only shown to people who run the circle.",
                    nullable = true)
            String joinUrl,

            List<MemberResponse> members,

            @Schema(description = "How many things of each kind are shared with you here, by kind of thing")
            Map<String, Integer> shared,

            @Schema(
                    nullable = true,
                    description = "A few words the places add under the circle's name in the list of your circles,"
                            + " after what kind it is and how many people: you're owed €64. Null with nothing to say.")
            String line) {}

    public record JoinPreview(UUID circleId, String name, CircleKind kind, int people, boolean alreadyIn) {}

    private final CircleStore circles;
    private final MemberStore members;
    private final ProfileStore profiles;
    private final MediaService media;
    private final PublicUrls urls;
    private final ObjectProvider<CircleLine> lines;

    // The places that add a line need the circles themselves: they are asked for when a list is read, not before.
    CircleService(
            CircleStore circles,
            MemberStore members,
            ProfileStore profiles,
            MediaService media,
            PublicUrls urls,
            ObjectProvider<CircleLine> lines) {
        this.circles = circles;
        this.members = members;
        this.profiles = profiles;
        this.media = media;
        this.urls = urls;
        this.lines = lines;
    }

    // ---------- reading ----------

    public List<CircleResponse> mine(UUID me) {
        return views(circles.of(me), me);
    }

    public CircleResponse get(UUID id, UUID me) {
        return views(List.of(require(id, me)), me).get(0);
    }

    /** The circle, for someone in it. To anyone else it isn't there. */
    public CircleRow require(UUID id, UUID me) {
        return circles.find(id, me).orElseThrow(CircleService::notFound);
    }

    public java.util.Optional<CircleRow> find(UUID id, UUID me) {
        return circles.find(id, me);
    }

    /** The signed-in person's own place in a circle. To anyone not in it, the circle isn't there. */
    public MemberRow me(UUID circleId, UUID me) {
        return members.mine(circleId, me).orElseThrow(CircleService::notFound);
    }

    public static ApiProblem notFound() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "circle_not_found", "We couldn't find that circle.");
    }

    private static ApiProblem memberNotFound() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "member_not_found", "We couldn't find that person.");
    }

    /** In a family the owner and the other adults run things. Everywhere else everyone does: they are equals. */
    public static boolean runs(CircleRow circle, MemberRow member) {
        return member.role() != Role.GUEST && (!circle.kind().hasRoles() || member.grownUp());
    }

    private List<CircleResponse> views(List<CircleRow> rows, UUID me) {
        List<UUID> ids = rows.stream().map(CircleRow::id).toList();
        Map<UUID, List<MemberRow>> people =
                members.of(ids).stream().collect(Collectors.groupingBy(MemberRow::circleId));
        Map<UUID, Map<String, Integer>> shared = circles.sharedCounts(ids, me);
        // What each place has to say about each circle, one after the other when several do.
        Map<UUID, String> said = new HashMap<>();
        if (!ids.isEmpty()) {
            lines.orderedStream()
                    .forEach(place -> place.lines(me, ids).forEach((circle, words) -> {
                        if (words != null && !words.isBlank()) {
                            said.merge(circle, words, (before, more) -> before + " · " + more);
                        }
                    }));
        }
        return rows.stream()
                .map(circle -> {
                    List<MemberRow> in = people.getOrDefault(circle.id(), List.of());
                    MemberRow mine = in.stream()
                            .filter(m -> me.equals(m.userId()))
                            .findFirst()
                            .orElseThrow(CircleService::notFound);
                    boolean iRunIt = runs(circle, mine);
                    return new CircleResponse(
                            circle.id(),
                            circle.kind(),
                            circle.name(),
                            media.urlFor(circle.coverKey(), MediaSize.MEDIUM),
                            circle.kind().startsAs(),
                            circle.kind().hasRoles(),
                            mine.id(),
                            mine.role(),
                            iRunIt,
                            circle.createdAt(),
                            iRunIt ? joinUrl(circle.joinCode()) : null,
                            in.stream().map(m -> view(m, me)).toList(),
                            shared.getOrDefault(circle.id(), Map.of()),
                            said.get(circle.id()));
                })
                .toList();
    }

    public MemberResponse view(MemberRow m, UUID me) {
        return new MemberResponse(
                m.id(),
                m.circleId(),
                m.name(),
                m.kind(),
                m.role(),
                m.status(),
                media.urlFor(m.avatarKey(), MediaSize.SMALL),
                m.birthday(),
                m.about(),
                m.facts(),
                m.tint(),
                me.equals(m.userId()),
                m.seesLibrary(),
                m.seesPlan(),
                m.seesPages());
    }

    private String joinUrl(String code) {
        return urls.to("/join/" + code);
    }

    // ---------- circles ----------

    @Transactional
    public CircleResponse create(UUID me, CircleKind kind, String name, UUID clientId) {
        if (circles.countOf(me) >= MAX_CIRCLES) {
            throw ApiProblem.conflict(
                    "too_many_circles", "That's the most circles one person can be in. Leave one first.");
        }
        Profile profile = profiles.find(me).orElseThrow();
        String clean = name.trim();
        UUID id = circles.insert(me, kind, clean, newJoinCode(clean), clientId);
        if (members.mine(id, me).isEmpty()) {
            members.insert(
                    id,
                    me,
                    profile.displayName(),
                    MemberKind.PERSON,
                    Role.OWNER,
                    MemberStatus.JOINED,
                    profile.avatarMediaId(),
                    null,
                    "",
                    null,
                    1,
                    null);
        }
        return get(id, me);
    }

    @Transactional
    public CircleResponse change(
            UUID id, UUID me, String name, CircleKind kind, UUID coverMediaId, boolean removeCover) {
        CircleRow circle = require(id, me);
        requireRuns(circle, me(id, me));
        if (coverMediaId != null) {
            media.requireOwn(coverMediaId, me, MediaKind.PHOTO);
        }
        circles.update(
                id,
                kind == null ? circle.kind() : kind,
                name == null ? circle.name() : name.trim(),
                coverMediaId,
                coverMediaId != null || removeCover);
        return get(id, me);
    }

    @Transactional
    public CircleResponse newJoinLink(UUID id, UUID me) {
        CircleRow circle = require(id, me);
        requireRuns(circle, me(id, me));
        circles.newJoinCode(id, newJoinCode(circle.name()));
        return get(id, me);
    }

    private static void requireRuns(CircleRow circle, MemberRow member) {
        if (!runs(circle, member)) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN, "not_yours_to_change", "Only the adults in this circle can change that.");
        }
    }

    /** A readable start and an end nobody can guess: "the-linds-x7k2m9qa". The end is what keeps strangers out. */
    static String newJoinCode(String name) {
        String slug = Normalizer.normalize(name, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
        StringBuilder code = new StringBuilder(slug.length() > 24 ? slug.substring(0, 24) : slug);
        if (code.length() > 0) {
            code.append('-');
        }
        for (int i = 0; i < 8; i++) {
            code.append(CODE_LETTERS.charAt(RANDOM.nextInt(CODE_LETTERS.length())));
        }
        return code.toString();
    }

    // ---------- members ----------

    public record NewMember(
            String name,
            MemberKind kind,
            Role role,
            String email,
            LocalDate birthday,
            String about,
            UUID avatarMediaId) {}

    @Transactional
    public MemberResponse add(UUID circleId, UUID me, NewMember input, UUID clientId) {
        CircleRow circle = require(circleId, me);
        MemberRow mine = me(circleId, me);
        requireRuns(circle, mine);
        if (members.countIn(circleId) >= MAX_MEMBERS) {
            throw ApiProblem.conflict("circle_full", "A circle holds 30 at most. Start another for the rest.");
        }
        MemberKind kind = input.kind() == null ? MemberKind.PERSON : input.kind();
        String email = input.email() == null || input.email().isBlank()
                ? null
                : input.email().trim().toLowerCase(Locale.ROOT);
        if (email != null && (kind != MemberKind.PERSON || !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))) {
            throw ApiProblem.badRequest("invalid_email", "Check that email address.");
        }
        Role role = roleFor(circle, kind, input.role());
        if (input.avatarMediaId() != null) {
            media.requireOwn(input.avatarMediaId(), me, MediaKind.PHOTO);
        }
        // Someone with an address is invited and joins with their own sign-in; anyone else is in the circle
        // without a phone, and the adults look after their things.
        MemberStatus status = email != null ? MemberStatus.INVITED : MemberStatus.NO_PHONE;
        int tint = members.countIn(circleId) % 5 + 1;
        UUID id = members.insert(
                circleId,
                null,
                input.name().trim(),
                kind,
                role,
                status,
                input.avatarMediaId(),
                input.birthday(),
                input.about() == null ? "" : input.about().trim(),
                email,
                tint,
                clientId);
        if (email != null) {
            // The invitation itself goes out by email once the email service is connected. Until then the
            // link is what gets someone in, and local mode writes it here so it can be tried.
            log.info("Invitation to {} for {}: {}", circle.name(), email, joinUrl(circle.joinCode()));
        }
        return view(members.find(id).orElseThrow(), me);
    }

    /** Roles exist only in a family, and nobody is made its owner by being added. A child and a pet have no say. */
    private static Role roleFor(CircleRow circle, MemberKind kind, Role asked) {
        if (kind == MemberKind.PET || kind == MemberKind.CHILD) {
            return Role.CHILD;
        }
        if (!circle.kind().hasRoles()) {
            return asked == Role.GUEST ? Role.GUEST : Role.ADULT;
        }
        return asked == null || asked == Role.OWNER ? Role.ADULT : asked;
    }

    public record MemberChange(
            String name,
            Role role,
            LocalDate birthday,
            Boolean removeBirthday,
            String about,
            List<String> facts,
            UUID avatarMediaId,
            Boolean removeAvatar,
            Boolean seesLibrary,
            Boolean seesPlan,
            Boolean seesPages) {}

    public MemberRow member(UUID id, UUID me) {
        MemberRow member = members.find(id).orElseThrow(CircleService::memberNotFound);
        if (members.mine(member.circleId(), me).isEmpty()) {
            throw memberNotFound();
        }
        return member;
    }

    @Transactional
    public MemberResponse change(UUID id, UUID me, MemberChange change) {
        MemberRow member = member(id, me);
        CircleRow circle = require(member.circleId(), me);
        MemberRow mine = me(member.circleId(), me);
        requireRuns(circle, mine);
        Role role = member.role();
        if (change.role() != null && change.role() != member.role()) {
            if (member.role() == Role.OWNER
                    || change.role() == Role.OWNER
                    || !circle.kind().hasRoles()
                    || member.kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("role_fixed", "That role can't be changed here.");
            }
            role = change.role();
        }
        // Someone with their own sign-in keeps the name and picture of their profile.
        boolean own = member.userId() != null;
        if (change.avatarMediaId() != null && !own) {
            media.requireOwn(change.avatarMediaId(), me, MediaKind.PHOTO);
        }
        List<String> facts = change.facts() == null
                ? member.facts()
                : change.facts().stream()
                        .map(String::trim)
                        .filter(f -> !f.isEmpty())
                        .distinct()
                        .limit(12)
                        .toList();
        members.update(
                id,
                own || change.name() == null ? member.name() : change.name().trim(),
                role,
                change.avatarMediaId(),
                !own && (change.avatarMediaId() != null || Boolean.TRUE.equals(change.removeAvatar())),
                Boolean.TRUE.equals(change.removeBirthday())
                        ? null
                        : change.birthday() == null ? member.birthday() : change.birthday(),
                change.about() == null ? member.about() : change.about().trim(),
                facts,
                change.seesLibrary() == null ? member.seesLibrary() : change.seesLibrary(),
                change.seesPlan() == null ? member.seesPlan() : change.seesPlan(),
                change.seesPages() == null ? member.seesPages() : change.seesPages());
        return view(members.find(id).orElseThrow(), me);
    }

    /**
     * Takes someone out of a circle, or leaves it yourself. The owner can't be removed and can't leave while
     * others are in it: someone else has to become the owner first. The last person to leave takes the circle
     * with them.
     */
    @Transactional
    public void remove(UUID id, UUID me) {
        MemberRow member = member(id, me);
        CircleRow circle = require(member.circleId(), me);
        MemberRow mine = me(member.circleId(), me);
        boolean myself = member.id().equals(mine.id());
        if (!myself) {
            requireRuns(circle, mine);
            if (member.role() == Role.OWNER) {
                throw ApiProblem.conflict("owner_stays", "The owner can't be removed from the circle.");
            }
        }
        if (member.userId() == null) {
            members.delete(id);
            return;
        }
        List<MemberRow> others = members.of(List.of(circle.id())).stream()
                .filter(m -> m.userId() != null && m.status() == MemberStatus.JOINED && !m.id().equals(id))
                .toList();
        if (myself && others.isEmpty()) {
            circles.delete(circle.id());
            return;
        }
        if (myself && member.role() == Role.OWNER) {
            // Whoever has been here longest and can run things takes over.
            MemberRow next = others.stream()
                    .filter(m -> runs(circle, m))
                    .findFirst()
                    .orElseThrow(() -> ApiProblem.conflict(
                            "owner_needed", "Make another adult the owner before you leave, or remove the circle."));
            members.makeOwner(next.id());
        }
        members.markLeft(id);
    }

    /** The owner hands the circle to another adult and becomes an adult in it. */
    @Transactional
    public CircleResponse handOver(UUID memberId, UUID me) {
        MemberRow member = member(memberId, me);
        MemberRow mine = me(member.circleId(), me);
        if (mine.role() != Role.OWNER) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN, "not_yours_to_change", "Only the owner can hand the circle over.");
        }
        if (member.userId() == null || member.status() != MemberStatus.JOINED || !member.grownUp()) {
            throw ApiProblem.badRequest("not_an_adult", "Choose an adult who has joined the circle.");
        }
        members.update(
                mine.id(),
                mine.name(),
                Role.ADULT,
                null,
                false,
                mine.birthday(),
                mine.about(),
                mine.facts(),
                mine.seesLibrary(),
                mine.seesPlan(),
                mine.seesPages());
        members.makeOwner(member.id());
        return get(member.circleId(), me);
    }

    // ---------- joining ----------

    public JoinPreview preview(String code, UUID me) {
        CircleRow circle =
                circles.byJoinCode(code.trim().toLowerCase(Locale.ROOT)).orElseThrow(CircleService::linkGone);
        return new JoinPreview(
                circle.id(),
                circle.name(),
                circle.kind(),
                members.countIn(circle.id()),
                members.mine(circle.id(), me).isPresent());
    }

    /**
     * Joins the circle a link is for. Someone who was invited by email takes the place that was kept for
     * them, with the role it was given; anyone else with the link joins as an adult (in a couple, a flat or
     * a crew: as an equal). Joining twice is fine.
     */
    @Transactional
    public CircleResponse join(String code, UUID me, String email) {
        CircleRow circle =
                circles.byJoinCode(code.trim().toLowerCase(Locale.ROOT)).orElseThrow(CircleService::linkGone);
        if (members.mine(circle.id(), me).isPresent()) {
            return get(circle.id(), me);
        }
        if (circles.countOf(me) >= MAX_CIRCLES) {
            throw ApiProblem.conflict(
                    "too_many_circles", "That's the most circles one person can be in. Leave one first.");
        }
        Profile profile = profiles.find(me).orElseThrow();
        UUID invited =
                email == null ? null : members.invited(circle.id(), email).orElse(null);
        UUID before = members.leftBefore(circle.id(), me).orElse(null);
        if (invited != null) {
            members.join(invited, me, profile.displayName(), profile.avatarMediaId());
        } else if (before != null) {
            members.comeBack(before);
        } else {
            if (members.countIn(circle.id()) >= MAX_MEMBERS) {
                throw ApiProblem.conflict("circle_full", "That circle is full.");
            }
            members.insert(
                    circle.id(),
                    me,
                    profile.displayName(),
                    MemberKind.PERSON,
                    Role.ADULT,
                    MemberStatus.JOINED,
                    profile.avatarMediaId(),
                    null,
                    "",
                    null,
                    members.countIn(circle.id()) % 5 + 1,
                    null);
        }
        return get(circle.id(), me);
    }

    private static ApiProblem linkGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "link_gone", "That link doesn't work any more. Ask for a new one.");
    }
}
