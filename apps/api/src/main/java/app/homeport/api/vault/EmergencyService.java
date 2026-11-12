package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Names;
import app.homeport.api.common.Sealed;
import app.homeport.api.profile.ProfileStore;
import app.homeport.api.vault.EmergencyState.Event;
import app.homeport.api.vault.EmergencyStore.EmergencyRow;
import app.homeport.api.vault.EmergencyStore.EscrowItem;
import app.homeport.api.vault.EmergencyStore.Handed;
import app.homeport.api.vault.VaultService.VaultPersonResponse;
import app.homeport.api.vault.VaultStore.PersonRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "If something happens": a person names one other person, a wait, the items that open and a note for the
 * family. Their phone wraps each chosen item's key for that person and seals the note for them: an escrow the
 * API keeps and hands to nobody. The trusted person can ask; the owner is told and can say no until the wait
 * is over; after that the API hands the escrow over. What may happen when is {@link EmergencyState}.
 *
 * <p>The wait is the API's promise, not something the scrambling enforces: the escrow is already sealed for
 * the trusted person, and it is this code that holds it back.
 */
@Service
public class EmergencyService {

    static final int MAX_ITEMS = 200;
    static final int DEFAULT_WAIT_HOURS = 48;

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm 'UTC'", Locale.ENGLISH);

    public record EmergencyItemResponse(UUID id, String title, VaultCategory category) {}

    /** A person's own emergency access, as their own phone shows it. */
    public record VaultEmergencyResponse(
            EmergencyState state,

            @Schema(nullable = true, description = "The person who can ask. Null while it is off.")
            VaultPersonResponse trusted,

            @Schema(description = "How long you have to say no after they ask, in hours: 24 to 168")
            int waitHours,

            @Schema(description = "What opens. Two hundred at most.")
            List<EmergencyItemResponse> items,

            @Schema(
                    nullable = true,
                    description = "Your note for the family, sealed for yourself so you can read it again")
            String noteMine,

            @Schema(nullable = true, description = "When they asked. Set while a request is running or has opened.")
            Instant askedAt,

            @Schema(nullable = true, description = "When it opens (or opened) unless you say no")
            Instant opensAt,

            @Schema(nullable = true, description = "When you last said no")
            Instant refusedAt,

            @Schema(nullable = true, description = "When it opened to them")
            Instant openedAt) {}

    public record EscrowKey(
            UUID id,

            @Schema(description = "The item's key, wrapped for the trusted person")
            String wrappedKey) {}

    public record EmergencyChange(
            UUID trustedMemberId, Integer waitHours, List<EscrowKey> items, String note, String noteMine) {}

    public record EntrustedItemResponse(
            UUID id,
            String title,
            VaultCategory category,
            String site,

            @Schema(nullable = true, description = "When you were first handed it")
            Instant openedAt) {}

    /** Someone else's emergency access, as the person they trust sees it. Nothing of what opens until it is open. */
    public record EntrustedVaultResponse(
            UUID id,
            VaultPersonResponse owner,
            EmergencyState state,
            int waitHours,
            @Schema(nullable = true) Instant askedAt,

            @Schema(nullable = true, description = "When it opens, unless they say no before then")
            Instant opensAt,

            @Schema(nullable = true, description = "When they last said no")
            Instant refusedAt,

            @Schema(nullable = true) Instant openedAt,

            @Schema(nullable = true, description = "Their note, sealed for you. Only once it is open.")
            String note,

            @Schema(description = "What opened to you. Empty until it is open.")
            List<EntrustedItemResponse> items) {}

    /** One item of an open escrow: its ciphertext, and its key wrapped for the trusted person. */
    public record EntrustedOpenedResponse(
            UUID id, String title, VaultCategory category, String site, String ciphertext, String wrappedKey) {}

    private final EmergencyStore store;
    private final VaultService people;
    private final VaultNotices notices;
    private final ProfileStore profiles;

    EmergencyService(EmergencyStore store, VaultService people, VaultNotices notices, ProfileStore profiles) {
        this.store = store;
        this.people = people;
        this.notices = notices;
        this.profiles = profiles;
    }

    private String firstName(UUID userId) {
        return profiles.find(userId).map(p -> Names.first(p.displayName())).orElse("Someone");
    }

    private static EmergencyState stateOf(EmergencyRow row) {
        return row == null ? EmergencyState.OFF : row.state();
    }

    // ---------- the owner ----------

    @Transactional
    public VaultEmergencyResponse mine(UUID me) {
        openDue();
        return view(store.ofOwner(me).orElse(null), me);
    }

