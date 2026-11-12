package app.homeport.api.vault;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Names;
import app.homeport.api.common.Page;
import app.homeport.api.common.Sealed;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.Access;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.Hidden;
import app.homeport.api.thing.ThingService.PersonAccess;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import app.homeport.api.vault.VaultItemStore.GrantRow;
import app.homeport.api.vault.VaultItemStore.ItemRow;
import app.homeport.api.vault.VaultItemStore.SealedItem;
import app.homeport.api.vault.VaultItemStore.SharingRow;
import app.homeport.api.vault.VaultItemStore.Tally;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
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
 * The items in the Vault. Each is a thing, so the one sharing rule decides who knows it exists and sees its
 * title. Its secret part is one ciphertext the API can't read, and the item's key is kept wrapped for each
 * person who may open it: a grant. The API hands someone the ciphertext and their own wrapped key only when
 * the rule lets them see the thing <em>and</em> they hold a grant that hasn't stopped or been used up.
 */
@Service
public class VaultItemService {

    static final int MAX_ITEMS = 2000;
    static final int MAX_GRANTS = 50;

    /** An item in a list: everything that is kept in the clear, and where the viewer stands with it. */
    public record VaultItemRowResponse(
            UUID id,
            UUID circleId,
            String title,
            VaultCategory category,

            @Schema(description = "A site or a label, in the clear: netflix.com, home")
            String site,

            @Schema(nullable = true, description = "For an ID: the day it runs out")
            LocalDate expiresOn,

            @Schema(description = "True for an ID that runs out within a year, or has")
            boolean renewSoon,

            @Schema(description = "How good the password is, as the phone that saved it judged")
            VaultHealth health,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip,
            PersonBrief owner,

            @Schema(description = "What you may do with it: use, see or change")
            VaultAccess myAccess,

            @Schema(description = "Whether its key is there for you: ready, waiting, used (once, and opened), stopped")
            GrantState myState,

            @Schema(description = "True for an item of the sample data: it has no real ciphertext and can't be opened")
            boolean sample,

            @Schema(description = "A few words on what it is: Login · netflix.com")
            String glance) {}

    /** Someone in the item's circle, with what its sharing says about them. */
    public record VaultItemPersonResponse(
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl,
            MemberKind kind,
            Role role,
            boolean owner,

            @Schema(description = "True for the signed-in person")
            boolean you,

            @Schema(
                    nullable = true,
                    description = "Their public key, to wrap the item's key for. Null when they have no Vault.")
            String publicKey,

            @Schema(
                    nullable = true,
                    description =
                            "Why nothing can be sealed for them, when that is so: no_phone (no sign-in of their own) or no_vault")
            String missing,

            @Schema(nullable = true, description = "What they may do. Null: it isn't shared with them.")
            VaultAccess access,

            @Schema(nullable = true, description = "Where their key stands. Null: it isn't shared with them.")
            GrantState state,

            @Schema(description = "True when it is gone for them after it is opened once")
            boolean once,

            @Schema(nullable = true, description = "When it stops working for them")
            Instant stopsAt,

            @Schema(nullable = true, description = "When they were last handed it. Only its owner is told.")
            Instant openedAt,

            @Schema(nullable = true, description = "When they last saved a change to it")
            Instant changedAt) {}

    public record VaultItemResponse(
            UUID id,
            UUID circleId,
            String title,
            VaultCategory category,
            String site,
            @Schema(nullable = true) LocalDate expiresOn,
            boolean renewSoon,
            VaultHealth health,

            @Schema(description = "Counts up with every new ciphertext. Send it back when saving one.")
            int version,

            Instant updatedAt,

            @Schema(description = "When its secret part was last changed")
            Instant changedAt,

            boolean mine,

            @Schema(description = "True when you may save changes: it is yours, or it was shared with you to change")
            boolean canEdit,

            AudienceChip chip,
            PersonBrief owner,
            VaultAccess myAccess,
            GrantState myState,

            @Schema(description = "True when it is gone for you after you open it once")
            boolean once,

            @Schema(nullable = true, description = "When it stops working for you")
            Instant stopsAt,

            boolean sample,
            String glance,

            @Schema(description = "Who it is about, so it shows on their page")
            List<PersonBrief> about,

            @Schema(description = "Who can use it: its owner first, then everyone it is shared with")
            List<VaultItemPersonResponse> people) {}

