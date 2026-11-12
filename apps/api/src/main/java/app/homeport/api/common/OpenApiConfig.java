package app.homeport.api.common;

import app.homeport.api.auth.Me;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The API's description. The app's TypeScript client is generated from it. */
@Configuration
class OpenApiConfig {

    static {
        // The signed-in person comes from the token, not from the caller, so it is not part of the description.
        SpringDocUtils.getConfig().addAnnotationsToIgnore(Me.class);
        // Each fixed set of words is described once, under its own name, so the app gets one type per set.
        io.swagger.v3.core.jackson.ModelResolver.enumsAsRef = true;
    }

    @Bean
    OpenAPI journeyOpenApi() {
        return new OpenAPI()
                .info(new Info().title("Homeport API").version("v1").description("Backend of the Homeport app."))
                .components(new Components()
                        .addSecuritySchemes(
                                "bearer",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }

    /**
     * In everything the API sends back, a field is always present unless it is declared nullable. Saying
     * so in the description gives the app exact types instead of "maybe undefined" everywhere.
     */
    @Bean
    OpenApiCustomizer responseFieldsAreRequired() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            openApi.getComponents().getSchemas().forEach((name, schema) -> {
                if (name.endsWith("Response")) {
                    requireEveryField(schema);
                }
            });
        };
    }

    @SuppressWarnings({"unchecked", "rawtypes"}) // the library hands out its Schema type without its type parameter
    private static void requireEveryField(Schema schema) {
        if (schema.getProperties() == null) {
            return;
        }
        Map<String, Schema<?>> properties = (Map<String, Schema<?>>) schema.getProperties();
        schema.setRequired(new ArrayList<>(properties.keySet()));
        properties.replaceAll((property, value) -> nullableReference(value));
    }

    /**
     * "Another object, or null" must be written as a choice between the two. Left alone, the generator
     * writes it in a way that reads as "always null".
     */
    private static Schema<?> nullableReference(Schema<?> property) {
        boolean nullable = property.getTypes() != null && property.getTypes().contains("null");
        if (property.get$ref() == null || !nullable) {
            return property;
        }
        Schema<Object> reference = new Schema<>();
        reference.set$ref(property.get$ref());
        Schema<Object> nothing = new Schema<>();
        nothing.addType("null");
        Schema<Object> choice = new Schema<>();
        choice.setDescription(property.getDescription());
        choice.setOneOf(List.of(reference, nothing));
        return choice;
    }
}
