package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.homeport.api.account.SignInAccounts;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.media.R2Storage;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The API as it runs for real people: sign-in by Supabase and files in R2, none of the stand-ins. Nothing here
 * talks to those services; the test is that the API starts with them switched on and that the stand-ins' doors
 * are closed.
 */
@SpringBootTest(
        properties = {
            "homeport.auth.mode=supabase",
            "homeport.auth.supabase.url=https://project.supabase.example",
            "homeport.auth.supabase.service-key=service-key",
            "homeport.media.mode=r2",
            "homeport.media.r2.endpoint=https://account.r2.example",
            "homeport.media.r2.bucket=journey",
            "homeport.media.r2.access-key-id=key-id",
            "homeport.media.r2.secret-access-key=secret",
            "homeport.media.r2.public-url=https://photos.example.com",
            "homeport.email.mode=resend",
            "homeport.email.resend.api-key=resend-key",
            "homeport.push.mode=expo",
            "homeport.seed.enabled=false",
            "springdoc.api-docs.enabled=false",
            // The test database is shared with the other tests, which use the stand-in tables.
            "spring.flyway.locations=classpath:db/migration,classpath:db/local"
        })
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductionWiringTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    MediaStorage storage;

    @Autowired
    List<SignInAccounts> signIns;

    @Test
    void theRealServicesAreInPlaceAndTheStandInsAreGone() throws Exception {
        assertThat(storage).isInstanceOf(R2Storage.class);
        assertThat(signIns).hasSize(1);
        assertThat(signIns.get(0).getClass().getSimpleName()).isEqualTo("SupabaseSignInAccounts");

        // Nobody can hand themselves a token, upload past storage, or read the API's description.
        mvc.perform(post("/local-auth/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"anyone@example.com\",\"code\":\"123456\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/media/2026/01/anything.jpg")).andExpect(status().isNotFound());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isNotFound());
        // A token the API made up itself is worth nothing here.
        mvc.perform(get("/v1/me").header("Authorization", "Bearer not-a-supabase-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("signed_out"));
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }
}
