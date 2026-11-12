package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The database the way it is in production: the API's tables in a schema of their own (on Supabase,
 * everything in "public" is served to anyone with the project's public key), named in one setting. Every
 * migration is run into an empty schema, and the API then works in it: sign-up, a circle, a page, search.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
class ProductionShapeTest {

    private static final String SCHEMA = "homeport_shape";

    @DynamicPropertySource
    static void aSchemaOfItsOwn(DynamicPropertyRegistry settings) throws Exception {
        String url =
                System.getenv().getOrDefault("HOMEPORT_TEST_DB_URL", "jdbc:postgresql://localhost:5432/homeport_test");
        try (Connection db = DriverManager.getConnection(url, "homeport", "homeport");
                Statement sql = db.createStatement()) {
            sql.execute("drop schema if exists " + SCHEMA + " cascade"); // every run starts from nothing
        }
        // Exactly what HOMEPORT_DB_SCHEMA=homeport_shape does to the settings in application.properties.
        settings.add("spring.flyway.default-schema", () -> SCHEMA);
        settings.add("spring.flyway.schemas", () -> SCHEMA);
        settings.add(
                "spring.datasource.hikari.connection-init-sql",
                () -> "set search_path to \"" + SCHEMA + "\", extensions, public");
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Test
    void everyMigrationRunsIntoASchemaOfItsOwnAndTheApiWorksThere() throws Exception {
        // All of the API's tables are in its own schema, and none of them leaked into "public" on the way.
        assertThat(jdbc.sql("select count(*) from information_schema.tables where table_schema = :schema")
                        .param("schema", SCHEMA)
                        .query(Integer.class)
                        .single())
                .isGreaterThan(15);
        assertThat(jdbc.sql("select current_schema()").query(String.class).single())
                .isEqualTo(SCHEMA);

        String token = "Bearer "
                + JsonPath.<String>read(
                        mvc.perform(post("/local-auth/token")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"email\":\"shape@example.com\",\"code\":\"123456\"}"))
                                .andExpect(status().isOk())
                                .andReturn()
                                .getResponse()
                                .getContentAsString(),
                        "$.accessToken");
        mvc.perform(put("/v1/me/profile")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ageConfirmed\":true,\"displayName\":\"Shape\"}"))
                .andExpect(status().isOk());
        String circle = JsonPath.read(
                mvc.perform(post("/v1/circles")
                                .header("Authorization", token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"clientId\":\"%s\",\"kind\":\"family\",\"name\":\"Shapes\"}"
                                        .formatted(java.util.UUID.randomUUID())))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "$.id");
        mvc.perform(post("/v1/pages")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Round things\",\"body\":\"Circles\"}"
                                        .formatted(java.util.UUID.randomUUID(), circle)))
                .andExpect(status().isCreated());
        mvc.perform(get("/v1/circles/" + circle + "/search").param("q", "round").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hits[0].thing.title").value("Round things"));
    }
}
