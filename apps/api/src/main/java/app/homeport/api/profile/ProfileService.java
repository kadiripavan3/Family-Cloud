package app.homeport.api.profile;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The rules for profiles: a name, a picture, and being 13 or older. */
@Service
public class ProfileService {

    private final ProfileStore profiles;
    private final MediaService media;

    ProfileService(ProfileStore profiles, MediaService media) {
        this.profiles = profiles;
        this.media = media;
    }

    /** The address of a profile's picture, or null when it has none. */
    public String avatarUrl(Profile profile) {
        return media.urlFor(profile.avatarKey(), MediaSize.SMALL);
    }

    public Optional<Profile> find(UUID userId) {
        return profiles.find(userId);
    }

    /** Creates the profile the first time, and updates it after that. */
    @Transactional
    public Profile save(
            UUID userId, String displayName, UUID avatarMediaId, boolean removeAvatar, boolean ageConfirmed) {
        Optional<Profile> current = profiles.find(userId);
        if (current.isEmpty() && !ageConfirmed) {
            throw ApiProblem.badRequest(
                    "age_required", "Homeport accounts are for people aged 13 and over. Confirm your age to continue.");
        }
        // A picture the request leaves out stays as it is, so a screen can save just what it shows.
        UUID avatar = removeAvatar
                ? null
                : avatarMediaId != null
                        ? avatarMediaId
                        : current.map(Profile::avatarMediaId).orElse(null);
        if (avatarMediaId != null) {
            media.requireOwn(avatarMediaId, userId, MediaKind.PHOTO);
        }
        profiles.save(userId, displayName.trim(), avatar);
        if (current.isEmpty()) {
            profiles.confirmAge(userId);
        } else {
            profiles.carryIntoCircles(userId, displayName.trim(), avatar);
        }
        return profiles.find(userId).orElseThrow();
    }
}