    /**
     * Turns it on, or changes the person, the wait, the items or the note. The escrow that was there is thrown
     * away and the new one kept, and a request that was running is over: whoever changes this is at their phone.
     */
    @Transactional
    public VaultEmergencyResponse save(UUID me, EmergencyChange change) {
        people.require(me);
        PersonRow trusted = people.chosen(change.trustedMemberId(), me);
        int wait = change.waitHours() == null ? DEFAULT_WAIT_HOURS : change.waitHours();
        if (wait < 24 || wait > 168) {
            throw ApiProblem.badRequest("invalid_wait", "Choose between 24 hours and 7 days to say no.");
        }
        List<EscrowKey> items = change.items() == null ? List.of() : change.items();
        if (items.size() > MAX_ITEMS) {
            throw ApiProblem.badRequest("too_many_items", "Choose 200 things at most.");
        }
        Map<UUID, String> keys = new LinkedHashMap<>();
        for (EscrowKey item : items) {
            if (item.id() == null || keys.put(item.id(), Sealed.key(item.wrappedKey())) != null) {
                throw ApiProblem.badRequest("invalid_items", "Each thing can be chosen once.");
            }
        }
        if (store.ownedBy(me, keys.keySet()).size() != keys.size()) {
            throw ApiProblem.badRequest("invalid_items", "Only things in your own Vault can open to someone.");
        }
        String note = Sealed.note(change.note());
        String noteMine = Sealed.note(change.noteMine());
        if ((note == null) != (noteMine == null)) {
            throw ApiProblem.badRequest(
                    "invalid_note", "The note has to be sealed twice: once for them, once for you to read again.");
        }
        if (keys.isEmpty() && note == null) {
            throw ApiProblem.badRequest("nothing_chosen", "Choose at least one thing that opens, or write a note.");
        }
        openDue();
        EmergencyRow before = store.ofOwner(me).orElse(null);
        stateOf(before).after(Event.SET);
        UUID id = store.save(me, trusted.userId(), wait, note, noteMine);
        store.replaceItems(id, keys);

        String name = firstName(me);
        if (before != null && before.state() != EmergencyState.READY) {
            notices.tell(
                    before.trustedId(),
                    "vault_emergency_ended",
                    "%s changed their plans".formatted(name),
                    "Your request to open their Vault is over. Nothing more opens.",
                    "/vault/entrusted");
        }
        if (before == null || !before.trustedId().equals(trusted.userId())) {
            notices.tell(
                    trusted.userId(),
                    "vault_emergency_named",
                    "%s trusts you".formatted(name),
                    "If something happens to them, you can ask for what they chose to leave you. Until then you see none of it.",
                    "/vault/entrusted/" + id);
        }
        return view(store.ofOwner(me).orElseThrow(), me);
    }

    /** Switches it off. The escrow is thrown away; nothing more is handed to anyone. */
    @Transactional
    public void switchOff(UUID me) {
        openDue();
        EmergencyRow before = store.ofOwner(me).orElse(null);
        stateOf(before).after(Event.SWITCH_OFF);
        if (before == null) {
            return;
        }
        store.delete(me);
        if (before.state() != EmergencyState.READY) {
            notices.tell(
                    before.trustedId(),
                    "vault_emergency_ended",
                    "%s switched it off".formatted(firstName(me)),
                    "Your request to open their Vault is over. Nothing more opens.",
                    "/vault/entrusted");
        }
    }

    /** The owner says no to a request that is running. It is over; the trusted person is told. */
    @Transactional
    public VaultEmergencyResponse refuse(UUID me) {
        openDue(); // a wait that is already over has opened: it is too late for a no
        EmergencyRow before = store.ofOwner(me).orElse(null);
        stateOf(before).after(Event.SAY_NO);
        store.refuse(before.id());
        notices.tell(
                before.trustedId(),
                "vault_emergency_refused",
                "%s said no".formatted(firstName(me)),
                "Your request to open their Vault was turned down. They are fine and at their phone.",
                "/vault/entrusted/" + before.id());
        return view(store.ofOwner(me).orElseThrow(), me);
    }

    private VaultEmergencyResponse view(EmergencyRow row, UUID me) {
        if (row == null) {
            return new VaultEmergencyResponse(
                    EmergencyState.OFF, null, DEFAULT_WAIT_HOURS, List.of(), null, null, null, null, null);
        }
        return new VaultEmergencyResponse(
                row.state(),
                people.people(me, List.of(row.trustedId())).get(row.trustedId()),
                row.waitHours(),
                store.items(row.id()).stream()
                        .map(i -> new EmergencyItemResponse(i.thingId(), i.title(), i.category()))
                        .toList(),
                row.noteMine(),
                row.askedAt(),
                row.opensAt(),
                row.refusedAt(),
                row.openedAt());
    }

