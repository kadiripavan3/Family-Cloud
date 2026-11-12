package app.homeport.api.money;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.money.MoneyService.MoneyResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "money", description = "Money's first page, and the planners that need nothing saved")
class MoneyController {

    private final MoneyService money;
    private final CircleService circles;

    MoneyController(MoneyService money, CircleService circles) {
        this.money = money;
        this.circles = circles;
    }

    /** What a plan comes to. */
    record LoanFiguresResponse(
            @Schema(description = "What is paid each month, in cents")
            long paymentCents,

            @Schema(description = "How many payments it takes, the last one included")
            int payments,

            @Schema(description = "The last payment, which settles what is left; often smaller than the others")
            long lastPaymentCents,

            @Schema(description = "All the interest paid, in cents")
            long interestCents,

            @Schema(description = "Everything paid: what was borrowed and the interest, in cents")
            long totalCents) {}

    /** A point of the chart: what is still owed at the end of a year. Year 0 is now. */
    record LoanPointResponse(
            int year,
            long owedCents,

            @Schema(
                    nullable = true,
                    description = "The same with the extra paid each month. Null when no extra was asked about.")
            Long owedWithExtraCents) {}

    /** One year of the schedule. */
    record LoanYearResponse(int year, long paidCents, long interestCents, long owedCents) {}

    record LoanPlanResponse(
            long principalCents,
            BigDecimal ratePercent,
            int years,
            long extraCents,
            LoanFiguresResponse plan,

            @Schema(
                    nullable = true,
                    description = "The same loan with the extra paid each month. Null when no extra was asked about.")
            LoanFiguresResponse withExtra,

            @Schema(
                    description =
                            "How much sooner it is paid off with the extra, to the nearest month. A small last payment"
                                    + " counts as the part of a month it is of a full one: 265 payments and a last one of a tenth of"
                                    + " the size is 265.1 months, 35 sooner than 300.")
            int monthsSooner,

            @Schema(description = "How much less interest is paid with the extra, in cents")
            long interestSavedCents,

            @Schema(description = "What is still owed at the end of each year, with and without the extra: the chart")
            List<LoanPointResponse> chart,

            @Schema(
                    description =
                            "The schedule year by year, with the extra when one was asked about. Fifty lines at most.")
            List<LoanYearResponse> schedule) {}

    record SavingsYearResponse(int year, long savedCents) {}

    record SavingsPlanResponse(
            long goalCents,
            long savedCents,
            long monthlyCents,
            BigDecimal ratePercent,

            @Schema(description = "False when the goal isn't reached in a hundred years at this pace")
            boolean reached,

            @Schema(description = "How many months until the goal is reached. Zero when it isn't.")
            int months,

            @Schema(description = "What was put aside by then, the start included, in cents")
            long putInCents,

            @Schema(description = "What the interest added, in cents")
            long interestCents,

            @Schema(description = "What is saved at the end of each year")
            List<SavingsYearResponse> chart) {}

    @GetMapping("/circles/{id}/money")
    @Operation(
            operationId = "getMoney",
            summary =
                    "Money's first page: the month's bills, what is due soon, subscriptions, who owes whom, and the sheets")
    MoneyResponse home(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        circles.require(id, me);
        return money.home(id, me, day);
    }

