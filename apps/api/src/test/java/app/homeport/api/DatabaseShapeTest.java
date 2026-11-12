package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** What the database itself has to keep true as tables are added: indexes where deletes need them. */
class DatabaseShapeTest extends ApiTest {

    /**
     * Deleting a row makes the database look in every table that points at it. Without an index on the
     * pointing column that look reads the whole table, once per deleted row. A new table with a
     * "references" column fails here until that column has an index (a partial one over the rows that have a
     * value is fine).
     */
    @Test
    void everyColumnThatPointsAtAnotherTableHasAnIndex() {
        List<String> missing = jdbc.sql("""
            select c.conrelid::regclass || ' (' || (
                     select string_agg(a.attname, ', ' order by k.ord)
                     from unnest(c.conkey) with ordinality k(attnum, ord)
                     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) || ')'
            from pg_constraint c
            where c.contype = 'f' and c.connamespace = current_schema()::regnamespace
              and not exists (
                select 1 from pg_index i
                where i.indrelid = c.conrelid and i.indisvalid
                  and not exists (
                    select 1 from unnest(c.conkey) k(attnum)
                    where k.attnum <> all (array(
                      select i.indkey[s] from generate_series(0, cardinality(c.conkey) - 1) s)))
                  and (i.indpred is null
                       or pg_get_expr(i.indpred, i.indrelid) ~ '^\\(?[a-z_]+ IS NOT NULL\\)?$'))
            order by 1
            """).query(String.class).list();
        assertThat(missing)
                .as("columns that reference another table and have no index to find their rows by")
                .isEmpty();
    }
}
