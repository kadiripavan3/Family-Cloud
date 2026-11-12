package app.homeport.api.vault;

import app.homeport.api.auth.Me;
import app.homeport.api.vault.EmergencyService.EmergencyChange;
import app.homeport.api.vault.EmergencyService.EntrustedOpenedResponse;
import app.homeport.api.vault.EmergencyService.EntrustedVaultResponse;
import app.homeport.api.vault.EmergencyService.EscrowKey;
import app.homeport.api.vault.EmergencyService.VaultEmergencyResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
        name = "vault emergency",
        description = "If something happens: a trusted person can ask, the owner can say no, then it opens")
class EmergencyController {

    private final EmergencyService emergencies;

    EmergencyController(EmergencyService emergencies) {
        this.emergencies = emergencies;
    }

    record EmergencyRequest(
            @NotNull(message = "Choose the person who can ask.")
            @Schema(description = "A member of one of your circles who has a Vault")
            UUID trustedMemberId,

            @Min(value = 24, message = "Choose between 24 hours and 7 days to say no.")
            @Max(value = 168, message = "Choose between 24 hours and 7 days to say no.")
            @Schema(description = "How long you have to say no, in hours. 48 when left out.")
            Integer waitHours,

            @Size(max = 200, message = "Choose 200 things at most.")
            @Schema(description = "What opens: each item's key, wrapped for the trusted person")
            List<EscrowKey> items,

            @Schema(
                    description = "A note for the family, sealed for the trusted person. base64url, 16 KB at most.",
                    maxLength = 22000)
            String note,

            @Schema(description = "The same note, sealed for yourself, so you can read it again", maxLength = 22000)
            String noteMine) {}

    @GetMapping("/emergency")
    @Operation(operationId = "getEmergency", summary = "Your own emergency access: who can ask, the wait, what opens")
    VaultEmergencyResponse mine(@Me UUID me) {
        return emergencies.mine(me);
    }

    @PutMapping("/emergency")
    @Operation(
            operationId = "saveEmergency",
            summary =
                    "Turn emergency access on, or change it. What was kept before is thrown away, and a request that was running ends.")
    VaultEmergencyResponse save(@Me UUID me, @Valid @RequestBody EmergencyRequest request) {
        return emergencies.save(
                me,
                new EmergencyChange(
                        request.trustedMemberId(),
                        request.waitHours(),
                        request.items(),
                        request.note(),
                        request.noteMine()));
    }

    @DeleteMapping("/emergency")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "switchOffEmergency",
            summary = "Switch emergency access off. Nothing more opens to anyone.")
    void switchOff(@Me UUID me) {
        emergencies.switchOff(me);
    }

    @PostMapping("/emergency/refusal")
    @Operation(operationId = "refuseEmergency", summary = "Say no to the request that is running. It ends.")
    VaultEmergencyResponse refuse(@Me UUID me) {
        return emergencies.refuse(me);
    }

    @GetMapping("/entrusted")
    @Operation(
            operationId = "getEntrusted",
            summary = "The people who named you as the one who can ask for their Vault. As many as your circles hold.")
    List<EntrustedVaultResponse> entrusted(@Me UUID me) {
        return emergencies.entrusted(me);
    }

    @GetMapping("/entrusted/{id}")
    @Operation(
            operationId = "getEntrustedVault",
            summary =
                    "Someone's emergency access, as the person they trust. What opens is listed only once it is open.")
    EntrustedVaultResponse entrusted(@Me UUID me, @PathVariable UUID id) {
        return emergencies.entrusted(id, me);
    }

    @PostMapping("/entrusted/{id}/ask")
    @Operation(
            operationId = "askForVault",
            summary =
                    "Ask for someone's Vault. They are told and can say no; asking again doesn't start the wait again.")
    EntrustedVaultResponse ask(@Me UUID me, @PathVariable UUID id) {
        return emergencies.ask(id, me);
    }

    @PostMapping("/entrusted/{id}/items/{itemId}/open")
    @Operation(
            operationId = "openEntrustedItem",
            summary = "Be handed one item that opened to you: its ciphertext and its key, wrapped for you")
    EntrustedOpenedResponse open(@Me UUID me, @PathVariable UUID id, @PathVariable UUID itemId) {
        return emergencies.openItem(id, itemId, me);
    }
}
