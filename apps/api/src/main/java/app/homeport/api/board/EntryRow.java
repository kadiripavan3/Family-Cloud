package app.homeport.api.board;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import tools.jackson.databind.node.ObjectNode;

/**
 * One entry of a board as it is stored: a meal, a letter, a height mark, a tick. What the columns mean is in
 * the migration (V60); what is in {@code doc} is the template's own business, read with {@link #as}.
 *
 * <p>This is the stored row, with everything in it. It never leaves the API as it is: a template turns it
 * into what one viewer may see.
 */
public record EntryRow(
        UUID id,
        UUID boardId,
        UUID parentId,
        String kind,
        UUID authorId,
        UUID forId,
        ObjectNode doc,
        LocalDate day,
        Instant opensAt,
        Instant doneAt,
        UUID doneBy,
        UUID mediaId,
        Long amount,
        String token,
        double position,
        Instant createdAt,
        Instant updatedAt) {

    /** The entry's details as one of the template's records. */
    public <T> T as(Class<T> type) {
        return Json.as(doc, type);
    }

    public boolean is(String kindWord) {
        return kind.equals(kindWord);
    }

    /** True when it has its tick: sealed, opened, answered, done. */
    public boolean done() {
        return doneAt != null;
    }

    public long amountOr(long otherwise) {
        return amount == null ? otherwise : amount;
    }
}
