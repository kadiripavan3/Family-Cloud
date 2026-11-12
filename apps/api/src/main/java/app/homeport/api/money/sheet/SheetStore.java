package app.homeport.api.money.sheet;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads and writes sheets: their tabs, columns, rows and tiles. Who may read one is decided by the thing it
 * is. Rows, cells and columns are each changed one at a time, so two people editing keep both changes.
 */
@Repository
public class SheetStore {

    public record SheetRow(UUID thingId, String currency, String template, UUID editedBy) {}

    public record TabRow(UUID id, UUID thingId, String name, double position) {}

    public record ColumnRow(
            UUID id,
            UUID tabId,
            String name,
            ColumnKind kind,
            List<String> options,
            String formula,
            Summary summary,
            double position) {}

    /** A row as it is kept: its cells by column id, each a plain JSON value (text, a number, true, a list of ids). */
    public record RowRow(UUID id, UUID tabId, Map<String, Object> cells, String note, double position) {}

    public record TileRow(UUID id, UUID tabId, String name, String formula, UUID ofTile, double position) {}

    /** Where a row, a column, a tab or a tile belongs: its tab and its sheet. */
    public record Home(UUID tabId, UUID thingId) {}

    public record Paper(UUID rowId, UUID mediaId, Instant addedAt) {}

    private static final JsonMapper JSON = new JsonMapper();
    private static final TypeReference<Map<String, Object>> CELLS = new TypeReference<>() {};

    private final JdbcClient jdbc;

    SheetStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- the sheet ----------

    public void insert(UUID thingId, String currency, String template, UUID editedBy) {
        jdbc.sql("""
            insert into sheets (thing_id, currency, template, edited_by) values (:id, :currency, :template, :by)
            on conflict (thing_id) do nothing
            """)
                .param("id", thingId)
                .param("currency", currency)
                .param("template", template)
                .param("by", editedBy)
                .update();
    }

    public Optional<SheetRow> find(UUID thingId) {
        return findAll(List.of(thingId)).stream().findFirst();
    }

    public List<SheetRow> findAll(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select thing_id, currency, template, edited_by from sheets where thing_id in (:ids)")
                .param("ids", thingIds)
                .query((rs, n) -> new SheetRow(
                        rs.getObject("thing_id", UUID.class),
                        rs.getString("currency"),
                        rs.getString("template"),
                        rs.getObject("edited_by", UUID.class)))
                .list();
    }

    public void setCurrency(UUID thingId, String currency) {
        jdbc.sql("update sheets set currency = :currency where thing_id = :id")
                .param("id", thingId)
                .param("currency", currency)
                .update();
    }

    /** Notes who changed a sheet last, and when. */
    public void edited(UUID thingId, UUID by) {
        jdbc.sql("update sheets set edited_by = :by where thing_id = :id")
                .param("id", thingId)
                .param("by", by)
                .update();
        jdbc.sql("update things set updated_at = now() where id = :id")
                .param("id", thingId)
                .update();
    }

    // ---------- tabs ----------

