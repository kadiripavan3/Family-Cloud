package app.homeport.api.account;

import java.util.UUID;

/** Where sign-ins are kept: Supabase Auth in production, a small table in local mode. Deleting an account removes the sign-in too. */
public interface SignInAccounts {

    void remove(UUID userId);
}
