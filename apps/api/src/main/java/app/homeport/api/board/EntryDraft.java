package app.homeport.api.board;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import tools.jackson.databind.node.ObjectNode;

/**
 * An entry about to be stored: what a template hands to {@link Scene#add} or {@link Scene#save}. Start one
 * with {@link #of} for a new entry, or with {@link #from} to change one, and set what differs.
 */
public final class EntryDraft {

    String kind;
    UUID parentId;
    UUID authorId;
    UUID forId;
    ObjectNode doc = Json.empty();
    LocalDate day;
    Instant opensAt;
    Instant doneAt;
    UUID doneBy;
    UUID mediaId;
    Long amount;
    String token;
    Double position;

    private EntryDraft() {}

    /** A new entry of this kind ("meal", "letter", "mark"). */
    public static EntryDraft of(String kind) {
        EntryDraft draft = new EntryDraft();
        draft.kind = kind;
        return draft;
    }

    /** A stored entry, to change. */
    public static EntryDraft from(EntryRow row) {
        EntryDraft draft = new EntryDraft();
        draft.kind = row.kind();
        draft.parentId = row.parentId();
        draft.authorId = row.authorId();
        draft.forId = row.forId();
        draft.doc = row.doc();
        draft.day = row.day();
        draft.opensAt = row.opensAt();
        draft.doneAt = row.doneAt();
        draft.doneBy = row.doneBy();
        draft.mediaId = row.mediaId();
        draft.amount = row.amount();
        draft.token = row.token();
        draft.position = row.position();
        return draft;
    }

    public EntryDraft under(UUID parent) {
        this.parentId = parent;
        return this;
    }

    public EntryDraft by(UUID author) {
        this.authorId = author;
        return this;
    }

    public EntryDraft forMember(UUID member) {
        this.forId = member;
        return this;
    }

    /** Its details: one of the template's records, stored as a document. */
    public EntryDraft doc(Object details) {
        this.doc = Json.tree(details);
        return this;
    }

    public EntryDraft day(LocalDate value) {
        this.day = value;
        return this;
    }

    public EntryDraft opensAt(Instant value) {
        this.opensAt = value;
        return this;
    }

    /** Its tick, and who gave it: sealed, opened, answered, done. Null and null take it away. */
    public EntryDraft done(Instant at, UUID by) {
        this.doneAt = at;
        this.doneBy = by;
        return this;
    }

    /** Its photo or recording. The entry owns the file from now on. */
    public EntryDraft media(UUID media) {
        this.mediaId = media;
        return this;
    }

    public EntryDraft amount(Long value) {
        this.amount = value;
        return this;
    }

    public EntryDraft token(String value) {
        this.token = value;
        return this;
    }

    /** Where it stands among the others. Left alone, a new entry goes to the end. */
    public EntryDraft position(double value) {
        this.position = value;
        return this;
    }
}
