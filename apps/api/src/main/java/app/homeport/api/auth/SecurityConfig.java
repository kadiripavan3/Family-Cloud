package app.homeport.api.auth;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Who may call what. Everything under /v1 needs a valid sign-in token; the API keeps no sessions.
 */
@Configuration
class SecurityConfig {

    static final String LOCAL_ISSUER = "journey-local";
    static final String AUDIENCE = "authenticated";

    @Bean
    SecurityFilterChain security(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.dispatcherTypeMatchers(DispatcherType.ERROR)
                        .permitAll() // so a failure outside a controller is reported as what it is, not as "forbidden"
                        .requestMatchers("/actuator/health/**", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                        .permitAll()
                        .requestMatchers("/g/**", "/share/**")
                        .permitAll() // a guest pass's web page (it asks for its own code), and the pages' stylesheet
                        .requestMatchers("/.well-known/**")
                        .permitAll() // the files that let links open the app
                        .requestMatchers("/terms", "/privacy", "/contact", "/delete-account")
                        .permitAll() // the legal pages
                        .requestMatchers("/local-auth/**", "/local-media/**", "/media/**")
                        .permitAll() // these controllers only exist in local mode; uploads carry their own token
                        .requestMatchers("/v1/**")
                        .authenticated()
                        .anyRequest()
                        .denyAll())
                .oauth2ResourceServer(
                        server -> server.jwt(Customizer.withDefaults()).authenticationEntryPoint(signedOut()))
                .exceptionHandling(failures -> failures.authenticationEntryPoint(signedOut())
                        .accessDeniedHandler((request, response, denied) ->
                                write(response, HttpStatus.NOT_FOUND, "not_found", "We couldn't find that.")));
        return http.build();
    }

    /** A missing, expired or damaged token: the usual 401 and header, plus a body in the API's own shape. */
    private static AuthenticationEntryPoint signedOut() {
        BearerTokenAuthenticationEntryPoint bearer = new BearerTokenAuthenticationEntryPoint();
        return (request, response, failure) -> {
            bearer.commence(request, response, failure);
            write(response, HttpStatus.UNAUTHORIZED, "signed_out", "Please sign in again.");
        };
    }

    /** Writes a problem by hand: this runs before Spring MVC, so ProblemHandler is not in reach. The texts are fixed, never input. */
    private static void write(HttpServletResponse response, HttpStatus status, String code, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter()
                .write("{\"type\":\"about:blank\",\"title\":\"%s\",\"status\":%d,\"detail\":\"%s\",\"code\":\"%s\"}"
                        .formatted(status.getReasonPhrase(), status.value(), message, code));
    }

    /** Browsers (the web preview) need CORS. Phones don't, so the list is empty outside local mode. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${homeport.cors.allowed-origin-patterns:}") String allowedOriginPatterns) {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        List<String> patterns = Arrays.stream(allowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(p -> !p.isEmpty())
                .toList();
        if (!patterns.isEmpty()) {
            CorsConfiguration cors = new CorsConfiguration();
            cors.setAllowedOriginPatterns(patterns);
            cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
            cors.setAllowedHeaders(List.of("*"));
            cors.setMaxAge(3600L);
            source.registerCorsConfiguration("/**", cors);
        }
        return source;
    }

    @Bean
    JwtDecoder jwtDecoder(AuthProperties auth) {
        if (auth.isSupabase()) {
            return SupabaseTokens.decoder(auth.supabase());
        }
        if (!auth.isLocal()) {
            throw new IllegalStateException("homeport.auth.mode is '" + auth.mode()
                    + "'. It must be 'supabase', or 'local' together with the 'local' profile.");
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(localKey(auth))
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<Jwt>(
                JwtValidators.createDefaultWithIssuer(LOCAL_ISSUER),
                new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains(AUDIENCE))));
        return decoder;
    }

    @Bean
    @ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "local")
    JwtEncoder localJwtEncoder(AuthProperties auth) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(localKey(auth)));
    }

    private static SecretKey localKey(AuthProperties auth) {
        byte[] secret = auth.local().secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalStateException("homeport.auth.local.secret must be at least 32 characters.");
        }
        return new SecretKeySpec(secret, "HmacSHA256");
    }
}
