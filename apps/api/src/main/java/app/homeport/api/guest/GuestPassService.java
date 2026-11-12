package app.homeport.api.guest;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.PublicUrls;
import app.homeport.api.common.Sealed;
import app.homeport.api.guest.GuestPassStore.PassCard;
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
import java.util.Set;
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
 *
 * <p>A pass can also carry sealed cards: a door code, a Wi‑Fi password. The phone of whoever made the pass
 * seals the text with a fresh key that travels only in the part of the link after the {@code #}, which a
 * browser never sends to a server. The API keeps the ciphertext and hands it to the guest's page, which opens
 * it there. A show-once card loses its ciphertext the moment the page says it was shown.
 */
@Service
public class GuestPassService {

    static final int MAX_THINGS = 20;
    static final int MAX_CARDS = 10;
    static final int MAX_WRONG_CODES = 5;
    static final Duration LONGEST = Duration.ofDays(30);

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

    public record PassThingResponse(UUID id, ThingKind kind, String title) {}

    /** A sealed card as the people in the circle see it: its label, never what it holds. */
    public record PassCardResponse(
            UUID id,
            String label,

            @Schema(description = "True when it shows once and is then gone for good")
            boolean once,

            @Schema(description = "True once the guest's page has shown it")
            boolean shown,

            @Schema(nullable = true) Instant shownAt,

            @Schema(nullable = true, description = "The Vault item it was made from")
            UUID thingId) {}

    /** A sealed card to put on a pass, made on the phone. */
    public record NewSealedCard(
            String label,

            @Schema(
                    description =
                            "The text to show, sealed with the pass's key (AES-GCM): base64url of nonce and ciphertext")
            String ciphertext,

            Boolean once,

            @Schema(description = "The Vault item it was made from, if any")
            UUID thingId) {}

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

            List<PassThingResponse> things,

            @Schema(description = "Sealed cards: a door code, a Wi‑Fi password. Ten at most.")
            List<PassCardResponse> cards,

            @Schema(
                    nullable = true,
                    description =
                            "The pass's key, sealed to your own Vault, so another phone of yours can build the whole link again. Only shown to whoever made the pass.")
            String keyForMaker) {}

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

    public record GuestCard(String label, String title, String text, List<String> images) {}

    /** A sealed card as the guest's page gets it. {@code ciphertext} is null for a show-once card that was shown. */
    public record SealedCard(UUID id, String label, String ciphertext, boolean once) {

        public boolean gone() {
            return ciphertext == null;
        }
    }

    public record Visit(
            Door door, PassRow pass, List<GuestCard> cards, List<SealedCard> sealed, String device, boolean wrongCode) {

        Visit(Door door, PassRow pass) {
            this(door, pass, List.of(), List.of(), null, false);
        }
    }

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
            List<NewSealedCard> cards,
            String keyForMaker,
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
        List<NewSealedCard> sealed = cards == null ? List.of() : cards;
        if ((ids.isEmpty() && sealed.isEmpty()) || ids.size() > MAX_THINGS) {
            throw ApiProblem.badRequest("invalid_things", "Choose between 1 and 20 things for the pass.");
        }
        if (sealed.size() > MAX_CARDS) {
            throw tooManyCards();
        }
        sealed.forEach(card -> check(card, circleId, me));
        Sealed.keyOrNull(keyForMaker);
        // Only what the maker can see, in this circle, of a kind a guest can be shown.
        List<ThingRow> chosen = things.findAll(ids, me);
        if (chosen.size() != ids.size()
                || chosen.stream().anyMatch(t -> !t.circleId().equals(circleId) || !views.containsKey(t.kind()))) {
            throw ApiProblem.badRequest("invalid_things", "One of those can't be put on a pass.");
        }
        UUID id = passes.insert(circleId, mine.id(), guestName.trim(), newToken(), newCode(), starts, endsAt, clientId);
        passes.put(id, ids);
        if (keyForMaker != null) {
            passes.keyForMaker(id, keyForMaker);
        }
        for (int i = 0; i < sealed.size(); i++) {
            // Sent again with the same clientId, each card finds itself already there.
            add(id, sealed.get(i), UUID.nameUUIDFromBytes((clientId + ":" + i).getBytes(StandardCharsets.UTF_8)));
        }
        return get(id, me);
    }

    /** Adds a sealed card to a pass that hasn't ended. Whoever adds it needs the pass's key, which the API doesn't have. */
    @Transactional
    public GuestPassResponse addCard(UUID id, UUID me, NewSealedCard card, UUID clientId) {
        PassRow pass = require(id, me);
        if (pass.endedAt() != null || !Instant.now().isBefore(pass.endsAt())) {
            throw ApiProblem.conflict("pass_ended", "That pass has ended. Give a new one.");
        }
        check(card, pass.circleId(), me);
        add(id, card, clientId);
        if (passes.cards(List.of(id)).size() > MAX_CARDS) {
            throw tooManyCards();
        }
        return get(id, me);
    }

    @Transactional
    public void removeCard(UUID id, UUID cardId, UUID me) {
        require(id, me);
        passes.removeCard(id, cardId);
    }

    private void add(UUID passId, NewSealedCard card, UUID clientId) {
        passes.addCard(
                passId,
                card.label().trim(),
                card.ciphertext(),
                Boolean.TRUE.equals(card.once()),
                card.thingId(),
                clientId);
    }

    /** A card needs a label and something sealed; the item it names has to be one its maker can see in this circle. */
    private void check(NewSealedCard card, UUID circleId, UUID me) {
        if (card == null
                || card.label() == null
                || card.label().isBlank()
                || card.label().trim().length() > 60) {
            throw ApiProblem.badRequest("invalid_card", "Give each sealed card a short name, such as Front door code.");
        }
        Sealed.card(card.ciphertext());
        if (card.thingId() != null
                && things.findAll(List.of(card.thingId()), me).stream()
                        .noneMatch(t -> t.circleId().equals(circleId))) {
            throw ApiProblem.badRequest("invalid_things", "One of those can't be put on a pass.");
        }
    }

    private static ApiProblem tooManyCards() {
        return ApiProblem.badRequest("too_many_cards", "A pass carries 10 sealed cards at most.");
    }

    public GuestPassResponse get(UUID id, UUID me) {
        PassRow pass = require(id, me);
        return views(List.of(pass), me).get(0);
    }

    public List<GuestPassResponse> list(UUID circleId, UUID me) {
        CircleRow circle = circles.require(circleId, me);
        requireRuns(circle, circles.me(circleId, me));
        return views(passes.of(circleId), me);
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

    private List<GuestPassResponse> views(List<PassRow> rows, UUID me) {
        Set<UUID> mine = rows.stream()
                .map(PassRow::circleId)
                .distinct()
                .map(circle -> circles.me(circle, me).id())
                .collect(Collectors.toSet());
        List<UUID> ids = rows.stream().map(PassRow::id).toList();
        Map<UUID, List<PassThing>> on = passes.things(ids).stream().collect(Collectors.groupingBy(PassThing::passId));
        Map<UUID, List<PassCard>> sealed = passes.cards(ids).stream().collect(Collectors.groupingBy(PassCard::passId));
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
                                .toList(),
                        sealed.getOrDefault(p.id(), List.of()).stream()
                                .map(c -> new PassCardResponse(
                                        c.id(), c.label(), c.once(), c.shownAt() != null, c.shownAt(), c.thingId()))
                                .toList(),
                        mine.contains(p.madeBy()) ? p.keyForMaker() : null))
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
            return new Visit(Door.GONE, null);
        }
        Instant now = Instant.now();
        if (pass.endedAt() != null || !now.isBefore(pass.endsAt())) {
            return new Visit(Door.ENDED, pass);
        }
        if (now.isBefore(pass.startsAt())) {
            return new Visit(Door.EARLY, pass);
        }
        if (pass.device() != null) {
            return same(pass.device(), device) ? open(pass, device) : new Visit(Door.ELSEWHERE, pass);
        }
        if (pass.wrongCodes() >= MAX_WRONG_CODES) {
            return new Visit(Door.LOCKED, pass);
        }
        if (code == null) {
            return new Visit(Door.CODE, pass);
        }
        if (!same(pass.code(), code.trim())) {
            passes.wrongCode(pass.id());
            return new Visit(
                    pass.wrongCodes() + 1 >= MAX_WRONG_CODES ? Door.LOCKED : Door.CODE,
                    pass,
                    List.of(),
                    List.of(),
                    null,
                    true);
        }
        String mine = UUID.randomUUID().toString();
        if (!passes.bind(pass.id(), mine)) {
            return new Visit(Door.ELSEWHERE, pass);
        }
        return open(pass, mine);
    }

    private Visit open(PassRow pass, String device) {
        List<PassCard> sealed = passes.cards(List.of(pass.id()));
        return new Visit(
                Door.OPEN,
                pass,
                cards(pass, sealed),
                sealed.stream()
                        .map(c -> new SealedCard(c.id(), c.label(), c.ciphertext(), c.once()))
                        .toList(),
                device,
                false);
    }

    /**
     * The guest's page says it has shown a sealed card. Only the phone the pass is open on can say so, and
     * only while the pass runs. A show-once card is gone from here on. False when there was nothing to mark.
     */
    @Transactional
    public boolean shown(String token, String device, UUID cardId) {
        PassRow pass = passes.byToken(token).orElse(null);
        Instant now = Instant.now();
        if (pass == null
                || pass.endedAt() != null
                || !now.isBefore(pass.endsAt())
                || now.isBefore(pass.startsAt())
                || pass.device() == null
                || !same(pass.device(), device)) {
            return false;
        }
        return passes.cardShown(pass.id(), cardId);
    }

    /** What the guest reads for each thing on the pass. A thing a sealed card was made from isn't listed twice. */
    private List<GuestCard> cards(PassRow pass, List<PassCard> sealed) {
        Set<UUID> carried =
                sealed.stream().map(PassCard::thingId).filter(id -> id != null).collect(Collectors.toSet());
        return passes.things(List.of(pass.id())).stream()
                .filter(t -> views.containsKey(t.kind()) && !carried.contains(t.thingId()))
                .map(t -> {
                    GuestView.Card card = views.get(t.kind()).show(t.thingId());
                    return new GuestCard(card.label(), t.title(), card.text(), card.imageUrls());
                })
                .toList();
    }

    /** Compares in the same time whatever the two hold, so the wait doesn't say how much of a guess was right. */
    private static boolean same(String a, String b) {
        return b != null
                && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
