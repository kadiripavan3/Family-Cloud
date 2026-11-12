package app.homeport.api.library;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.Place;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes what a document adds to a file: the words inside it, and what was found in them. */
@Repository
public class DocumentStore {

    /** A document's details, without its words (they can be long, and a list doesn't show them). */
    public record DocumentRow(
            UUID thingId,
            Integer pages,
            DocumentCategory category,
            LocalDate keyDate,
            DateLabel keyLabel,
            boolean keyByHand,
            Long amountCents,
            String currency,
            boolean hasText) {}

    /**
     * Something a document is linked to, as far as the viewer may see it.
     *
     * @param kind the kind of thing, as its word: a later place may add kinds this one doesn't know
     */
    public record Linked(UUID documentId, UUID otherId, String kind, Place place, String title) {}

    public record Found(UUID thingId, String around) {}

    private final JdbcClient jdbc;

    DocumentStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(
            UUID thingId,
            String text,
            Integer pages,
            DocumentCategory category,
            LocalDate keyDate,
            DateLabel keyLabel,
            Long amountCents,
            String currency) {
        jdbc.sql("""
                        insert into documents (thing_id, text, pages, category, key_date, key_label, amount_cents, currency)
                        values (:id, :text, :pages, :category, :keyDate, :keyLabel, :amount, :currency)
                        on conflict (thing_id) do nothing
                        """)
                .param("id", thingId)
                .param("text", text)
                .param("pages", pages, java.sql.Types.INTEGER)
                .param("category", category.code())
                .param("keyDate", keyDate, java.sql.Types.DATE)
                .param("keyLabel", keyLabel == null ? null : keyLabel.code())
                .param("amount", amountCents, java.sql.Types.BIGINT)
                .param("currency", currency)
                .update();
    }

    public void update(
            UUID thingId,
            String text,
            Integer pages,
            DocumentCategory category,
            LocalDate keyDate,
            DateLabel keyLabel,
            boolean keyByHand,
            Long amountCents,
            String currency) {
        jdbc.sql("""
                        update documents set text = :text, pages = :pages, category = :category, key_date = :keyDate,
                          key_label = :keyLabel, key_by_hand = :byHand, amount_cents = :amount, currency = :currency
                        where thing_id = :id
                        """)
                .param("id", thingId)
                .param("text", text)
                .param("pages", pages, java.sql.Types.INTEGER)
                .param("category", category.code())
                .param("keyDate", keyDate, java.sql.Types.DATE)
                .param("keyLabel", keyLabel == null ? null : keyLabel.code())
                .param("byHand", keyByHand)
                .param("amount", amountCents, java.sql.Types.BIGINT)
                .param("currency", currency)
                .update();
    }

    /** The details of these documents, by their id. */
    public Map<UUID, DocumentRow> rows(List<UUID> thingIds) {
        Map<UUID, DocumentRow> rows = new HashMap<>();
        if (thingIds.isEmpty()) {
            return rows;
        }
        jdbc.sql("select thing_id, pages, category, key_date, key_label, key_by_hand, amount_cents, currency,"
                        + " text <> '' as has_text from documents where thing_id in (:ids)")
                .param("ids", thingIds)
                .query((rs, n) -> rows.put(
                        rs.getObject("thing_id", UUID.class),
                        new DocumentRow(
                                rs.getObject("thing_id", UUID.class),
                                (Integer) rs.getObject("pages"),
                                DocumentCategory.read(rs.getString("category")),
                                rs.getObject("key_date", LocalDate.class),
                                DateLabel.read(rs.getString("key_label")),
                                rs.getBoolean("key_by_hand"),
                                (Long) rs.getObject("amount_cents"),
                                rs.getString("currency"),
                                rs.getBoolean("has_text"))))
                .list();
        return rows;
    }

    public Optional<String> text(UUID thingId) {
        return jdbc.sql("select text from documents where thing_id = :id")
                .param("id", thingId)
                .query(String.class)
                .optional();
    }

    /** How many documents of each kind the viewer may see in a circle. */
    public Map<DocumentCategory, Integer> categories(UUID circleId, UUID me) {
        Map<DocumentCategory, Integer> counts = new java.util.EnumMap<>(DocumentCategory.class);
        jdbc.sql("select d.category, count(*) as n from documents d join library_items i on i.thing_id = d.thing_id"
                        + " join things t on t.id = i.thing_id where i.circle_id = :circle and "
                        + Rules.sees("t", ":me") + " group by d.category")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> counts.put(DocumentCategory.read(rs.getString("category")), rs.getInt("n")))
                .list();
        return counts;
    }

    /** What these documents are linked to, from either end, as far as the viewer may see it. The oldest link first. */
    public List<Linked> linked(List<UUID> documentIds, UUID me) {
        if (documentIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                        select l.document_id, o.id, o.kind, o.place, o.title from (
                          select from_id as document_id, to_id as other, created_at from thing_links where from_id in (:ids)
                          union all select to_id, from_id, created_at from thing_links where to_id in (:ids)) l
                        join things o on o.id = l.other
                        where\s""" + Rules.sees("o", ":me") + " order by l.created_at, o.id")
                .param("ids", documentIds)
                .param("me", me)
                .query((rs, n) -> new Linked(
                        rs.getObject("document_id", UUID.class),
                        rs.getObject("id", UUID.class),
                        rs.getString("kind"),
                        Place.read(rs.getString("place")),
                        rs.getString("title")))
                .list();
    }

    /** The documents of a circle with these words inside, whoever asks: who may see each is checked afterwards. */
    public List<Found> inside(UUID circleId, String words, int limit) {
        return jdbc.sql("""
                        select d.thing_id,
                          substring(d.text from greatest(position(lower(:plain) in lower(d.text)) - 30, 1) for 90) as around
                        from documents d join library_items i on i.thing_id = d.thing_id
                        where i.circle_id = :circle and d.text ilike :pattern order by i.created_at desc limit :limit
                        """)
                .param("circle", circleId)
                .param("pattern", Sql.anywhere(words))
                .param("plain", words)
                .param("limit", limit)
                .query((rs, n) -> new Found(rs.getObject("thing_id", UUID.class), rs.getString("around")))
                .list();
    }
}
