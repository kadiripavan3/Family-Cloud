package app.homeport.api.board;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.SpecVersion;
import io.swagger.v3.oas.models.media.Schema;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocAnnotationsUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Writes each template's own shapes into the API's description, so the app's generated client has a type for
 * every board. The routes are the same for all templates; what differs is listed here, from the templates
 * themselves:
 *
 * <ul>
 *   <li>{@code BoardResponse.settings} and {@code BoardResponse.view} become "one of" the templates' records
 *       (which one follows from {@code template});
 *   <li>the items of a page of entries become "one of" the templates' entry records;
 *   <li>{@code x-board-templates} names, for each template, those schemas and the lines of its guide: what
 *       the app may send as settings, as an entry of each kind and with each verb.
 * </ul>
 *
 * A new template appears here without anything being added: its rules class says what its records are.
 */
@Configuration
class BoardApiDescription {

    @Bean
    OpenApiCustomizer boardTemplatesAreDescribed(Boards boards) {
        return openApi -> {
            Components components = openApi.getComponents();
            if (components == null
                    || components.getSchemas() == null
                    || !components.getSchemas().containsKey("BoardResponse")) {
                return;
            }
            Set<String> before = new HashSet<>(components.getSchemas().keySet());
            List<Schema<?>> settings = new ArrayList<>();
            List<Schema<?>> views = new ArrayList<>();
            List<Schema<?>> entries = new ArrayList<>();
            Map<String, Object> templates = new LinkedHashMap<>();
            for (BoardRules rules : boards.all()) {
                Map<String, Object> about = new LinkedHashMap<>();
                about.put("name", rules.template().title());
                about.put("settings", name(describe(components, rules.settingsType(), settings)));
                about.put("view", name(describe(components, rules.viewType(), views)));
                if (rules.entryType() != null) {
                    about.put("entry", name(describe(components, rules.entryType(), entries)));
                }
                about.put("guide", rules.guide());
                templates.put(rules.template().code(), about);
            }
            // The records the templates brought: every field is always there unless it says it may be null.
            components.getSchemas().forEach((name, schema) -> {
                if (!before.contains(name)) {
                    requireEveryField(schema);
                }
            });
            Schema<?> board = components.getSchemas().get("BoardResponse");
            board.getProperties()
                    .put(
                            "settings",
                            oneOf(
                                    settings,
                                    "The board's settings. Which shape follows from `template`: see x-board-templates."));
            board.getProperties()
                    .put(
                            "view",
                            oneOf(
                                    views,
                                    "What this person sees on the board. Which shape follows from `template`: see x-board-templates."));
            Schema<?> page = components.getSchemas().get("BoardEntriesResponse");
            if (page != null && !entries.isEmpty()) {
                Schema<Object> items = new Schema<>();
                items.addType("array");
                items.setItems(oneOf(entries, "An entry as the board's template shapes it for this person"));
                page.getProperties().put("items", items);
            }
            openApi.addExtension("x-board-templates", templates);
        };
    }

    private static Schema<?> describe(Components components, Class<?> type, List<Schema<?>> into) {
        Schema<?> reference = SpringDocAnnotationsUtils.extractSchema(components, type, null, null, SpecVersion.V31);
        into.add(reference);
        return reference;
    }

    private static String name(Schema<?> reference) {
        String ref = reference.get$ref();
        return ref == null ? null : ref.substring(ref.lastIndexOf('/') + 1);
    }

    private static Schema<Object> oneOf(List<Schema<?>> choices, String description) {
        Schema<Object> choice = new Schema<>();
        choice.setDescription(description);
        choice.setOneOf(new ArrayList<>(choices));
        return choice;
    }

    @SuppressWarnings({"unchecked", "rawtypes"}) // the library hands out its Schema type without its type parameter
    private static void requireEveryField(Schema schema) {
        if (schema.getProperties() == null) {
            if (schema.getTypes() == null && schema.get$ref() == null && schema.getEnum() == null) {
                schema.addType("object"); // a template with no settings: an empty object, said as one
            }
            return;
        }
        Map<String, Schema<?>> properties = (Map<String, Schema<?>>) schema.getProperties();
        schema.setRequired(new ArrayList<>(properties.keySet()));
        properties.replaceAll((property, value) -> nullableReference(value));
    }

    /** "Another object, or null" as a choice between the two, as everywhere else in the description. */
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
