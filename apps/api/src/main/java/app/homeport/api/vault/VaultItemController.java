package app.homeport.api.vault;

import app.homeport.api.auth.Me;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.vault.VaultItemService.NewVaultItem;
import app.homeport.api.vault.VaultItemService.VaultHomeResponse;
import app.homeport.api.vault.VaultItemService.VaultItemChange;
import app.homeport.api.vault.VaultItemService.VaultItemResponse;
import app.homeport.api.vault.VaultItemService.VaultItemRowResponse;
import app.homeport.api.vault.VaultItemService.VaultKeyFor;
import app.homeport.api.vault.VaultItemService.VaultOpenedResponse;
import app.homeport.api.vault.VaultItemService.VaultShareChange;
import app.homeport.api.vault.VaultItemService.VaultSharingResponse;
import app.homeport.api.vault.VaultItemService.VaultWaitingResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(
        name = "vault items",
        description = "Passwords, cards, IDs, Wi‑Fi, door codes and secrets, scrambled on the phone before they arrive")
class VaultItemController {

    private final VaultItemService items;

    VaultItemController(VaultItemService items) {
        this.items = items;
    }

    record NewVaultItemRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Give it a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @NotNull(message = "Choose a login, a card, an ID, Wi‑Fi, a code or a secret.")
            VaultCategory category,

            @Size(max = 120, message = "Keep the site to 120 characters or fewer.")
            @Schema(description = "A site or a label, kept in the clear: netflix.com, home")
            String site,

            @Schema(description = "For an ID: the day it runs out")
            LocalDate expiresOn,

            @Schema(description = "How good the password is, as the phone judged. OK when left out.")
            VaultHealth health,

            @Size(max = 30) @Schema(description = "Who it is about: members of the circle")
            List<UUID> about,

            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(
                    description = "Everything else, sealed with the item's own key. base64url, 64 KB at most.",
                    maxLength = 87382)
            String ciphertext,

            @NotBlank(message = "Something went wrong on our side. Try again.")
            @Schema(description = "The item's key, wrapped for yourself. base64url.", maxLength = 512)
            String wrappedKey) {}

    record VaultItemChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            VaultCategory category,

            @Size(max = 120, message = "Keep the site to 120 characters or fewer.")
            String site,

            LocalDate expiresOn,
            Boolean removeExpiry,
            VaultHealth health,
            @Size(max = 30) List<UUID> about,

            @Schema(description = "A new ciphertext, sealed with the same item key", maxLength = 87382)
            String ciphertext,

            @Schema(description = "With a ciphertext: the version the phone read")
            Integer version) {}

    record VaultKeysRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            @Size(max = 50, message = "One item can be shared with 50 people at most.")
            List<VaultKeyFor> keys) {}

    @GetMapping("/circles/{id}/vault")
    @Operation(
            operationId = "getVaultHome",
            summary =
                    "The Vault's home in a circle: six drawers with their counts, what needs a look, what others shared with you")
    VaultHomeResponse home(@Me UUID me, @PathVariable UUID id) {
        return items.home(id, me);
    }

    @GetMapping("/circles/{id}/vault/items")
    @Operation(operationId = "getVaultItems", summary = "The Vault items in a circle you can see, last changed first")
    Page<VaultItemRowResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "Only this drawer") @RequestParam(required = false) VaultCategory category,
            @Parameter(description = "True for only your own, false for only what others shared with you")
                    @RequestParam(required = false)
                    Boolean mine,
            @Parameter(description = "True for only those whose password needs a look")
                    @RequestParam(defaultValue = "false")
                    boolean look,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return items.list(id, me, category, mine, look, Keyset.of(cursor, limit, 50));
    }

    @GetMapping("/vault/items")
    @Operation(
            operationId = "getMyVaultItems",
            summary =
                    "Every item you own, in all your circles, last changed first: to choose what opens if something happens")
    Page<VaultItemRowResponse> own(
            @Me UUID me, @RequestParam(required = false) String cursor, @RequestParam(required = false) Integer limit) {
        return items.own(me, Keyset.of(cursor, limit, 50));
    }

    @PostMapping("/vault/items")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createVaultItem", summary = "Keep a new item. It starts as yours alone.")
    VaultItemResponse create(@Me UUID me, @Valid @RequestBody NewVaultItemRequest request) {
        return items.create(
                me,
                new NewVaultItem(
                        request.circleId(),
                        request.title(),
                        request.category(),
                        request.site(),
                        request.expiresOn(),
                        request.health(),
                        request.about(),
                        request.ciphertext(),
                        request.wrappedKey()),
                request.clientId());
    }

    @GetMapping("/vault/items/{id}")
    @Operation(
            operationId = "getVaultItem",
            summary = "An item's clear part and who can use it. Its secret part is handed out by opening it.")
    VaultItemResponse get(@Me UUID me, @PathVariable UUID id) {
        return items.get(id, me);
    }

    @PatchMapping("/vault/items/{id}")
    @Operation(
            operationId = "changeVaultItem",
            summary = "Save a change to an item. It has to be yours, or shared with you to change.")
    VaultItemResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody VaultItemChangeRequest request) {
        return items.change(
                id,
                me,
                new VaultItemChange(
                        request.title(),
                        request.category(),
                        request.site(),
                        request.expiresOn(),
                        request.removeExpiry(),
                        request.health(),
                        request.about(),
                        request.ciphertext(),
                        request.version()));
    }

    @PostMapping("/vault/items/{id}/open")
    @Operation(
            operationId = "openVaultItem",
            summary =
                    "Be handed an item's ciphertext and your own wrapped key. It is written down, and a once-only key is gone after this.")
    VaultOpenedResponse open(@Me UUID me, @PathVariable UUID id) {
        return items.open(id, me);
    }

    @GetMapping("/vault/items/{id}/sharing")
    @Operation(
            operationId = "getVaultSharing",
            summary =
                    "What the share sheet shows: everyone in the circle, their public keys, and what each may do. Thirty at most.")
    VaultSharingResponse sharing(@Me UUID me, @PathVariable UUID id) {
        return items.sharing(id, me);
    }

    @PutMapping("/vault/items/{id}/sharing")
    @Operation(
            operationId = "saveVaultSharing",
            summary = "Change who an item is shared with, with a wrapped key for each person. Only its owner can.")
    VaultSharingResponse share(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody VaultShareChange change) {
        return items.share(id, me, change);
    }

    @PutMapping("/vault/items/{id}/keys")
    @Operation(
            operationId = "giveVaultKeys",
            summary = "Hand keys to people who were waiting for one. Only its owner can; nobody's key is replaced.")
    VaultSharingResponse giveKeys(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody VaultKeysRequest request) {
        return items.giveKeys(id, me, request.keys());
    }

    @GetMapping("/vault/waiting")
    @Operation(
            operationId = "getVaultWaiting",
            summary =
                    "Everyone who waits for a key to one of your items, with their public key. Two hundred at a time.")
    List<VaultWaitingResponse> waiting(@Me UUID me) {
        return items.waiting(me);
    }
}
