package app.homeport.api.list;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every quarter of an hour: the lines that repeat and whose time has come round are unticked again (the
 * milk, a week on). Safe in every copy of the API at once: unticking what is unticked changes nothing.
 */
@Component
class ChecklistUpkeep {

    private final ChecklistService lists;

    ChecklistUpkeep(ChecklistService lists) {
        this.lists = lists;
    }

    @Scheduled(initialDelayString = "PT3M", fixedDelayString = "${homeport.lists.upkeep-every:PT15M}")
    void everyQuarterOfAnHour() {
        lists.bringBackRepeating();
    }
}
