package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Names;
import app.homeport.api.common.Sealed;
import app.homeport.api.profile.ProfileStore;
import app.homeport.api.vault.RecoveryState.Event;
import app.homeport.api.vault.RecoveryStore.GivenShare;
import app.homeport.api.vault.RecoveryStore.HelperRow;
import app.homeport.api.vault.RecoveryStore.RecoveryRow;
import app.homeport.api.vault.VaultService.VaultPersonResponse;
import app.homeport.api.vault.VaultStore.PersonRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Helpers, and getting back into a Vault without its key.
 *
 * <p>A person's phone splits their Vault key into shares so that any two rebuild it, and seals one share to
 * each helper who said yes. The API keeps the sealed shares. It hands a share to its helper only while a
 * recovery its owner started is open; the helper's phone opens it and seals it again for the owner's new
 * phone. One share says nothing about the key, and the API can open none of them.
 */
@Service
public class RecoveryService {

    static final int MAX_HELPERS = 5;

    /** How many helpers it takes. The phone splits the key to match. */
    static final int SHARES_NEEDED = 2;

    static final int OPEN_FOR_DAYS = 7;

    public record VaultHelperResponse(
            UUID id,
            VaultPersonResponse person,
            HelperState state,

            @Schema(description = "True when they keep a share of your Vault key")
            boolean hasShare,

            Instant askedAt,
            @Schema(nullable = true) Instant answeredAt) {}

    public record VaultHelpersResponse(
            @Schema(description = "The people you asked, in the order you asked them. Five at most.")
            List<VaultHelperResponse> helpers,

            @Schema(description = "How many helpers it takes to let you back in")
            int needed,

            @Schema(description = "True when enough helpers hold a share: you could get back in without your key")
            boolean ready,

            @Schema(
                    description =
                            "True when your phone should split the key again and send new shares: someone said yes since the last split")
            boolean sharesDue) {}

    /** What a helper is told about a recovery they can help with. */
    public record HelpNeededResponse(
            UUID recoveryId,
            Instant startedAt,
            Instant lapsesAt,

            @Schema(description = "True once you passed your share on")
            boolean given) {}

    /** Someone who asked the signed-in person to be their helper. */
    public record VaultHelpingResponse(
            UUID id,
            VaultPersonResponse person,
            HelperState state,
            Instant askedAt,

            @Schema(nullable = true, description = "Their open recovery, when they are getting back in right now")
            HelpNeededResponse recovery) {}

    public record ShareToPassOnResponse(
            UUID recoveryId,

            @Schema(description = "Your share of their Vault key, sealed to your own public key")
            String sealedShare,

            @Schema(description = "The temporary public key of their new phone: open your share and seal it to this")
            String tempPublicKey) {}

    public record RecoveryHelperResponse(
            VaultPersonResponse person,

            @Schema(description = "True once they passed their share on")
            boolean given,

            @Schema(
                    nullable = true,
                    description =
                            "Their share, sealed to the temporary key. Only while the recovery is open and enough have helped.")
            String resealedShare) {}

    public record VaultRecoveryResponse(
            UUID id,
            RecoveryState state,
            Instant startedAt,
            Instant lapsesAt,
            @Schema(nullable = true) Instant endedAt,

            @Schema(description = "The temporary public key it was started with, so a phone can tell it is its own")
            String tempPublicKey,

            int needed,
            int given,

            @Schema(description = "True when enough helpers have helped and the shares below can rebuild the key")
            boolean ready,

            List<RecoveryHelperResponse> helpers) {}

    private final RecoveryStore store;
    private final VaultService people;
    private final VaultNotices notices;
    private final ProfileStore profiles;

    RecoveryService(RecoveryStore store, VaultService people, VaultNotices notices, ProfileStore profiles) {
        this.store = store;
        this.people = people;
        this.notices = notices;
        this.profiles = profiles;
    }

    private String firstName(UUID userId) {
        return profiles.find(userId).map(p -> Names.first(p.displayName())).orElse("Someone");
    }

    // ---------- the owner and their helpers ----------

    public VaultHelpersResponse helpers(UUID me) {
        List<HelperRow> rows = store.helpersOf(me);
        Map<UUID, VaultPersonResponse> who =
                people.people(me, rows.stream().map(HelperRow::helperId).toList());
        List<VaultHelperResponse> helpers = rows.stream()
                .map(h -> new VaultHelperResponse(
                        h.id(), who.get(h.helperId()), h.state(), h.sealedShare() != null, h.askedAt(), h.answeredAt()))
                .toList();
        long accepted =
                rows.stream().filter(h -> h.state() == HelperState.ACCEPTED).count();
        long holding = rows.stream().filter(h -> h.sealedShare() != null).count();
        return new VaultHelpersResponse(
                helpers,
                SHARES_NEEDED,
                store.usableHelpers(me) >= SHARES_NEEDED,
                accepted >= SHARES_NEEDED && holding < accepted);
    }

