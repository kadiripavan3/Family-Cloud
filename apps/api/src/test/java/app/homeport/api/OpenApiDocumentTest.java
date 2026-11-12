package app.homeport.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * The app's TypeScript client is generated from apps/api/openapi.json. This test fails when that file
 * no longer matches the API, so the two can't drift apart.
 *
 * <p>After changing the API on purpose, refresh the file with: UPDATE_OPENAPI=1 ./mvnw test
 */
class OpenApiDocumentTest extends ApiTest {

    private static final Path COMMITTED = Path.of("openapi.json");

    @Test
    void theCommittedDescriptionMatchesTheApi() throws Exception {
        String json = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        String pretty =
                new tools.jackson.databind.json.JsonMapper().readTree(json).toPrettyString() + "\n";

        if ("1".equals(System.getenv("UPDATE_OPENAPI")) || !Files.exists(COMMITTED)) {
            Files.writeString(COMMITTED, pretty);
        }
        assertEquals(
                Files.readString(COMMITTED),
                pretty,
                "apps/api/openapi.json is out of date. Run: UPDATE_OPENAPI=1 ./mvnw test, then regenerate the app's client.");
    }
}
