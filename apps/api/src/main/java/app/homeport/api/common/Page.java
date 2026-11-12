package app.homeport.api.common;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.function.Function;

/**
 * One page of a list that can grow without end. Every such list in the API has this shape and takes the
 * same two parameters, {@code cursor} and {@code limit}.
 */
public record Page<T>(
        List<T> items,

        @Schema(
                nullable = true,
                description = "Send this back as `cursor` to get the next page. Null on the last page.")
        String nextCursor) {

    /** Builds a page from rows fetched with {@link PageRequest#fetch()}: one row more than asked for says there is a next page. */
    public static <T> Page<T> of(List<T> rows, PageRequest request) {
        boolean more = rows.size() > request.limit();
        return new Page<>(
                more ? rows.subList(0, request.limit()) : rows,
                more ? PageRequest.cursor(request.offset() + request.limit()) : null);
    }

    public <R> Page<R> map(Function<List<T>, List<R>> views) {
        return new Page<>(views.apply(items), nextCursor);
    }
}
