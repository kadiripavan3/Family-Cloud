package app.homeport.api.money;

import app.homeport.api.common.Rules;
import app.homeport.api.digest.DigestSource;
import app.homeport.api.money.BillStore.Listed;
import app.homeport.api.thing.ThingKind;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Money's part of the Sunday summary: how many bills were paid this week, and the bills that are due next
 * week ("Electricity, €84.20 · Due Thursday"). Only bills this person may see.
 */
@Component
class MoneyDigest implements DigestSource {

    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH);

    private final BillStore bills;
    private final JdbcClient jdbc;

    MoneyDigest(BillStore bills, JdbcClient jdbc) {
        this.bills = bills;
        this.jdbc = jdbc;
    }

    @Override
    public Part week(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        int paid = jdbc.sql("""
            select count(*) from bill_dues d join things t on t.id = d.thing_id
            where t.circle_id = :circle and d.paid_at >= :from and d.paid_at < :until and\s""" + Rules.sees("t", ":me"))
                .param("circle", circleId)
                .param("me", me)
                .param("from", Timestamp.from(from.atStartOfDay().toInstant(ZoneOffset.UTC)))
                .param("until", Timestamp.from(to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)))
                .query(Integer.class)
                .single();
        List<Row> next = bills.openThrough(circleId, me, to.plusDays(7), 50).stream()
                .filter(bill -> bill.due().dueOn().isAfter(to))
                .limit(4)
                .map(MoneyDigest::row)
                .toList();
        return Part.of(
                paid == 0
                        ? List.of()
                        : List.of(new Stat(String.valueOf(paid), paid == 1 ? "bill paid" : "bills paid", 30)),
                null,
                next);
    }

    private static Row row(Listed bill) {
        return new Row(
                bill.thing().id(),
                ThingKind.BILL,
                bill.bill().emoji().isBlank() ? "🧾" : bill.bill().emoji(),
                null,
                bill.thing().title() + ", "
                        + Cash.exact(bill.due().amountCents(), bill.bill().currency()),
                "Due " + WEEKDAY.format(bill.due().dueOn()),
                bill.due().dueOn());
    }
}
