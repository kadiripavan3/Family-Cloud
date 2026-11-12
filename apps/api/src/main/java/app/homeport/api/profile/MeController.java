package app.homeport.api.profile;

import app.homeport.api.auth.CurrentUser;
import app.homeport.api.auth.Me;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "me", description = "The signed-in person and their profile")
class MeController {

    private final ProfileService profiles;

    MeController(ProfileService profiles) {
        this.profiles = profiles;
    }

    record ProfileResponse(
            UUID id,
            String displayName,
            @Schema(nullable = true) String avatarUrl) {}

    record MeResponse(
            UUID id,
            String email,

            @Schema(nullable = true, description = "Null until the person has created their profile")
            ProfileResponse profile) {}

    record SaveProfileRequest(
            @NotBlank(message = "Add your name.") @Size(max = 50, message = "Use 50 characters or fewer.")
            String displayName,

            @Schema(description = "A photo uploaded through /v1/media/uploads")
            UUID avatarMediaId,

            @Schema(description = "True to go back to no picture")
            Boolean removeAvatar,

            @Schema(
                    description =
                            "The person confirms they are 13 or older. Needed, and must be true, when the profile is first created.")
            Boolean ageConfirmed) {}

    @GetMapping("/me")
    @Operation(operationId = "getMe", summary = "Who is signed in, with their profile if they have one")
    MeResponse me(@Me CurrentUser user) {
        return new MeResponse(
                user.id(),
                user.email(),
                profiles.find(user.id()).map(this::view).orElse(null));
    }

    @PutMapping("/me/profile")
    @Operation(operationId = "saveProfile", summary = "Create the profile, or change it")
    ProfileResponse saveProfile(@Me UUID me, @Valid @RequestBody SaveProfileRequest request) {
        return view(profiles.save(
                me,
                request.displayName(),
                request.avatarMediaId(),
                Boolean.TRUE.equals(request.removeAvatar()),
                Boolean.TRUE.equals(request.ageConfirmed())));
    }

    private ProfileResponse view(Profile profile) {
        return new ProfileResponse(profile.id(), profile.displayName(), profiles.avatarUrl(profile));
    }
}
