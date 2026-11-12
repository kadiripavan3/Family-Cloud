package app.homeport.api.vault;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Sealed;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.vault.VaultStore.PersonRow;
import app.homeport.api.vault.VaultStore.VaultRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A person's Vault: the key pair their phone made. The API keeps the public key for others to seal to and the
 * private key wrapped with the Vault key, which it never sees. It can hand both back; it can open neither.
 */
@Service
public class VaultService {

    /** How the Vault key becomes the key that opens the wrapped private key: scrypt with these numbers. */
    public record VaultKdf(
            @Schema(description = "scrypt's N: a power of two, 16384 to 4194304")
            int n,

            @Schema(description = "scrypt's r, 1 to 32") int r,
            @Schema(description = "scrypt's p, 1 to 16") int p) {}

    public record VaultRecordResponse(
            @Schema(description = "False until this person has set up a Vault. Everything else is null then.")
            boolean setUp,

            @Schema(nullable = true, description = "Their public key (X25519), base64url")
            String publicKey,

            @Schema(nullable = true, description = "Their private key, sealed with a key made from the Vault key")
            String wrappedPrivateKey,

            @Schema(nullable = true, description = "The salt that went into making that key, base64url")
            String salt,

            @Schema(nullable = true) VaultKdf kdf,

            @Schema(description = "Counts up each time the Vault key is replaced")
            int keyVersion,

            @Schema(description = "True once they said: I've saved my key")
            boolean keySaved,

            @Schema(nullable = true) Instant createdAt) {}

    /** Someone the signed-in person shares a circle with, as far as the Vault is concerned. */
    public record VaultPersonResponse(
            @Schema(
                    nullable = true,
                    description = "Who they are in a circle you share. Null when you share none any more.")
            UUID memberId,

            String name,
            @Schema(nullable = true) String avatarUrl,

            @Schema(description = "False for someone who hasn't set up a Vault: nothing can be sealed for them yet")
            boolean hasVault,

            @Schema(nullable = true, description = "Their public key, to seal to. Null without a Vault.")
            String publicKey) {}

    /** A member of a circle and whether something can be sealed for them. */
    public record VaultKeyHolderResponse(
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl,
            MemberKind kind,
            Role role,

            @Schema(description = "True for the signed-in person's own place in the circle")
            boolean you,

            @Schema(nullable = true, description = "Their public key. Null when nothing can be sealed for them yet.")
            String publicKey,

            @Schema(
                    nullable = true,
                    description =
                            "Why not, when there is no key: no_phone (they have no sign-in of their own) or no_vault (they haven't set up their Vault)")
            String missing) {}

    public record VaultKeysResponse(
            @Schema(description = "People in the circle a Vault item can be sealed for")
            List<VaultKeyHolderResponse> people,

            @Schema(description = "People in the circle who can't be shared with yet, and why")
            List<VaultKeyHolderResponse> without) {}

    private final VaultStore vaults;
    private final RecoveryStore recoveries;
    private final CircleService circles;
    private final MediaService media;

    VaultService(VaultStore vaults, RecoveryStore recoveries, CircleService circles, MediaService media) {
        this.vaults = vaults;
        this.recoveries = recoveries;
        this.circles = circles;
        this.media = media;
    }

    public VaultRecordResponse record(UUID me) {
        return vaults.find(me)
                .map(v -> new VaultRecordResponse(
                        true,
                        v.publicKey(),
                        v.wrappedPrivateKey(),
                        v.salt(),
                        new VaultKdf(v.n(), v.r(), v.p()),
                        v.keyVersion(),
                        v.keySavedAt() != null,
                        v.createdAt()))
                .orElseGet(() -> new VaultRecordResponse(false, null, null, null, null, 0, false, null));
    }

    /** The signed-in person's own Vault. Without one, nothing can be kept, sealed or shared. */
    public VaultRow require(UUID me) {
        return vaults.find(me)
                .orElseThrow(() -> ApiProblem.conflict("no_vault", "Set up your Vault first. It takes a minute."));
    }

    /**
     * Sets up the signed-in person's Vault. A person has one, for good: a second key pair would leave
     * everything sealed to the first unreadable. Sending the very same again is fine.
     */
    @Transactional
    public VaultRecordResponse setUp(UUID me, String publicKey, String wrappedPrivateKey, String salt, VaultKdf kdf) {
        Sealed.publicKey(publicKey);
        Sealed.key(wrappedPrivateKey);
        checkKdf(salt, kdf);
        if (!vaults.insert(me, publicKey, wrappedPrivateKey, salt, kdf.n(), kdf.r(), kdf.p())) {
            VaultRow has = vaults.find(me).orElseThrow();
            if (!has.publicKey().equals(publicKey)) {
                throw ApiProblem.conflict(
                        "vault_exists", "You already have a Vault. Unlock it with your Vault key on this phone.");
            }
        }
        return record(me);
    }

