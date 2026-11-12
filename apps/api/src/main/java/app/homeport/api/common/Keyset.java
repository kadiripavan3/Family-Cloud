package app.homeport.api.common;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * Which page of a list is wanted, when the page starts "after this row" instead of "after this many rows".
 *
 * <p>The cursor names the last row of the page before: the values the list is ordered by (when it happened,
 * and an id to settle ties). The next page asks the database for the rows after exactly that one, so a row
 * that appears or disappears between two pages can neither repeat an item nor skip one, and the database
 * goes straight to the place through an index instead of counting its way there.
 *
 * <p>To the app the cursor is the same opaque text as before: it gets one from a page and sends it back.
 *
 * @param after the values of the row the page comes after; empty for the first page
 * @param limit how many rows the page holds at most
 */
public record Keyset(List<String> after, int limit) {

    private static final String SEPARATOR = "|";

    public static Keyset of(String cursor, Integer limit, int defaultLimit) {
        int size = limit == null ? defaultLimit : Math.clamp(limit, 1, PageRequest.MAX_LIMIT);
        return new Keyset(cursor == null || cursor.isBlank() ? List.of() : valuesIn(cursor), size);
    }

    /** The first page of a list, for callers that never page (a web page that shows the start of one). */
    public static Keyset first(int limit) {
        return new Keyset(List.of(), limit);
    }

    /** True for the first page: there is no row to come after. */
    public boolean first() {
        return after.isEmpty();
    }

    /** How many rows to ask the database for: one more than the page, to learn whether another page follows. */
    public int fetch() {
        return limit + 1;
    }

    /** The cursor that means "after the row with these values". */
    public static String cursor(Object... values) {
        String text = "k"
                + String.join(
                        SEPARATOR, Arrays.stream(values).map(String::valueOf).toList());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    /** Builds a page from rows fetched with {@link #fetch()}: one row more than asked for says there is a next page. */
    public <T> Page<T> page(List<T> rows, Function<T, String> cursorOf) {
        boolean more = rows.size() > limit;
        List<T> items = more ? rows.subList(0, limit) : rows;
        return new Page<>(items, more ? cursorOf.apply(items.get(items.size() - 1)) : null);
    }

    public String text(int index) {
        if (index >= after.size()) {
            throw badCursor();
        }
        return after.get(index);
    }

    public Instant instant(int index) {
        try {
            return Instant.parse(text(index));
        } catch (RuntimeException notATime) {
            throw badCursor();
        }
    }

    public UUID uuid(int index) {
        try {
            return UUID.fromString(text(index));
        } catch (RuntimeException notAnId) {
            throw badCursor();
        }
    }

    private static List<String> valuesIn(String cursor) {
        try {
            String text = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            if (text.length() > 1 && text.charAt(0) == 'k') {
                return List.of(text.substring(1).split("\\" + SEPARATOR, -1));
            }
        } catch (RuntimeException notACursor) {
            // falls through to the same answer
        }
        throw badCursor();
    }

    /** The same answer a cursor nobody handed out has always got. */
    public static ApiProblem badCursor() {
        return ApiProblem.badRequest("bad_cursor", "That list has changed. Pull to refresh.");
    }
}
