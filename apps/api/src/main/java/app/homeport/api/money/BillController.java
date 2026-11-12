package app.homeport.api.money;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.money.BillReader.Found;
import app.homeport.api.money.BillReader.Reading;
import app.homeport.api.money.BillService.BillChange;
import app.homeport.api.money.BillService.BillResponse;
import app.homeport.api.money.BillService.BillRowResponse;
import app.homeport.api.money.BillService.NewBill;
import app.homeport.api.money.BillService.Paid;
import app.homeport.api.money.BillService.ShareInput;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "bills", description = "Bills and subscriptions: what is due, who pays, what it usually costs")
class BillController {

    private final BillService bills;
    private final CircleService circles;

    BillController(BillService bills, CircleService circles) {
        this.bills = bills;
        this.circles = circles;
    }

    record ShareRequest(
            @NotNull(message = "Choose who pays.") UUID memberId,

            @Schema(description = "Their part of the whole: 1 and 1 is half each. Left out: 1.") @Min(1) @Max(1000000)
            Long parts,

            @Schema(
                    description =
                            "Or their exact amount in cents. Then everyone needs one, and they must add up to the bill.")
            @Min(1)
            @Max(100000000000L)
            Long cents) {}

    record NewBillRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @Schema(description = "What to call it: Electricity. Left out: who it is paid to.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 120, message = "Keep who it is paid to to 120 characters or fewer.")
            String payee,

            @Size(max = 16) String emoji,

            @NotNull(message = "Say how much it is.")
            @Min(value = 0, message = "An amount can't be below zero.")
            @Max(value = 100000000000L, message = "That amount is too large.")
            Long amountCents,

            @Schema(description = "Three letters. Left out: EUR.") @Size(max = 3)
            String currency,

            @NotNull(message = "Say when it is due.") LocalDate dueOn,

            @Schema(description = "Left out: once") Repeat repeat,

            @Schema(description = "For every few months: how many, 2 to 24") @Min(2) @Max(24)
            Integer everyMonths,

            Boolean subscription,

            @Schema(description = "Left out: by hand") PaidHow pays,

            @Schema(description = "Remind this many days before it is due. Left out: no reminder.") @Min(0) @Max(30)
            Integer remindDays,

            @Size(max = 2000, message = "Keep the note to 2,000 characters or fewer.")
            String note,

            @Schema(description = "The payee's own page for paying") @Size(max = 500)
            String payUrl,

            @Size(max = 42) String iban,
            @Size(max = 60) String reference,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience,

            @Schema(description = "Who pays. Left out: you pay all of it.") @Size(max = 30)
            List<@Valid ShareRequest> shares) {}

    record BillChangeRequest(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Size(max = 120, message = "Keep who it is paid to to 120 characters or fewer.")
            String payee,

            @Size(max = 16) String emoji,

            @Schema(description = "What is due now, in cents")
            @Min(value = 0, message = "An amount can't be below zero.")
            @Max(value = 100000000000L, message = "That amount is too large.")
            Long amountCents,

            @Size(max = 3) String currency,

            @Schema(description = "When it is due now. It comes round on this day of the month from then on.")
            LocalDate dueOn,

            Repeat repeat,
            @Min(2) @Max(24) Integer everyMonths,
            Boolean subscription,
            PaidHow pays,
            @Min(0) @Max(30) Integer remindDays,
            Boolean removeReminder,

            @Size(max = 2000, message = "Keep the note to 2,000 characters or fewer.")
            String note,

            @Size(max = 500) String payUrl,
            Boolean removePayUrl,
            @Size(max = 42) String iban,
            @Size(max = 60) String reference,

            @Schema(description = "Who pays, all of them: this replaces the shares there were")
            @Size(min = 1, max = 30, message = "Someone has to pay it.")
            List<@Valid ShareRequest> shares) {}

    record PaidRequest(
            @Schema(
                    description =
                            "Which time it was due: the bill's dueOn as the app shows it. A second send of the same tap then changes nothing.")
            @NotNull(message = "Say which bill you mean.")
            LocalDate dueOn,

            @Schema(description = "Whose share. Left out: your own, or the whole bill when you pay no share of it.")
            UUID memberId,

            @Schema(description = "True to mark every share at once")
            Boolean everyone,

            @Schema(description = "False to take it back. Left out: true.")
            Boolean paid) {}

    record ReadRequest(
            @Schema(description = "The lines of text the phone read off the photo or the PDF, top to bottom")
            @NotEmpty(message = "There was no text to read.")
            @Size(max = 400, message = "That is too much text for one bill.")
            List<@Size(max = 500) String> lines,

            @Schema(
                    description =
                            "The day on the person's phone, for a due date written without its year. The API's own day when left out.")
            LocalDate day) {}

    /** Some words that were read, and the line they were read from. */
    record ReadTextResponse(
            String value,

            @Schema(description = "The line it was read from, as it was sent")
            String line,

            @Schema(description = "Which of the lines sent that was, counting from 0")
            int lineNumber) {}

    record ReadAmountResponse(
            @Schema(description = "The amount, in cents") long value, String line, int lineNumber) {}