    private static TabRow aTab(ResultSet rs, int n) throws SQLException {
        return new TabRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getString("name"),
                rs.getDouble("position"));
    }

    /** The tabs of these sheets, in their order. A sheet holds 24 at most. */
    public List<TabRow> tabs(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "select id, thing_id, name, position from sheet_tabs where thing_id in (:ids) order by thing_id, position, id")
                .param("ids", thingIds)
                .query(SheetStore::aTab)
                .list();
    }

    public Optional<TabRow> tab(UUID tabId) {
        return jdbc.sql("select id, thing_id, name, position from sheet_tabs where id = :id")
                .param("id", tabId)
                .query(SheetStore::aTab)
                .optional();
    }

    /** Adds a tab at the end. Sending the same clientId again adds nothing and returns the tab added the first time. */
    public UUID addTab(UUID thingId, String name, UUID clientId) {
        return jdbc.sql("""
            insert into sheet_tabs (id, thing_id, name, client_id, position)
            values (:id, :thing, :name, :client,
              coalesce((select max(position) from sheet_tabs where thing_id = :thing), 0) + 1)
            on conflict (thing_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("thing", thingId)
                .param("name", name)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void renameTab(UUID tabId, String name) {
        jdbc.sql("update sheet_tabs set name = :name where id = :id")
                .param("id", tabId)
                .param("name", name)
                .update();
    }

    public void removeTab(UUID tabId) {
        jdbc.sql("delete from sheet_tabs where id = :id").param("id", tabId).update();
    }

    /** How many rows each of these tabs holds. */
    public Map<UUID, Integer> rowCounts(List<UUID> tabIds) {
        if (tabIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("select tab_id, count(*) as n from sheet_rows where tab_id in (:ids) group by tab_id")
                .param("ids", tabIds)
                .query((rs, n) -> Map.entry(rs.getObject("tab_id", UUID.class), rs.getInt("n")))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    // ---------- moving within a list ----------

    /**
     * Moves a tab, a column, a row or a tile to just before another one of the same list, or to the end when
     * there is no other.
     *
     * @param table one of this store's own tables
     * @param list the column that says which list it is in
     */
    private void move(String table, String list, UUID id, UUID listId, UUID beforeId) {
        jdbc.sql("""
            update %1$s set position = case
              when cast(:before as uuid) is null then coalesce((select max(position) from %1$s where %2$s = :list), 0) + 1
              else (select (b.position + coalesce((select max(p.position) from %1$s p
                                                  where p.%2$s = :list and p.position < b.position and p.id <> :id), b.position - 1)) / 2
                    from %1$s b where b.id = cast(:before as uuid) and b.%2$s = :list)
              end
            where id = :id
            """.formatted(table, list))
                .param("id", id)
                .param("list", listId)
                .param("before", beforeId == null ? null : beforeId.toString())
                .update();
    }

    public void moveTab(UUID tabId, UUID thingId, UUID beforeId) {
        move("sheet_tabs", "thing_id", tabId, thingId, beforeId);
    }

    public void moveColumn(UUID columnId, UUID tabId, UUID beforeId) {
        move("sheet_columns", "tab_id", columnId, tabId, beforeId);
    }

    public void moveRow(UUID rowId, UUID tabId, UUID beforeId) {
        move("sheet_rows", "tab_id", rowId, tabId, beforeId);
    }

    public void moveTile(UUID tileId, UUID tabId, UUID beforeId) {
        move("sheet_tiles", "tab_id", tileId, tabId, beforeId);
    }

    // ---------- columns ----------

    private static ColumnRow aColumn(ResultSet rs, int n) throws SQLException {
        return new ColumnRow(
                rs.getObject("id", UUID.class),
                rs.getObject("tab_id", UUID.class),
                rs.getString("name"),
                ColumnKind.read(rs.getString("kind")),
                Sql.strings(rs, "options"),
                rs.getString("formula"),
                Summary.read(rs.getString("summary")),
                rs.getDouble("position"));
    }

    /** The columns of these tabs, in their order. A tab holds 40 at most. */
    public List<ColumnRow> columns(List<UUID> tabIds) {
        if (tabIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select * from sheet_columns where tab_id in (:ids) order by tab_id, position, id")
                .param("ids", tabIds)
                .query(SheetStore::aColumn)
                .list();
    }

    public Optional<ColumnRow> column(UUID columnId) {
        return jdbc.sql("select * from sheet_columns where id = :id")
                .param("id", columnId)
                .query(SheetStore::aColumn)
                .optional();
    }

    /** Adds a column at the end. Sending the same clientId again adds nothing and returns the column added the first time. */
    public UUID addColumn(
            UUID tabId,
            String name,
            ColumnKind kind,
            List<String> options,
            String formula,
            Summary summary,
            UUID clientId) {
        return jdbc.sql("""
            insert into sheet_columns (id, tab_id, name, kind, options, formula, summary, client_id, position)
            values (:id, :tab, :name, :kind, :options, :formula, :summary, :client,
              coalesce((select max(position) from sheet_columns where tab_id = :tab), 0) + 1)
            on conflict (tab_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("tab", tabId)
                .param("name", name)
                .param("kind", kind.code())
                .param("options", options.toArray(String[]::new))
                .param("formula", formula)
                .param("summary", summary.code())
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void changeColumn(
            UUID columnId, String name, ColumnKind kind, List<String> options, String formula, Summary summary) {
        jdbc.sql("""
            update sheet_columns set name = :name, kind = :kind, options = :options, formula = :formula,
              summary = :summary where id = :id
            """)
                .param("id", columnId)
                .param("name", name)
                .param("kind", kind.code())
                .param("options", options.toArray(String[]::new))
                .param("formula", formula)
                .param("summary", summary.code())
                .update();
    }

    /** Removes a column, and what every row held in it. */
    public void removeColumn(UUID columnId, UUID tabId) {
        jdbc.sql("delete from sheet_columns where id = :id")
                .param("id", columnId)
                .update();
        jdbc.sql(
                        "update sheet_rows set cells = cells - cast(:key as text) where tab_id = :tab and jsonb_exists(cells, :key)")
                .param("tab", tabId)
                .param("key", columnId.toString())
                .update();
    }

    /** True when any row of the tab holds something in this column. */
    public boolean columnHolds(UUID columnId, UUID tabId) {
        return jdbc.sql("select exists (select 1 from sheet_rows where tab_id = :tab and jsonb_exists(cells, :key))")
                .param("tab", tabId)
                .param("key", columnId.toString())
                .query(Boolean.class)
                .single();
    }

    // ---------- rows ----------

    private static RowRow aRow(ResultSet rs, int n) throws SQLException {
        return new RowRow(
                rs.getObject("id", UUID.class),
                rs.getObject("tab_id", UUID.class),
                JSON.readValue(rs.getString("cells"), CELLS),
                rs.getString("note"),
                rs.getDouble("position"));
    }

    /** Every row of a tab, in their order. A tab holds 2,000 at most, and its sums need them all. */
    public List<RowRow> rows(UUID tabId) {
        return jdbc.sql(
                        "select id, tab_id, cells::text as cells, note, position from sheet_rows where tab_id = :tab order by position, id limit 2000")
                .param("tab", tabId)
                .query(SheetStore::aRow)
                .list();
    }

    /** Every row of each of these tabs, in their order. One statement however many tabs. */
    public Map<UUID, List<RowRow>> rowsOf(List<UUID> tabIds) {
        if (tabIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql(
                        "select id, tab_id, cells::text as cells, note, position from sheet_rows where tab_id in (:tabs) order by tab_id, position, id")
                .param("tabs", tabIds)
                .query(SheetStore::aRow)
                .list()
                .stream()
                .collect(Collectors.groupingBy(RowRow::tabId));
    }

    public int countRows(UUID tabId) {
        return jdbc.sql("select count(*) from sheet_rows where tab_id = :tab")
                .param("tab", tabId)
                .query(Integer.class)
                .single();
    }

    /** Adds a row at the end. Sending the same clientId again adds nothing and returns the row added the first time. */
    public UUID addRow(UUID tabId, Map<String, Object> cells, String note, UUID addedBy, UUID clientId) {
        return jdbc.sql("""
            insert into sheet_rows (id, tab_id, cells, note, added_by, client_id, position)
            values (:id, :tab, cast(:cells as jsonb), :note, :by, :client,
              coalesce((select max(position) from sheet_rows where tab_id = :tab), 0) + 1)
            on conflict (tab_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("tab", tabId)
                .param("cells", JSON.writeValueAsString(cells))
                .param("note", note)
                .param("by", addedBy)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    /**
     * Changes some cells of a row and leaves the others as they are. Each cell named is set or emptied in one
     * statement, so someone else changing another cell of the same row at the same moment keeps theirs.
     */
    public void setCells(UUID rowId, Map<String, Object> set, List<String> emptied) {
        jdbc.sql(
                        "update sheet_rows set cells = (cells || cast(:set as jsonb)) - cast(:emptied as text[]) where id = :id")
                .param("id", rowId)
                .param("set", JSON.writeValueAsString(set))
                .param("emptied", emptied.toArray(String[]::new))
                .update();
    }

    public void setNote(UUID rowId, String note) {
        jdbc.sql("update sheet_rows set note = :note where id = :id")
                .param("id", rowId)
                .param("note", note)
                .update();
    }

    public void removeRow(UUID rowId) {
        jdbc.sql("delete from sheet_rows where id = :id").param("id", rowId).update();
    }

    // ---------- tiles ----------

    private static TileRow aTile(ResultSet rs, int n) throws SQLException {
        return new TileRow(
                rs.getObject("id", UUID.class),
                rs.getObject("tab_id", UUID.class),
                rs.getString("name"),
                rs.getString("formula"),
                rs.getObject("of_tile", UUID.class),
                rs.getDouble("position"));
    }

    /** The tiles of these tabs, in their order. A tab holds 12 at most. */
    public List<TileRow> tiles(List<UUID> tabIds) {
        if (tabIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select * from sheet_tiles where tab_id in (:ids) order by tab_id, position, id")
                .param("ids", tabIds)
                .query(SheetStore::aTile)
                .list();
    }

    public Optional<TileRow> tile(UUID tileId) {
        return jdbc.sql("select * from sheet_tiles where id = :id")
                .param("id", tileId)
                .query(SheetStore::aTile)
                .optional();
    }

    /** Adds a tile at the end. Sending the same clientId again adds nothing and returns the tile added the first time. */
    public UUID addTile(UUID tabId, String name, String formula, UUID ofTile, UUID clientId) {
        return jdbc.sql("""
            insert into sheet_tiles (id, tab_id, name, formula, of_tile, client_id, position)
            values (:id, :tab, :name, :formula, :of, :client,
              coalesce((select max(position) from sheet_tiles where tab_id = :tab), 0) + 1)
            on conflict (tab_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("tab", tabId)
                .param("name", name)
                .param("formula", formula)
                .param("of", ofTile)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void changeTile(UUID tileId, String name, String formula, UUID ofTile) {
        jdbc.sql("update sheet_tiles set name = :name, formula = :formula, of_tile = :of where id = :id")
                .param("id", tileId)
                .param("name", name)
                .param("formula", formula)
                .param("of", ofTile)
                .update();
    }

    public void removeTile(UUID tileId) {
        jdbc.sql("delete from sheet_tiles where id = :id").param("id", tileId).update();
    }

    /** The column or tile of a tab that was made with this clientId, when there is one: the same request sent again. */
    public Optional<UUID> madeBefore(String table, UUID tabId, UUID clientId) {
        if (clientId == null) {
            return Optional.empty();
        }
        return jdbc.sql("select id from %s where tab_id = :tab and client_id = :client".formatted(table))
                .param("tab", tabId)
                .param("client", clientId)
                .query(UUID.class)
                .optional();
    }

    // ---------- where things belong ----------

    private Optional<Home> home(String sql, UUID id) {
        return jdbc.sql(sql)
                .param("id", id)
                .query((rs, n) -> new Home(rs.getObject("tab_id", UUID.class), rs.getObject("thing_id", UUID.class)))
                .optional();
    }

    public Optional<Home> homeOfRow(UUID rowId) {
        return home(
                "select r.tab_id, t.thing_id from sheet_rows r join sheet_tabs t on t.id = r.tab_id where r.id = :id",
                rowId);
    }

    public Optional<Home> homeOfColumn(UUID columnId) {
        return home(
                "select c.tab_id, t.thing_id from sheet_columns c join sheet_tabs t on t.id = c.tab_id where c.id = :id",
                columnId);
    }

    public Optional<Home> homeOfTile(UUID tileId) {
        return home(
                "select l.tab_id, t.thing_id from sheet_tiles l join sheet_tabs t on t.id = l.tab_id where l.id = :id",
                tileId);
    }

    // ---------- receipts and papers ----------

    /** Keeps a paper with a row. Sending the same clientId again adds nothing. */
    public void addPaper(UUID rowId, UUID mediaId, UUID addedBy, UUID clientId) {
        jdbc.sql("""
            insert into sheet_row_papers (row_id, media_id, added_by, client_id) values (:row, :media, :by, :client)
            on conflict do nothing
            """)
                .param("row", rowId)
                .param("media", mediaId)
                .param("by", addedBy)
                .param("client", clientId)
                .update();
    }

    /** Takes a paper off its row. Its file goes with it (the database sees to that). */
    public void removePaper(UUID rowId, UUID mediaId) {
        jdbc.sql("delete from sheet_row_papers where row_id = :row and media_id = :media")
                .param("row", rowId)
                .param("media", mediaId)
                .update();
    }

    /** The papers kept with a row, the oldest first. A row holds 20 at most. */
    public List<Paper> papers(UUID rowId) {
        return jdbc.sql(
                        "select row_id, media_id, created_at from sheet_row_papers where row_id = :row order by created_at, media_id limit 20")
                .param("row", rowId)
                .query((rs, n) -> new Paper(
                        rs.getObject("row_id", UUID.class),
                        rs.getObject("media_id", UUID.class),
                        Sql.instant(rs, "created_at")))
                .list();
    }

    /** How many papers each of these rows has. */
    public Map<UUID, Integer> paperCounts(List<UUID> rowIds) {
        Map<UUID, Integer> counts = new HashMap<>();
        if (rowIds.isEmpty()) {
            return counts;
        }
        jdbc.sql("select row_id, count(*) as n from sheet_row_papers where row_id in (:ids) group by row_id")
                .param("ids", rowIds)
                .query((rs, n) -> Map.entry(rs.getObject("row_id", UUID.class), rs.getInt("n")))
                .list()
                .forEach(count -> counts.put(count.getKey(), count.getValue()));
        return counts;
    }

    // ---------- who has it open ----------

    /** Notes that someone has the sheet open now, and returns who else had it open in the last minute and a half. */
    public List<UUID> seenBy(UUID thingId, UUID memberId) {
        jdbc.sql("""
            insert into sheet_viewers (thing_id, member_id) values (:thing, :member)
            on conflict (thing_id, member_id) do update set seen_at = now()
            """).param("thing", thingId).param("member", memberId).update();
        return jdbc.sql("""
            select member_id from sheet_viewers
            where thing_id = :thing and member_id <> :member and seen_at > now() - interval '90 seconds'
            order by seen_at desc limit 10
            """)
                .param("thing", thingId)
                .param("member", memberId)
                .query(UUID.class)
                .list();
    }

    // ---------- search ----------

    /** Sheets of a circle with these words in a cell, a row's note, a column's name or a tab's name. */
    public List<Map.Entry<UUID, String>> search(UUID circleId, String pattern, int limit) {
        return jdbc.sql("""
            select distinct on (found.thing_id) found.thing_id, found.words from (
              select b.thing_id, left(c.value, 90) as words, 1 as rank
              from sheet_rows r join sheet_tabs b on b.id = r.tab_id join things t on t.id = b.thing_id,
                   jsonb_each_text(r.cells) c
              where t.circle_id = :circle and jsonb_typeof(r.cells -> c.key) = 'string' and c.value ilike :pattern
              union all
              select b.thing_id, left(r.note, 90), 2
              from sheet_rows r join sheet_tabs b on b.id = r.tab_id join things t on t.id = b.thing_id
              where t.circle_id = :circle and r.note ilike :pattern
              union all
              select b.thing_id, 'Column: ' || c.name, 3
              from sheet_columns c join sheet_tabs b on b.id = c.tab_id join things t on t.id = b.thing_id
              where t.circle_id = :circle and c.name ilike :pattern
              union all
              select b.thing_id, 'Tab: ' || b.name, 4
              from sheet_tabs b join things t on t.id = b.thing_id
              where t.circle_id = :circle and b.name ilike :pattern) found
            order by found.thing_id, found.rank limit :limit
            """)
                .param("circle", circleId)
                .param("pattern", pattern)
                .param("limit", limit)
                .query((rs, n) -> Map.entry(rs.getObject("thing_id", UUID.class), rs.getString("words")))
                .list();
    }
}
