package app.homeport.api.notify;

import java.util.Optional;
import java.util.UUID;

/**
 * Where to write to someone. The API keeps no copy of anyone's email address: it belongs to the sign-in
 * service, and is looked up there at the moment an email is sent.
 */
public interface EmailAddresses {

    /** The person's email address, or empty when the sign-in service doesn't know one. */
    Optional<String> of(UUID userId);

    /** Who signs in with this address, or empty when nobody does. Capital letters don't matter. */
    Optional<UUID> whose(String email);
}
