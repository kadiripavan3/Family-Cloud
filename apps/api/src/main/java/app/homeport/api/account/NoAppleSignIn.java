package app.homeport.api.account;

import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Without "Continue with Apple" connected ({@code journey.apple.mode=off}, the default), there is nothing to tell Apple. */
@Component
@ConditionalOnProperty(name = "homeport.apple.mode", havingValue = "off", matchIfMissing = true)
class NoAppleSignIn implements AppleSignIn {

    @Override
    public void remember(UUID userId, String authorizationCode) {
        // Nothing to keep.
    }

    @Override
    public void forget(UUID userId) {
        // Nothing to tell.
    }
}
