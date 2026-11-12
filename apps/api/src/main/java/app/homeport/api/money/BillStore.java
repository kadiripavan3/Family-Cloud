package app.homeport.api.money;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes bills, the times they are due, and who has paid their share. Who may read one is decided by the thing it is. */
@Repository
public class BillStore {

    public record BillRow(
            UUID thingId,
            String payee,
            String emoji,
            String currency,
            Repeat repeat,
            int everyMonths,
            int dueDay,
            boolean subscription,
            PaidHow pays,
            Integer remindDays,
            String note,
            String payUrl,
            String iban,
            String reference) {}

    /** One time a bill is due. It is open until {@code paidAt} is set. */
    public record DueRow(UUID id, UUID thingId, LocalDate dueOn, long amountCents, Instant paidAt, UUID paidBy) {}

    public record ShareRow(UUID thingId, UUID memberId, long parts) {}

    /** A share of one due time that has been paid. */
    public record MarkRow(UUID dueId, UUID memberId, Instant paidAt, UUID paidBy) {}

    /** A bill in a list: the thing, the bill, and the due time the list is about. */
    public record Listed(ThingRow thing, BillRow bill, DueRow due) {}

    /** What a circle's bills of one month and one currency come to. */
    public record MonthSum(String currency, long totalCents, long paidCents, int bills) {}

    /** Someone to remind that a bill is coming up. */
    public record Reminder(
            UUID thingId,
            UUID circleId,
            String title,
            String currency,
            long amountCents,
            LocalDate dueOn,
            UUID memberId) {}

    private static final String BILL = """
        b.thing_id, b.payee, b.emoji, b.currency, b.repeat, b.every_months, b.due_day, b.subscription, b.pays,
        b.remind_days, b.note, b.pay_url, b.iban, b.reference\s""";

    private static final String DUE =
            "d.id as due_id, d.due_on, d.amount_cents, d.paid_at as due_paid_at, d.paid_by as due_paid_by ";

    private final JdbcClient jdbc;

    BillStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static BillRow bill(ResultSet rs, int n) throws SQLException {
        return new BillRow(
                rs.getObject("thing_id", UUID.class),
                rs.getString("payee"),
                rs.getString("emoji"),
                rs.getString("currency"),
                Repeat.read(rs.getString("repeat")),
                rs.getInt("every_months"),
                rs.getInt("due_day"),
                rs.getBoolean("subscription"),
                PaidHow.read(rs.getString("pays")),
                (Integer) rs.getObject("remind_days"),
                rs.getString("note"),
                rs.getString("pay_url"),
                rs.getString("iban"),
                rs.getString("reference"));
    }

