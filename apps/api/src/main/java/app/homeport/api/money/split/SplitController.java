package app.homeport.api.money.split;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.money.split.SplitService.ExpenseInput;
import app.homeport.api.money.split.SplitService.ExpenseResponse;
import app.homeport.api.money.split.SplitService.PaymentResponse;
import app.homeport.api.money.split.SplitService.ShareInput;
import app.homeport.api.money.split.SplitService.SplitBriefResponse;
import app.homeport.api.money.split.SplitService.SplitResponse;
import app.homeport.api.thing.Audience;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@Tag(name = "splits", description = "Splitting costs: who paid what, who owes who, the fewest payments to settle up")
class SplitController {

    private static final String DAY =
            "The day on the person's phone, for an expense with no day of its own. The API's own day when left out.";

    private final SplitService splits;
    private final CircleService circles;

    SplitController(SplitService splits, CircleService circles) {
        this.splits = splits;
        this.circles = circles;
    }

    record NewSplitRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Choose a circle.") UUID circleId,

            @NotBlank(message = "Give it a name, like Lisbon weekend.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            @Schema(description = "Three letters. Left out: EUR.") @Size(max = 3)
            String currency,

            @Schema(description = "Left out: what the circle's kind starts things as")
            Audience audience) {}

    record RenameRequest(
            @NotBlank(message = "Give it a name.")
            @Size(max = 200, message = "Keep the name to 200 characters or fewer.")
            String title) {}

    record ShareRequest(
            @NotNull(message = "Choose who shares it.") UUID memberId,

            @Schema(description = "For a split by shares: how many shares are theirs, 1 to 1,000") @Min(1) @Max(1000)
            Long weight,

            @Schema(description = "For exact amounts: theirs, in cents. They must add up to what it cost.")
            @Min(1)
            @Max(100000000000L)
            Long cents) {}

    record NewExpenseRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotBlank(message = "Say what it was for.")
            @Size(max = 120, message = "Keep what it was for to 120 characters or fewer.")
            String title,

            @Size(max = 16) String emoji,

            @NotNull(message = "Say how much it was.")
            @Min(value = 1, message = "Say how much it was.")
            @Max(value = 100000000000L, message = "That amount is too large.")
            Long amountCents,

            @Schema(description = "Who paid. Left out: you.")
            UUID paidBy,

            @Schema(description = "Left out: equally") ShareMode mode,

            @Schema(description = "Who shares it. Left out, for an equal split: everyone in the circle.")
            @Size(max = 30)
            List<@Valid ShareRequest> shares,

