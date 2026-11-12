package app.homeport.api.board;

import app.homeport.api.common.ApiProblem;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * What the app sent for an entry, a board's settings or a verb: a small JSON object whose names each template
 * documents. Reading goes through here so every template checks the same way and answers in the same words.
 *
 * <p>For a change, a name that was not sent means "leave it as it is", and a name sent as null means "take it
 * away": {@link #has} tells the two apart, and the readers with an {@code otherwise} keep what was there.
 */
public final class Fields {

    private final ObjectNode sent;

    private Fields(ObjectNode sent) {
        this.sent = sent;
    }

    public static Fields of(Map<String, Object> sent) {
        return new Fields(sent == null ? Json.empty() : Json.tree(sent));
    }

    private static Fields of(JsonNode node) {
        return new Fields(node instanceof ObjectNode object ? object : Json.empty());
    }

    /** True when the name was sent, also when it was sent as null. */
    public boolean has(String name) {
        return sent.has(name);
    }

    private JsonNode value(String name) {
        JsonNode node = sent.get(name);
        return node == null || node.isNull() ? null : node;
    }

    private static ApiProblem unreadable(String name) {
        return ApiProblem.badRequest("invalid_field", "We couldn't read \"" + name + "\". Check it and try again.");
    }

    /** Text, trimmed; null when it was not sent, sent as null, or empty. */
    public String text(String name, int max) {
        JsonNode node = value(name);
        if (node == null) {
            return null;
        }
        if (!node.isString()) {
            throw unreadable(name);
        }
        String text = node.stringValue().trim();
        if (text.length() > max) {
            throw ApiProblem.badRequest("too_long", "That's too long. Keep it to " + max + " characters or fewer.");
        }
        return text.isEmpty() ? null : text;
    }

    /** Text, or what was there when the name was not sent. */
    public String text(String name, int max, String otherwise) {
        return has(name) ? text(name, max) : otherwise;
    }

    /** Text that has to be there, with the sentence to say when it isn't. */
    public String need(String name, int max, String whenMissing) {
        String text = text(name, max);
        if (text == null) {
            throw ApiProblem.badRequest("missing_" + name.toLowerCase(java.util.Locale.ROOT), whenMissing);
        }
        return text;
    }

    public UUID id(String name) {
        JsonNode node = value(name);
        if (node == null) {
            return null;
        }
        try {
            return UUID.fromString(node.isString() ? node.stringValue() : "");
        } catch (IllegalArgumentException notAnId) {
            throw unreadable(name);
        }
    }

    public UUID id(String name, UUID otherwise) {
        return has(name) ? id(name) : otherwise;
    }

    /** A calendar day, written as 2026-11-12. */
    public LocalDate day(String name) {
        JsonNode node = value(name);
        if (node == null) {
            return null;
        }
        try {
            return LocalDate.parse(node.isString() ? node.stringValue() : "");
        } catch (RuntimeException notADay) {
            throw unreadable(name);
        }
    }

    public LocalDate day(String name, LocalDate otherwise) {
        return has(name) ? day(name) : otherwise;
    }

    /** A whole number between two bounds; null when it was not sent or sent as null. */
    public Long whole(String name, long min, long max) {
        JsonNode node = value(name);
        if (node == null) {
            return null;
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong()) {
            throw unreadable(name);
        }
        long number = node.longValue();
        if (number < min || number > max) {
            throw ApiProblem.badRequest(
                    "out_of_range", "That number doesn't fit. It has to be between " + min + " and " + max + ".");
        }
        return number;
    }

    public Long whole(String name, long min, long max, Long otherwise) {
        return has(name) ? whole(name, min, max) : otherwise;
    }

    public Integer count(String name, int min, int max, Integer otherwise) {
        Long number = whole(name, min, max, otherwise == null ? null : otherwise.longValue());
        return number == null ? null : number.intValue();
    }

    /** True or false; null when it was not sent or sent as null. */
    public Boolean flag(String name) {
        JsonNode node = value(name);
        if (node == null) {
            return null;
        }
        if (!node.isBoolean()) {
            throw unreadable(name);
        }
        return node.booleanValue();
    }

    public boolean flag(String name, boolean otherwise) {
        Boolean flag = flag(name);
        return flag == null ? otherwise : flag;
    }

    /** A short list of texts. Empty lines are dropped; null when the name was not sent. */
    public List<String> texts(String name, int maxItems, int maxLength) {
        JsonNode node = value(name);
        if (node == null) {
            return has(name) ? List.of() : null;
        }
        if (!node.isArray() || node.size() > maxItems) {
            throw tooMany(name, maxItems, node);
        }
        List<String> texts = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isString()) {
                throw unreadable(name);
            }
            String text = item.stringValue().trim();
            if (text.length() > maxLength) {
                throw ApiProblem.badRequest(
                        "too_long", "That's too long. Keep each one to " + maxLength + " characters or fewer.");
            }
            if (!text.isEmpty()) {
                texts.add(text);
            }
        }
        return texts;
    }

    /** A short list of ids; null when the name was not sent. */
    public List<UUID> ids(String name, int maxItems) {
        List<String> texts = texts(name, maxItems, 36);
        if (texts == null) {
            return null;
        }
        try {
            return texts.stream().map(UUID::fromString).distinct().toList();
        } catch (IllegalArgumentException notAnId) {
            throw unreadable(name);
        }
    }

    /** A short list of small objects, each read like this one; null when the name was not sent. */
    public List<Fields> list(String name, int maxItems) {
        JsonNode node = value(name);
        if (node == null) {
            return has(name) ? List.of() : null;
        }
        if (!node.isArray() || node.size() > maxItems) {
            throw tooMany(name, maxItems, node);
        }
        List<Fields> items = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isObject()) {
                throw unreadable(name);
            }
            items.add(of(item));
        }
        return items;
    }

    /** One small object inside this one, read like this one. Empty when it was not sent. */
    public Fields inside(String name) {
        JsonNode node = value(name);
        if (node != null && !node.isObject()) {
            throw unreadable(name);
        }
        return of(node);
    }

    private static ApiProblem tooMany(String name, int maxItems, JsonNode node) {
        return node.isArray()
                ? ApiProblem.badRequest("too_many", "That's too many. Keep it to " + maxItems + " or fewer.")
                : unreadable(name);
    }
}