    /** Asks someone to be a helper. Asking the same person twice asks once; asking after a no asks again. */
    @Transactional
    public VaultHelperResponse ask(UUID me, UUID memberId, UUID clientId) {
        people.require(me);
        PersonRow chosen = people.chosen(memberId, me);
        HelperRow before = store.helperOf(me, chosen.userId()).orElse(null);
        UUID id;
        if (before == null) {
            if (store.helpersOf(me).size() >= MAX_HELPERS) {
                throw ApiProblem.conflict("too_many_helpers", "Five helpers is the most. Remove one first.");
            }
            id = store.insertHelper(me, chosen.userId(), clientId);
        } else {
            id = before.id();
            if (before.state().after(HelperState.Event.ASK) != before.state()) {
                store.askAgain(id);
            }
        }
        if (before == null || before.state() == HelperState.DECLINED) {
            notices.tell(
                    chosen.userId(),
                    "vault_helper_asked",
                    "%s asks you to be a Vault helper".formatted(firstName(me)),
                    "If they ever lose their Vault key, you and one other helper can let them back in. You can't open their Vault.",
                    "/vault/helping");
        }
        return helpers(me).helpers().stream()
                .filter(h -> h.id().equals(id))
                .findFirst()
                .orElseThrow();
    }

    /** Takes a helper off the list. Their share is thrown away with the row. */
    @Transactional
    public void remove(UUID me, UUID id) {
        HelperRow row =
                store.helperForChange(id).filter(h -> h.ownerId().equals(me)).orElseThrow(RecoveryService::noHelper);
        store.removeHelper(row.id());
    }

    public record HelperShare(UUID helperId, String sealedShare) {}

    /**
     * Keeps the shares of a new split, one for each helper who said yes, and forgets every older share. All
     * the shares a person's helpers hold come from the same split, or they wouldn't fit together.
     */
    @Transactional
    public VaultHelpersResponse saveShares(UUID me, List<HelperShare> shares) {
        people.require(me);
        Map<UUID, HelperRow> accepted = store.helpersOf(me).stream()
                .filter(h -> h.state() == HelperState.ACCEPTED)
                .collect(Collectors.toMap(HelperRow::id, h -> h));
        Map<UUID, String> byRow = new HashMap<>();
        for (HelperShare share : shares == null ? List.<HelperShare>of() : shares) {
            if (share.helperId() == null
                    || !accepted.containsKey(share.helperId())
                    || byRow.put(share.helperId(), Sealed.key(share.sealedShare())) != null) {
                throw ApiProblem.badRequest("not_a_helper", "A share can only go to a helper who said yes, one each.");
            }
        }
        if (byRow.size() < SHARES_NEEDED) {
            throw ApiProblem.badRequest(
                    "not_enough_helpers",
                    "It takes two helpers to let you back in, so one alone can't. Wait for a second yes.");
        }
        store.saveShares(me, byRow);
        return helpers(me);
    }

    // ---------- the helper ----------

    /** The people who asked the signed-in person to help, with what each needs right now. Bounded by their circles. */
    @Transactional
    public List<VaultHelpingResponse> helping(UUID me) {
        store.lapseDue();
        List<HelperRow> rows = store.helping(me).stream()
                .filter(h -> h.state() != HelperState.DECLINED)
                .toList();
        List<UUID> owners = rows.stream().map(HelperRow::ownerId).toList();
        Map<UUID, VaultPersonResponse> who = people.people(me, owners);
        Map<UUID, RecoveryRow> open =
                store.openOf(owners).stream().collect(Collectors.toMap(RecoveryRow::ownerId, r -> r));
        Set<UUID> givenTo = store
                .given(open.values().stream().map(RecoveryRow::id).toList())
                .stream()
                .filter(g -> g.helperId().equals(me))
                .map(GivenShare::recoveryId)
                .collect(Collectors.toSet());
        return rows.stream()
                .map(h -> {
                    RecoveryRow recovery = h.sealedShare() == null ? null : open.get(h.ownerId());
                    return new VaultHelpingResponse(
                            h.id(),
                            who.get(h.ownerId()),
                            h.state(),
                            h.askedAt(),
                            recovery == null
                                    ? null
                                    : new HelpNeededResponse(
                                            recovery.id(),
                                            recovery.startedAt(),
                                            recovery.lapsesAt(),
                                            givenTo.contains(recovery.id())));
                })
                .toList();
    }

