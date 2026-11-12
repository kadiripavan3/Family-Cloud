package app.homeport.api.account;

import app.homeport.api.auth.LocalUsers;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Local mode: sign-ins live in the local_users table. */
@Component
@ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "local")
class LocalSignInAccounts implements SignInAccounts {

    private final LocalUsers users;

    LocalSignInAccounts(LocalUsers users) {
        this.users = users;
    }

    @Override
    public void remove(UUID userId) {
        users.remove(userId);
    }
}