    record ReadDayResponse(LocalDate value, String line, int lineNumber) {}

    record ReadRepeatResponse(Repeat value, String line, int lineNumber) {}

    /** What was read off a bill, for the person to check before saving. */
    record BillReadingResponse(
            @Schema(nullable = true, description = "Who to pay")
            ReadTextResponse payee,

            @Schema(nullable = true, description = "The amount to pay")
            ReadAmountResponse amountCents,

            @Schema(description = "The currency found next to an amount, or EUR when none was")
            String currency,

            @Schema(nullable = true) ReadDayResponse dueOn,
            @Schema(nullable = true) ReadTextResponse iban,
            @Schema(nullable = true) ReadTextResponse reference,

            @Schema(
                    nullable = true,
                    description = "Set when the text says, or the kind of bill suggests, how it comes round")
            ReadRepeatResponse repeat,

            @Schema(description = "A name for the bill: Electricity, Netflix, or who to pay")
            String title,

            @Schema(description = "An emoji for it") String emoji) {}

    private static ReadTextResponse text(Found<String> found) {
        return found == null ? null : new ReadTextResponse(found.value(), found.line(), found.lineNumber());
    }

    private static List<ShareInput> shares(List<ShareRequest> shares) {
        return shares == null
                ? null
                : shares.stream()
                        .map(share -> new ShareInput(share.memberId(), share.parts(), share.cents()))
                        .toList();
    }

    @PostMapping("/bills")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createBill", summary = "Add a bill or a subscription")
    BillResponse create(@Me UUID me, @Valid @RequestBody NewBillRequest request) {
        return bills.create(
                me,
                request.circleId(),
                new NewBill(
                        request.title(),
                        request.payee(),
                        request.emoji(),
                        request.amountCents(),
                        request.currency(),
                        request.dueOn(),
                        request.repeat(),
                        request.everyMonths(),
                        request.subscription(),
                        request.pays(),
                        request.remindDays(),
                        request.note(),
                        request.payUrl(),
                        request.iban(),
                        request.reference(),
                        request.audience(),
                        shares(request.shares())),
                request.clientId());
    }

    @GetMapping("/bills/{id}")
    @Operation(operationId = "getBill", summary = "A bill: what is due, who pays, the last six, its login and invoice")
    BillResponse get(@Me UUID me, @PathVariable UUID id) {
        return bills.get(id, me);
    }

    @PatchMapping("/bills/{id}")
    @Operation(
            operationId = "changeBill",
            summary = "Change a bill: this time's amount and day, how it comes round, who pays")
    BillResponse change(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody BillChangeRequest request) {
        return bills.change(
                id,
                me,
                new BillChange(
                        request.title(),
                        request.payee(),
                        request.emoji(),
                        request.amountCents(),
                        request.currency(),
                        request.dueOn(),
                        request.repeat(),
                        request.everyMonths(),
                        request.subscription(),
                        request.pays(),
                        request.remindDays(),
                        request.removeReminder(),
                        request.note(),
                        request.payUrl(),
                        request.removePayUrl(),
                        request.iban(),
                        request.reference(),
                        shares(request.shares())));
    }

    @PutMapping("/bills/{id}/paid")
    @Operation(
            operationId = "markBillPaid",
            summary =
                    "Mark a share of a bill as paid, or take that back. A repeating bill is due again once every share is paid.")
    BillResponse paid(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody PaidRequest request) {
        return bills.paid(id, me, new Paid(request.dueOn(), request.memberId(), request.everyone(), request.paid()));
    }

    @GetMapping("/circles/{id}/bills")
    @Operation(
            operationId = "getBills",
            summary =
                    "The bills in a circle you can see: still to pay (soonest first), paid (latest first) or the subscriptions")
    Page<BillRowResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "due, paid or subscriptions. Left out: due.") @RequestParam(required = false)
                    BillShow show,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return bills.list(id, me, show, Keyset.of(cursor, limit, 30));
    }

    @PostMapping("/bills/read")
    @Operation(
            operationId = "readBill",
            summary =
                    "Read a bill from the text of a photo or a PDF: who to pay, how much, by when. It suggests; nothing is saved.")
    BillReadingResponse read(@Me UUID me, @Valid @RequestBody ReadRequest request) {
        Reading reading = BillReader.read(request.lines(), request.day() == null ? LocalDate.now() : request.day());
        Found<Long> amount = reading.amountCents();
        Found<LocalDate> due = reading.dueOn();
        Found<Repeat> repeat = reading.repeat();
        return new BillReadingResponse(
                text(reading.payee()),
                amount == null ? null : new ReadAmountResponse(amount.value(), amount.line(), amount.lineNumber()),
                reading.currency(),
                due == null ? null : new ReadDayResponse(due.value(), due.line(), due.lineNumber()),
                text(reading.iban()),
                text(reading.reference()),
                repeat == null ? null : new ReadRepeatResponse(repeat.value(), repeat.line(), repeat.lineNumber()),
                reading.title(),
                reading.emoji());
    }
}
