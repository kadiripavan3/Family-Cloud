package app.homeport.api.money;

import app.homeport.api.common.Keyset;
import app.homeport.api.money.BillService.BillRowResponse;
import app.homeport.api.money.BillStore.Listed;
import app.homeport.api.money.BillStore.MonthSum;
import app.homeport.api.money.sheet.SheetService;
import app.homeport.api.money.sheet.SheetService.SheetBriefResponse;
import app.homeport.api.money.split.SplitService;
import app.homeport.api.money.split.SplitService.OwingResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Money's first page: the month in one card, what is due soon, the sheets, and who owes whom in short. It
 * gathers what bills, sheets and splits each know; it keeps nothing itself.
 */
@Service
public class MoneyService {

    static final int DUE_SOON = 5;
    static final int SHEETS = 6;
    static final int OWING = 5;

    public record MoneyResponse(
            LocalDate day,

            @Schema(description = "The currency the sums are in: the one most of the circle's bills are kept in")
            String currency,

            @Schema(description = "Other currencies there are bills in. Those bills are in the lists, not in the sums.")
            List<String> otherCurrencies,

            @Schema(description = "The first day of the month the card is about")
            LocalDate monthStart,

            @Schema(description = "Everything due in that month, paid or not, in cents")
            long monthTotalCents,

            @Schema(description = "How much of it is paid, in cents")
            long monthPaidCents,

            @Schema(
                    description =
                            "Still to pay and due by the end of this week (Sunday), overdue ones included, in cents")
            long dueThisWeekCents,

            @Schema(description = "What the subscriptions come to in a month, in cents")
            long subscriptionsMonthCents,

            @Schema(description = "What the subscriptions come to in a year, in cents")
            long subscriptionsYearCents,

            @Schema(description = "How many subscriptions there are")
            int subscriptions,

            @Schema(
                    description =
                            "Who owes you (above zero) and whom you owe (below zero), from the circle's splits. The five largest.")
            List<OwingResponse> owing,

            @Schema(description = "The five bills due soonest that aren't paid")
            List<BillRowResponse> dueSoon,

            @Schema(description = "The six sheets changed last")
            List<SheetBriefResponse> sheets) {}

    private final BillStore bills;
    private final BillService billService;
    private final SheetService sheets;
    private final SplitService splits;

    MoneyService(BillStore bills, BillService billService, SheetService sheets, SplitService splits) {
        this.bills = bills;
        this.billService = billService;
        this.sheets = sheets;
        this.splits = splits;
    }

    /** Money's first page for one person in one circle. Everything in it is what that person may see. */
    public MoneyResponse home(UUID circleId, UUID me, LocalDate day) {
        LocalDate today = day == null ? LocalDate.now() : day;
        LocalDate monthStart = today.withDayOfMonth(1);
        List<String> currencies = bills.currencies(circleId, me);
        String currency = currencies.isEmpty() ? Cash.EUR : currencies.get(0);
        MonthSum month = bills.sums(circleId, me, monthStart, today.with(TemporalAdjusters.lastDayOfMonth())).stream()
                .filter(sum -> sum.currency().equals(currency))
                .findFirst()
                .orElse(new MonthSum(currency, 0, 0, 0));
        List<Listed> subscriptions = bills.subscriptions(circleId, me, currency);
        long yearly = 0;
        for (Listed subscription : subscriptions) {
            Long aYear = subscription
                    .bill()
                    .repeat()
                    .yearly(
                            subscription.due().amountCents(),
                            subscription.bill().everyMonths());
            yearly += aYear == null ? 0 : aYear;
        }
        List<Listed> soon = bills.list(circleId, me, BillShow.DUE, Keyset.first(DUE_SOON)).stream()
                .limit(DUE_SOON)
                .toList();
        return new MoneyResponse(
                today,
                currency,
                currencies.stream().skip(1).toList(),
                monthStart,
                month.totalCents(),
                month.paidCents(),
                bills.openSum(circleId, me, currency, today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))),
                (yearly + 6) / 12, // a twelfth, rounded to the cent
                yearly,
                subscriptions.size(),
                splits.owing(circleId, me).stream().limit(OWING).toList(),
                billService.views(circleId, soon, me),
                sheets.list(circleId, me, Keyset.first(SHEETS)).items());
    }
}
