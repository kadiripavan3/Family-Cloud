package app.homeport.api.vault;

import app.homeport.api.auth.Me;
import app.homeport.api.vault.VaultAttention.VaultAttentionResponse;
import app.homeport.api.vault.VaultService.VaultKdf;
import app.homeport.api.vault.VaultService.VaultKeysResponse;
import app.homeport.api.vault.VaultService.VaultPersonResponse;
import app.homeport.api.vault.VaultService.VaultRecordResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "vault", description = "A person's Vault: the keys their phone made. The API can open none of it.")
class VaultController {

    private final VaultService vaults;
    private final VaultAttention attention;

    VaultController(VaultService vaults, VaultAttention attention) {
        this.vaults = vaults;
        this.attention = attention;
    }

    record SetUpVaultRequest(
            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(description = "The public key (X25519, 32 bytes), base64url", maxLength = 43)
            String publicKey,

            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(
                    description = "The private key, sealed with a key made from the Vault key. base64url.",
                    maxLength = 512)
            String wrappedPrivateKey,

            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(description = "The salt that went into making that key, base64url", maxLength = 64)
            String salt,

            @NotNull(message = "Something went wrong on our side. Try again.")
            VaultKdf kdf) {}

    record ReplaceVaultKeyRequest(
            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(
                    description = "The same private key, sealed with a key made from the new Vault key",
                    maxLength = 512)
            String wrappedPrivateKey,

            @NotBlank(message = "Something went wrong on our side. Try again.") @Schema(maxLength = 64)
            String salt,

            @NotNull(message = "Something went wrong on our side. Try again.")
            VaultKdf kdf) {}

    @GetMapping("/vault")
    @Operation(
            operationId = "getVault",
            summary =
                    "Your own Vault record: your public key and your wrapped private key, for a new phone to open with your Vault key")
    VaultRecordResponse get(@Me UUID me) {
        return vaults.record(me);
    }

    @PutMapping("/vault")
    @Operation(
            operationId = "setUpVault",
            summary = "Set up your Vault with a key pair made on this phone. A second, different one is refused.")
    VaultRecordResponse setUp(@Me UUID me, @Valid @RequestBody SetUpVaultRequest request) {
        return vaults.setUp(me, request.publicKey(), request.wrappedPrivateKey(), request.salt(), request.kdf());
    }

    @PutMapping("/vault/key")
    @Operation(
            operationId = "replaceVaultKey",
            summary =
                    "A new Vault key: the same private key wrapped afresh. Your helpers' shares are thrown away and have to be made again.")
    VaultRecordResponse replaceKey(@Me UUID me, @Valid @RequestBody ReplaceVaultKeyRequest request) {
        return vaults.replaceKey(me, request.wrappedPrivateKey(), request.salt(), request.kdf());
    }

    @PutMapping("/vault/key-saved")
    @Operation(operationId = "confirmVaultKeySaved", summary = "Say: I've saved my key")
    VaultRecordResponse keySaved(@Me UUID me) {
        return vaults.keySaved(me);
    }

    @GetMapping("/circles/{id}/vault-keys")
    @Operation(
            operationId = "getVaultKeys",
            summary =
                    "The public keys of the people in a circle who have a Vault, and who can't be shared with yet. Thirty at most.")
    VaultKeysResponse circleKeys(@Me UUID me, @PathVariable UUID id) {
        return vaults.circleKeys(id, me);
    }

    @GetMapping("/vault/people")
    @Operation(
            operationId = "getVaultPeople",
            summary =
                    "Everyone in your circles you could name as your trusted person or a helper, by name. As many as your circles hold.")
    List<VaultPersonResponse> people(@Me UUID me) {
        return vaults.around(me);
    }

    @GetMapping("/vault/attention")
    @Operation(
            operationId = "getVaultAttention",
            summary =
                    "What in the Vault needs you now: someone asked for your Vault, a recovery is open, someone needs your help")
    VaultAttentionResponse attention(@Me UUID me) {
        return attention.of(me);
    }
}
