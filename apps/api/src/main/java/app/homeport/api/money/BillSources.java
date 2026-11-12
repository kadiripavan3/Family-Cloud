package app.homeport.api.money;

import app.homeport.api.activity.LineLooks;
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
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * What bills bring to the rest: the ones due today or tomorrow (and any that are overdue) on Today, a search
 * inside who they are paid to, and "€84 · due Thu 12 Nov" wherever a bill is listed among other things.
 */
@Component
class BillSources implements TodaySource, SearchSource, GlanceSource, PlanSource, LineLooks {

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
                                        .toList())
                        // A bill the bank pays by itself has nothing to tap; the others can be marked paid from the
                        // row.
                        .with(
                                bill.pays() == PaidHow.BY_HAND ? new TodayAction("Pay", "pay") : null,
                                bill.repeat() != Repeat.ONCE,
                                new TodayDue(
                                        bill.dueOn(), Cash.exact(bill.amountCents(), bill.currency()), share(bill))))
                .toList();
    }

    /** "Your half is €42.10" for a bill that is split; otherwise how it is paid, or nothing more to say. */
    private static String share(BillRowResponse bill) {
        if (bill.myShareCents() != null && !bill.splitWith().isEmpty()) {
            boolean half = bill.splitWith().size() == 1 && bill.myShareCents() * 2 == bill.amountCents();
            return (half ? "Your half is " : "Your share is ") + Cash.exact(bill.myShareCents(), bill.currency());
        }
        return switch (bill.pays()) {
            case BY_HAND -> bill.payee();
            case STANDING_ORDER -> "Standing order";
            case DIRECT_DEBIT -> "Direct debit";
        };
    }

    /** A bill that is still to pay stands in the calendar on the day it is due, with the dots of whoever pays a share. */
    @Override
    public List<Dated> between(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        List<Listed> due = bills.openThrough(circleId, me, to, 200).stream()
                .filter(bill -> !bill.due().dueOn().isBefore(from))
                .toList();
        Map<UUID, List<UUID>> payers = bills
                .shares(due.stream().map(bill -> bill.thing().id()).toList())
                .stream()
                .collect(Collectors.groupingBy(
                        BillStore.ShareRow::thingId,
                        Collectors.mapping(BillStore.ShareRow::memberId, Collectors.toList())));
        return service.views(circleId, due, me).stream()
                .map(bill -> new Dated(
                        bill.dueOn(),
                        new TodayItem(
                                        bill.id(),
                                        ThingKind.BILL,
                                        bill.title(),
                                        "Bill due" + how(bill),
                                        Cash.round(bill.amountCents(), bill.currency()),
                                        null,
                                        1440,
                                        bill.splitWith().stream()
                                                .map(PersonBrief::avatarUrl)
                                                .filter(Objects::nonNull)
                                                .limit(2)
                                                .toList())
                                .with(
                                        null,
                                        bill.repeat() != Repeat.ONCE,
                                        new TodayDue(
                                                bill.dueOn(),
                                                Cash.exact(bill.amountCents(), bill.currency()),
                                                share(bill))),
                        payers.getOrDefault(bill.id(), List.of())))
                .toList();
    }

    /** A bill is drawn with its own emoji where nobody's face stands in front. */
    @Override
    public Set<ThingKind> kinds() {
        return Set.of(ThingKind.BILL);
    }

    @Override
    public Map<UUID, Look> looks(List<UUID> thingIds, UUID me) {
        Map<UUID, Look> looks = new HashMap<>();
        for (Listed bill : bills.current(thingIds, me)) {
            if (!bill.bill().emoji().isBlank()) {
                looks.put(bill.thing().id(), new Look(bill.bill().emoji(), null));
            }
        }
        return looks;
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
    public List<Found> find(UUID circleId, UUID me, String words, int limit) {
        return bills.search(circleId, Sql.anywhere(words), limit).stream()
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
