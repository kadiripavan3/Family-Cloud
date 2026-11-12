package app.homeport.api.profile;

import java.util.UUID;

/** A person. Its id is the id of the signed-in user. */
public record Profile(UUID id, String displayName, UUID avatarMediaId, String avatarKey) {}
