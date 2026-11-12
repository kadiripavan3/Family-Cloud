package app.homeport.api.guest;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.PublicUrls;
import app.homeport.api.guest.GuestPassStore.PassRow;
import app.homeport.api.guest.GuestPassStore.PassThing;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Guest passes: chosen things for someone who is not in the circle, for a set time, on one phone, with no
 * account. The guest opens a web page with the link and a four-digit code; the first phone to get the code
 * right is the only one the pass works on, and when the time is over it shows nothing.
 */
@Service
public class GuestPassService {

    static final int MAX_THINGS = 20;
    static final int MAX_WRONG_CODES = 5;
    static final Duration LONGEST = Duration.ofDays(30);

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

    public record PassThingResponse(UUID id, ThingKind kind, String title) {}

    public record GuestPassResponse(
            UUID id,
            UUID circleId,
            String guestName,
            Instant startsAt,
            Instant endsAt,

            @Schema(description = "The link to send to the guest")
            String url,

            @Schema(description = "The four digits the guest types. Tell them another way than the link.")
            String code,

            @Schema(description = "True between its start and its end, unless it was ended early")
            boolean running,

            @Schema(description = "True once a phone has opened it")
            boolean opened,

            List<PassThingResponse> things) {}

    /** What the guest's web page shows. */
    public enum Door {
        GONE,
        EARLY,
        ENDED,
        ELSEWHERE,
        LOCKED,
        CODE,
        OPEN
    }

    public record GuestCard(String label, String title, String text) {}

    public record Visit(Door door, PassRow pass, List<GuestCard> cards, String device, boolean wrongCode) {}

    private final GuestPassStore passes;
    private final CircleService circles;
    private final ThingStore things;
    private final PublicUrls urls;
    private final Map<ThingKind, GuestView> views;

    GuestPassService(
            GuestPassStore passes, CircleService circles, ThingStore things, PublicUrls urls, List<GuestView> views) {
        this.passes = passes;
        this.circles = circles;
        this.things = things;
        this.urls = urls;
        this.views = views.stream().collect(Collectors.toMap(GuestView::kind, Function.identity()));
    }

    // ---------- for the people in the circle ----------

    @Transactional
    public GuestPassResponse create(
            UUID me,
            UUID circleId,
            String guestName,
            Instant startsAt,
            Instant endsAt,
            List<UUID> thingIds,
            UUID clientId) {
        CircleRow circle = circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        requireRuns(circle, mine);
        Instant starts = startsAt == null ? Instant.now() : startsAt;
        if (endsAt == null || !endsAt.isAfter(starts) || !endsAt.isAfter(Instant.now())) {
            throw ApiProblem.badRequest("invalid_time", "Choose when the pass ends. It has to be later than now.");
        }
        if (Duration.between(starts, endsAt).compareTo(LONGEST) > 0) {
            throw ApiProblem.badRequest(
                    "too_long", "A pass lasts 30 days at most. Invite them to the circle for longer.");
        }
        List<UUID> ids =
                thingIds == null ? List.of() : thingIds.stream().distinct().toList();
        if (ids.isEmpty() || ids.size() > MAX_THINGS) {
            throw ApiProblem.badRequest("invalid_things", "Choose between 1 and 20 things for the pass.");
        }
        // Only what the maker can see, in this circle, of a kind a guest can be shown.
        List<ThingRow> chosen = things.findAll(ids, me);
        if (chosen.size() != ids.size()
                || chosen.stream().anyMatch(t -> !t.circleId().equals(circleId) || !views.containsKey(t.kind()))) {
            throw ApiProblem.badRequest("invalid_things", "One of those can't be put on a pass.");
        }
        UUID id = passes.insert(circleId, mine.id(), guestName.trim(), newToken(), newCode(), starts, endsAt, clientId);
        passes.put(id, ids);
        return get(id, me);
    }

    public GuestPassResponse get(UUID id, UUID me) {
        PassRow pass = require(id, me);
        return views(List.of(pass)).get(0);
    }

    public List<GuestPassResponse> list(UUID circleId, UUID me) {
        CircleRow circle = circles.require(circleId, me);
        requireRuns(circle, circles.me(circleId, me));
        return views(passes.of(circleId));
    }

    @Transactional
    public void end(UUID id, UUID me) {
        require(id, me);
        passes.end(id);
    }