    /**
     * A new Vault key for the same Vault: the private key comes back wrapped afresh, the public key stays.
     * The shares the helpers held belonged to the old key, so they are thrown away, and a recovery that was
     * open has done its work.
     */
    @Transactional
    public VaultRecordResponse replaceKey(UUID me, String wrappedPrivateKey, String salt, VaultKdf kdf) {
        require(me);
        Sealed.key(wrappedPrivateKey);
        checkKdf(salt, kdf);
        vaults.replaceKey(me, wrappedPrivateKey, salt, kdf.n(), kdf.r(), kdf.p());
        recoveries.forgetShares(me);
        recoveries.closeOpen(me, RecoveryState.DONE);
        return record(me);
    }

    @Transactional
    public VaultRecordResponse keySaved(UUID me) {
        require(me);
        vaults.keySaved(me);
        return record(me);
    }

    private static void checkKdf(String salt, VaultKdf kdf) {
        if (salt == null || salt.length() < 16 || salt.length() > 64 || !Sealed.looksSealed(salt)) {
            throw ApiProblem.badRequest("not_sealed", "That isn't a salt this app made. Update the app and try again.");
        }
        if (kdf == null
                || kdf.n() < 16384
                || kdf.n() > 4194304
                || Integer.bitCount(kdf.n()) != 1
                || kdf.r() < 1
                || kdf.r() > 32
                || kdf.p() < 1
                || kdf.p() > 16) {
            throw ApiProblem.badRequest(
                    "invalid_kdf", "Those aren't numbers this app would choose. Update the app and try again.");
        }
    }

    /** Who in a circle a Vault item can be sealed for, and who not yet. */
    public VaultKeysResponse circleKeys(UUID circleId, UUID me) {
        circles.require(circleId, me);
        UUID mine = circles.me(circleId, me).id();
        Map<Boolean, List<VaultKeyHolderResponse>> byKey = vaults.circleKeys(circleId).stream()
                .map(k -> new VaultKeyHolderResponse(
                        k.memberId(),
                        k.name(),
                        media.urlFor(k.avatarKey(), MediaSize.SMALL),
                        k.kind(),
                        k.role(),
                        k.memberId().equals(mine),
                        k.publicKey(),
                        k.publicKey() != null ? null : k.hasPhone() ? "no_vault" : "no_phone"))
                .collect(Collectors.partitioningBy(k -> k.publicKey() != null));
        return new VaultKeysResponse(byKey.get(true), byKey.get(false));
    }

    /** Everyone the signed-in person could name as their trusted person or as a helper. */
    public List<VaultPersonResponse> around(UUID me) {
        return vaults.around(me).stream().map(this::view).toList();
    }

    public VaultPersonResponse view(PersonRow p) {
        return new VaultPersonResponse(
                p.memberId(),
                p.name(),
                media.urlFor(p.avatarKey(), MediaSize.SMALL),
                p.publicKey() != null,
                p.publicKey());
    }

    /** These people as the viewer knows them, by user id. */
    public Map<UUID, VaultPersonResponse> people(UUID me, Collection<UUID> userIds) {
        return vaults.persons(me, userIds).stream().collect(Collectors.toMap(PersonRow::userId, this::view));
    }

    public Map<UUID, PersonRow> rows(UUID me, Collection<UUID> userIds) {
        return vaults.persons(me, userIds).stream().collect(Collectors.toMap(PersonRow::userId, Function.identity()));
    }

    /**
     * The person behind a member the app named, for choosing a trusted person or a helper: someone with their
     * own sign-in, in a circle with the signed-in person, who has a Vault. Never yourself.
     */
    public PersonRow chosen(UUID memberId, UUID me) {
        UUID user = memberId == null ? null : vaults.userBehind(memberId, me).orElse(null);
        if (user == null || user.equals(me)) {
            throw ApiProblem.badRequest(
                    "not_in_circle", "Choose someone from one of your circles who has their own sign-in.");
        }
        PersonRow person = vaults.persons(me, List.of(user)).get(0);
        if (person.publicKey() == null) {
            throw ApiProblem.conflict(
                    "they_have_no_vault",
                    "%s hasn't set up a Vault yet. Ask them to open theirs once, then choose them again."
                            .formatted(app.homeport.api.common.Names.first(person.name())));
        }
        return person;
    }
}
