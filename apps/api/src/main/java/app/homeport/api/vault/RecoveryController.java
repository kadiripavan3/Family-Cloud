package app.homeport.api.vault;

import app.homeport.api.auth.Me;
import app.homeport.api.vault.RecoveryService.HelperShare;
import app.homeport.api.vault.RecoveryService.ShareToPassOnResponse;
import app.homeport.api.vault.RecoveryService.VaultHelperResponse;
import app.homeport.api.vault.RecoveryService.VaultHelpersResponse;
import app.homeport.api.vault.RecoveryService.VaultHelpingResponse;
import app.homeport.api.vault.RecoveryService.VaultRecoveryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/vault")
@Tag(
        name = "vault helpers",
        description = "Helpers who can together let someone back into their Vault, and the recovery itself")
class RecoveryController {

    private final RecoveryService recoveries;

    RecoveryController(RecoveryService recoveries) {
        this.recoveries = recoveries;
    }

    record AskHelperRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose who to ask.")
            @Schema(description = "A member of one of your circles who has a Vault")
            UUID memberId) {}

    record HelperSharesRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            @Size(max = 5, message = "Five helpers is the most.")
            @Schema(description = "One share for each helper who said yes, all from the same split")
            List<HelperShare> shares) {}

    record HelperAnswerRequest(
            @NotNull(message = "Say yes or no.") Boolean accept) {}

    record PassShareOnRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            @Schema(description = "The recovery you were shown")
            UUID recoveryId,

            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(description = "Your share, sealed again to the temporary public key. base64url.", maxLength = 512)
            String resealedShare) {}

    record StartRecoveryRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(
                    description = "The public key of a key pair this phone made just for this. base64url.",
                    maxLength = 43)
            String tempPublicKey) {}

    // ---------- your helpers ----------

    @GetMapping("/helpers")
    @Operation(operationId = "getVaultHelpers", summary = "The people you asked to be your helpers. Five at most.")
    VaultHelpersResponse helpers(@Me UUID me) {
        return recoveries.helpers(me);
    }

    @PostMapping("/helpers")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "askVaultHelper", summary = "Ask someone to be a helper. They can say yes or no.")
    VaultHelperResponse ask(@Me UUID me, @Valid @RequestBody AskHelperRequest request) {
        return recoveries.ask(me, request.memberId(), request.clientId());
    }

    @DeleteMapping("/helpers/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeVaultHelper", summary = "Take a helper off your list. Their share is thrown away.")
    void remove(@Me UUID me, @PathVariable UUID id) {
        recoveries.remove(me, id);
    }

    @PutMapping("/helpers/shares")
    @Operation(
            operationId = "saveHelperShares",
            summary =
                    "Keep the shares of a new split of your Vault key, one sealed for each helper. Older shares are thrown away.")
    VaultHelpersResponse saveShares(@Me UUID me, @Valid @RequestBody HelperSharesRequest request) {
        return recoveries.saveShares(me, request.shares());
    }

    // ---------- the people you help ----------

    @GetMapping("/helping")
    @Operation(
            operationId = "getHelping",
            summary =
                    "The people who asked you to be their helper, and who of them needs you now. As many as your circles hold.")
    List<VaultHelpingResponse> helping(@Me UUID me) {
        return recoveries.helping(me);
    }

    @PutMapping("/helping/{id}")
    @Operation(operationId = "answerHelperAsk", summary = "Say yes or no to being someone's helper, or step down later")
    VaultHelpingResponse answer(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody HelperAnswerRequest request) {
        return recoveries.answer(me, id, request.accept());
    }

    @GetMapping("/helping/{id}/share")
    @Operation(
            operationId = "getShareToPassOn",
            summary =
                    "Your share of someone's Vault key and the key to seal it to again. Only while they have a recovery open.")
    ShareToPassOnResponse share(@Me UUID me, @PathVariable UUID id) {
        return recoveries.shareToPassOn(me, id);
    }

    @PutMapping("/helping/{id}/share")
    @Operation(operationId = "passShareOn", summary = "Pass your share on, sealed for their new phone")
    VaultHelpingResponse passOn(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody PassShareOnRequest request) {
        return recoveries.passOn(me, id, request.recoveryId(), request.resealedShare());
    }

    // ---------- getting back in ----------

    @PostMapping("/recoveries")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "startVaultRecovery",
            summary =
                    "Start getting back into your Vault on a new phone. You are told on every phone, and so are your helpers.")
    VaultRecoveryResponse start(@Me UUID me, @Valid @RequestBody StartRecoveryRequest request) {
        return recoveries.start(me, request.tempPublicKey(), request.clientId());
    }

    @GetMapping("/recoveries/{id}")
    @Operation(
            operationId = "getVaultRecovery",
            summary = "A recovery of your own Vault: who has helped, and the shares once two have")
    VaultRecoveryResponse get(@Me UUID me, @PathVariable UUID id) {
        return recoveries.get(id, me);
    }

    @PostMapping("/recoveries/{id}/finish")
    @Operation(operationId = "finishVaultRecovery", summary = "Close a recovery once the new phone has rebuilt the key")
    VaultRecoveryResponse finish(@Me UUID me, @PathVariable UUID id) {
        return recoveries.finish(id, me);
    }

    @DeleteMapping("/recoveries/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "cancelVaultRecovery",
            summary = "Cancel a recovery of your Vault, from any of your phones")
    void cancel(@Me UUID me, @PathVariable UUID id) {
        recoveries.cancel(id, me);
    }
}
