package app.homeport.api.plan;

import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.ThingKind;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * What goals bring to the rest: "70% · €5,600 of €8,000" next to one in a list of mixed kinds. A goal can't
 * go on a guest pass.
 *
 * <p>The goals' own service is asked for when a glance is wanted, not when the API starts: it needs the
 * service every thing shares, and that service is the one that collects the glances.
 */
@Component
class GoalSources implements GlanceSource {

    private final ObjectProvider<GoalService> goals;

    GoalSources(ObjectProvider<GoalService> goals) {
        this.goals = goals;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.GOAL;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        return goals.getObject().glances(thingIds, me);
    }
}