    private PassRow require(UUID id, UUID me) {
        PassRow pass = passes.find(id).orElseThrow(GuestPassService::notFound);
        CircleRow circle = circles.find(pass.circleId(), me).orElseThrow(GuestPassService::notFound);
        requireRuns(circle, circles.me(pass.circleId(), me));
        return pass;
    }

    private static void requireRuns(CircleRow circle, MemberRow member) {
        if (!CircleService.runs(circle, member)) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "not_yours_to_change",
                    "Only the adults in this circle can give a guest pass.");
        }
    }

    private static ApiProblem notFound() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "pass_not_found", "We couldn't find that guest pass.");
    }

    private List<GuestPassResponse> views(List<PassRow> rows) {
        Map<UUID, List<PassThing>> on = passes
                .things(rows.stream().map(PassRow::id).toList())
                .stream()
                .collect(Collectors.groupingBy(PassThing::passId));
        return rows.stream()
                .map(p -> new GuestPassResponse(
                        p.id(),
                        p.circleId(),
                        p.guestName(),
                        p.startsAt(),
                        p.endsAt(),
                        urls.to("/g/" + p.token()),
                        p.code(),
                        running(p),
                        p.device() != null,
                        on.getOrDefault(p.id(), List.of()).stream()
                                .map(t -> new PassThingResponse(t.thingId(), t.kind(), t.title()))
                                .toList()))
                .toList();
    }

    private static boolean running(PassRow pass) {
        Instant now = Instant.now();
        return pass.endedAt() == null && !now.isBefore(pass.startsAt()) && now.isBefore(pass.endsAt());
    }

    private static String newToken() {
        StringBuilder token = new StringBuilder();
        for (int i = 0; i < 16; i++) {
            if (i > 0 && i % 4 == 0) {
                token.append('-');
            }
            token.append(LETTERS.charAt(RANDOM.nextInt(LETTERS.length())));
        }
        return token.toString();
    }

    private static String newCode() {
        return "%04d".formatted(RANDOM.nextInt(10000));
    }

    // ---------- for the guest ----------

    /**
     * What the guest's page shows for this link, phone and code. {@code device} is what this phone was given
     * when it first got the code right (a cookie), or null; {@code code} is what was just typed, or null.
     */
    @Transactional
    public Visit visit(String token, String device, String code) {
        PassRow pass = passes.byToken(token).orElse(null);
        if (pass == null) {
            return new Visit(Door.GONE, null, List.of(), null, false);
        }
        Instant now = Instant.now();
        if (pass.endedAt() != null || !now.isBefore(pass.endsAt())) {
            return new Visit(Door.ENDED, pass, List.of(), null, false);
        }
        if (now.isBefore(pass.startsAt())) {
            return new Visit(Door.EARLY, pass, List.of(), null, false);
        }
        if (pass.device() != null) {
            return same(pass.device(), device)
                    ? new Visit(Door.OPEN, pass, cards(pass), device, false)
                    : new Visit(Door.ELSEWHERE, pass, List.of(), null, false);
        }
        if (pass.wrongCodes() >= MAX_WRONG_CODES) {
            return new Visit(Door.LOCKED, pass, List.of(), null, false);
        }
        if (code == null) {
            return new Visit(Door.CODE, pass, List.of(), null, false);
        }
        if (!same(pass.code(), code.trim())) {
            passes.wrongCode(pass.id());
            return new Visit(
                    pass.wrongCodes() + 1 >= MAX_WRONG_CODES ? Door.LOCKED : Door.CODE, pass, List.of(), null, true);
        }
        String mine = UUID.randomUUID().toString();
        if (!passes.bind(pass.id(), mine)) {
            return new Visit(Door.ELSEWHERE, pass, List.of(), null, false);
        }
        return new Visit(Door.OPEN, pass, cards(pass), mine, false);
    }

    private List<GuestCard> cards(PassRow pass) {
        return passes.things(List.of(pass.id())).stream()
                .filter(t -> views.containsKey(t.kind()))
                .map(t -> {
                    GuestView.Card card = views.get(t.kind()).show(t.thingId());
                    return new GuestCard(card.label(), t.title(), card.text());
                })
                .toList();
    }

    /** Compares in the same time whatever the two hold, so the wait doesn't say how much of a guess was right. */
    private static boolean same(String a, String b) {
        return b != null
                && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
