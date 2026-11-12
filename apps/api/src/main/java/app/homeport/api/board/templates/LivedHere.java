package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Everyone who's lived here: the roll of a flat. A flat outlives its flatmates, so the roll is built from the
 * circle's people, those who have left included, and the flat adds by hand what the app can't know.
 *
 * <p><b>The roll.</b> Everyone who is or was in the circle has a row: from the year they came into it, and
 * for someone who left, until the year they did. The flat can write over both years (people usually move in
 * long before they start using an app) and add a line to anyone. People who lived here before the app was
 * used are added by hand, one row for one person or for several ("two people before you").
 *
 * <p><b>Handed on.</b> The flat names the things the next person should find: the house manual, the bin
 * days. They are ordinary things; each viewer is shown the ones they may see.
 *
 * <p>Nothing here is secret: everyone who sees the board sees the whole roll.
 */
@Component
class LivedHere implements BoardRules {

    static final String RESIDENT = "resident";
    static final String BEFORE = "before";
    static final String HANDED_ON = "handed_on";

    record LivedHereSettings() {}

    /** What the flat wrote about someone of the circle. The entry is for that member. */
    record Resident(Integer fromYear, Integer untilYear, String note) {}

    /** @param count how many people the row stands for */
    record Before(String name, Integer count, Integer fromYear, Integer untilYear, String note) {}

    record HandedOn(UUID thingId) {}

    record LivedHereViewResponse(
            @Schema(description = "The people who live here now, the newest first")
            List<LivedHereRowResponse> hereNow,

            @Schema(description = "The people who lived here before, the last to leave first")
            List<LivedHereRowResponse> before,

            @Schema(description = "What is handed on to the next person, as far as this person may see it")
            List<LivedHereHandedOnResponse> handedOn) {}

    record LivedHereRowResponse(
            @Schema(
                    nullable = true,
                    description = "The entry behind what the flat wrote by hand, to change or remove it")
            UUID entryId,

            @Schema(nullable = true, description = "The member, for someone who is or was in the circle")
            PersonBrief person,

            String name,

            @Schema(description = "How many people the row stands for: 1, or 2 for “two people before you”")
            int count,

            boolean you,
            int fromYear,

            @Schema(nullable = true, description = "The year they left. Null while they live here.")
            Integer untilYear,

            @Schema(nullable = true) String note,

            @Schema(description = "True when the years were typed by the flat, not taken from the circle")
            boolean byHand) {}

    record LivedHereHandedOnResponse(UUID entryId, ThingBrief thing) {}

    private final ThingService things;
    private final ThingStore thingStore;

    LivedHere(ThingService things, ThingStore thingStore) {
        this.things = things;
        this.thingStore = thingStore;
    }

    @Override
    public Template template() {
        return Template.LIVED_HERE;
    }

    @Override
    public Class<?> settingsType() {
        return LivedHereSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return LivedHereViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry resident (what the flat writes about someone who is or was in the circle; one per person,"
                        + " adding again changes it): memberId, fromYear, untilYear, note",
                "entry before (people who lived here before the app): name, count (how many people; left out: 1),"
                        + " fromYear, untilYear, note",
                "entry handed_on: thingId (something of this circle that you can see)");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new LivedHereSettings();
    }

    // ---------- the roll ----------

    private static Integer year(Instant moment) {
        return moment == null ? null : moment.atOffset(ZoneOffset.UTC).getYear();
    }

    private static List<LivedHereRowResponse> roll(Scene scene) {
        List<LivedHereRowResponse> rows = new ArrayList<>();
        for (Person person : scene.everyone()) {
            // A pet isn't on the roll, and neither is someone who was invited and hasn't come yet.
            if (person.kind() == MemberKind.PET || person.status() == MemberStatus.INVITED) {
                continue;
            }
            EntryRow written = scene.entries(RESIDENT).stream()
                    .filter(e -> person.id().equals(e.forId()))
                    .findFirst()
                    .orElse(null);
            Resident byHand = written == null ? new Resident(null, null, null) : written.as(Resident.class);
            Integer from = byHand.fromYear() != null ? byHand.fromYear() : year(person.since());
            Integer until =
                    !person.left() ? null : byHand.untilYear() != null ? byHand.untilYear() : year(person.leftAt());
            rows.add(new LivedHereRowResponse(
                    written == null ? null : written.id(),
                    scene.brief(person.id()),
                    scene.firstName(person.id()),
                    1,
                    scene.isMe(person.id()),
                    from == null ? scene.today().getYear() : from,
                    // Someone who left always stands under "before", also when the year they left was never kept.
                    person.left() && until == null ? from : until,
                    byHand.note(),
                    byHand.fromYear() != null || (person.left() && byHand.untilYear() != null)));
        }
        for (EntryRow row : scene.entries(BEFORE)) {
            Before before = row.as(Before.class);
            rows.add(new LivedHereRowResponse(
                    row.id(),
                    null,
                    before.name(),
                    before.count() == null ? 1 : before.count(),
                    false,
                    before.fromYear(),
                    before.untilYear(),
                    before.note(),
                    true));
        }
        return rows;
    }

