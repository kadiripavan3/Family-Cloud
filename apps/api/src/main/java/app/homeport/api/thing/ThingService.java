package app.homeport.api.thing;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingStore.HideRow;
import app.homeport.api.thing.ThingStore.ShareRow;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What every kind of thing shares: it is made in a circle by one of its members, it starts as that circle's
 * kind says ("Only you" in a family, shared among equals), and its owner decides who sees it. The services
 * for pages, photos, events, bills and passwords all go through here, so there is one way to share and one
 * way to hide.
 */
@Service
public class ThingService {

    /** One person on an audience chip. */
    public record PersonBrief(
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl) {}

    /** What the small chip on every thing says: only you, these people, or everyone, and who it is hidden from today. */
    public record AudienceChip(
            Audience audience,

            @Schema(description = "For some people: who, besides its owner")
            List<PersonBrief> people,

            @Schema(description = "The first names of people it is hidden from today")
            List<String> hiddenFrom) {}

    /** A thing in a list of mixed kinds: a search result, a person's page, what a guest pass can hold. */
    public record ThingBrief(
            UUID id,
            UUID circleId,
            ThingKind kind,
            Place place,
            String title,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip,

            @Schema(nullable = true, description = "Where it stands, in a few words: 4 of 9 done")
            String glance) {}

    public record AudiencePerson(
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl,
            MemberKind kind,
            Role role,

            @Schema(description = "With some people: what this person may do. With everyone: edit or view for all.")
            Access access,

            @Schema(description = "True when it is hidden from this person today")
            boolean hidden,

            @Schema(nullable = true, description = "The last day it is hidden from them. Null with hidden: for good.")
            LocalDate hiddenThrough) {}

    public record AudienceResponse(
            UUID thingId,
            String title,
            ThingKind kind,
            Place place,
            UUID circleId,
            String circleName,
            CircleKind circleKind,
            Audience audience,

            @Schema(description = "With everyone: whether everyone may change it, or only look")
            boolean everyoneEdits,

            @Schema(description = "Only its owner may change who sees a thing")
            boolean mine,

            @Schema(description = "Everyone in the circle who can be shared with, except its owner")
            List<AudiencePerson> people) {}

    public record PersonAccess(UUID memberId, Access access) {}

    public record Hidden(UUID memberId, LocalDate through) {}

    public record AudienceChange(
            Audience audience, Boolean everyoneEdits, List<PersonAccess> people, List<Hidden> hiddenFrom) {}

    private final ThingStore things;
    private final CircleService circles;
    private final MemberStore members;
    private final MediaService media;
    private final List<GlanceSource> glanceSources;

    ThingService(
            ThingStore things,
            CircleService circles,
            MemberStore members,
            MediaService media,
            List<GlanceSource> glanceSources) {
        this.things = things;
        this.circles = circles;
        this.members = members;
        this.media = media;
        this.glanceSources = glanceSources;
    }

    public static ApiProblem notFound() {
        return new ApiProblem(
                HttpStatus.NOT_FOUND, "not_found", "That isn't there any more, or it isn't shared with you.");
    }

    /**
     * Makes a thing in a circle for the signed-in person. With no audience it starts as the circle's kind
     * says. Returns its id; the caller then writes the details of its kind under the same id.
     */
    @Transactional
    public UUID create(UUID me, UUID circleId, ThingKind kind, String title, Audience audience, UUID clientId) {
        CircleRow circle = circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        Audience startsAs = audience != null ? audience : circle.kind().startsAs();
        // "Some people" with nobody chosen yet is, for now, only you.
        return things.insert(
                circleId,
                mine.id(),
                kind,
                title == null ? "" : title.trim(),
                startsAs == Audience.SOME ? Audience.ME : startsAs,
                clientId);
    }

    /** The thing, for someone who may see it. To everyone else it isn't there. */
    public ThingRow require(UUID id, UUID me) {
        return things.find(id, me).orElseThrow(ThingService::notFound);
    }

    public ThingRow require(UUID id, UUID me, ThingKind kind) {
        ThingRow row = require(id, me);
        if (row.kind() != kind) {
            throw notFound();
        }
        return row;
    }

    public ThingRow requireEdit(UUID id, UUID me, ThingKind kind) {
        ThingRow row = require(id, me, kind);
        if (!row.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        return row;
    }

    public ThingRow requireOwner(UUID id, UUID me) {
        ThingRow row = require(id, me);
        if (!row.mine()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "not_yours", "Only the person who made this can do that.");
        }
        return row;
    }