    /** What the share sheet shows: everyone in the circle, and what the item's sharing says about each. */
    public record VaultSharingResponse(
            UUID itemId,
            String title,
            Audience audience,

            @Schema(description = "With everyone: what someone gets who wasn't given something else by name")
            VaultAccess everyone,

            boolean mine,
            List<VaultItemPersonResponse> people) {}

    /** The scrambled part of an item and the viewer's own key for it. Everything in it was made on a phone. */
    public record VaultOpenedResponse(
            UUID id,
            int version,

            @Schema(description = "The item, sealed with its own key")
            String ciphertext,

            @Schema(description = "The item's key, wrapped for you")
            String wrappedKey,

            VaultAccess access,

            @Schema(description = "True when this was the one time: the API has just erased your key for it")
            boolean once) {}

    public record VaultDrawerResponse(VaultCategory category, int items) {}

    public record VaultNeedsALookResponse(int total, int weak, int reused, int leaked) {}

    public record VaultHomeResponse(
            @Schema(description = "The six drawers, each with how many items you may see in it")
            List<VaultDrawerResponse> drawers,

            VaultNeedsALookResponse needsALook,

            @Schema(description = "How many items here are someone else's, shared with you")
            int sharedWithYouCount,

            @Schema(description = "The latest of them, five at most")
            List<VaultItemRowResponse> sharedWithYou) {}

    /** Someone who should be able to open one of your items, and waits for your phone to wrap its key for them. */
    public record VaultWaitingResponse(
            UUID itemId,
            String title,
            UUID circleId,
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl,

            @Schema(description = "Their public key, to wrap the item's key for")
            String publicKey) {}

    public record NewVaultItem(
            UUID circleId,
            String title,
            VaultCategory category,
            String site,
            LocalDate expiresOn,
            VaultHealth health,
            List<UUID> about,
            String ciphertext,
            String wrappedKey) {}

    public record VaultItemChange(
            String title,
            VaultCategory category,
            String site,
            LocalDate expiresOn,
            Boolean removeExpiry,
            VaultHealth health,
            List<UUID> about,
            String ciphertext,
            Integer version) {}

    public record VaultShareWith(UUID memberId, VaultAccess access, Boolean once, Instant stopsAt, String wrappedKey) {}

    /** A new key for the item, made by its owner's phone: the item sealed again, and the new key wrapped for the owner. */
    public record VaultRotation(Integer version, String ciphertext, String myWrappedKey, String emergencyWrappedKey) {}

    public record VaultShareChange(
            Audience audience,
            VaultAccess everyone,
            List<VaultShareWith> people,
            List<Hidden> hiddenFrom,
            VaultRotation rotation) {}

    public record VaultKeyFor(UUID memberId, String wrappedKey) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final VaultItemStore items;
    private final VaultService vaults;
    private final EmergencyStore emergencies;
    private final CircleService circles;
    private final MemberStore members;
    private final MediaService media;

    VaultItemService(
            ThingService things,
            ThingStore thingStore,
            VaultItemStore items,
            VaultService vaults,
            EmergencyStore emergencies,
            CircleService circles,
            MemberStore members,
            MediaService media) {
        this.things = things;
        this.thingStore = thingStore;
        this.items = items;
        this.vaults = vaults;
        this.emergencies = emergencies;
        this.circles = circles;
        this.members = members;
        this.media = media;
    }

    // ---------- making and reading ----------

