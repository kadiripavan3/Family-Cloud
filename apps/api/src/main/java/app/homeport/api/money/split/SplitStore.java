package app.homeport.api.money.split;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes splits: what was paid, who shares it, and the payments made to settle up. Who may read one is decided by the thing it is. */
@Repository
public class SplitStore {

    public record ExpenseRow(
            UUID id,
            UUID thingId,
            String title,
            String emoji,
            long amountCents,
            UUID paidBy,
            ShareMode mode,
            LocalDate spentOn,
            UUID addedBy,
            Instant createdAt) {}

    /** One person's part of one expense, by weight. */
    public record ShareRow(UUID expenseId, UUID memberId, long weight) {}

    public record PaymentRow(
            UUID id,
            UUID thingId,
            UUID from,
            UUID to,
            long amountCents,
            LocalDate paidOn,
            UUID notedBy,
            Instant createdAt) {}

    /** What one person paid and was meant to pay in one expense, for adding up balances without reading every expense. */
    public record Part(UUID thingId, UUID expenseId, long amountCents, UUID paidBy, UUID memberId, long weight) {}

    public record Reminded(UUID thingId, UUID memberId, Instant at) {}

    private final JdbcClient jdbc;

    SplitStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- the split ----------

    public void insert(UUID thingId, String currency) {
        jdbc.sql("insert into splits (thing_id, currency) values (:id, :currency) on conflict (thing_id) do nothing")
                .param("id", thingId)
                .param("currency", currency)
                .update();
    }

