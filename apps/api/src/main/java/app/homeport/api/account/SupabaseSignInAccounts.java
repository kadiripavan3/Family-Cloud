package app.homeport.api.account;

import app.homeport.api.auth.AuthProperties;
import app.homeport.api.common.Http;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Removes a person's sign-in from Supabase Auth when they delete their account, so the email is free again
 * and nothing of them is left with the sign-in service. This is the one thing the API uses the project's
 * secret key for.
 */
@Component
@ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "supabase")
class SupabaseSignInAccounts implements SignInAccounts {

    private static final Logger log = LoggerFactory.getLogger(SupabaseSignInAccounts.class);

    private final RestClient supabase;

    SupabaseSignInAccounts(AuthProperties auth) {
        AuthProperties.Supabase project = auth.supabase();
        if (project == null
                || project.serviceKey() == null
                || project.serviceKey().isBlank()) {
            throw new IllegalStateException(
                    "Deleting an account needs the Supabase project's secret key. Set SUPABASE_SERVICE_KEY (see docs/08-connect-services.md).");
        }
        this.supabase = Http.client()
                .baseUrl(project.url().trim().replaceAll("/+$", "") + "/auth/v1")
                .defaultHeader("apikey", project.serviceKey())
                .defaultHeader("Authorization", "Bearer " + project.serviceKey())
                .build();
    }

    @Override
    public void remove(UUID userId) {
        supabase.delete()
                .uri("/admin/users/{id}", userId)
                .retrieve()
                // Already gone is as good as removed.
                .onStatus(status -> status.value() == 404, (request, response) -> {})
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    log.error("Supabase refused to remove the sign-in of {}: {}", userId, response.getStatusCode());
                    throw new IllegalStateException("The sign-in could not be removed.");
                })
                .toBodilessEntity();
    }
}