    /**
     * Keeps a new item. It starts as its owner's alone, whatever the circle's kind: a password is never shared
     * by default. The phone sends the ciphertext and the item's key wrapped for its owner.
     */
    @Transactional
    public VaultItemResponse create(UUID me, NewVaultItem input, UUID clientId) {
        vaults.require(me);
        String ciphertext = Sealed.item(input.ciphertext());
        String wrappedKey = Sealed.key(input.wrappedKey());
        if (input.expiresOn() != null && input.category() != VaultCategory.ID) {
            throw ApiProblem.badRequest("no_expiry", "Only an ID has a day it runs out.");
        }
        UUID id = things.create(me, input.circleId(), ThingKind.VAULT_ITEM, input.title(), Audience.ME, clientId);
        if (thingStore.isNew(id, "vault_items")) {
            if (items.countOwnedBy(me) > MAX_ITEMS) {
                throw ApiProblem.conflict(
                        "vault_full", "A Vault holds 2,000 items. Remove one you no longer need, then add this.");
            }
            UUID mine = circles.me(input.circleId(), me).id();
            items.insert(
                    id,
                    input.category(),
                    clean(input.site()),
                    input.expiresOn(),
                    input.health() == null ? VaultHealth.OK : input.health(),
                    ciphertext,
                    mine);
            items.grant(id, mine, VaultAccess.CHANGE, false, null, wrappedKey, false);
            if (input.about() != null && !input.about().isEmpty()) {
                things.setAbout(id, me, input.about());
            }
        }
        return get(id, me);
    }

    private static String clean(String site) {
        return site == null ? "" : site.trim();
    }

    private ItemRow require(UUID id, UUID me) {
        things.require(id, me, ThingKind.VAULT_ITEM);
        return items.find(id, me).orElseThrow(ThingService::notFound);
    }

    /** An item's clear part and who can use it. Never its ciphertext: that is handed out by {@link #open}. */
    public VaultItemResponse get(UUID id, UUID me) {
        ItemRow row = require(id, me);
        ThingRow thing = row.thing();
        VaultItemRowResponse brief = rows(List.of(row)).get(0);
        Map<UUID, MemberRow> inCircle = members.of(List.of(thing.circleId())).stream()
                .collect(Collectors.toMap(MemberRow::id, Function.identity()));
        List<PersonBrief> about = things.about(id).stream()
                .map(inCircle::get)
                .filter(m -> m != null)
                .map(m -> new PersonBrief(m.id(), m.name(), media.urlFor(m.avatarKey(), MediaSize.SMALL)))
                .toList();
        UUID mine = circles.me(thing.circleId(), me).id();
        List<VaultItemPersonResponse> people = items.people(id).stream()
                .filter(p -> p.owner() || p.sees())
                .map(p -> person(p, row, mine))
                .toList();
        return new VaultItemResponse(
                brief.id(),
                brief.circleId(),
                brief.title(),
                brief.category(),
                brief.site(),
                brief.expiresOn(),
                brief.renewSoon(),
                brief.health(),
                row.version(),
                brief.updatedAt(),
                row.changedAt(),
                brief.mine(),
                canChange(row),
                brief.chip(),
                brief.owner(),
                brief.myAccess(),
                brief.myState(),
                row.myOnce(),
                row.myStopsAt(),
                brief.sample(),
                brief.glance(),
                about,
                people);
    }

    /** The viewer may save changes: it is theirs, or the rule lets them edit and their own grant says change. */
    private static boolean canChange(ItemRow row) {
        return row.thing().mine()
                || (row.thing().canEdit() && row.myState() == GrantState.READY && row.myAccess() == VaultAccess.CHANGE);
    }

    /** What the viewer may do with it: their grant's word, or, while they wait for a key, what the sharing gives them. */
    private static VaultAccess accessOf(ItemRow row) {
        if (row.thing().mine()) {
            return VaultAccess.CHANGE;
        }
        if (row.myAccess() != null) {
            return row.myAccess();
        }
        // No grant yet: what they will get once a key arrives.
        if (row.thing().audience() == Audience.CIRCLE) {
            return row.everyoneAccess();
        }
        return row.thing().canEdit() ? VaultAccess.CHANGE : VaultAccess.SEE;
    }

