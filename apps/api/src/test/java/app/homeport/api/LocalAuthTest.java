package app.homeport.api;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class LocalAuthTest extends ApiTest {

    @Test
    void theTestCodeSignsAnyEmailIn() throws Exception {
        String token = signIn("Nora@Example.com");

        mvc.perform(get("/v1/me").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("nora@example.com"))
                .andExpect(jsonPath("$.profile").value(nullValue()));
    }

    @Test
    void theSameEmailIsTheSamePersonEveryTime() throws Exception {
        String first = mvc.perform(get("/v1/me").header("Authorization", signIn("nora@example.com")))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String second = mvc.perform(get("/v1/me").header("Authorization", signIn("nora@example.com")))
                .andReturn()
                .getResponse()
                .getContentAsString();

        org.junit.jupiter.api.Assertions.assertEquals(first, second);
    }

    @Test
    void aWrongCodeIsRefusedWithAPlainMessage() throws Exception {
        mvc.perform(post("/local-auth/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nora@example.com\",\"code\":\"000000\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("wrong_code"))
                .andExpect(jsonPath("$.detail").value("That code isn't right. Check it and try again."));
    }

    @Test
    void askingForACodeNeedsARealLookingEmail() throws Exception {
        mvc.perform(post("/local-auth/code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nora@example.com\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(post("/local-auth/code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"not-an-email\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_input"))
                .andExpect(jsonPath("$.fields.email").exists());
    }

    @Test
    void nothingUnderV1WorksWithoutSigningIn() throws Exception {
        mvc.perform(get("/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/me").header("Authorization", "Bearer not-a-token")).andExpect(status().isUnauthorized());
    }

    @Test
    void addressesTheApiDoesNotKnowAreClosed() throws Exception {
        mvc.perform(get("/internal/anything").header("Authorization", signIn("nora@example.com")))
                .andExpect(status().isNotFound())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("not_found"));
    }
}
