package app.homeport.api.money;

import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.money.BillService.BillRowResponse;
import app.homeport.api.money.BillStore.Listed;
import app.homeport.api.plan.PlanSource;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * What bills bring to the rest: the ones due today or tomorrow (and any that are overdue) on Today, each bill
 * that is still to pay on its day in the calendar, a search inside who they are paid to, and
 * "€84 · due Thu 12 Nov" wherever a bill is listed among other things.
 */
@Component
class BillSources implements TodaySource, PlanSource, SearchSource, GlanceSource {

    /** What the button next to a bill says, when there is something for the viewer to do about it. */
    static final String PAY = "Pay";

    static final DateTimeFormatter SHORT_DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final BillStore bills;
    private final BillService service;

    // ThingService asks every GlanceSource, and BillService asks ThingService: lazily, so either can be made first.
    BillSources(BillStore bills, @Lazy BillService service) {
        this.bills = bills;
        this.service = service;
    }

    @Override
    public List<TodayItem> today(UUID me, UUID circleId, LocalDate day) {
        List<Listed> due = bills.openThrough(circleId, me, day.plusDays(1), 20);
        return service.views(circleId, due, me).stream()
                // Your own share is paid: nothing left for you to do about it today.
                .filter(bill -> !bill.mySharePaid())
                .map(bill -> new TodayItem(
                        bill.id(),
                        ThingKind.BILL,
                        bill.title(),
                        when(bill.dueOn(), day) + how(bill),
                        Cash.round(bill.amountCents(), bill.currency()),
                        null,
                        1440,
                        bill.splitWith().stream()
                                .map(PersonBrief::avatarUrl)
                                .filter(Objects::nonNull)
                                .limit(2)
                                .toList(),
                        false,
                        bill.dueOn(),
                        action(bill),
                        bill.repeat() != Repeat.ONCE))
                .toList();
    }

    /**
     * The calendar: every bill that is still to pay, on the day it is due, with its amount in front. A bill
     * that is paid is no longer on its day, and one that comes round again is there when it is next due.
     */
    @Override
    public List<Dated> between(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        List<Listed> due = bills.openBetween(circleId, me, from, to);
        // Whose each bill is (for its dot), and who has paid their share of it already. A bill has one time
        // that is still to pay, so a paid share can be kept by the bill.
        Map<UUID, List<UUID>> payers = new HashMap<>();
        bills.shares(due.stream().map(listed -> listed.thing().id()).distinct().toList())
                .forEach(share -> payers.computeIfAbsent(share.thingId(), id -> new ArrayList<>())
                        .add(share.memberId()));
        Map<UUID, UUID> billOfDue = new HashMap<>();
        due.forEach(listed -> billOfDue.put(listed.due().id(), listed.thing().id()));
        Map<UUID, Set<UUID>> paid = new HashMap<>();
        bills.marks(List.copyOf(billOfDue.keySet()))
                .forEach(mark -> paid.computeIfAbsent(billOfDue.get(mark.dueId()), id -> new HashSet<>())
                        .add(mark.memberId()));
        return service.views(circleId, due, me).stream()
                .map(bill -> new Dated(
                        bill.dueOn(),
                        new TodayItem(
                                bill.id(),
                                ThingKind.BILL,
                                bill.title() + " is due",
                                calendarNote(bill, paid.getOrDefault(bill.id(), Set.of())),
                                Cash.round(bill.amountCents(), bill.currency()),
                                null,
                                // Like something that takes all day: before the day's times.
                                0,
                                List.of(),
                                false,
                                bill.dueOn(),
                                action(bill),
                                bill.repeat() != Repeat.ONCE),
                        payers.getOrDefault(bill.id(), List.of())))
                .toList();
    }

    /** "Pay", for a bill someone pays by hand, when the viewer may mark it paid and hasn't paid their own share. */
    private static String action(BillRowResponse bill) {
        return bill.pays() == PaidHow.BY_HAND && bill.canEdit() && !bill.paid() && !bill.mySharePaid() ? PAY : null;
    }

    /** The line under a bill in the calendar: "Split with Alex · Alex has paid", "Standing order". Whoever has paid is named. */
    private static String calendarNote(BillRowResponse bill, Set<UUID> paidBy) {
        if (bill.splitWith().isEmpty()) {
            return switch (bill.pays()) {
                case BY_HAND -> "";
                case STANDING_ORDER -> "Standing order";
                case DIRECT_DEBIT -> "Direct debit";
            };
        }
        String with = "Split with "
                + MoneyPeople.names(
                        bill.splitWith().stream().map(PersonBrief::name).toList());
        List<String> paid = new ArrayList<>();
        if (bill.mySharePaid()) {
            paid.add("you");
        }
        bill.splitWith().stream()
                .filter(other -> paidBy.contains(other.memberId()))
                .map(PersonBrief::name)
                .forEach(paid::add);
        if (paid.isEmpty()) {
            return with;
        }
        return with + " · " + MoneyPeople.names(paid)
                + (paid.size() == 1 && !bill.mySharePaid() ? " has paid" : " have paid");
    }

    private static String when(LocalDate dueOn, LocalDate day) {
        if (dueOn.equals(day)) {
            return "Due today";
        }
        return dueOn.equals(day.plusDays(1)) ? "Due tomorrow" : "Was due " + SHORT_DAY.format(dueOn);
    }

    /** What follows the day: who it is split with, or that the bank pays it by itself. */
    private static String how(BillRowResponse bill) {
        if (!bill.splitWith().isEmpty()) {
            return " · split with "
                    + MoneyPeople.names(
                            bill.splitWith().stream().map(PersonBrief::name).toList());
        }
        return switch (bill.pays()) {
            case BY_HAND -> "";
            case STANDING_ORDER -> " · standing order";
            case DIRECT_DEBIT -> " · direct debit";
        };
    }

    @Override
    public Place place() {
        return Place.MONEY;
    }

    @Override
    public List<Found> find(UUID me, UUID circleId, String words, int limit) {
        return bills.search(circleId, me, Sql.anywhere(words), limit).stream()
                .map(found -> new Found(found.getKey(), found.getValue()))
                .toList();
    }

    @Override
    public ThingKind kind() {
        return ThingKind.BILL;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        Map<UUID, String> glances = new HashMap<>();
        for (Listed bill : bills.current(thingIds, me)) {
            String amount = Cash.round(bill.due().amountCents(), bill.bill().currency());
            glances.put(
                    bill.thing().id(),
                    bill.due().paidAt() != null
                            ? amount + " · paid"
                            : amount + " · due " + SHORT_DAY.format(bill.due().dueOn()));
        }
        return glances;
    }
}