    private List<VaultItemRowResponse> rows(List<ItemRow> rows) {
        Map<UUID, AudienceChip> chips =
                things.chips(rows.stream().map(ItemRow::thing).toList());
        LocalDate today = LocalDate.now();
        return rows.stream()
                .map(r -> new VaultItemRowResponse(
                        r.thing().id(),
                        r.thing().circleId(),
                        r.thing().title(),
                        r.category(),
                        r.site(),
                        r.expiresOn(),
                        VaultGlance.renewSoon(r.expiresOn(), today),
                        r.health(),
                        r.thing().updatedAt(),
                        r.thing().mine(),
                        canChange(r),
                        chips.get(r.thing().id()),
                        new PersonBrief(
                                r.thing().ownerId(), r.ownerName(), media.urlFor(r.ownerAvatarKey(), MediaSize.SMALL)),
                        accessOf(r),
                        r.myState(),
                        r.sample(),
                        VaultGlance.of(r.category(), r.site(), r.expiresOn(), today)))
                .toList();
    }

    private VaultItemPersonResponse person(SharingRow p, ItemRow item, UUID mine) {
        boolean shared = p.owner() || p.sees();
        VaultAccess access = !shared
                ? null
                : p.owner()
                        ? VaultAccess.CHANGE
                        : p.granted()
                                ? p.access()
                                : item.thing().audience() == Audience.CIRCLE ? item.everyoneAccess() : VaultAccess.SEE;
        return new VaultItemPersonResponse(
                p.memberId(),
                p.name(),
                media.urlFor(p.avatarKey(), MediaSize.SMALL),
                p.kind(),
                p.role(),
                p.owner(),
                p.memberId().equals(mine),
                p.publicKey(),
                p.publicKey() != null ? null : p.hasPhone() ? "no_vault" : "no_phone",
                access,
                shared ? p.state() : null,
                shared && p.once(),
                shared ? p.stopsAt() : null,
                item.thing().mine() ? p.openedAt() : null,
                shared ? p.changedAt() : null);
    }

    public Page<VaultItemRowResponse> list(
            UUID circleId, UUID me, VaultCategory category, Boolean mine, boolean needsALook, Keyset page) {
        circles.require(circleId, me);
        List<ItemRow> found = items.list(circleId, me, category, mine, needsALook, page);
        return page.page(
                        found,
                        row -> Keyset.cursor(
                                row.thing().updatedAt(), row.thing().id()))
                .map(this::rows);
    }

    /** Everything the signed-in person owns in the Vault, across their circles. */
    public Page<VaultItemRowResponse> own(UUID me, Keyset page) {
        return page.page(
                        items.listOwn(me, page),
                        row -> Keyset.cursor(
                                row.thing().updatedAt(), row.thing().id()))
                .map(this::rows);
    }

    /** The Vault's home in one circle: the six drawers, what needs a look, what others shared. Nothing secret. */
    public VaultHomeResponse home(UUID circleId, UUID me) {
        circles.require(circleId, me);
        Map<VaultCategory, Tally> byCategory =
                items.tallies(circleId, me).stream().collect(Collectors.toMap(Tally::category, Function.identity()));
        List<VaultDrawerResponse> drawers = Arrays.stream(VaultCategory.values())
                .map(c -> new VaultDrawerResponse(
                        c, byCategory.containsKey(c) ? byCategory.get(c).items() : 0))
                .toList();
        int weak = byCategory.values().stream().mapToInt(Tally::weak).sum();
        int reused = byCategory.values().stream().mapToInt(Tally::reused).sum();
        int leaked = byCategory.values().stream().mapToInt(Tally::leaked).sum();
        List<ItemRow> shared = items.list(circleId, me, null, false, false, Keyset.first(5));
        return new VaultHomeResponse(
                drawers,
                new VaultNeedsALookResponse(weak + reused + leaked, weak, reused, leaked),
                byCategory.values().stream().mapToInt(Tally::fromOthers).sum(),
                rows(shared.subList(0, Math.min(5, shared.size()))));
    }

    // ---------- opening and changing ----------