    private static DueRow due(ResultSet rs, int n) throws SQLException {
        return new DueRow(
                rs.getObject("due_id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("due_on", LocalDate.class),
                rs.getLong("amount_cents"),
                Sql.instant(rs, "due_paid_at"),
                rs.getObject("due_paid_by", UUID.class));
    }

    private static Listed listed(ResultSet rs, int n) throws SQLException {
        return new Listed(ThingStore.row(rs, n), bill(rs, n), due(rs, n));
    }

    // ---------- a bill ----------

    public void insert(BillRow bill) {
        jdbc.sql("""
            insert into bills (thing_id, payee, emoji, currency, repeat, every_months, due_day, subscription, pays,
              remind_days, note, pay_url, iban, reference)
            values (:id, :payee, :emoji, :currency, :repeat, :every, :day, :subscription, :pays, :remind, :note, :url,
              :iban, :reference)
            on conflict (thing_id) do nothing
            """)
                .param("id", bill.thingId())
                .param("payee", bill.payee())
                .param("emoji", bill.emoji())
                .param("currency", bill.currency())
                .param("repeat", bill.repeat().code())
                .param("every", bill.everyMonths())
                .param("day", bill.dueDay())
                .param("subscription", bill.subscription())
                .param("pays", bill.pays().code())
                .param("remind", bill.remindDays())
                .param("note", bill.note())
                .param("url", bill.payUrl())
                .param("iban", bill.iban())
                .param("reference", bill.reference())
                .update();
    }

    public void update(BillRow bill) {
        jdbc.sql("""
            update bills set payee = :payee, emoji = :emoji, currency = :currency, repeat = :repeat,
              every_months = :every, due_day = :day, subscription = :subscription, pays = :pays, remind_days = :remind,
              note = :note, pay_url = :url, iban = :iban, reference = :reference
            where thing_id = :id
            """)
                .param("id", bill.thingId())
                .param("payee", bill.payee())
                .param("emoji", bill.emoji())
                .param("currency", bill.currency())
                .param("repeat", bill.repeat().code())
                .param("every", bill.everyMonths())
                .param("day", bill.dueDay())
                .param("subscription", bill.subscription())
                .param("pays", bill.pays().code())
                .param("remind", bill.remindDays())
                .param("note", bill.note())
                .param("url", bill.payUrl())
                .param("iban", bill.iban())
                .param("reference", bill.reference())
                .update();
    }

    public Optional<BillRow> find(UUID thingId) {
        return jdbc.sql("select " + BILL + " from bills b where b.thing_id = :id")
                .param("id", thingId)
                .query(BillStore::bill)
                .optional();
    }

    /** Holds the bill until the transaction ends, so two people marking it paid at the same moment take turns. */
    public void lock(UUID thingId) {
        jdbc.sql("select thing_id from bills where thing_id = :id for update")
                .param("id", thingId)
                .query(UUID.class)
                .optional();
    }

    // ---------- who pays ----------

    /** Who pays these bills, in the order the circle lists its people. */
    public List<ShareRow> shares(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select s.thing_id, s.member_id, s.parts from bill_shares s join members m on m.id = s.member_id
            where s.thing_id in (:ids) order by s.thing_id, m.created_at, m.id
            """)
                .param("ids", thingIds)
                .query((rs, n) -> new ShareRow(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getLong("parts")))
                .list();
    }

    /** Sets who pays a bill and how much of it each. What someone no longer pays is no longer marked as paid by them. */
    public void replaceShares(UUID thingId, Map<UUID, Long> parts) {
        jdbc.sql("delete from bill_shares where thing_id = :id")
                .param("id", thingId)
                .update();
        for (Map.Entry<UUID, Long> share : parts.entrySet()) {
            jdbc.sql("insert into bill_shares (thing_id, member_id, parts) values (:id, :member, :parts)")
                    .param("id", thingId)
                    .param("member", share.getKey())
                    .param("parts", share.getValue())
                    .update();
        }
        jdbc.sql("""
            delete from bill_due_marks k using bill_dues d
            where d.id = k.due_id and d.thing_id = :id and d.paid_at is null
              and not exists (select 1 from bill_shares s where s.thing_id = :id and s.member_id = k.member_id)
            """).param("id", thingId).update();
    }

    // ---------- the times it is due ----------

    public UUID addDue(UUID thingId, LocalDate dueOn, long amountCents) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into bill_dues (id, thing_id, due_on, amount_cents) values (:id, :thing, :on, :amount)")
                .param("id", id)
                .param("thing", thingId)
                .param("on", dueOn)
                .param("amount", amountCents)
                .update();
        return id;
    }

    /** The time a bill is due that hasn't been paid yet. A bill that came once and is paid has none. */
    public Optional<DueRow> open(UUID thingId) {
        return jdbc.sql("select d.thing_id, " + DUE + " from bill_dues d where d.thing_id = :id and d.paid_at is null")
                .param("id", thingId)
                .query(BillStore::due)
                .optional();
    }

    /** The last times a bill was due, the newest first: the open one, then the paid ones. */
    public List<DueRow> latest(UUID thingId, int limit) {
        return jdbc.sql("select d.thing_id, " + DUE + """
             from bill_dues d where d.thing_id = :id order by d.due_on desc, d.id desc limit :limit
            """)
                .param("id", thingId)
                .param("limit", limit)
                .query(BillStore::due)
                .list();
    }

    public void changeDue(UUID dueId, LocalDate dueOn, long amountCents) {
        jdbc.sql("update bill_dues set due_on = :on, amount_cents = :amount where id = :id")
                .param("id", dueId)
                .param("on", dueOn)
                .param("amount", amountCents)
                .update();
    }

    public void close(UUID dueId, UUID paidBy) {
        jdbc.sql("update bill_dues set paid_at = now(), paid_by = :by where id = :id and paid_at is null")
                .param("id", dueId)
                .param("by", paidBy)
                .update();
    }

    public void reopen(UUID dueId) {
        jdbc.sql("update bill_dues set paid_at = null, paid_by = null where id = :id")
                .param("id", dueId)
                .update();
    }

    public void removeDue(UUID dueId) {
        jdbc.sql("delete from bill_dues where id = :id").param("id", dueId).update();
    }

    // ---------- shares that are paid ----------

    public List<MarkRow> marks(List<UUID> dueIds) {
        if (dueIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select due_id, member_id, paid_at, paid_by from bill_due_marks where due_id in (:ids)")
                .param("ids", dueIds)
                .query((rs, n) -> new MarkRow(
                        rs.getObject("due_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        Sql.instant(rs, "paid_at"),
                        rs.getObject("paid_by", UUID.class)))
                .list();
    }

    /** Marks someone's share of one due time as paid. Marking what is marked keeps who marked it first. */
    public void mark(UUID dueId, UUID memberId, UUID paidBy) {
        jdbc.sql("""
            insert into bill_due_marks (due_id, member_id, paid_by) values (:due, :member, :by)
            on conflict (due_id, member_id) do nothing
            """)
                .param("due", dueId)
                .param("member", memberId)
                .param("by", paidBy)
                .update();
    }

    public void unmark(UUID dueId, List<UUID> memberIds) {
        if (memberIds.isEmpty()) {
            return;
        }
        jdbc.sql("delete from bill_due_marks where due_id = :due and member_id in (:members)")
                .param("due", dueId)
                .param("members", memberIds)
                .update();
    }

    // ---------- lists ----------

    private static LocalDate day(Keyset page) {
        try {
            return LocalDate.parse(page.text(0));
        } catch (DateTimeParseException notADay) {
            throw Keyset.badCursor();
        }
    }

    /**
     * The bills of a circle the viewer may see: those still to pay (soonest first), those paid (latest first,
     * one line for each time), or the subscriptions (soonest first).
     */
    public List<Listed> list(UUID circleId, UUID me, BillShow show, Keyset page) {
        boolean paid = show == BillShow.PAID;
        String which = switch (show) {
            case DUE -> "d.paid_at is null";
            case PAID -> "d.paid_at is not null";
            case SUBSCRIPTIONS -> "d.paid_at is null and b.subscription";
        };
        String after = paid
                ? "(d.due_on, d.id) < (cast(:on as date), cast(:id as uuid))"
                : "(d.due_on, d.id) > (cast(:on as date), cast(:id as uuid))";
        String order = paid ? "d.due_on desc, d.id desc" : "d.due_on, d.id";
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + BILL + ", " + DUE + """
             from bill_dues d join bills b on b.thing_id = d.thing_id join things t on t.id = b.thing_id
             where t.circle_id = :circle and\s""" + which
                        + " and (cast(:on as date) is null or " + after + ") and "
                        + Rules.sees("t", ":me") + " order by " + order + " limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("on", page.first() ? null : day(page))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(BillStore::listed)
                .list();
    }

    /** The bills of a circle that are still to pay and due on or before a day, soonest first. */
    public List<Listed> openThrough(UUID circleId, UUID me, LocalDate through, int limit) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + BILL + ", " + DUE + """
             from bill_dues d join bills b on b.thing_id = d.thing_id join things t on t.id = b.thing_id
             where t.circle_id = :circle and d.paid_at is null and d.due_on <= :through and\s"""
                        + Rules.sees("t", ":me") + " order by d.due_on, d.id limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("through", through)
                .param("limit", limit)
                .query(BillStore::listed)
                .list();
    }

    /** These bills with the time each is due now (or was due last, for one that is paid), as far as the viewer may see them. */
    public List<Listed> current(List<UUID> thingIds, UUID me) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + BILL + ", " + DUE + """
             from bills b join things t on t.id = b.thing_id
             join lateral (select * from bill_dues x where x.thing_id = b.thing_id
                           order by (x.paid_at is null) desc, x.due_on desc, x.id desc limit 1) d on true
             where b.thing_id in (:ids) and\s""" + Rules.sees("t", ":me"))
                .param("ids", thingIds)
                .param("me", me)
                .query(BillStore::listed)
                .list();
    }

    /** What the bills due in a stretch of days come to, and how much of that is paid, for each currency. The most bills first. */
    public List<MonthSum> sums(UUID circleId, UUID me, LocalDate from, LocalDate through) {
        return jdbc.sql("""
            select b.currency, coalesce(sum(d.amount_cents), 0) as total,
              coalesce(sum(d.amount_cents) filter (where d.paid_at is not null), 0) as paid, count(*) as bills
            from bill_dues d join bills b on b.thing_id = d.thing_id join things t on t.id = b.thing_id
            where t.circle_id = :circle and d.due_on between :from and :through and\s""" + Rules.sees("t", ":me") + """
             group by b.currency order by count(*) desc, b.currency
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("from", from)
                .param("through", through)
                .query((rs, n) -> new MonthSum(
                        rs.getString("currency"), rs.getLong("total"), rs.getLong("paid"), rs.getInt("bills")))
                .list();
    }

    /** What is still to pay and due on or before a day, in one currency. */
    public long openSum(UUID circleId, UUID me, String currency, LocalDate through) {
        return jdbc.sql("""
            select coalesce(sum(d.amount_cents), 0)
            from bill_dues d join bills b on b.thing_id = d.thing_id join things t on t.id = b.thing_id
            where t.circle_id = :circle and d.paid_at is null and d.due_on <= :through and b.currency = :currency
              and\s""" + Rules.sees("t", ":me"))
                .param("circle", circleId)
                .param("me", me)
                .param("currency", currency)
                .param("through", through)
                .query(Long.class)
                .single();
    }

    /** The subscriptions of a circle the viewer may see, in one currency: what each costs and how it comes round. Five hundred at most. */
    public List<Listed> subscriptions(UUID circleId, UUID me, String currency) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + BILL + ", " + DUE + """
             from bill_dues d join bills b on b.thing_id = d.thing_id join things t on t.id = b.thing_id
             where t.circle_id = :circle and d.paid_at is null and b.subscription and b.currency = :currency
               and\s""" + Rules.sees("t", ":me")
                        + " order by d.due_on, d.id limit 500")
                .param("circle", circleId)
                .param("me", me)
                .param("currency", currency)
                .query(BillStore::listed)
                .list();
    }

    /** The currencies a circle's bills are kept in, as far as the viewer sees them: the most used first. */
    public List<String> currencies(UUID circleId, UUID me) {
        return jdbc.sql("""
            select b.currency from bills b join things t on t.id = b.thing_id
            where t.circle_id = :circle and\s""" + Rules.sees("t", ":me") + """
             group by b.currency order by count(*) desc, b.currency
            """)
                .param("circle", circleId)
                .param("me", me)
                .query(String.class)
                .list();
    }

    /** For each of these things, the places of what it is linked to and the viewer may see: a login in the Vault, an invoice in the Library. */
    public Map<UUID, Set<Place>> linkedPlaces(List<UUID> thingIds, UUID me) {
        Map<UUID, Set<Place>> places = new HashMap<>();
        if (thingIds.isEmpty()) {
            return places;
        }
        jdbc.sql("""
            select l.one, t.place from (
              select from_id as one, to_id as other from thing_links where from_id in (:ids)
              union all select to_id, from_id from thing_links where to_id in (:ids)) l
            join things t on t.id = l.other where\s""" + Rules.sees("t", ":me"))
                .param("ids", thingIds)
                .param("me", me)
                .query((rs, n) -> Map.entry(rs.getObject("one", UUID.class), Place.read(rs.getString("place"))))
                .list()
                .forEach(link -> places.computeIfAbsent(link.getKey(), id -> EnumSet.noneOf(Place.class))
                        .add(link.getValue()));
        return places;
    }

    /** Bills of a circle whose payee, note or reference holds these words. */
    public List<Map.Entry<UUID, String>> search(UUID circleId, String pattern, int limit) {
        return jdbc.sql("""
            select b.thing_id, case when b.payee ilike :pattern then b.payee when b.reference ilike :pattern
                     then b.reference else left(b.note, 90) end as found
            from bills b join things t on t.id = b.thing_id
            where t.circle_id = :circle and (b.payee ilike :pattern or b.note ilike :pattern or b.reference ilike :pattern)
            order by t.updated_at desc limit :limit
            """)
                .param("circle", circleId)
                .param("pattern", pattern)
                .param("limit", limit)
                .query((rs, n) -> Map.entry(rs.getObject("thing_id", UUID.class), rs.getString("found")))
                .list();
    }

    /**
     * Who to remind on a day: for every bill that asked to be reminded this many days before it is due, each
     * person whose share isn't paid yet. A thousand at most.
     */
    public List<Reminder> reminders(LocalDate day) {
        return jdbc.sql("""
            select t.id, t.circle_id, t.title, b.currency, d.amount_cents, d.due_on, s.member_id
            from bill_dues d join bills b on b.thing_id = d.thing_id join things t on t.id = b.thing_id
            join bill_shares s on s.thing_id = b.thing_id
            where d.paid_at is null and b.remind_days is not null and d.due_on - b.remind_days = :day
              and not exists (select 1 from bill_due_marks k where k.due_id = d.id and k.member_id = s.member_id)
            order by t.id, s.member_id limit 1000
            """)
                .param("day", day)
                .query((rs, n) -> new Reminder(
                        rs.getObject("id", UUID.class),
                        rs.getObject("circle_id", UUID.class),
                        rs.getString("title"),
                        rs.getString("currency"),
                        rs.getLong("amount_cents"),
                        rs.getObject("due_on", LocalDate.class),
                        rs.getObject("member_id", UUID.class)))
                .list();
    }
}
