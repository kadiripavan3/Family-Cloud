package app.homeport.api.activity;

import app.homeport.api.activity.ActivityLog.Happened;
import app.homeport.api.activity.AskStore.AskRow;
import app.homeport.api.activity.AskStore.AskState;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Names;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.OutboxStore;
import app.homeport.api.notify.OutboxStore.Reachable;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
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
 * Asking to see something you know exists and can't open. Someone a Vault item is shared with, whose key
 * was for one look or has stopped working, asks its owner; the owner sees the question in Activity and says
 * Allow or Not now.
 *
 * <p>The API keeps the question and its answer and tells the other person. It can't allow anything itself:
 * opening a Vault item to someone means wrapping the item's key for them, which only the owner's phone can
 * do (see docs/07-vault-protocol.md). So the owner's phone first shares the item with the asker
 * ({@code PUT /v1/vault/items/{id}/sharing}, with a key and the "until" or "once" that was asked for), and
 * then says so here; "allowed" is refused until the asker really can open it.
 *
 * <p>Nothing here is the Vault's alone. A kind of thing takes part by implementing {@link Askable}.
 */
@Service
public class AskService {

    /** A question, as either side sees it. */
    public record AskResponse(
            UUID id,
            UUID circleId,
            UUID thingId,
            String title,
            ThingKind kind,

            @Schema(description = "Who asked") UUID askerId,
            String askerName,

            @Schema(nullable = true, description = "They would like it until this moment: for today only")
            Instant until,

            @Schema(description = "They would like it for one look")
            boolean once,

            AskState state,
            Instant askedAt,
            @Schema(nullable = true) Instant answeredAt,

            @Schema(description = "True when the signed-in person is the one who asked")
            boolean mine) {}

    /** Whether the signed-in person can ask about a thing, and the last thing they asked about it. */
    public record AskStanding(
            @Schema(description = "True when there is something to ask: you see it exists and can't open it")
            boolean canAsk,

            @Schema(nullable = true, description = "Your last question about it, when there was one")
            AskResponse ask) {}

    private final AskStore asks;
    private final ThingService things;
    private final CircleService circles;
    private final ActivityLog activity;
    private final ActivityStore lines;
    private final Outbox outbox;
    private final OutboxStore people;
    private final Map<ThingKind, Askable> askable;

    AskService(
            AskStore asks,
            ThingService things,
            CircleService circles,
            ActivityLog activity,
            ActivityStore lines,
            Outbox outbox,
            OutboxStore people,
            List<Askable> askable) {
        this.asks = asks;
        this.things = things;
        this.circles = circles;
        this.activity = activity;
        this.lines = lines;
        this.outbox = outbox;
        this.people = people;
        this.askable = askable.stream().collect(Collectors.toMap(Askable::kind, Function.identity()));
    }

    /** Where a kind of thing is, for the sentence: "in the Vault". Empty for a kind nobody can ask about. */
    String where(ThingKind kind) {
        Askable source = askable.get(kind);
        return source == null ? "" : source.where();
    }

    public AskStanding standing(UUID thingId, UUID me) {
        ThingRow thing = things.require(thingId, me);
        MemberRow mine = circles.me(thing.circleId(), me);
        Askable source = askable.get(thing.kind());
        AskRow last = asks.latest(thingId, mine.id()).orElse(null);
        boolean shut = source != null && !thing.mine() && source.shutFor(thingId, mine.id());
        return new AskStanding(
                shut && (last == null || last.state() != AskState.OPEN), last == null ? null : view(last, thing, mine));
    }