    // ---------- the trusted person ----------

    /** Everyone who named the signed-in person as the one who can ask. */
    @Transactional
    public List<EntrustedVaultResponse> entrusted(UUID me) {
        openDue();
        return store.entrustedTo(me).stream().map(row -> view(row, me, false)).toList();
    }

    @Transactional
    public EntrustedVaultResponse entrusted(UUID id, UUID me) {
        openDue();
        return view(store.entrusted(id, me).orElseThrow(EmergencyService::gone), me, true);
    }

    /**
     * The trusted person asks. The owner is told on every phone and has the wait they chose to say no. Asking
     * again while a request is running changes nothing: the clock doesn't start again.
     */
    @Transactional
    public EntrustedVaultResponse ask(UUID id, UUID me) {
        openDue();
        EmergencyRow row = store.entrusted(id, me).orElseThrow(EmergencyService::gone);
        EmergencyState next = row.state().after(Event.ASK);
        if (next != row.state()) {
            store.ask(id);
            EmergencyRow asked = store.entrusted(id, me).orElseThrow();
            notices.tell(
                    row.ownerId(),
                    "vault_emergency_asked",
                    "%s asked to open your Vault".formatted(firstName(me)),
                    "If you say nothing, what you chose opens to them on %s. If you are fine, say no."
                            .formatted(WHEN.format(asked.opensAt().atOffset(ZoneOffset.UTC))),
                    "/vault/emergency");
        }
        return view(store.entrusted(id, me).orElseThrow(), me, true);
    }

    /** Hands the trusted person one item of an open escrow: its ciphertext and its key, wrapped for them. */
    @Transactional
    public EntrustedOpenedResponse openItem(UUID id, UUID itemId, UUID me) {
        openDue();
        EmergencyRow row = store.entrusted(id, me).orElseThrow(EmergencyService::gone);
        row.state().after(Event.READ);
        Handed handed = store.hand(id, itemId)
                .orElseThrow(() -> new ApiProblem(
                        HttpStatus.NOT_FOUND, "not_found", "That isn't one of the things that opened to you."));
        return new EntrustedOpenedResponse(
                handed.thingId(),
                handed.title(),
                handed.category(),
                handed.site(),
                handed.ciphertext(),
                handed.wrappedKey());
    }

    private EntrustedVaultResponse view(EmergencyRow row, UUID me, boolean withItems) {
        boolean open = row.state() == EmergencyState.OPEN;
        List<EntrustedItemResponse> items = open && withItems
                ? store.items(row.id()).stream()
                        .map(EmergencyService::entrustedItem)
                        .toList()
                : List.of();
        return new EntrustedVaultResponse(
                row.id(),
                people.people(me, List.of(row.ownerId())).get(row.ownerId()),
                row.state(),
                row.waitHours(),
                row.askedAt(),
                row.opensAt(),
                row.refusedAt(),
                row.openedAt(),
                open ? row.note() : null,
                items);
    }

    private static EntrustedItemResponse entrustedItem(EscrowItem i) {
        return new EntrustedItemResponse(i.thingId(), i.title(), i.category(), i.site(), i.handedAt());
    }

    private static ApiProblem gone() {
        return new ApiProblem(
                HttpStatus.NOT_FOUND, "not_found", "That isn't there any more. They may have switched it off.");
    }

    // ---------- the clock ----------

    /**
     * Opens every request whose wait is over without a no, and tells both people. Called before anything
     * reads an emergency and by a job every minute, so it opens on time whether or not anyone is looking.
     * Returns how many opened.
     */
    @Transactional
    public int openDue() {
        List<EmergencyRow> opened = store.openDue();
        for (EmergencyRow row : opened) {
            String owner = firstName(row.ownerId());
            notices.tell(
                    row.trustedId(),
                    "vault_emergency_open",
                    "%s's Vault has opened to you".formatted(owner),
                    "The wait is over. What they chose for you, and their note, are in the app now.",
                    "/vault/entrusted/" + row.id());
            notices.tell(
                    row.ownerId(),
                    "vault_emergency_open",
                    "Your Vault has opened to %s".formatted(firstName(row.trustedId())),
                    "The time to say no is over. Switch it off in the Vault to stop it from here on.",
                    "/vault/emergency");
        }
        return opened.size();
    }
}
