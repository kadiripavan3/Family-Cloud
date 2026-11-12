package app.homeport.api.board;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The small JSON documents of boards (a board's settings, an entry's details) and the Java records the
 * templates read them as. One mapper, set up once: dates are written as text ("2034-12-04"), and a word in a
 * stored document that a record no longer has is skipped, so a template can drop a field without a migration.
 */
public final class Json {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private Json() {}

    /** A record (or a map) as a document to store. */
    public static ObjectNode tree(Object value) {
        if (value == null) {
            return MAPPER.createObjectNode();
        }
        JsonNode node = MAPPER.valueToTree(value);
        return node instanceof ObjectNode object ? object : MAPPER.createObjectNode();
    }

    /** A stored document as one of a template's records. */
    public static <T> T as(JsonNode document, Class<T> type) {
        return MAPPER.treeToValue(document == null ? MAPPER.createObjectNode() : document, type);
    }

    /** From a jsonb column. */
    public static ObjectNode read(String text) {
        if (text == null || text.isBlank()) {
            return MAPPER.createObjectNode();
        }
        JsonNode node = MAPPER.readTree(text);
        return node instanceof ObjectNode object ? object : MAPPER.createObjectNode();
    }

    /** For a jsonb column. */
    public static String text(JsonNode document) {
        return document == null ? "{}" : MAPPER.writeValueAsString(document);
    }

    public static ObjectNode empty() {
        return MAPPER.createObjectNode();
    }
}
