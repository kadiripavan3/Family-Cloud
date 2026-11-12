package app.homeport.api.account;

import java.util.UUID;

/**
 * The link between a person's account and their Apple ID, for people who chose "Continue with Apple". Signing
 * in itself is the sign-in service's work. This is only about the end: Apple requires that deleting an account
 * also tells Apple, so the app disappears from the person's "Sign in with Apple" list.
 */
public interface AppleSignIn {

    /**
     * Keeps what is needed to tell Apple later. {@code authorizationCode} is the one-time code Apple gives the
     * app at sign-in. Throws when Apple doesn't take the code.
     */
    void remember(UUID userId, String authorizationCode);

    /** Tells Apple the account is gone. Nothing happens for someone who never signed in with Apple. Throws when Apple can't be reached, so it is tried again. */
    void forget(UUID userId);
}
