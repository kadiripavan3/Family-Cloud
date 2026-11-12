package app.homeport.api.money;

import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.money.BillService.BillRowResponse;
import app.homeport.api.money.BillStore.Listed;
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
import java.util.UUID;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * What bills bring to the rest: the ones due today or tomorrow (and any that are overdue) on Today, a search
 * inside who they are paid to, and "€84 · due Thu 12 Nov" wherever a bill is listed among other things.
 */
@Component
class BillSources implements TodaySource, SearchSource, GlanceSource {

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
                                .toList()))
                .toList();
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
    public List<Found> find(UUID circleId, String words, int limit) {
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