    /** The currency each of these splits counts in. */
    public Map<UUID, String> currencies(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("select thing_id, currency from splits where thing_id in (:ids)")
                .param("ids", thingIds)
                .query((rs, n) -> Map.entry(rs.getObject("thing_id", UUID.class), rs.getString("currency")))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    /** The splits of a circle the viewer may see, last changed first. Fifty at most: what a circle's Money page and Today add up. */
    public List<ThingRow> visible(UUID circleId, UUID me) {
        return jdbc.sql("select " + ThingStore.COLUMNS + """
             from things t where t.circle_id = :circle and t.kind = 'split' and\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit 50")
                .param("circle", circleId)
                .param("me", me)
                .query(ThingStore::row)
                .list();
    }

    // ---------- expenses ----------

    private static ExpenseRow anExpense(ResultSet rs, int n) throws SQLException {
        return new ExpenseRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getString("title"),
                rs.getString("emoji"),
                rs.getLong("amount_cents"),
                rs.getObject("paid_by", UUID.class),
                ShareMode.read(rs.getString("mode")),
                rs.getObject("spent_on", LocalDate.class),
                rs.getObject("added_by", UUID.class),
                Sql.instant(rs, "created_at"));
    }

    /** Adds an expense. Sending the same clientId again adds nothing and returns the expense added the first time. */
    public UUID addExpense(
            UUID thingId,
            String title,
            String emoji,
            long amountCents,
            UUID paidBy,
            ShareMode mode,
            LocalDate spentOn,
            UUID addedBy,
            UUID clientId) {
        return jdbc.sql("""
            insert into split_expenses (id, thing_id, title, emoji, amount_cents, paid_by, mode, spent_on, added_by, client_id)
            values (:id, :thing, :title, :emoji, :amount, :payer, :mode, :on, :by, :client)
            on conflict (thing_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("thing", thingId)
                .param("title", title)
                .param("emoji", emoji)
                .param("amount", amountCents)
                .param("payer", paidBy)
                .param("mode", mode.code())
                .param("on", spentOn)
                .param("by", addedBy)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void changeExpense(
            UUID id, String title, String emoji, long amountCents, UUID paidBy, ShareMode mode, LocalDate spentOn) {
        jdbc.sql("""
            update split_expenses set title = :title, emoji = :emoji, amount_cents = :amount, paid_by = :payer,
              mode = :mode, spent_on = :on where id = :id
            """)
                .param("id", id)
                .param("title", title)
                .param("emoji", emoji)
                .param("amount", amountCents)
                .param("payer", paidBy)
                .param("mode", mode.code())
                .param("on", spentOn)
                .update();
    }

    public Optional<ExpenseRow> expense(UUID id) {
        return jdbc.sql("select * from split_expenses where id = :id")
                .param("id", id)
                .query(SplitStore::anExpense)
                .optional();
    }

    public void removeExpense(UUID id) {
        jdbc.sql("delete from split_expenses where id = :id").param("id", id).update();
    }

    public int countExpenses(UUID thingId) {
        return jdbc.sql("select count(*) from split_expenses where thing_id = :id")
                .param("id", thingId)
                .query(Integer.class)
                .single();
    }

    /** True when the expense has shares already: a second send of the same clientId found the one made before. */
    public boolean hasShares(UUID expenseId) {
        return jdbc.sql("select exists (select 1 from split_expense_shares where expense_id = :id)")
                .param("id", expenseId)
                .query(Boolean.class)
                .single();
    }

    /** The expenses of a split, the latest first, a page at a time. */
    public List<ExpenseRow> expenses(UUID thingId, Keyset page) {
        LocalDate on = null;
        if (!page.first()) {
            try {
                on = LocalDate.parse(page.text(0));
            } catch (DateTimeParseException notADay) {
                throw Keyset.badCursor();
            }
        }
        return jdbc.sql("""
            select * from split_expenses e where e.thing_id = :thing
              and (cast(:on as date) is null
                   or (e.spent_on, e.created_at, e.id) < (cast(:on as date), cast(:at as timestamptz), cast(:id as uuid)))
            order by e.spent_on desc, e.created_at desc, e.id desc limit :limit
            """)
                .param("thing", thingId)
                .param("on", on)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(1)))
                .param("id", page.first() ? null : page.uuid(2).toString())
                .param("limit", page.fetch())
                .query(SplitStore::anExpense)
                .list();
    }

    public void setShares(UUID expenseId, Map<UUID, Long> weights) {
        jdbc.sql("delete from split_expense_shares where expense_id = :id")
                .param("id", expenseId)
                .update();
        for (Map.Entry<UUID, Long> share : weights.entrySet()) {
            jdbc.sql("insert into split_expense_shares (expense_id, member_id, weight) values (:id, :member, :weight)")
                    .param("id", expenseId)
                    .param("member", share.getKey())
                    .param("weight", share.getValue())
                    .update();
        }
    }

    /** Who shares these expenses, in the order the circle lists its people. */
    public List<ShareRow> shares(List<UUID> expenseIds) {
        if (expenseIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select s.expense_id, s.member_id, s.weight from split_expense_shares s join members m on m.id = s.member_id
            where s.expense_id in (:ids) order by s.expense_id, m.created_at, m.id
            """)
                .param("ids", expenseIds)
                .query((rs, n) -> new ShareRow(
                        rs.getObject("expense_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getLong("weight")))
                .list();
    }

    /**
     * Every share of every expense of these splits, with what the expense came to and who paid it: what
     * balances are added up from. An expense nobody shares any more comes as one line with no member. A split
     * holds 2,000 expenses at most.
     */
    public List<Part> parts(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select e.thing_id, e.id, e.amount_cents, e.paid_by, s.member_id, coalesce(s.weight, 0) as weight
            from split_expenses e left join split_expense_shares s on s.expense_id = e.id
            left join members m on m.id = s.member_id
            where e.thing_id in (:ids) order by e.thing_id, e.id, m.created_at, m.id
            """)
                .param("ids", thingIds)
                .query((rs, n) -> new Part(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("id", UUID.class),
                        rs.getLong("amount_cents"),
                        rs.getObject("paid_by", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getLong("weight")))
                .list();
    }

    // ---------- payments made ----------

    private static PaymentRow aPayment(ResultSet rs, int n) throws SQLException {
        return new PaymentRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("from_member", UUID.class),
                rs.getObject("to_member", UUID.class),
                rs.getLong("amount_cents"),
                rs.getObject("paid_on", LocalDate.class),
                rs.getObject("noted_by", UUID.class),
                Sql.instant(rs, "created_at"));
    }

    /** Notes a payment as made. Sending the same clientId again notes nothing and returns the one noted the first time. */
    public UUID addPayment(
            UUID thingId, UUID from, UUID to, long amountCents, LocalDate paidOn, UUID notedBy, UUID clientId) {
        return jdbc.sql("""
            insert into split_payments (id, thing_id, from_member, to_member, amount_cents, paid_on, noted_by, client_id)
            values (:id, :thing, :from, :to, :amount, :on, :by, :client)
            on conflict (thing_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("thing", thingId)
                .param("from", from)
                .param("to", to)
                .param("amount", amountCents)
                .param("on", paidOn)
                .param("by", notedBy)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public Optional<PaymentRow> payment(UUID id) {
        return jdbc.sql("select * from split_payments where id = :id")
                .param("id", id)
                .query(SplitStore::aPayment)
                .optional();
    }

    public void removePayment(UUID id) {
        jdbc.sql("delete from split_payments where id = :id").param("id", id).update();
    }

    /** Every payment made in these splits, the latest first. A split holds 2,000 at most. */
    public List<PaymentRow> payments(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "select * from split_payments where thing_id in (:ids) order by thing_id, paid_on desc, created_at desc, id")
                .param("ids", thingIds)
                .query(SplitStore::aPayment)
                .list();
    }

    public int countPayments(UUID thingId) {
        return jdbc.sql("select count(*) from split_payments where thing_id = :id")
                .param("id", thingId)
                .query(Integer.class)
                .single();
    }

    // ---------- reminders ----------

    /** Notes that someone was reminded now. */
    public void reminded(UUID thingId, UUID memberId, UUID by) {
        jdbc.sql("""
            insert into split_reminders (thing_id, member_id, by_member) values (:thing, :member, :by)
            on conflict (thing_id, member_id) do update set by_member = excluded.by_member, reminded_at = now()
            """)
                .param("thing", thingId)
                .param("member", memberId)
                .param("by", by)
                .update();
    }

    public List<Reminded> reminders(UUID thingId) {
        return jdbc.sql("select thing_id, member_id, reminded_at from split_reminders where thing_id = :thing")
                .param("thing", thingId)
                .query((rs, n) -> new Reminded(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        Sql.instant(rs, "reminded_at")))
                .list();
    }

    // ---------- search ----------

    /** Splits of a circle the viewer may see with an expense whose name holds these words. */
    public List<Map.Entry<UUID, String>> search(UUID circleId, UUID me, String pattern, int limit) {
        return jdbc.sql("""
            select distinct on (e.thing_id) e.thing_id, e.title
            from split_expenses e join things t on t.id = e.thing_id
            where t.circle_id = :circle and e.title ilike :pattern and\s""" + Rules.sees("t", ":me") + """
             order by e.thing_id, e.spent_on desc limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("pattern", pattern)
                .param("limit", limit)
                .query((rs, n) -> Map.entry(rs.getObject("thing_id", UUID.class), rs.getString("title")))
                .list();
    }
}