    @GetMapping("/money/loan-plan")
    @Operation(
            operationId = "getLoanPlan",
            summary =
                    "The sums of a loan, for sliders: the monthly payment, the interest, the schedule by year, and what paying extra changes. Nothing is saved.")
    LoanPlanResponse loan(
            @Me UUID me,
            @Parameter(description = "What is borrowed, in cents") @RequestParam long principalCents,
            @Parameter(description = "Interest a year, in percent: 3.4") @RequestParam BigDecimal ratePercent,
            @Parameter(description = "Over how many years, 1 to 50") @RequestParam int years,
            @Parameter(description = "Paid on top each month, in cents. Left out: nothing.")
                    @RequestParam(required = false)
                    Long extraCents) {
        long extra = extraCents == null ? 0 : extraCents;
        if (principalCents < 1 || principalCents > Cash.MAX_CENTS) {
            throw ApiProblem.badRequest(
                    "invalid_loan", "Say how much is borrowed: more than nothing, a billion at most.");
        }
        if (ratePercent.signum() < 0 || ratePercent.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw ApiProblem.badRequest("invalid_loan", "Interest is between 0 and 100 percent a year.");
        }
        if (years < 1 || years > LoanPlan.MAX_MONTHS / 12) {
            throw ApiProblem.badRequest("invalid_loan", "A loan runs for 1 to 50 years.");
        }
        if (extra < 0 || extra > Cash.MAX_CENTS) {
            throw ApiProblem.badRequest("invalid_loan", "The extra each month can't be below zero.");
        }
        LoanPlan.WhatIf whatIf = LoanPlan.whatIf(principalCents, ratePercent, years * 12, extra);
        List<LoanPointResponse> chart = new ArrayList<>();
        chart.add(new LoanPointResponse(0, principalCents, extra == 0 ? null : principalCents));
        for (int year = 1; year <= years; year++) {
            chart.add(new LoanPointResponse(
                    year, owedAfter(whatIf.plan(), year), extra == 0 ? null : owedAfter(whatIf.withExtra(), year)));
        }
        return new LoanPlanResponse(
                principalCents,
                ratePercent,
                years,
                extra,
                figures(whatIf.plan()),
                extra == 0 ? null : figures(whatIf.withExtra()),
                whatIf.monthsSooner(),
                whatIf.interestSavedCents(),
                chart,
                whatIf.withExtra().years().stream()
                        .map(year -> new LoanYearResponse(
                                year.year(), year.paidCents(), year.interestCents(), year.owedCents()))
                        .toList());
    }

    private static LoanFiguresResponse figures(LoanPlan.Plan plan) {
        return new LoanFiguresResponse(
                plan.paymentCents(), plan.payments(), plan.lastPaymentCents(), plan.interestCents(), plan.totalCents());
    }

    /** What is still owed at the end of a year: nothing once the plan has ended. */
    private static long owedAfter(LoanPlan.Plan plan, int year) {
        return year <= plan.years().size() ? plan.years().get(year - 1).owedCents() : 0;
    }

    @GetMapping("/money/savings-plan")
    @Operation(
            operationId = "getSavingsPlan",
            summary =
                    "How long until a savings goal, for sliders: the months, what was put in, what interest added. Nothing is saved.")
    SavingsPlanResponse savings(
            @Me UUID me,
            @Parameter(description = "The goal, in cents") @RequestParam long goalCents,
            @Parameter(description = "Put aside each month, in cents") @RequestParam long monthlyCents,
            @Parameter(description = "Saved already, in cents. Left out: nothing.") @RequestParam(required = false)
                    Long savedCents,
            @Parameter(description = "Interest a year, in percent. Left out: none.") @RequestParam(required = false)
                    BigDecimal ratePercent) {
        long saved = savedCents == null ? 0 : savedCents;
        BigDecimal rate = ratePercent == null ? BigDecimal.ZERO : ratePercent;
        if (goalCents < 1 || goalCents > Cash.MAX_CENTS) {
            throw ApiProblem.badRequest("invalid_plan", "Say what the goal is: more than nothing, a billion at most.");
        }
        if (monthlyCents < 0 || monthlyCents > Cash.MAX_CENTS || saved < 0 || saved > Cash.MAX_CENTS) {
            throw ApiProblem.badRequest("invalid_plan", "What is saved and what is put aside can't be below zero.");
        }
        if (rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw ApiProblem.badRequest("invalid_plan", "Interest is between 0 and 100 percent a year.");
        }
        SavingsPlan.Plan plan = SavingsPlan.plan(goalCents, saved, monthlyCents, rate);
        return new SavingsPlanResponse(
                goalCents,
                saved,
                monthlyCents,
                rate,
                plan.months() >= 0,
                Math.max(plan.months(), 0),
                plan.putInCents(),
                plan.interestCents(),
                plan.years().stream()
                        .map(year -> new SavingsYearResponse(year.year(), year.savedCents()))
                        .toList());
    }
}
