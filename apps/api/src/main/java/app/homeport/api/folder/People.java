package app.homeport.api.folder;

import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.Names;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingService.PersonBrief;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** The people of a circle as a small line each (first name and picture): who edited it last, who ticked it. */
@Component
public class People {

    private final MemberStore members;
    private final MediaService media;

    People(MemberStore members, MediaService media) {
        this.members = members;
        this.media = media;
    }

    /** Everyone in the circle who hasn't left, by member id. */
    public Map<UUID, PersonBrief> of(UUID circleId) {
        return members.of(List.of(circleId)).stream()
                .collect(Collectors.toMap(
                        MemberRow::id,
                        m -> new PersonBrief(
                                m.id(), Names.first(m.name()), media.urlFor(m.avatarKey(), MediaSize.SMALL)),
                        (a, b) -> a));
    }
}