    /**
     * Hands the viewer the item's ciphertext and their own wrapped key, and writes down that it did. They get
     * it only if the one rule lets them see the thing and their grant is ready. A grant that was shared to be
     * opened once is used up here, in the same transaction: of two phones asking at once, one gets it.
     */
    @Transactional
    public VaultOpenedResponse open(UUID id, UUID me) {
        ItemRow row = require(id, me);
        if (row.sample()) {
            throw sample();
        }
        UUID mine = circles.me(row.thing().circleId(), me).id();
        GrantRow grant = items.grantForOpening(id, mine).orElse(null);
        switch (grant == null ? GrantState.WAITING : grant.state()) {
            case WAITING ->
                throw new ApiProblem(
                        HttpStatus.FORBIDDEN,
                        "no_key_yet",
                        "Its key hasn't reached you yet. It will the next time %s opens the app."
                                .formatted(
                                        row.thing().mine() ? "you unlock your Vault" : Names.first(row.ownerName())));
            case USED ->
                throw new ApiProblem(
                        HttpStatus.FORBIDDEN,
                        "opened_once",
                        "This was shared to be opened once, and it has been. Ask for it again if you need it.");
            case STOPPED ->
                throw new ApiProblem(
                        HttpStatus.FORBIDDEN,
                        "stopped_working",
                        "This was shared for a while, and that time is over. Ask for it again if you need it.");
            case READY -> items.opened(id, mine);
        }
        SealedItem sealed = items.sealed(id);
        return new VaultOpenedResponse(
                id,
                sealed.version(),
                sealed.ciphertext(),
                grant.wrappedKey(),
                row.thing().mine() ? VaultAccess.CHANGE : grant.access(),
                grant.once());
    }

    private static ApiProblem sample() {
        return ApiProblem.conflict(
                "sample_item",
                "This is a sample item, so there is nothing inside. Add your own to see the real thing.");
    }

