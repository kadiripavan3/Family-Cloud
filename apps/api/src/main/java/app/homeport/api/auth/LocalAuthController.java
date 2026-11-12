package app.homeport.api.auth;

import app.homeport.api.common.ApiProblem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Stand-in for real sign-in while we build without outside accounts: any email signs in with the test
 * code from the configuration. The tokens look like the ones Supabase Auth will issue, so nothing else
 * in the API or the app changes when the real service is connected.
 */
@RestController
@RequestMapping("/local-auth")
@ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "local")
@Tag(name = "local-auth", description = "Test sign-in. Exists only in local mode.")
@SecurityRequirements
class LocalAuthController {

    private static final Logger log = LoggerFactory.getLogger(LocalAuthController.class);

    private final AuthProperties auth;
    private final JwtEncoder encoder;
    private final LocalUsers users;

    LocalAuthController(AuthProperties auth, JwtEncoder encoder, LocalUsers users) {
        this.auth = auth;
        this.encoder = encoder;
        this.users = users;
    }

    record CodeRequest(@NotBlank @Email @Size(max = 254) String email) {}

    record TokenRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank String code) {}

    record TokenResponse(String accessToken, Instant expiresAt, UUID userId, String email) {}

    @PostMapping("/code")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "requestLocalCode", summary = "Ask for a sign-in code (it is written to the API's log)")
    void requestCode(@Valid @RequestBody CodeRequest request) {
        log.info(
                "Local sign-in code for {}: {}",
                normalize(request.email()),
                auth.local().code());
    }

    @PostMapping("/token")
    @Operation(operationId = "createLocalToken", summary = "Swap an email and the test code for a sign-in token")
    TokenResponse createToken(@Valid @RequestBody TokenRequest request) {
        if (!auth.local().code().equals(request.code().trim())) {
            throw ApiProblem.unauthorized("wrong_code", "That code isn't right. Check it and try again.");
        }
        String email = normalize(request.email());
        UUID userId = users.idFor(email);

        Instant now = Instant.now();
        Instant expiresAt = now.plus(auth.local().tokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(SecurityConfig.LOCAL_ISSUER)
                .subject(userId.toString())
                .audience(List.of(SecurityConfig.AUDIENCE))
                .issuedAt(now)
                .expiresAt(expiresAt)
                .claim("email", email)
                .claim("role", "authenticated")
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(
                        JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new TokenResponse(token, expiresAt, userId, email);
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
