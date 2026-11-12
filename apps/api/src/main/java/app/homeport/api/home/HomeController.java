package app.homeport.api.home;

import app.homeport.api.auth.Me;
import app.homeport.api.home.HomeService.PersonPageResponse;
import app.homeport.api.home.HomeService.SearchResponse;
import app.homeport.api.home.HomeService.SwitcherResponse;
import app.homeport.api.home.HomeService.TodayResponse;
import app.homeport.api.thing.Place;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@Tag(name = "home", description = "What Home shows across every place")
class HomeController {

    private final HomeService home;

    HomeController(HomeService home) {
        this.home = home;
    }

    @GetMapping("/circles/{id}/today")
    @Operation(operationId = "getToday", summary = "What is on, what is due and what is new in a circle")
    TodayResponse today(
            @Me UUID me,
            @PathVariable UUID id,
            @Parameter(description = "The day on the person's phone. The API's own day when left out.")
                    @RequestParam(required = false)
                    LocalDate day) {
        return home.today(id, me, day);
    }

    @GetMapping("/home/circles")
    @Operation(
            operationId = "getCircleSwitcher",
            summary = "Your circles, each with one short line for the switcher, and what only you can see")
    SwitcherResponse switcher(@Me UUID me) {
        return home.switcher(me);
    }

    @GetMapping("/circles/{id}/search")
    @Operation(operationId = "searchCircle", summary = "Find anything in a circle, across every place")
    SearchResponse search(
            @Me UUID me,
            @PathVariable UUID id,
            @RequestParam(name = "q", defaultValue = "") String words,
            @RequestParam(required = false) Place place) {
        return home.search(id, me, words, place);
    }

    @GetMapping("/members/{id}")
    @Operation(operationId = "getPerson", summary = "A person's page: who they are and what the circle keeps for them")
    PersonPageResponse person(@Me UUID me, @PathVariable UUID id) {
        return home.person(id, me);
    }
}