    /**
     * Asks a thing's owner to open it to the signed-in person. They have to be able to see that it exists,
     * and not be able to open it. Asking again while a question is open keeps the one there is.
     */
    @Transactional
    public AskResponse ask(UUID thingId, UUID me, Instant until, boolean once, UUID clientId) {
        ThingRow thing = things.require(thingId, me);
        MemberRow mine = circles.me(thing.circleId(), me);
        Askable source = askable.get(thing.kind());
        if (thing.mine()) {
            throw ApiProblem.badRequest("yours_already", "It's yours already: there is nobody to ask.");
        }
        if (source == null) {
            throw ApiProblem.badRequest("nothing_to_ask", "You can open that as it is. There is nothing to ask for.");
        }
        if (until != null && !until.isAfter(Instant.now())) {
            throw ApiProblem.badRequest("invalid_time", "Choose a time in the future to have it until.");
        }
        if (!source.shutFor(thingId, mine.id())) {
            throw ApiProblem.conflict("open_already", "You can open that already.");
        }
        Map.Entry<UUID, Boolean> made =
                asks.insert(thing.circleId(), thingId, mine.id(), thing.ownerId(), until, once, clientId);
        if (made.getValue()) {
            activity.record(Happened.to(thing.circleId(), ActivityKind.ASK, thingId)
                    .by(mine.id())
                    .onlyFor(thing.ownerId())
                    .ask(made.getKey()));
            Reachable owner = people.reachable(List.of(thing.ownerId())).get(thing.ownerId());
            if (owner != null) {
                // It says who asks and where, never what: a push about the Vault doesn't name the item.
                outbox.tell(Push.to(
                                owner.userId(),
                                PushKind.ASK,
                                Names.first(mine.name()) + " asks to see something " + source.where(),
                                "Open Activity to answer",
                                "/activity?filter=asks")
                        .about(thing.circleId(), thingId)
                        .by(mine.id()));
            }
        }
        return view(asks.find(made.getKey()).orElseThrow(), thing, mine);
    }

    /**
     * The owner's answer. "Allow" comes after the owner's phone has opened the thing to the asker, and is
     * refused until it has. Either way the asker is told.
     */
    @Transactional
    public AskResponse answer(UUID askId, UUID me, boolean allow) {
        AskRow ask = asks.find(askId).orElseThrow(AskService::gone);
        ThingRow thing;
        try {
            thing = things.require(ask.thingId(), me);
        } catch (ApiProblem notTheirs) {
            throw gone();
        }
        MemberRow mine = circles.me(thing.circleId(), me);
        if (!thing.mine()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "not_yours", "Only the person it belongs to can answer that.");
        }
        if (ask.state() == AskState.OPEN) {
            Askable source = askable.get(thing.kind());
            if (allow && source != null && source.shutFor(thing.id(), ask.askerId())) {
                throw ApiProblem.conflict(
                        "not_opened_yet",
                        "Share it with them first: only your phone can make the key that opens it for them.");
            }
            if (asks.answer(askId, allow ? AskState.ALLOWED : AskState.DECLINED)) {
                activity.record(Happened.to(thing.circleId(), ActivityKind.ASK_ANSWERED, thing.id())
                        .by(mine.id())
                        .onlyFor(ask.askerId())
                        .ask(askId));
                Reachable asker = people.reachable(List.of(ask.askerId())).get(ask.askerId());
                if (asker != null) {
                    outbox.tell(Push.to(
                                    asker.userId(),
                                    PushKind.ASK_ANSWERED,
                                    Names.first(mine.name()) + (allow ? " said yes" : " said not now"),
                                    allow ? "Open it to see what you asked for" : "You can ask again another time",
                                    allow ? url(thing) : "/activity?filter=asks")
                            .about(thing.circleId(), thing.id())
                            .by(mine.id()));
                }
            }
        }
        return view(asks.find(askId).orElseThrow(), thing, mine);
    }

    /** Takes a question back. Only whoever asked can; taking back what was answered changes nothing. */
    @Transactional
    public void withdraw(UUID askId, UUID me) {
        AskRow ask = asks.find(askId).orElse(null);
        if (ask == null) {
            return;
        }
        MemberRow mine = circles.find(ask.circleId(), me)
                .map(c -> circles.me(c.id(), me))
                .orElseThrow(AskService::gone);
        if (!mine.id().equals(ask.askerId())) {
            throw gone();
        }
        asks.answer(askId, AskState.WITHDRAWN);
    }

    AskResponse view(AskRow ask, ThingRow thing, MemberRow mine) {
        return new AskResponse(
                ask.id(),
                ask.circleId(),
                ask.thingId(),
                thing.title(),
                thing.kind(),
                ask.askerId(),
                Names.first(lines.who(List.of(ask.askerId())).values().stream()
                        .findFirst()
                        .map(ActivityStore.Who::name)
                        .orElse("Someone")),
                ask.until(),
                ask.once(),
                ask.state(),
                ask.createdAt(),
                ask.answeredAt(),
                ask.askerId().equals(mine.id()));
    }

    /** The app's own address for a thing: it opens every kind by {@code /<kind>/<id>}. */
    static String url(ThingRow thing) {
        return "/" + thing.kind().code().replace('_', '-') + "/" + thing.id();
    }

    private static ApiProblem gone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That question isn't there any more.");
    }
}
