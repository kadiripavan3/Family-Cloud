package app.homeport.api.plan;

import app.homeport.api.auth.Me;
import app.homeport.api.circle.CircleService;
import app.homeport.api.plan.PlanService.MonthResponse;
import app.homeport.api.plan.PlanService.PlanResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "plan", description = "The calendar: one list for the day, and the month at a glance")
class PlanController {

    private final PlanService plan;
    private final CircleService circles;

    PlanController(PlanService plan, CircleService circles) {
        this.plan = plan;
        this.circles = circles;
    }

    @GetMapping("/circles/{id}/plan")
    @Operation(
            operationId = "getPlan",
            summary = "The day's list from one day on (events with a time, jobs with a tick, what other places"
                    + " bring), the dots of that week, and what is still open from before. Sixty-two days,"
                    + " five hundred events and five hundred reminders at most.")
    PlanResponse plan(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The first day. The API's own day when left out.") @RequestParam(required = false)
                    LocalDate day,
            @Parameter(description = "How many days from there. Left out: 7.") @RequestParam(required = false)
                    Integer days,
            @Parameter(description = "Only what concerns this person of the circle") @RequestParam(required = false)
                    UUID member) {
        circles.require(id, me);
        return plan.plan(id, me, day, days, member);
    }

    @GetMapping("/circles/{id}/month")
    @Operation(
            operationId = "getMonth",
            summary = "A month as whole weeks (forty-two days at most), each day with a dot per person who has"
                    + " something on it")
    MonthResponse month(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The month, as 2026-11. This month when left out.", example = "2026-11")
                    @RequestParam(required = false)
                    @DateTimeFormat(pattern = "yyyy-MM")
                    YearMonth month,
            @Parameter(description = "Only what concerns this person of the circle") @RequestParam(required = false)
                    UUID member) {
        circles.require(id, me);
        return plan.month(id, me, month, member);
    }
}
