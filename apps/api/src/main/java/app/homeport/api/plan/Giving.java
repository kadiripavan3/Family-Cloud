package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.thing.Access;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudiencePerson;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Giving someone a job, or putting them on an event, shows it to them: a reminder nobody told Alex about
 * is no use to Alex. So when its owner gives a thing to someone it isn't shared with yet, it is shared with
 * them to look at ("Only you" becomes "Some people"). Three things it never does: share on behalf of
 * someone who doesn't own the thing, show a thing to someone it is hidden from, or take anything away.
 */
@Component
class Giving {

    private final ThingService things;
    private final ThingStore thingStore;

    Giving(ThingService things, ThingStore thingStore) {
        this.things = things;
        this.thingStore = thingStore;
    }

    void showTo(ThingRow row, UUID me, Collection<UUID> memberIds) {
        if (memberIds.isEmpty()) {
            return;
        }
        // The audience sheet already says, for each person, what they may do with it and whether it is hidden.
        Map<UUID, AudiencePerson> sheet = things.audience(row.id(), me).people().stream()
                .collect(Collectors.toMap(AudiencePerson::memberId, p -> p));
        List<AudiencePerson> cantSee = new ArrayList<>();
        for (UUID memberId : memberIds) {
            AudiencePerson person = sheet.get(memberId); // the owner and pets aren't on the sheet
            if (person != null && person.access() == Access.NONE) {
                cantSee.add(person);
            }
        }
        if (cantSee.isEmpty()) {
            return;
        }
        AudiencePerson first = cantSee.get(0);
        if (cantSee.stream().anyMatch(AudiencePerson::hidden)) {
            throw ApiProblem.conflict(
                    "hidden_from_them",
                    "This is hidden from %s for now. Change who can see it first."
                            .formatted(cantSee.stream()
                                    .filter(AudiencePerson::hidden)
                                    .findFirst()
                                    .orElse(first)
                                    .name()));
        }
        if (!row.mine()) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "not_shared_with_them",
                    "%s can't see this yet. Only the person who made it can share it with them."
                            .formatted(first.name()));
        }
        if (row.audience() == Audience.ME) {
            thingStore.setAudience(row.id(), Audience.SOME, row.everyoneEdits());
        }
        for (AudiencePerson person : cantSee) {
            thingStore.share(row.id(), person.memberId(), false);
        }
    }
}
