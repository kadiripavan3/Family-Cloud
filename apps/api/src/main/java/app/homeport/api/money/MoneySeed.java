package app.homeport.api.money;

import app.homeport.api.money.BillStore.BillRow;
import app.homeport.api.money.sheet.ColumnKind;
import app.homeport.api.money.sheet.SheetService;
import app.homeport.api.money.sheet.SheetStore;
import app.homeport.api.money.sheet.SheetTemplate;
import app.homeport.api.money.sheet.SheetTemplate.ColumnDef;
import app.homeport.api.money.sheet.SheetTemplate.RowDef;
import app.homeport.api.money.sheet.SheetTemplate.TabDef;
import app.homeport.api.money.sheet.SheetTemplate.TileDef;
import app.homeport.api.money.sheet.Summary;
import app.homeport.api.money.split.ShareMode;
import app.homeport.api.money.split.SplitStore;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Month;
import java.time.MonthDay;
import java.time.format.TextStyle;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Money's sample data, as the screens draw it: the Linds' bills and subscriptions (the electricity due
 * tomorrow and split with Alex), their sheets (the Norway budget, a budget with a tab for each month, the
 * party budget at €180 of €250, a loan plan), and the Lisbon crew's weekend, where Nora is owed €64.
 * Every date is counted from the day it runs.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class MoneySeed implements Seeder {

    private final BillStore bills;
    private final SheetStore sheets;
    private final SheetService sheetService;
    private final SplitStore splits;

    MoneySeed(BillStore bills, SheetStore sheets, SheetService sheetService, SplitStore splits) {
        this.bills = bills;
        this.sheets = sheets;
        this.sheetService = sheetService;
        this.splits = splits;
    }

    @Override
    public int order() {
        return 40;
    }

    @Override
    public void seed(SeedWorld w) {
        LocalDate today = LocalDate.now();
        lindsBills(w, today);
        lindsSheets(w, today);
        lindsShopping(w, today);
        lisbonWeekend(w, today);
    }

    // ---------- the Linds' bills ----------

    private void lindsBills(SeedWorld w, LocalDate today) {
        LocalDate tomorrow = today.plusDays(1);
        LocalDate monday = today.with(TemporalAdjusters.next(DayOfWeek.MONDAY));

        // Electricity: due tomorrow, split with Alex, who has paid his half. Six months of history.
        UUID electricity = bill(
                w,
                "nora",
                "Electricity",
                "Elektro Ljubljana",
                "⚡",
                tomorrow,
                Repeat.MONTHLY,
                false,
                PaidHow.BY_HAND,
                2,
                "SI56 2633 0001 2039 086",
                "SI12 3456 7890 1184",
                "",
                List.of("nora", "alex"));
        long[] before = {5230, 4890, 5510, 6080, 7800};
        for (int i = 0; i < before.length; i++) {
            paid(w, electricity, tomorrow.minusMonths(before.length - i), before[i], "nora");
        }
        UUID due = bills.addDue(electricity, tomorrow, 8420);
        bills.mark(due, w.member("linds", "alex"), w.member("linds", "alex"));

        // Rent: next Monday, by standing order.
        UUID rent = bill(
                w,
                "nora",
                "Rent",
                "Mr Novak",
                "🏠",
                monday,
                Repeat.MONTHLY,
                false,
                PaidHow.STANDING_ORDER,
                null,
                "",
                "",
                "The standing order goes out by itself. Nothing to do unless the rent changes.",
                List.of("nora"));
        paid(w, rent, monday.minusMonths(1), 98000, "nora");
        bills.addDue(rent, monday, 98000);

        // Netflix: the Friday after, taken from the card.
        UUID netflix = bill(
                w,
                "nora",
                "Netflix",
                "Netflix",
                "📺",
                monday.plusDays(4),
                Repeat.MONTHLY,
                true,
                PaidHow.DIRECT_DEBIT,
                null,
                "",
                "",
                "",
                List.of("nora"));
        paid(w, netflix, monday.plusDays(4).minusMonths(1), 1399, "nora");
        bills.addDue(netflix, monday.plusDays(4), 1399);

        // Paid already this month, due again next month. Together they are the €1,240 the month's card shows as paid.
        Object[][] paidThisMonth = {
            {"After-school care", "OŠ Vič", "🎒", 38000L, 1, false, "nora"},
            {"Car loan", "Banka Koper", "🚗", 28900L, 2, false, "alex"},
            {"Heating", "Energetika Ljubljana", "🔥", 10100L, 3, false, "nora"},
            {"Health insurance", "Vzajemna", "🛡️", 9650L, 3, false, "nora"},
            {"Car insurance", "Zavarovalnica Triglav", "🚗", 6150L, 4, false, "alex"},
            {"Phones", "A1", "📱", 5460L, 5, false, "nora"},
            {"Swimming course", "Plavalni klub Ljubljana", "🏊", 5200L, 5, false, "nora"},
            {"Football club", "NK Svoboda", "⚽", 4000L, 6, false, "alex"},
            {"Internet", "T-2", "🌐", 3990L, 7, false, "nora"},
            {"Water", "VOKA Snaga", "💧", 3140L, 8, false, "nora"},
            {"Waste collection", "VOKA Snaga", "🗑️", 2213L, 8, false, "nora"},
            {"Spotify Family", "Spotify", "🎵", 1799L, 2, true, "nora"},
            {"iCloud+", "Apple", "☁️", 299L, 4, true, "nora"},
            {"Gym", "Fitnes Vič", "🏋️", 4500L, 1, true, "alex"},
            {"Newspaper", "Delo", "📰", 599L, 6, true, "nora"},
        };
        for (Object[] one : paidThisMonth) {
            // On its day of this month, or today when the month is younger than that.
            LocalDate was = today.withDayOfMonth(Math.min((Integer) one[4], today.getDayOfMonth()));
            String payer = (String) one[6];
            UUID id = bill(
                    w,
                    payer,
                    (String) one[0],
                    (String) one[1],
                    (String) one[2],
                    was,
                    Repeat.MONTHLY,
                    (Boolean) one[5],
                    (Boolean) one[5] ? PaidHow.DIRECT_DEBIT : PaidHow.BY_HAND,
                    null,
                    "",
                    "",
                    "",
                    List.of(payer));
            paid(w, id, was, (Long) one[3], payer);
            bills.addDue(id, was.plusMonths(1), (Long) one[3]);
        }
    }

    private UUID bill(
            SeedWorld w,
            String owner,
            String title,
            String payee,
            String emoji,
            LocalDate dueOn,
            Repeat repeat,
            boolean subscription,
            PaidHow pays,
            Integer remindDays,
            String iban,
            String reference,
            String note,
            List<String> payers) {
        UUID id = thing(w, "linds", owner, "bill", title, "circle", 0);
        bills.insert(new BillRow(
                id,
                payee,
                emoji,
                Cash.EUR,
                repeat,
                1,
                dueOn.getDayOfMonth(),
                subscription,
                pays,
                remindDays,
                note,
                null,
                iban,
                reference));
        Map<UUID, Long> parts = new LinkedHashMap<>();
        payers.forEach(payer -> parts.put(w.member("linds", payer), 1L));
        bills.replaceShares(id, parts);
        return id;
    }

    /** A time the bill was due and paid. */
    private static void paid(SeedWorld w, UUID bill, LocalDate dueOn, long cents, String by) {
        w.jdbc()
                .sql("""
            insert into bill_dues (id, thing_id, due_on, amount_cents, paid_at, paid_by)
            values (:id, :bill, :on, :cents, least(cast(:on as date) + interval '9 hours', now()), :by)
            """)
                .param("id", UUID.randomUUID())
                .param("bill", bill)
                .param("on", dueOn)
                .param("cents", cents)
                .param("by", w.member("linds", by))
                .update();
    }

    /** A thing of Money's, made as the sample data makes them: straight into the table, changed some days ago. */
    private static UUID thing(
            SeedWorld w, String circle, String owner, String kind, String title, String audience, int daysAgo) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into things (id, circle_id, owner_id, kind, place, title, audience, created_at, updated_at)
            values (:id, :circle, :owner, :kind, 'money', :title, :audience, now() - make_interval(days => :ago + 20),
              now() - make_interval(days => :ago))
            """)
                .param("id", id)
                .param("circle", w.circle(circle))
                .param("owner", w.member(circle, owner))
                .param("kind", kind)
                .param("title", title)
                .param("audience", audience)
                .param("ago", daysAgo)
                .update();
        return id;
    }

    private static void shareWith(SeedWorld w, UUID thing, String circle, String member) {
        w.jdbc()
                .sql("insert into thing_shares (thing_id, member_id, can_edit) values (:thing, :member, true)")
                .param("thing", thing)
                .param("member", w.member(circle, member))
                .update();
    }

    // ---------- the Linds' sheets ----------

    private void lindsSheets(SeedWorld w, LocalDate today) {
        UUID nora = w.member("linds", "nora");
        UUID alex = w.member("linds", "alex");
        UUID mia = w.member("linds", "mia");
        UUID leo = w.member("linds", "leo");
        LocalDate monthStart = today.withDayOfMonth(1);

        // Norway budget: three tabs, changed by Alex today. Its "Saved" tile is what the Norway goal reads.
        UUID norway = sheet(w, "nora", "Norway budget", "circle", SheetTemplate.TRIP_BUDGET, "alex", 0);
        LocalDate nextJanuary = next(MonthDay.of(1, 15), today);
        LocalDate july = next(MonthDay.of(7, 11), today);
        List<UUID> tabs = sheetService.build(
                norway,
                List.of(
                        new TabDef(
                                "Budget",
                                List.of(
                                        ColumnDef.of("Item", ColumnKind.TEXT),
                                        ColumnDef.of("Who", ColumnKind.PERSON),
                                        ColumnDef.of("Cost", ColumnKind.MONEY, Summary.SUM),
                                        ColumnDef.of("Paid", ColumnKind.TICK, Summary.TICKED),
                                        ColumnDef.of("Due", ColumnKind.DATE)),
                                List.of(
                                        new TileDef("Planned", "SUM([Cost])", null),
                                        new TileDef("Paid", "SUMIF([Paid], [Cost])", "Planned"),
                                        new TileDef("Still to pay", "SUM([Cost]) - SUMIF([Paid], [Cost])", null)),
                                List.of(
                                        RowDef.of("Flights", List.of(alex), units(1480), true, null),
                                        RowDef.of("Rail passes", List.of(nora), units(1020), true, null),
                                        new RowDef(
                                                java.util.Arrays.asList(
                                                        "Cabins, 9 nights",
                                                        List.of(alex),
                                                        units(2350),
                                                        false,
                                                        nextJanuary),
                                                "€470 deposit paid on 2 Nov. The rest is due six weeks before we go."),
                                        RowDef.of("Ferries", List.of(nora), units(640), false, null),
                                        RowDef.of("Food", List.of(nora, alex), units(1400), false, null),
                                        RowDef.of("Fun money", List.of(mia, leo), units(750), false, null))),
                        new TabDef(
                                "Day by day",
                                List.of(
                                        ColumnDef.of("Day", ColumnKind.DATE),
                                        ColumnDef.of("Plan", ColumnKind.TEXT, Summary.COUNT),
                                        ColumnDef.of("Cost", ColumnKind.MONEY, Summary.SUM)),
                                List.of(
                                        new TileDef("Days", "COUNT([Plan])", null),
                                        new TileDef("Planned", "SUM([Cost])", null)),
                                List.of(
                                        RowDef.of(july, "Fly to Bergen, the fish market", units(90)),
                                        RowDef.of(
                                                july.plusDays(1),
                                                "The Bergen railway to Myrdal, then Flåm",
                                                units(160)),
                                        RowDef.of(july.plusDays(2), "Kayaks on the fjord", units(140)),
                                        RowDef.of(july.plusDays(3), "Ferry to Balestrand", units(85)),
                                        RowDef.of(july.plusDays(4), "A day with nothing in it", null))),
                        SheetTemplate.savings(
                                8000,
                                List.of(
                                        RowDef.of(
                                                monthStart.minusMonths(5),
                                                List.of(nora),
                                                units(2000),
                                                "From the old holiday account"),
                                        RowDef.of(monthStart.minusMonths(5), List.of(alex), units(2000), ""),
                                        RowDef.of(monthStart.minusMonths(3), List.of(nora), units(400), ""),
                                        RowDef.of(monthStart.minusMonths(2), List.of(alex), units(400), ""),
                                        RowDef.of(
                                                monthStart.minusMonths(1),
                                                List.of(nora),
                                                units(345),
                                                "Sold the old bike"),
                                        RowDef.of(monthStart.minusMonths(1), List.of(alex), units(300), ""),
                                        RowDef.of(
                                                monthStart.minusDays(2),
                                                List.of(mia),
                                                units(5),
                                                "From her pocket money"),
                                        RowDef.of(monthStart, List.of(alex), units(150), "Payday")))),
                nora);
        // The receipt on the cabins' row.
        UUID receipt = w.photo("nora", "coffee-receipt.jpg");
        if (receipt != null) {
            UUID cabins = sheets.rows(tabs.get(0)).get(2).id();
            sheets.addPaper(cabins, receipt, nora, null);
        }

        // A budget with a tab for each month, shared with Alex.
        UUID budget = sheet(w, "nora", "Budget " + today.getYear(), "some", SheetTemplate.MONTHLY_BUDGET, "nora", 1);
        shareWith(w, budget, "linds", "alex");
        List<TabDef> months = new ArrayList<>();
        for (Month month : Month.values()) {
            months.add(SheetTemplate.monthlyBudget(
                    month.getDisplayName(TextStyle.SHORT, Locale.ENGLISH), month.getValue() <= today.getMonthValue()));
        }
        sheetService.build(budget, months, nora);

        // Mia's party: €180 planned of the €250 set aside. Linked to the page about her birthday.
        UUID party = sheet(w, "nora", "Party budget", "circle", SheetTemplate.PARTY_BUDGET, "nora", 2);
        sheetService.build(
                party,
                List.of(SheetTemplate.partyBudget(
                        250,
                        List.of(
                                RowDef.of("Cake", units(38), 1, true),
                                RowDef.of("Pizza for eight", 650L, 8, false),
                                RowDef.of("Juice and snacks", units(21), 1, false),
                                RowDef.of("Party bags", 450L, 8, false),
                                RowDef.of("Balloons and bunting", units(15), 1, true),
                                RowDef.of("Candles and paper plates", units(9), 2, false)))),
                nora);
        w.jdbc()
                .sql("""
            insert into thing_links (from_id, to_id)
            select t.id, :party from things t
            where t.circle_id = :circle and t.kind = 'page' and t.title = 'Mia''s 10th birthday'
            """)
                .param("party", party)
                .param("circle", w.circle("linds"))
                .update();
        w.jdbc()
                .sql("insert into thing_hides (thing_id, member_id, through) values (:thing, :member, :through)")
                .param("thing", party)
                .param("member", mia)
                .param("through", next(MonthDay.of(12, 4), today))
                .update();

        // The loan planner's own example, kept as a sheet.
        UUID loan = sheet(w, "nora", "Loan plan", "some", SheetTemplate.LOAN, "nora", 6);
        shareWith(w, loan, "linds", "alex");
        sheetService.build(loan, List.of(SheetTemplate.loan(24_000_000, new BigDecimal("3.4"), 25, 0)), nora);

        // Alex's renovation budget, for the whole family to see.
        UUID renovation = sheet(w, "alex", "Renovation budget", "circle", null, "alex", 9);
        sheetService.build(
                renovation,
                List.of(new TabDef(
                        "Budget",
                        List.of(
                                ColumnDef.of("Item", ColumnKind.TEXT),
                                ColumnDef.of("Cost", ColumnKind.MONEY, Summary.SUM),
                                ColumnDef.of("Paid", ColumnKind.TICK, Summary.TICKED)),
                        List.of(
                                new TileDef("Planned", "SUM([Cost])", null),
                                new TileDef("Paid", "SUMIF([Paid], [Cost])", "Planned")),
                        List.of(
                                RowDef.of("Kitchen", units(6200), false),
                                RowDef.of("Bathroom", units(3900), false),
                                RowDef.of("Floors", units(1500), true),
                                RowDef.of("Painting", units(800), true)))),
                alex);
    }

    private static Long units(long whole) {
        return SheetTemplate.units(whole);
    }

    private UUID sheet(
            SeedWorld w,
            String owner,
            String title,
            String audience,
            SheetTemplate template,
            String editedBy,
            int daysAgo) {
        UUID id = thing(w, "linds", owner, "sheet", title, audience, daysAgo);
        sheets.insert(id, Cash.EUR, template == null ? "" : template.code(), w.member("linds", editedBy));
        return id;
    }

    /** The next time this day of the year comes round (today counts). */
    private static LocalDate next(MonthDay day, LocalDate today) {
        LocalDate thisYear = day.atYear(today.getYear());
        return thisYear.isBefore(today) ? day.atYear(today.getYear() + 1) : thisYear;
    }

    // ---------- the Linds' shared shopping ----------

    /** Nora paid for the big shop and shares it with Alex: he owes her €42. */
    private void lindsShopping(SeedWorld w, LocalDate today) {
        UUID id = thing(w, "linds", "nora", "split", "Between us", "some", 3);
        shareWith(w, id, "linds", "alex");
        splits.insert(id, Cash.EUR);
        expense(w, id, "linds", "Big shop for the party", "🛒", 8400, "nora", today.minusDays(3), 0, "nora", "alex");
    }

    // ---------- Lisbon crew ----------

    /**
     * A weekend in Lisbon: 14 expenses, €1,236 in all. Nora, Lea and Ana have paid Lena most of their share of
     * the flat. What is left settles in three payments: Lea pays Nora €44, Kai pays Nora €20, Lena pays Ana
     * €31. So Nora is owed €64.
     */
    private void lisbonWeekend(SeedWorld w, LocalDate today) {
        UUID id = thing(w, "crew", "lea", "split", "Lisbon weekend", "circle", 4);
        splits.insert(id, Cash.EUR);
        LocalDate sunday =
                today.with(TemporalAdjusters.previous(DayOfWeek.SUNDAY)).minusWeeks(1);
        LocalDate saturday = sunday.minusDays(1);
        LocalDate friday = sunday.minusDays(2);
        String[] all = {"lea", "nora", "kai", "lena", "ana"};
        int n = 0;
        expense(w, id, "crew", "Groceries for the flat", "🛒", 6250, "ana", friday, n++, all);
        expense(w, id, "crew", "Tram passes for everyone", "🚋", 3810, "lea", friday, n++, all);
        expense(w, id, "crew", "Pastéis de Belém", "🥐", 1800, "nora", friday, n++, all);
        expense(w, id, "crew", "Wine for the rooftop", "🍷", 1660, "kai", friday, n++, all);
        expense(w, id, "crew", "Breakfast at the bakery", "☕", 2360, "nora", saturday, n++, all);
        expense(w, id, "crew", "Lunch at the Time Out Market", "🍜", 4260, "ana", saturday, n++, all);
        expense(w, id, "crew", "Fado night tickets", "🎶", 4500, "ana", saturday, n++, "ana", "nora", "lena");
        expense(
                w,
                id,
                "crew",
                "Ride back from Bairro Alto",
                "🚕",
                1400,
                "lea",
                saturday,
                n++,
                "lea",
                "nora",
                "kai",
                "ana");
        expense(w, id, "crew", "Sunscreen and water", "🧴", 950, "nora", sunday, n++, all);
        expense(w, id, "crew", "Coffee at the viewpoint", "☕", 1150, "kai", sunday, n++, all);
        expense(w, id, "crew", "Plasters and the pharmacy", "🩹", 2460, "lena", sunday, n++, all);
        expense(w, id, "crew", "Flat, 3 nights", "🏠", 72000, "lena", sunday, n++, all);
        expense(w, id, "crew", "Airport taxi", "🚕", 2400, "nora", sunday, n++, "nora", "lea");
        expense(w, id, "crew", "Dinner at Ramiro", "🍽️", 18600, "kai", sunday, n, all);
        UUID lena = w.member("crew", "lena");
        splits.addPayment(
                id, w.member("crew", "nora"), lena, 25000, sunday.plusDays(2), w.member("crew", "nora"), null);
        splits.addPayment(id, w.member("crew", "lea"), lena, 15000, sunday.plusDays(3), w.member("crew", "lea"), null);
        splits.addPayment(id, w.member("crew", "ana"), lena, 13000, sunday.plusDays(4), lena, null);
    }

    /** An expense shared equally. {@code order} keeps the ones of the same day in the order they were added. */
    private void expense(
            SeedWorld w,
            UUID split,
            String circle,
            String title,
            String emoji,
            long cents,
            String paidBy,
            LocalDate on,
            int order,
            String... sharers) {
        UUID payer = w.member(circle, paidBy);
        UUID id = splits.addExpense(split, title, emoji, cents, payer, ShareMode.EQUAL, on, payer, null);
        Map<UUID, Long> weights = new LinkedHashMap<>();
        for (String sharer : sharers) {
            weights.put(w.member(circle, sharer), 1L);
        }
        splits.setShares(id, weights);
        w.jdbc()
                .sql(
                        "update split_expenses set created_at = cast(:on as date) + make_interval(hours => 9, mins => :order) where id = :id")
                .param("id", id)
                .param("on", on)
                .param("order", order)
                .update();
    }
}