    /** Deletes a thing and everything of its kind under it. Only its owner can. */
    @Transactional
    public void delete(UUID id, UUID me) {
        requireOwner(id, me);
        things.delete(id);
    }

    // ---------- links, and who it is about ----------

    /** What a thing is linked to, as far as the viewer may see it. */
    public List<ThingBrief> linked(UUID id, UUID me) {
        require(id, me);
        return briefs(things.linked(id, me), me);
    }

    /** Links two things in the same circle. Whoever may change the first and see the second can. */
    @Transactional
    public void link(UUID id, UUID otherId, UUID me) {
        ThingRow row = require(id, me);
        ThingRow other = require(otherId, me);
        if (!row.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        if (!row.circleId().equals(other.circleId()) || id.equals(otherId)) {
            throw ApiProblem.badRequest("cant_link", "Those two can't be linked.");
        }
        things.link(id, otherId);
    }

    @Transactional
    public void unlink(UUID id, UUID otherId, UUID me) {
        ThingRow row = require(id, me);
        if (!row.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        things.unlink(id, otherId);
    }

    /** Says who a thing is about, so it shows on their page. Anyone who may change it can; pets count too. */
    @Transactional
    public void setAbout(UUID id, UUID me, List<UUID> memberIds) {
        ThingRow row = require(id, me);
        if (!row.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        Set<UUID> inCircle =
                members.of(List.of(row.circleId())).stream().map(MemberRow::id).collect(Collectors.toSet());
        List<UUID> chosen =
                memberIds == null ? List.of() : memberIds.stream().distinct().toList();
        if (!inCircle.containsAll(chosen)) {
            throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
        }
        things.setAbout(id, chosen);
    }

    public List<UUID> about(UUID id) {
        return things.aboutIds(id);
    }

    // ---------- chips ----------

    public Map<UUID, AudienceChip> chips(List<ThingRow> rows) {
        List<UUID> ids = rows.stream()
                .filter(r -> r.audience() != Audience.ME)
                .map(ThingRow::id)
                .toList();
        Map<UUID, List<ShareRow>> shares =
                things.shares(ids).stream().collect(Collectors.groupingBy(ShareRow::thingId));
        Map<UUID, List<HideRow>> hides = things.hides(ids).stream().collect(Collectors.groupingBy(HideRow::thingId));
        return rows.stream().collect(Collectors.toMap(ThingRow::id, row -> {
            Set<UUID> hiddenNow = hides.getOrDefault(row.id(), List.of()).stream()
                    .filter(HideRow::today)
                    .map(HideRow::memberId)
                    .collect(Collectors.toSet());
            List<PersonBrief> people = row.audience() != Audience.SOME
                    ? List.of()
                    : shares.getOrDefault(row.id(), List.of()).stream()
                            .filter(s -> !hiddenNow.contains(s.memberId()))
                            .map(s -> new PersonBrief(
                                    s.memberId(), s.name(), media.urlFor(s.avatarKey(), MediaSize.SMALL)))
                            .toList();
            List<String> hiddenFrom = row.audience() == Audience.ME
                    ? List.of()
                    : hides.getOrDefault(row.id(), List.of()).stream()
                            .filter(HideRow::today)
                            .map(h -> app.homeport.api.common.Names.first(h.name()))
                            .toList();
            return new AudienceChip(row.audience(), people, hiddenFrom);
        }));
    }

    public AudienceChip chip(ThingRow row) {
        return chips(List.of(row)).get(row.id());
    }

    /** Things of mixed kinds for one viewer, each with its chip and a few words on where it stands. */
    public List<ThingBrief> briefs(List<ThingRow> rows, UUID me) {
        Map<UUID, AudienceChip> chips = chips(rows);
        Map<UUID, String> glances = new java.util.HashMap<>();
        for (GlanceSource source : glanceSources) {
            List<UUID> ofKind = rows.stream()
                    .filter(r -> r.kind() == source.kind())
                    .map(ThingRow::id)
                    .toList();
            if (!ofKind.isEmpty()) {
                glances.putAll(source.glances(ofKind, me));
            }
        }
        return rows.stream()
                .map(r -> new ThingBrief(
                        r.id(),
                        r.circleId(),
                        r.kind(),
                        r.place(),
                        r.title(),
                        r.updatedAt(),
                        r.mine(),
                        r.canEdit(),
                        chips.get(r.id()),
                        glances.get(r.id())))
                .toList();
    }

    // ---------- the audience sheet ----------

    public AudienceResponse audience(UUID id, UUID me) {
        ThingRow row = require(id, me);
        CircleRow circle = circles.require(row.circleId(), me);
        Map<UUID, ShareRow> shared =
                things.shares(List.of(id)).stream().collect(Collectors.toMap(ShareRow::memberId, s -> s));
        Map<UUID, HideRow> hidden =
                things.hides(List.of(id)).stream().collect(Collectors.toMap(HideRow::memberId, h -> h));
        List<AudiencePerson> people = members.of(List.of(row.circleId())).stream()
                .filter(m -> !m.id().equals(row.ownerId()) && m.kind() != MemberKind.PET)
                .map(m -> {
                    ShareRow share = shared.get(m.id());
                    HideRow hide = hidden.get(m.id());
                    Access access = switch (row.audience()) {
                        case ME -> Access.NONE;
                        case SOME -> share == null ? Access.NONE : share.canEdit() ? Access.EDIT : Access.VIEW;
                        case CIRCLE ->
                            seesEveryoneThings(m, row)
                                    ? (row.everyoneEdits() || (share != null && share.canEdit())
                                            ? Access.EDIT
                                            : Access.VIEW)
                                    : share == null ? Access.NONE : share.canEdit() ? Access.EDIT : Access.VIEW;
                    };
                    boolean hiddenNow = hide != null && hide.today();
                    return new AudiencePerson(
                            m.id(),
                            m.name(),
                            media.urlFor(m.avatarKey(), MediaSize.SMALL),
                            m.kind(),
                            m.role(),
                            hiddenNow ? Access.NONE : access,
                            hiddenNow,
                            hiddenNow ? hide.through() : null);
                })
                .toList();
        return new AudienceResponse(
                row.id(),
                row.title(),
                row.kind(),
                row.place(),
                circle.id(),
                circle.name(),
                circle.kind(),
                row.audience(),
                row.everyoneEdits(),
                row.mine(),
                people);
    }

    /** The same two narrowings as in {@link app.homeport.api.common.Rules}: a guest, and Money and the Vault for the young. */
    private static boolean seesEveryoneThings(MemberRow member, ThingRow thing) {
        if (member.role() == Role.GUEST) {
            return false;
        }
        boolean young = member.role() == Role.TEEN || member.role() == Role.CHILD;
        return !(young && (thing.place() == Place.MONEY || thing.place() == Place.VAULT));
    }

    /**
     * Changes who a thing is shared with. Only its owner can. People are chosen from the thing's own circle;
     * a pet can't be shared with, and its owner always sees it.
     */
    @Transactional
    public AudienceResponse share(UUID id, UUID me, AudienceChange change) {
        ThingRow row = requireOwner(id, me);
        Map<UUID, MemberRow> inCircle = members.of(List.of(row.circleId())).stream()
                .filter(m ->
                        !m.id().equals(row.ownerId()) && m.kind() != MemberKind.PET && m.status() != MemberStatus.LEFT)
                .collect(Collectors.toMap(MemberRow::id, m -> m));
        Audience audience = change.audience() == null ? row.audience() : change.audience();
        List<PersonAccess> people = change.people() == null ? List.of() : change.people();
        List<Hidden> hides = change.hiddenFrom() == null ? List.of() : change.hiddenFrom();
        Set<UUID> seen = new HashSet<>();
        List<PersonAccess> chosen = new ArrayList<>();
        for (PersonAccess person : people) {
            if (person.memberId() == null || !inCircle.containsKey(person.memberId()) || !seen.add(person.memberId())) {
                throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
            }
            if (person.access() != null && person.access() != Access.NONE) {
                chosen.add(person);
            }
        }
        for (Hidden hide : hides) {
            if (hide.memberId() == null || !inCircle.containsKey(hide.memberId())) {
                throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
            }
        }
        if (audience == Audience.SOME && chosen.isEmpty()) {
            throw ApiProblem.badRequest("nobody_chosen", "Pick at least one person, or choose Only you.");
        }
        things.setAudience(id, audience, change.everyoneEdits() == null ? row.everyoneEdits() : change.everyoneEdits());
        things.clearShares(id);
        things.clearHides(id);
        if (audience != Audience.ME) {
            // With everyone, a name on the list is how a guest, or a teen in Money, is let in.
            for (PersonAccess person : chosen) {
                things.share(id, person.memberId(), person.access() == Access.EDIT);
            }
            for (Hidden hide : hides) {
                things.hide(id, hide.memberId(), hide.through());
            }
        }
        return audience(id, me);
    }
}
