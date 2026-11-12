package app.homeport.api.common;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Which page of a list is wanted. The cursor is opaque to the app: it gets one from a page and sends it
 * back unchanged. Today it holds a position in the list; because nobody outside this class reads it, that
 * can change (to "after this row") without the app noticing.
 */
public record PageRequest(int offset, int limit) {

    public static final int MAX_LIMIT = 100;

    public static PageRequest of(String cursor, Integer limit, int defaultLimit) {
        int size = limit == null ? defaultLimit : Math.clamp(limit, 1, MAX_LIMIT);
        return new PageRequest(cursor == null || cursor.isBlank() ? 0 : offsetIn(cursor), size);
    }

    /** How many rows to ask the database for: one more than the page, to learn whether another page follows. */
    public int fetch() {
        return limit + 1;
    }

    public static String cursor(int offset) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(("o" + offset).getBytes(StandardCharsets.UTF_8));
    }

    private static int offsetIn(String cursor) {
        try {
            String text = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            int offset = Integer.parseInt(text.substring(1));
            if (text.charAt(0) == 'o' && offset >= 0) {
                return offset;
            }
        } catch (RuntimeException notACursor) {
            // falls through to the same answer
        }
        throw ApiProblem.badRequest("bad_cursor", "That list has changed. Pull to refresh.");
    }
}
