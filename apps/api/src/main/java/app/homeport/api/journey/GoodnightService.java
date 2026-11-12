package app.homeport.api.journey;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.folder.People;
import app.homeport.api.journey.GoodnightStore.Goodnight;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaService.MediaResponse;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Goodnight from far away: a short clip someone who is away records for the circle at home. It is sent here
 * (by the Journey app, as that person, straight to this API) and never to Journey: it isn't part of the
 * journey other people see.
 *
 * <p>A goodnight is a thing like any other. It starts shared with the whole circle, its sender decides who
 * sees it through the same sheet as everything else, and nobody outside the circle ever learns of it. At
 * home it waits on Today for the day it is meant for, from the circle's bedtime on; anyone who sees it can
 * give it a heart (an adult can for a child) or send one back.
 */
@Service
public class GoodnightService {

    static final String USUAL_TITLE = "Goodnight";

    public record GoodnightResponse(
            UUID id,
            UUID circleId,

            @Schema(description = "The circle it is for, by name: Only for The Linds")
            String circleName,

            String title,

            @Schema(nullable = true, description = "Who sent it. Null when they have left the circle.")
            PersonBrief from,

            @Schema(description = "The clip: fileUrl plays it, durationSeconds is its length")
            MediaResponse clip,

            @Schema(nullable = true, description = "A still to show before it plays")
            String posterUrl,

            Instant recordedAt,

            @Schema(description = "The clock where it was recorded: 19:10 in Reine")
            LocalDateTime recordedLocal,

            @Schema(nullable = true) String place,

            @Schema(nullable = true, description = "Where the sender's journey stood: Day 6")
            String dayLabel,

            @Schema(description = "The day at home it is meant for")
            LocalDate forDay,

            @Schema(
                    type = "string",
                    example = "20:00",
                    description = "From when it is shown at home on that day: the circle's bedtime")
            @JsonFormat(pattern = "HH:mm")
            LocalTime showFrom,

            @Schema(nullable = true, description = "The goodnight this one answers")
            UUID replyTo,

            @Schema(description = "The goodnights sent back to this one that you may see, oldest first")
            List<UUID> replies,

            @Schema(description = "Who gave it a heart") List<PersonBrief> lovedBy,

            @Schema(description = "True when you gave it a heart")
            boolean loved,

            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    public record NewGoodnight(
            UUID clientId,
            UUID circleId,
            UUID mediaId,
            UUID posterMediaId,
            String title,
            OffsetDateTime recordedAt,
            LocalDate forDay,
            String place,
            String dayLabel,
            UUID journeyId,
            UUID replyTo) {}

    private final GoodnightStore store;
    private final ThingService things;
    private final ThingStore thingStore;
    private final CircleService circles;
    private final MemberStore members;
    private final MediaService media;
    private final People people;
    private final HomeSettings homes;
    private final ApplicationEventPublisher events;

    GoodnightService(
            GoodnightStore store,
            ThingService things,
            ThingStore thingStore,
            CircleService circles,
            MemberStore members,
            MediaService media,
            People people,
            HomeSettings homes,
            ApplicationEventPublisher events) {
        this.store = store;
        this.things = things;
        this.thingStore = thingStore;
        this.circles = circles;
        this.members = members;
        this.media = media;
        this.people = people;
        this.homes = homes;
        this.events = events;
    }

    /** Sends a goodnight to a circle, or one back in answer. Sending the same one twice makes one. */
    @Transactional
    public GoodnightResponse create(UUID me, NewGoodnight sent) {
        circles.require(sent.circleId(), me);
        MemberRow mine = circles.me(sent.circleId(), me);
        MediaRow clip = media.requireOwn(sent.mediaId(), me, MediaKind.VIDEO);
        UUID poster = sent.posterMediaId() == null
                ? null
                : media.requireOwn(sent.posterMediaId(), me, MediaKind.PHOTO).id();
        if (sent.replyTo() != null) {
            Goodnight answered = store.find(sent.replyTo(), me).orElseThrow(ThingService::notFound);
            if (!answered.thing().circleId().equals(sent.circleId())) {
                throw ThingService.notFound();
            }
        }
        UUID before = store.ofMedia(clip.id()).orElse(null);
        String title = sent.title() == null || sent.title().isBlank()
                ? USUAL_TITLE
                : sent.title().trim();
        // A goodnight is for the circle: that is the whole point of it. Its sender can narrow it afterwards.
        UUID id = things.create(me, sent.circleId(), ThingKind.GOODNIGHT, title, Audience.CIRCLE, sent.clientId());
        if (things.require(id, me).kind() != ThingKind.GOODNIGHT || (before != null && !before.equals(id))) {
            throw ApiProblem.conflict("sent_before", "That clip was sent before. Record it again.");
        }
        if (thingStore.isNew(id, "goodnights")) {
            OffsetDateTime recorded =
                    sent.recordedAt() == null ? OffsetDateTime.now(ZoneOffset.UTC) : sent.recordedAt();
            // Meant for the evening it is at home when it was recorded: by home's clock, when the circle said which
            // that is, else by the clock it was recorded on.
            LocalDate forDay = sent.forDay() != null
                    ? sent.forDay()
                    : homes.zone(sent.circleId())
                            .map(zone -> recorded.atZoneSameInstant(zone).toLocalDate())
                            .orElse(recorded.toLocalDate());
            store.insert(
                    id,
                    sent.circleId(),
                    clip.id(),
                    poster,
                    recorded.toInstant(),
                    recorded.toLocalDateTime(),
                    forDay,
                    blankToNull(sent.place()),
                    blankToNull(sent.dayLabel()),
                    sent.journeyId(),
                    sent.replyTo());
            events.publishEvent(new JourneyHappened.GoodnightArrived(
                    sent.circleId(), mine.id(), id, title, forDay, homes.bedtime(sent.circleId()), sent.replyTo()));
        }
        return get(id, me);
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }

    public GoodnightResponse get(UUID id, UUID me) {
        Goodnight goodnight = store.find(id, me).orElseThrow(ThingService::notFound);
        return views(goodnight.thing().circleId(), me, List.of(goodnight)).get(0);
    }

    /** The goodnights of a circle that this person may see, the newest first. */
    public Page<GoodnightResponse> list(UUID circleId, UUID me, Keyset page) {
        circles.require(circleId, me);
        return page.page(store.list(circleId, me, page), g -> Keyset.cursor(g.recordedAt(), g.id()))
                .map(shown -> views(circleId, me, shown));
    }

    /** The goodnights meant for this day at home that someone else sent: what waits on Today. */
    public List<GoodnightResponse> waiting(UUID circleId, UUID me, LocalDate day) {
        return views(
                circleId,
                me,
                store.forDay(circleId, me, day).stream()
                        .filter(g -> !g.thing().mine())
                        .toList());
    }

    /** Gives a heart, or takes it back. A heart is one member's; an adult can give one for a child without a phone. */
    @Transactional
    public GoodnightResponse love(UUID id, UUID me, UUID as, boolean on) {
        Goodnight goodnight = store.find(id, me).orElseThrow(ThingService::notFound);
        UUID circleId = goodnight.thing().circleId();
        UUID member = actingFor(circles.require(circleId, me), circles.me(circleId, me), as);
        if (on) {
            store.love(id, member);
        } else {
            store.unlove(id, member);
        }
        return get(id, me);
    }

    /**
     * The member something is done for: the signed-in person's own, or someone in the circle who has no phone
     * (a child). Only the people who run the circle act for them.
     */
    UUID actingFor(CircleRow circle, MemberRow mine, UUID memberId) {
        if (memberId == null || memberId.equals(mine.id())) {
            return mine.id();
        }
        MemberRow other = members.find(memberId)
                .filter(m -> m.circleId().equals(circle.id()))
                .orElseThrow(() -> ApiProblem.badRequest("not_in_circle", "Choose someone from this circle."));
        if (other.status() != MemberStatus.NO_PHONE || !CircleService.runs(circle, mine)) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "not_yours_to_do",
                    "You can do that for a child or a pet of the circle, not for someone with a phone of their own.");
        }
        return other.id();
    }

    List<GoodnightResponse> views(UUID circleId, UUID me, List<Goodnight> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        CircleRow circle = circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        List<UUID> ids = rows.stream().map(Goodnight::id).toList();
        Map<UUID, PersonBrief> who = people.of(circleId);
        Map<UUID, AudienceChip> chips =
                things.chips(rows.stream().map(Goodnight::thing).toList());
        Map<UUID, List<UUID>> loves = store.loves(ids);
        Map<UUID, List<UUID>> replies = store.replies(ids, me);
        List<UUID> files = new ArrayList<>();
        rows.forEach(row -> {
            files.add(row.mediaId());
            if (row.posterMediaId() != null) {
                files.add(row.posterMediaId());
            }
        });
        Map<UUID, MediaRow> media =
                this.media.rows(files).stream().collect(Collectors.toMap(MediaRow::id, Function.identity()));
        LocalTime bedtime = homes.bedtime(circleId);
        return rows.stream()
                .filter(row -> media.containsKey(row.mediaId()))
                .map(row -> {
                    ThingRow thing = row.thing();
                    MediaRow poster = row.posterMediaId() == null ? null : media.get(row.posterMediaId());
                    List<UUID> hearts = loves.getOrDefault(row.id(), List.of());
                    return new GoodnightResponse(
                            row.id(),
                            circleId,
                            circle.name(),
                            thing.title(),
                            who.get(thing.ownerId()),
                            this.media.view(media.get(row.mediaId())),
                            poster == null ? null : this.media.urlFor(poster.storageKey(), MediaSize.MEDIUM),
                            row.recordedAt(),
                            row.recordedLocal(),
                            row.place(),
                            row.dayLabel(),
                            row.forDay(),
                            bedtime,
                            row.replyTo(),
                            replies.getOrDefault(row.id(), List.of()),
                            hearts.stream()
                                    .map(who::get)
                                    .filter(person -> person != null)
                                    .toList(),
                            hearts.contains(mine.id()),
                            thing.mine(),
                            thing.canEdit(),
                            chips.get(row.id()));
                })
                .toList();
    }
}
