package app.homeport.api.account;

import app.homeport.api.account.AccountService.SettingsChange;
import app.homeport.api.account.AccountService.SettingsResponse;
import app.homeport.api.auth.Me;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "Account and safety")
class AccountController {

    private final AccountService account;

    AccountController(AccountService account) {
        this.account = account;
    }

    @GetMapping("/me/settings")
    @Operation(operationId = "getSettings", summary = "Your notification choices")
    SettingsResponse settings(@Me UUID me) {
        return account.settings(me);
    }

    @PutMapping("/me/settings")
    @Operation(
            operationId = "saveSettings",
            summary = "Change your settings. Send the ones that change; the rest stay as they are.")
    SettingsResponse save(@Me UUID me, @RequestBody SettingsChange change) {
        return account.save(me, change);
    }

    record AppleSignInRequest(
            @NotBlank(message = "Apple's code is missing.")
            @Schema(description = "The one-time authorization code Apple gives the app at sign-in")
            String authorizationCode) {}

    @PutMapping("/me/apple-sign-in")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "rememberAppleSignIn",
            summary =
                    "After \"Continue with Apple\": hand over Apple's one-time code, so deleting the account can tell Apple too")
    void appleSignIn(@Me UUID me, @Valid @RequestBody AppleSignInRequest request) {
        account.signedInWithApple(me, request.authorizationCode());
    }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteAccount", summary = "Delete your account and everything in it, for good")
    void delete(@Me UUID me) {
        account.delete(me);
    }
}
