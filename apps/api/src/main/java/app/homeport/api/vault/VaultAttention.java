package app.homeport.api.vault;

import app.homeport.api.vault.EmergencyService.EntrustedVaultResponse;
import app.homeport.api.vault.EmergencyService.VaultEmergencyResponse;
import app.homeport.api.vault.RecoveryService.VaultHelpingResponse;
import app.homeport.api.vault.RecoveryService.VaultRecoveryResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * What in the Vault needs the signed-in person now, read from where things stand rather than from what was
 * pushed: someone asked for their Vault, a recovery of it is open, someone needs their help. The app asks
 * when it opens, so nothing depends on a push having arrived, and nothing here is secret.
 */
@Service
public class VaultAttention {

    public record VaultAttentionResponse(
            @Schema(
                    nullable = true,
                    description =
                            "Your own emergency access, when your trusted person has asked or it has opened. Say no, or switch it off.")
            VaultEmergencyResponse emergency,

            @Schema(
                    nullable = true,
                    description = "A recovery of your Vault that is open. Cancel it if it isn't yours.")
            VaultRecoveryResponse recovery,

            @Schema(description = "People who asked you to be their helper and wait for your answer")
            List<VaultHelpingResponse> helperAsks,

            @Schema(description = "People you help who are getting back in now and still need your share")
            List<VaultHelpingResponse> helpNeeded,

            @Schema(description = "Vaults you asked for: waiting for the time to pass, or open to you")
            List<EntrustedVaultResponse> entrusted,

            @Schema(description = "How many people wait for your phone to wrap a key for them")
            int waitingForKeys,

            @Schema(description = "True when your phone should split your Vault key again for your helpers")
            boolean sharesDue) {}

    private final EmergencyService emergencies;
    private final RecoveryService recoveries;
    private final VaultItemService items;

    VaultAttention(EmergencyService emergencies, RecoveryService recoveries, VaultItemService items) {
        this.emergencies = emergencies;
        this.recoveries = recoveries;
        this.items = items;
    }

    public VaultAttentionResponse of(UUID me) {
        VaultEmergencyResponse mine = emergencies.mine(me);
        List<VaultHelpingResponse> helping = recoveries.helping(me);
        return new VaultAttentionResponse(
                mine.state() == EmergencyState.ASKED || mine.state() == EmergencyState.OPEN ? mine : null,
                recoveries.current(me),
                helping.stream().filter(h -> h.state() == HelperState.ASKED).toList(),
                helping.stream()
                        .filter(h -> h.recovery() != null && !h.recovery().given())
                        .toList(),
                emergencies.entrusted(me).stream()
                        .filter(e -> e.state() == EmergencyState.ASKED || e.state() == EmergencyState.OPEN)
                        .toList(),
                items.waiting(me).size(),
                recoveries.helpers(me).sharesDue());
    }
}