    @Override
    public Object view(Scene scene, String show) {
        List<LivedHereRowResponse> roll = roll(scene);
        return new LivedHereViewResponse(
                roll.stream()
                        .filter(row -> row.untilYear() == null)
                        .sorted(Comparator.comparingInt(LivedHereRowResponse::fromYear)
                                .reversed())
                        .toList(),
                roll.stream()
                        .filter(row -> row.untilYear() != null)
                        .sorted(Comparator.comparingInt((LivedHereRowResponse row) -> row.untilYear())
                                .thenComparingInt(LivedHereRowResponse::fromYear)
                                .reversed())
                        .toList(),
                handedOn(scene));
    }

    private List<LivedHereHandedOnResponse> handedOn(Scene scene) {
        List<EntryRow> entries = scene.entries(HANDED_ON);
        if (entries.isEmpty() || scene.me() == null) {
            return List.of();
        }
        UUID viewer = scene.me().userId();
        List<ThingBrief> briefs = things.briefs(
                thingStore.findAll(
                        entries.stream()
                                .map(e -> e.as(HandedOn.class).thingId())
                                .filter(Objects::nonNull)
                                .toList(),
                        viewer),
                viewer);
        List<LivedHereHandedOnResponse> handed = new ArrayList<>();
        for (EntryRow entry : entries) {
            briefs.stream()
                    .filter(brief -> brief.id().equals(entry.as(HandedOn.class).thingId()))
                    .findFirst()
                    .ifPresent(brief -> handed.add(new LivedHereHandedOnResponse(entry.id(), brief)));
        }
        return handed;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case RESIDENT -> entry.as(Resident.class).note();
            case BEFORE ->
                entry.as(Before.class).name()
                        + (entry.as(Before.class).note() == null
                                ? ""
                                : " · " + entry.as(Before.class).note());
            default -> null;
        };
    }

    // ---------- changing it ----------

    private static Integer year(Scene scene, Fields sent, String name, Integer otherwise) {
        return sent.count(name, 1900, scene.today().getYear() + 1, otherwise);
    }

    private static void inOrder(Integer from, Integer until) {
        if (from != null && until != null && until < from) {
            throw ApiProblem.badRequest("invalid_years", "The year they left can't be before the year they came.");
        }
    }

    private static Resident resident(Scene scene, Fields sent, Resident now) {
        Integer from = year(scene, sent, "fromYear", now.fromYear());
        Integer until = year(scene, sent, "untilYear", now.untilYear());
        inOrder(from, until);
        return new Resident(from, until, sent.text("note", 160, now.note()));
    }

    private static Before before(Scene scene, Fields sent, Before now) {
        String name = sent.text("name", 80, now.name());
        Integer from = year(scene, sent, "fromYear", now.fromYear());
        Integer until = year(scene, sent, "untilYear", now.untilYear());
        if (name == null || from == null || until == null) {
            throw ApiProblem.badRequest("missing_years", "Say who it was, and from which year to which.");
        }
        inOrder(from, until);
        return new Before(
                name, sent.count("count", 1, 20, now.count()), from, until, sent.text("note", 160, now.note()));
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case RESIDENT -> {
                UUID member = sent.id("memberId");
                if (member == null || scene.person(member) == null) {
                    throw ApiProblem.badRequest("not_in_circle", "Choose someone who is or was in this flat.");
                }
                EntryRow written = scene.entries(RESIDENT).stream()
                        .filter(e -> member.equals(e.forId()))
                        .findFirst()
                        .orElse(null);
                if (written != null) {
                    scene.save(
                            written, EntryDraft.from(written).doc(resident(scene, sent, written.as(Resident.class))));
                    return written.id();
                }
                return scene.add(
                        EntryDraft.of(RESIDENT)
                                .by(scene.myId())
                                .forMember(member)
                                .doc(resident(scene, sent, new Resident(null, null, null))),
                        clientId);
            }
            case BEFORE -> {
                return scene.add(
                        EntryDraft.of(BEFORE)
                                .by(scene.myId())
                                .doc(before(scene, sent, new Before(null, 1, null, null, null))),
                        clientId);
            }
            case HANDED_ON -> {
                UUID thing = sent.id("thingId");
                List<ThingRow> seen = thing == null || scene.me() == null
                        ? List.of()
                        : thingStore.findAll(List.of(thing), scene.me().userId());
                if (seen.isEmpty() || !seen.get(0).circleId().equals(scene.circleId())) {
                    throw ApiProblem.badRequest("not_found", "Choose something of this flat that you can see.");
                }
                if (scene.entries(HANDED_ON).size() >= 20) {
                    throw ApiProblem.conflict("too_many", "Twenty things is as many as the roll hands on.");
                }
                return scene.add(
                        EntryDraft.of(HANDED_ON).by(scene.myId()).doc(new HandedOn(thing)),
                        Scene.derivedId(scene.boardId(), "handed on " + thing));
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        switch (entry.kind()) {
            case RESIDENT ->
                scene.save(entry, EntryDraft.from(entry).doc(resident(scene, sent, entry.as(Resident.class))));
            case BEFORE -> scene.save(entry, EntryDraft.from(entry).doc(before(scene, sent, entry.as(Before.class))));
            default -> throw BoardRules.unknownKind();
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<LivedHereRowResponse> roll = roll(scene);
        int here = roll.stream()
                .filter(row -> row.untilYear() == null)
                .mapToInt(LivedHereRowResponse::count)
                .sum();
        int before = roll.stream()
                .filter(row -> row.untilYear() != null)
                .mapToInt(LivedHereRowResponse::count)
                .sum();
        return here + " here now" + (before == 0 ? "" : " · " + before + " before");
    }
}