    /**
     * Saves a change: to what is kept in the clear, to the ciphertext, or both. Whoever saves needs the item
     * to be theirs, or to have been shared with them to change. A new ciphertext has to build on the version
     * the phone read, so two people saving at once can't silently undo each other.
     */
    @Transactional
    public VaultItemResponse change(UUID id, UUID me, VaultItemChange change) {
        ItemRow row = require(id, me);
        if (!canChange(row)) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN, "view_only", "You can use this, but not change it. Ask its owner.");
        }
        if (row.sample()) {
            throw sample();
        }
        UUID mine = circles.me(row.thing().circleId(), me).id();
        if (change.ciphertext() != null) {
            String ciphertext = Sealed.item(change.ciphertext());
            if (change.version() == null || !items.saveCiphertext(id, change.version(), ciphertext, mine)) {
                throw changedMeanwhile();
            }
            items.changedBy(id, mine);
        }
        VaultCategory category = change.category() == null ? row.category() : change.category();
        LocalDate expiresOn = Boolean.TRUE.equals(change.removeExpiry()) || category != VaultCategory.ID
                ? null
                : change.expiresOn() == null ? row.expiresOn() : change.expiresOn();
        if (change.expiresOn() != null && category != VaultCategory.ID) {
            throw ApiProblem.badRequest("no_expiry", "Only an ID has a day it runs out.");
        }
        items.saveClearPart(
                id,
                category,
                change.site() == null ? row.site() : clean(change.site()),
                expiresOn,
                change.health() == null ? row.health() : change.health());
        thingStore.retitle(
                id,
                change.title() == null ? row.thing().title() : change.title().trim());
        if (change.about() != null) {
            things.setAbout(id, me, change.about());
        }
        return get(id, me);
    }

    private static ApiProblem changedMeanwhile() {
        return ApiProblem.conflict(
                "changed_meanwhile",
                "Someone changed this while you had it open. Open it again, then make your change.");
    }

    // ---------- sharing ----------

    public VaultSharingResponse sharing(UUID id, UUID me) {
        ItemRow row = require(id, me);
        UUID mine = circles.me(row.thing().circleId(), me).id();
        return new VaultSharingResponse(
                id,
                row.thing().title(),
                row.thing().audience(),
                row.everyoneAccess(),
                row.thing().mine(),
                items.people(id).stream().map(p -> person(p, row, mine)).toList());
    }

    /**
     * Changes who an item is shared with: the audience, through the one way every thing is shared, together
     * with each person's grant, in one transaction. Only its owner can. A wrapped key is taken only for someone
     * the audience includes; someone it includes who comes without a key waits for one.
     *
     * <p>With a rotation, the item gets a new key at the same moment (worth doing when someone is removed):
     * the new ciphertext, the new key wrapped for the owner, and for each person who keeps access. Keys from
     * before open nothing any more and are dropped.
     */
    @Transactional
    public VaultSharingResponse share(UUID id, UUID me, VaultShareChange change) {
        ItemRow row = require(id, me);
        things.requireOwner(id, me);
        if (row.sample()) {
            throw sample();
        }
        UUID mine = circles.me(row.thing().circleId(), me).id();
        Audience audience = change.audience() == null ? row.thing().audience() : change.audience();
        VaultAccess everyone = audience != Audience.CIRCLE
                ? VaultAccess.SEE
                : change.everyone() == null ? row.everyoneAccess() : change.everyone();
        List<VaultShareWith> people = change.people() == null ? List.of() : change.people();
        if (people.size() > MAX_GRANTS) {
            throw ApiProblem.badRequest("too_many_people", "One item can be shared with 50 people at most.");
        }
        if (audience == Audience.ME && !people.isEmpty()) {
            throw ApiProblem.badRequest(
                    "not_in_audience", "Only you means nobody else gets a key. Choose some people or everyone.");
        }
        Set<UUID> named = new HashSet<>();
        for (VaultShareWith person : people) {
            if (person.memberId() == null || person.access() == null || !named.add(person.memberId())) {
                throw ApiProblem.badRequest("invalid_people", "Say once for each person what they may do.");
            }
            if (person.memberId().equals(mine)) {
                throw ApiProblem.badRequest("invalid_people", "It's yours already. Share it with someone else.");
            }
            if (Boolean.TRUE.equals(person.once()) && person.access() == VaultAccess.CHANGE) {
                throw ApiProblem.badRequest(
                        "once_cant_change",
                        "Something that is gone after one look can't be changed. Choose can use or can see.");
            }
            if (person.stopsAt() != null && !person.stopsAt().isAfter(Instant.now())) {
                throw ApiProblem.badRequest("invalid_time", "Choose a time in the future for it to stop working.");
            }
            Sealed.keyOrNull(person.wrappedKey());
        }

        VaultRotation rotation = change.rotation();
        if (rotation != null) {
            String ciphertext = Sealed.item(rotation.ciphertext());
            String myKey = Sealed.key(rotation.myWrappedKey());
            if (rotation.version() == null || !items.saveCiphertext(id, rotation.version(), ciphertext, mine)) {
                throw changedMeanwhile();
            }
            if (emergencies.holds(me, id)) {
                if (rotation.emergencyWrappedKey() == null) {
                    throw ApiProblem.badRequest(
                            "escrow_key_needed",
                            "This opens to your trusted person if something happens. Its new key has to be wrapped for them too.");
                }
                emergencies.rewrap(me, id, Sealed.key(rotation.emergencyWrappedKey()));
            }
            items.grant(id, mine, VaultAccess.CHANGE, false, null, myKey, true);
        }

        // The audience, exactly as for any other thing: the chip and the sheet stay true.
        things.share(
                id,
                me,
                new AudienceChange(
                        audience,
                        audience == Audience.CIRCLE && everyone == VaultAccess.CHANGE,
                        people.stream()
                                .map(p -> new PersonAccess(
                                        p.memberId(), p.access() == VaultAccess.CHANGE ? Access.EDIT : Access.VIEW))
                                .toList(),
                        change.hiddenFrom()));

        // A key is taken only for someone the audience now includes, who has a Vault to open it with.
        List<UUID> withKey = people.stream()
                .filter(p -> p.wrappedKey() != null)
                .map(VaultShareWith::memberId)
                .toList();
        Set<UUID> able = new HashSet<>(items.canHoldAKey(id, withKey));
        if (!able.containsAll(withKey)) {
            throw noKeyFor(id, withKey, able);
        }
        for (VaultShareWith person : people) {
            items.grant(
                    id,
                    person.memberId(),
                    person.access(),
                    Boolean.TRUE.equals(person.once()),
                    person.stopsAt(),
                    person.wrappedKey(),
                    rotation != null);
        }
        List<UUID> keep = new ArrayList<>(named);
        keep.add(mine);
        if (audience == Audience.CIRCLE) {
            items.everyoneElseGets(id, keep, everyone, rotation != null);
        } else {
            items.keepOnly(id, keep);
        }
        items.dropGrantsOfThoseWhoNoLongerSee(id);
        items.setEveryoneAccess(id, everyone);
        return sharing(id, me);
    }

    /** The sentence for a wrapped key that came for someone who can't hold one. */
    private ApiProblem noKeyFor(UUID id, List<UUID> withKey, Set<UUID> able) {
        Map<UUID, SharingRow> roster =
                items.people(id).stream().collect(Collectors.toMap(SharingRow::memberId, Function.identity()));
        for (UUID member : withKey) {
            if (!able.contains(member)) {
                SharingRow who = roster.get(member);
                String name = who == null ? "Someone" : Names.first(who.name());
                if (who != null && !who.hasPhone()) {
                    return ApiProblem.badRequest(
                            "no_vault",
                            "%s has no sign-in of their own, so nothing can be sealed for them.".formatted(name));
                }
                if (who != null && who.publicKey() == null) {
                    return ApiProblem.badRequest(
                            "no_vault",
                            "%s hasn't set up a Vault yet, so nothing can be sealed for them. They'll get it once they have."
                                    .formatted(name));
                }
                return ApiProblem.badRequest(
                        "not_in_audience", "%s isn't among the people this is shared with.".formatted(name));
            }
        }
        return ApiProblem.badRequest("not_in_audience", "A key can only go to someone this is shared with.");
    }

    /**
     * Hands keys to people who were waiting: someone who joined the circle later, or set up their Vault later.
     * The owner's phone does this by itself the next time it is open. A key is taken only for someone the
     * audience includes, and never replaces one that is there, was used up or has stopped.
     */
    @Transactional
    public VaultSharingResponse giveKeys(UUID id, UUID me, List<VaultKeyFor> keys) {
        ItemRow row = require(id, me);
        things.requireOwner(id, me);
        if (row.sample()) {
            throw sample();
        }
        List<VaultKeyFor> given = keys == null ? List.of() : keys;
        if (given.size() > MAX_GRANTS) {
            throw ApiProblem.badRequest("too_many_people", "One item can be shared with 50 people at most.");
        }
        items.dropGrantsOfThoseWhoNoLongerSee(id);
        List<UUID> ids = given.stream().map(VaultKeyFor::memberId).toList();
        Set<UUID> able = new HashSet<>(items.canHoldAKey(id, ids));
        if (ids.contains(null) || !able.containsAll(ids)) {
            throw noKeyFor(id, ids.stream().filter(m -> m != null).toList(), able);
        }
        for (VaultKeyFor key : given) {
            items.giveKey(id, key.memberId(), row.everyoneAccess(), Sealed.key(key.wrappedKey()));
        }
        return sharing(id, me);
    }

    /** Everyone who waits for a key to one of the signed-in person's items. Two hundred at a time. */
    public List<VaultWaitingResponse> waiting(UUID me) {
        return items.waiting(me).stream()
                .map(w -> new VaultWaitingResponse(
                        w.thingId(),
                        w.title(),
                        w.circleId(),
                        w.memberId(),
                        w.name(),
                        media.urlFor(w.avatarKey(), MediaSize.SMALL),
                        w.publicKey()))
                .toList();
    }

    /** The clock's part, for the job: keys shared until a moment that has passed are erased. */
    @Transactional
    public int eraseStopped() {
        return items.eraseStopped();
    }
}
