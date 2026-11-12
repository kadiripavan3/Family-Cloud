package app.homeport.api.money;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Names;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingService.PersonBrief;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The people of a circle as Money needs them: by member id, with a first name and a picture, in the circle's
 * own order. Someone who left is still here by name, because what they paid and what they owe doesn't leave
 * with them.
 */
@Component
public class MoneyPeople {

    public record Person(UUID id, UUID userId, String name, String avatarUrl, MemberKind kind, boolean left) {

        public PersonBrief brief() {
            return new PersonBrief(id, name, avatarUrl);
        }
    }

    private final JdbcClient jdbc;
    private final MediaService media;

    MoneyPeople(JdbcClient jdbc, MediaService media) {
        this.jdbc = jdbc;
        this.media = media;
    }

    /** Everyone who is or was in the circle: the owner first, then adults, teens, children and pets, each as they were added. */
    public Map<UUID, Person> of(UUID circleId) {
        Map<UUID, Person> people = new LinkedHashMap<>();
        jdbc.sql("""
            select m.id, m.user_id, m.name, m.kind, m.status, a.storage_key as avatar_key
            from members m left join media a on a.id = m.avatar_media_id and a.status = 'ready'
            where m.circle_id = :circle
            order by case when m.kind = 'pet' then 5 else array_position(array['owner','adult','teen','child','guest'], m.role) end,
              m.created_at, m.id
            """)
                .param("circle", circleId)
                .query((rs, n) -> new Person(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        Names.first(rs.getString("name")),
                        media.urlFor(rs.getString("avatar_key"), MediaSize.SMALL),
                        MemberKind.read(rs.getString("kind")),
                        "left".equals(rs.getString("status"))))
                .list()
                .forEach(person -> people.put(person.id(), person));
        return people;
    }

    /** These members, who must all be people of the circle who are still in it. A pet doesn't pay. */
    public static void requirePayers(Map<UUID, Person> people, List<UUID> memberIds) {
        for (UUID id : memberIds) {
            Person person = id == null ? null : people.get(id);
            if (person == null || person.left()) {
                throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
            }
            if (person.kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("pets_dont_pay", person.name() + " can't pay for anything.");
            }
        }
        if (memberIds.stream().distinct().count() != memberIds.size()) {
            throw ApiProblem.badRequest("named_twice", "Someone is named twice. Name each person once.");
        }
    }

    /** "Alex", "Alex and Mia", "Alex, Mia and Leo". */
    public static String names(List<String> names) {
        if (names.isEmpty()) {
            return "";
        }
        if (names.size() == 1) {
            return names.get(0);
        }
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }
}
