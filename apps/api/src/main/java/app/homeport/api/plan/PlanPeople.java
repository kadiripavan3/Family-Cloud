package app.homeport.api.plan;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Names;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingService.PersonBrief;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The people of a circle as Plan and Jot show them: a first name, a face and a tint. */
@Component
public class PlanPeople {

    /** Someone in a circle. {@code userId} is null for a child or a pet, who has no phone of their own. */
    public record Person(UUID id, UUID userId, String name, String avatarUrl, int tint, MemberKind kind) {

        public PersonBrief brief() {
            return new PersonBrief(id, name, avatarUrl);
        }
    }

    private final MemberStore members;
    private final MediaService media;

    PlanPeople(MemberStore members, MediaService media) {
        this.members = members;
        this.media = media;
    }

    /** Everyone in the circle who hasn't left, by member id, in the order the circle lists them. */
    public Map<UUID, Person> in(UUID circleId) {
        Map<UUID, Person> people = new LinkedHashMap<>();
        for (MemberRow m : members.of(List.of(circleId))) {
            people.put(
                    m.id(),
                    new Person(
                            m.id(),
                            m.userId(),
                            Names.first(m.name()),
                            media.urlFor(m.avatarKey(), MediaSize.SMALL),
                            m.tint(),
                            m.kind()));
        }
        return people;
    }

    /** These member ids, each once, in the order given. Every one has to be in the circle. */
    public static List<UUID> chosen(Map<UUID, Person> people, Collection<UUID> memberIds) {
        if (memberIds == null) {
            return List.of();
        }
        List<UUID> chosen = memberIds.stream().distinct().toList();
        if (chosen.stream().anyMatch(id -> id == null || !people.containsKey(id))) {
            throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
        }
        return chosen;
    }
}