    /** The helper row, for the helper it names, as long as the two still share a circle. To anyone else it isn't there. */
    private HelperRow mineToHelp(UUID id, UUID me) {
        HelperRow row =
                store.helperForChange(id).filter(h -> h.helperId().equals(me)).orElseThrow(RecoveryService::noHelper);
        if (people.rows(me, List.of(row.ownerId())).get(row.ownerId()).memberId() == null) {
            throw noHelper();
        }
        return row;
    }

    private static ApiProblem noHelper() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That isn't there any more.");
    }

    /** Says yes or no to being someone's helper. Someone who said yes can step down later. */
    @Transactional
    public VaultHelpingResponse answer(UUID me, UUID id, boolean accept) {
        HelperRow row = mineToHelp(id, me);
        if (accept) {
            people.require(me); // a share is sealed to the helper's own Vault
        }
        HelperState next = row.state().after(accept ? HelperState.Event.ACCEPT : HelperState.Event.DECLINE);
        if (next != row.state()) {
            store.answer(id, next);
            notices.tell(
                    row.ownerId(),
                    "vault_helper_answered",
                    accept
                            ? "%s said yes".formatted(firstName(me))
                            : "%s can't be your Vault helper".formatted(firstName(me)),
                    accept
                            ? "Open your Vault key page once, so your phone can give them their share."
                            : "Ask someone else, so two helpers are always reachable.",
                    "/vault/key");
        }
        if (next == HelperState.DECLINED) {
            return new VaultHelpingResponse(
                    row.id(), people.people(me, List.of(row.ownerId())).get(row.ownerId()), next, row.askedAt(), null);
        }
        return helping(me).stream().filter(h -> h.id().equals(id)).findFirst().orElseThrow();
    }

    /**
     * Hands a helper their share, and the temporary public key to seal it to again. Only while the person
     * they help has a recovery open: at any other time the share stays where it is.
     */
    @Transactional
    public ShareToPassOnResponse shareToPassOn(UUID me, UUID id) {
        HelperRow row = mineToHelp(id, me);
        store.lapseDue();
        RecoveryRow open = store.openOf(row.ownerId()).orElse(null);
        if (row.state() != HelperState.ACCEPTED || row.sealedShare() == null || open == null) {
            throw ApiProblem.conflict(
                    "no_recovery",
                    "%s isn't getting back into their Vault right now, so there is nothing to help with."
                            .formatted(firstName(row.ownerId())));
        }
        return new ShareToPassOnResponse(open.id(), row.sealedShare(), open.tempPublicKey());
    }

    /** A helper passes their share on, sealed for the new phone, for the recovery they were shown. */
    @Transactional
    public VaultHelpingResponse passOn(UUID me, UUID id, UUID recoveryId, String resealedShare) {
        HelperRow row = mineToHelp(id, me);
        Sealed.key(resealedShare);
        store.lapseDue();
        RecoveryRow recovery = recoveryId == null
                ? null
                : store.findForChange(recoveryId)
                        .filter(r -> r.ownerId().equals(row.ownerId()))
                        .orElse(null);
        if (recovery == null || row.state() != HelperState.ACCEPTED || row.sealedShare() == null) {
            throw ApiProblem.conflict(
                    "no_recovery",
                    "%s isn't getting back into their Vault right now, so there is nothing to help with."
                            .formatted(firstName(row.ownerId())));
        }
        recovery.state().after(Event.GIVE_SHARE);
        int before = store.given(List.of(recovery.id())).size();
        store.give(recovery.id(), me, resealedShare);
        if (before < SHARES_NEEDED && store.given(List.of(recovery.id())).size() >= SHARES_NEEDED) {
            notices.tell(
                    row.ownerId(),
                    "vault_recovery_ready",
                    "Your helpers have helped",
                    "Open the app on your new phone to get back into your Vault.",
                    "/vault/recovery/" + recovery.id());
        }
        return helping(me).stream().filter(h -> h.id().equals(id)).findFirst().orElseThrow();
    }

    // ---------- the recovery ----------

    /**
     * Starts a recovery from a new phone, which made a temporary key pair for it. The person is told on every
     * phone, so one they didn't start doesn't go unnoticed, and so are their helpers. One can be open at a time.
     */
    @Transactional
    public VaultRecoveryResponse start(UUID me, String tempPublicKey, UUID clientId) {
        people.require(me);
        Sealed.publicKey(tempPublicKey);
        store.lapseDue();
        RecoveryRow sameSend = store.byClientId(me, clientId).orElse(null);
        if (sameSend != null) {
            return view(sameSend, me);
        }
        if (store.openOf(me).isPresent()) {
            throw ApiProblem.conflict(
                    "recovery_open", "A recovery is already open. Cancel it first if you want to start again.");
        }
        List<HelperRow> holding = store.helpersOf(me).stream()
                .filter(h -> h.state() == HelperState.ACCEPTED && h.sealedShare() != null)
                .toList();
        if (store.usableHelpers(me) < SHARES_NEEDED) {
            throw ApiProblem.conflict(
                    "not_enough_helpers",
                    "It takes two helpers who said yes to let you back in, and you don't have two. Without your Vault key there is no other way in.");
        }
        UUID id = store.start(me, tempPublicKey, OPEN_FOR_DAYS, clientId);
        String name = firstName(me);
        notices.tell(
                me,
                "vault_recovery_started",
                "Someone is getting back into your Vault",
                "A recovery of your Vault was started with the help of your helpers. If that wasn't you, cancel it now.",
                "/vault/recovery/" + id);
        for (HelperRow helper : holding) {
            notices.tell(
                    helper.helperId(),
                    "vault_help_needed",
                    "%s needs your help".formatted(name),
                    "They are getting back into their Vault on a new phone. Check with them that it is really them, then help.",
                    "/vault/helping");
        }
        return view(store.find(id).orElseThrow(), me);
    }

    /** A recovery, for the person whose Vault it is. To anyone else it isn't there. */
    @Transactional
    public VaultRecoveryResponse get(UUID id, UUID me) {
        store.lapseDue();
        return view(store.find(id).filter(r -> r.ownerId().equals(me)).orElseThrow(RecoveryService::noRecovery), me);
    }

    /** The signed-in person's open recovery, or null. */
    @Transactional
    public VaultRecoveryResponse current(UUID me) {
        store.lapseDue();
        return store.openOf(me).map(r -> view(r, me)).orElse(null);
    }

    /** The new phone rebuilt the key: the recovery is closed and the passed-on shares are thrown away. */
    @Transactional
    public VaultRecoveryResponse finish(UUID id, UUID me) {
        return end(id, me, Event.FINISH);
    }

    /** The owner stops a recovery, on any of their phones. */
    @Transactional
    public VaultRecoveryResponse cancel(UUID id, UUID me) {
        return end(id, me, Event.CANCEL);
    }

    private VaultRecoveryResponse end(UUID id, UUID me, Event event) {
        store.lapseDue();
        RecoveryRow row =
                store.findForChange(id).filter(r -> r.ownerId().equals(me)).orElseThrow(RecoveryService::noRecovery);
        RecoveryState next = row.state().after(event);
        if (next != row.state()) {
            store.close(id, next);
        }
        return view(store.find(id).orElseThrow(), me);
    }

    /** The clock's part, for the job: recoveries nobody finished in seven days end by themselves. */
    @Transactional
    public int lapseDue() {
        return store.lapseDue().size();
    }

    private static ApiProblem noRecovery() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "We couldn't find that recovery.");
    }

    private VaultRecoveryResponse view(RecoveryRow row, UUID me) {
        Map<UUID, String> given = row.state() != RecoveryState.OPEN
                ? Map.of()
                : store.given(List.of(row.id())).stream()
                        .collect(Collectors.toMap(GivenShare::helperId, GivenShare::resealedShare));
        // Everyone who keeps a share, in the order they were asked, then anyone who helped and has since stepped down.
        List<UUID> everyone = new java.util.ArrayList<>(store.helpersOf(me).stream()
                .filter(h -> h.state() == HelperState.ACCEPTED && h.sealedShare() != null)
                .map(HelperRow::helperId)
                .toList());
        given.keySet().stream().filter(helper -> !everyone.contains(helper)).forEach(everyone::add);
        Map<UUID, VaultPersonResponse> who = people.people(me, everyone);
        boolean ready = given.size() >= SHARES_NEEDED;
        List<RecoveryHelperResponse> helpers = everyone.stream()
                .map(helper -> new RecoveryHelperResponse(
                        who.get(helper), given.containsKey(helper), ready ? given.get(helper) : null))
                .toList();
        return new VaultRecoveryResponse(
                row.id(),
                row.state(),
                row.startedAt(),
                row.lapsesAt(),
                row.endedAt(),
                row.tempPublicKey(),
                SHARES_NEEDED,
                given.size(),
                ready,
                helpers);
    }
}