            @Schema(description = "The day it was spent. Left out: today.")
            LocalDate spentOn) {}

    record ExpenseChangeRequest(
            @Size(min = 1, max = 120, message = "Keep what it was for to 120 characters or fewer.")
            String title,

            @Size(max = 16) String emoji,

            @Min(value = 1, message = "Say how much it was.")
            @Max(value = 100000000000L, message = "That amount is too large.")
            Long amountCents,

            UUID paidBy,
            ShareMode mode,

            @Schema(description = "Who shares it, all of them: this replaces who shared it before")
            @Size(min = 1, max = 30, message = "Someone has to share it.")
            List<@Valid ShareRequest> shares,

            LocalDate spentOn) {}

    record NewPaymentRequest(
            @NotNull(message = "Something went wrong on our side. Try again.")
            UUID clientId,

            @NotNull(message = "Say who paid.") UUID from,

            @NotNull(message = "Say who was paid.") UUID to,

            @NotNull(message = "Say how much was paid.")
            @Min(value = 1, message = "Say how much was paid.")
            @Max(value = 100000000000L, message = "That amount is too large.")
            Long amountCents,

            @Schema(description = "The day it was paid. Left out: today.")
            LocalDate paidOn) {}

    private static List<ShareInput> shares(List<ShareRequest> shares) {
        return shares == null
                ? null
                : shares.stream()
                        .map(share -> new ShareInput(share.memberId(), share.weight(), share.cents()))
                        .toList();
    }

    @PostMapping("/splits")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createSplit", summary = "Start keeping count of a group's shared costs")
    SplitResponse create(@Me UUID me, @Valid @RequestBody NewSplitRequest request) {
        return splits.create(
                me, request.circleId(), request.title(), request.currency(), request.audience(), request.clientId());
    }

    @GetMapping("/splits/{id}")
    @Operation(
            operationId = "getSplit",
            summary = "A split: where everyone stands, the fewest payments that settle it, and the latest expenses")
    SplitResponse get(@Me UUID me, @PathVariable UUID id) {
        return splits.get(id, me);
    }

    @PatchMapping("/splits/{id}")
    @Operation(operationId = "renameSplit", summary = "Rename a split")
    SplitResponse rename(@Me UUID me, @PathVariable UUID id, @Valid @RequestBody RenameRequest request) {
        return splits.rename(id, me, request.title());
    }

    @GetMapping("/circles/{id}/splits")
    @Operation(operationId = "getSplits", summary = "The splits in a circle you can see, last changed first")
    Page<SplitBriefResponse> list(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        circles.require(id, me);
        return splits.list(id, me, Keyset.of(cursor, limit, 30));
    }

    @GetMapping("/splits/{id}/expenses")
    @Operation(operationId = "getSplitExpenses", summary = "The expenses of a split, the latest first")
    Page<ExpenseResponse> expenses(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return splits.expenses(id, me, Keyset.of(cursor, limit, 30));
    }

    @PostMapping("/splits/{id}/expenses")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "addSplitExpense", summary = "Add what someone paid, and who shares it")
    ExpenseResponse addExpense(
            @Me UUID me,
            @PathVariable UUID id,
            @Valid @RequestBody NewExpenseRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return splits.addExpense(
                id,
                me,
                new ExpenseInput(
                        request.title(),
                        request.emoji(),
                        request.amountCents(),
                        request.paidBy(),
                        request.mode(),
                        shares(request.shares()),
                        request.spentOn()),
                request.clientId(),
                day);
    }

    @PatchMapping("/split-expenses/{expenseId}")
    @Operation(
            operationId = "changeSplitExpense",
            summary = "Change an expense: what it was, how much, who paid, who shares it")
    ExpenseResponse changeExpense(
            @Me UUID me, @PathVariable UUID expenseId, @Valid @RequestBody ExpenseChangeRequest request) {
        return splits.changeExpense(
                expenseId,
                me,
                new ExpenseInput(
                        request.title(),
                        request.emoji(),
                        request.amountCents(),
                        request.paidBy(),
                        request.mode(),
                        shares(request.shares()),
                        request.spentOn()));
    }

    @DeleteMapping("/split-expenses/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removeSplitExpense", summary = "Remove an expense. Removing one that is gone is fine.")
    void removeExpense(@Me UUID me, @PathVariable UUID expenseId) {
        splits.removeExpense(expenseId, me);
    }

    @PostMapping("/splits/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "addSplitPayment",
            summary = "Mark a payment as made: one person paid another to settle up. The app pays nothing itself.")
    PaymentResponse addPayment(
            @Me UUID me,
            @PathVariable UUID id,
            @Valid @RequestBody NewPaymentRequest request,
            @Parameter(description = DAY) @RequestParam(required = false) LocalDate day) {
        return splits.addPayment(
                id, me, request.from(), request.to(), request.amountCents(), request.paidOn(), request.clientId(), day);
    }

    @DeleteMapping("/split-payments/{paymentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeSplitPayment",
            summary = "Take back a payment that was marked as made. One that is gone is fine.")
    void removePayment(@Me UUID me, @PathVariable UUID paymentId) {
        splits.removePayment(paymentId, me);
    }

    @PutMapping("/splits/{id}/reminders/{memberId}")
    @Operation(
            operationId = "remindSplitMember",
            summary =
                    "Remind someone of what they owe you in a split. Keeps the time; the notification itself is sent by whoever sends notifications.")
    SplitResponse remind(@Me UUID me, @PathVariable UUID id, @PathVariable UUID memberId) {
        return splits.remind(id, me, memberId);
    }
}
