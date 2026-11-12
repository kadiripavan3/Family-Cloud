package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.plan.EventStore.EventRow;
import app.homeport.api.plan.EventStore.GuestRow;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Events: a title, when (a time on a day, or all day), where, who is coming, and whether it comes round
 * again. Its checklist, budget and album are other things linked to it, not parts of it.
 */
@Service
public class EventService {

    static final int MAX_GUESTS = 100;
    static final int MAX_DAYS = 60;

    public record GuestResponse(
            UUID id,

            @Schema(nullable = true, description = "Their place in the circle. Null for someone from outside it.")
            UUID memberId,

            String name,
            @Schema(nullable = true) String avatarUrl,

            @Schema(description = "What they do there, after their name: is taking her, drives. Empty for most.")
            String part,

            @Schema(nullable = true, description = "Null: hasn't answered")
            Answer answer,

            @Schema(description = "True for the signed-in person")
            boolean you) {}

    public record EventResponse(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "The day it starts, on the calendar where it happens")
            LocalDate day,

            @Schema(nullable = true, type = "string", example = "15:30", description = "Null: all day")
            @JsonFormat(pattern = "HH:mm")
            LocalTime time,

            LocalDate endDay,

            @Schema(nullable = true, type = "string", example = "16:15", description = "Null: all day, or no end said")
            @JsonFormat(pattern = "HH:mm")
            LocalTime endTime,

            boolean allDay,
            String timeZone,

            @Schema(nullable = true, description = "The moment it starts. Null for all day.")
            Instant startsAt,

            @Schema(nullable = true) Instant endsAt,

            @Schema(description = "Where, in words: At home, Trubarjeva 12")
            String place,

            String notes,
            @Schema(nullable = true) String coverUrl,

            @Schema(nullable = true, description = "A push this many minutes before it starts. Null: none.")
            Integer remindMinutes,

            @Schema(nullable = true, description = "1 hour before")
            String remindLabel,

            @Schema(nullable = true, description = "Null: it happens once")
            RepeatResponse repeat,

            @Schema(
                    nullable = true,
                    description = "For one that repeats: the next day it happens, counted from the day asked about")
            LocalDate nextDay,

            List<GuestResponse> guests,

            @Schema(nullable = true, description = "What the signed-in person answered")
            Answer myAnswer,

            int going,
            int maybe,
            int cant,

            @Schema(description = "How many haven't answered")
            int unanswered,

            @Schema(description = "What was linked to it: its checklist, its budget, its album")
            List<ThingBrief> links,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** Someone to put on an event: a member of the circle, or a name. */
    public record NewGuest(UUID memberId, String name, String part, Answer answer) {}

    /** When an event is. No time means all day; no end means it ends when it starts. */
    public record When(LocalDate day, LocalTime time, LocalDate endDay, LocalTime endTime, String timeZone) {}

    public record NewEvent(
            UUID circleId,
            String title,
            When when,
            String place,
            String notes,
            UUID coverMediaId,
            Integer remindMinutes,
            Recurrence repeat,
            List<NewGuest> guests,
            List<UUID> about,
            Audience audience) {}

    public record EventChange(
            String title,
            When when,
            String place,
            String notes,
            UUID coverMediaId,
            boolean removeCover,
            Integer remindMinutes,
            boolean stopReminding,
            Recurrence repeat,
            boolean stopRepeating) {}

    public record GuestChange(String name, String part, Answer answer, boolean removeAnswer) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final EventStore events;
    private final PlanPeople people;
    private final Giving giving;
    private final MediaService media;

    EventService(
            ThingService things,
            ThingStore thingStore,
            EventStore events,
            PlanPeople people,
            Giving giving,
            MediaService media) {
        this.things = things;
        this.thingStore = thingStore;
        this.events = events;
        this.people = people;
        this.giving = giving;
        this.media = media;
    }

    @Transactional
    public EventResponse create(UUID me, NewEvent input, UUID clientId) {
        UUID id = things.create(me, input.circleId(), ThingKind.EVENT, input.title(), input.audience(), clientId);
        if (thingStore.isNew(id, "events")) {
            if (input.coverMediaId() != null) {
                media.requireOwn(input.coverMediaId(), me, MediaKind.PHOTO);
            }
            EventRow fresh = checked(new EventRow(
                    id,
                    input.when().day(),
                    input.when().time(),
                    input.when().endDay(),
                    input.when().endTime(),
                    input.when().timeZone(),
                    clean(input.place()),
                    input.notes() == null ? "" : input.notes().trim(),
                    null,
                    input.remindMinutes(),
                    input.repeat(),
                    null));
            events.insert(id, fresh, input.coverMediaId());
            ThingRow row = things.require(id, me, ThingKind.EVENT);
            Map<UUID, Person> circle = people.in(row.circleId());
            List<NewGuest> guests = input.guests() == null ? List.of() : input.guests();
            for (NewGuest guest : guests) {
                add(row, circle, guest, null);
            }
            giving.showTo(
                    row,
                    me,
                    guests.stream()
                            .map(NewGuest::memberId)
                            .filter(java.util.Objects::nonNull)
                            .toList());
            if (input.about() != null && !input.about().isEmpty()) {
                things.setAbout(id, me, input.about());
            }
        }
        return get(id, me, null);
    }

    public EventResponse get(UUID id, UUID me, LocalDate day) {
        ThingRow row = things.require(id, me, ThingKind.EVENT);
        EventRow e = events.find(id).orElseThrow(ThingService::notFound);
        List<GuestRow> guests = events.guests(List.of(id));
        LocalDate asked = day == null ? LocalDate.now(PlanSql.storedZone(e.timeZone())) : day;
        List<GuestResponse> shown = guests.stream().map(g -> view(g, me)).toList();
        return new EventResponse(
                row.id(),
                row.circleId(),
                row.title(),
                e.startsOn(),
                e.startTime(),
                e.endsOn(),
                e.endTime(),
                e.allDay(),
                e.timeZone(),
                e.allDay() ? null : PlanSql.moment(e.startsOn(), e.startTime(), e.timeZone()),
                e.allDay() || e.endTime() == null ? null : PlanSql.moment(e.endsOn(), e.endTime(), e.timeZone()),
                e.placeWords(),
                e.notes(),
                media.urlFor(e.coverKey(), MediaSize.MEDIUM),
                e.remindMinutes(),
                e.remindMinutes() == null ? null : Words.before(e.remindMinutes()),
                RepeatResponse.of(e.repeat()),
                e.repeat() == null
                        ? null
                        : e.repeat().nextOnOrAfter(e.startsOn(), asked).orElse(null),
                shown,
                guests.stream()
                        .filter(g -> me.equals(g.userId()))
                        .map(GuestRow::answer)
                        .filter(java.util.Objects::nonNull)
                        .findFirst()
                        .orElse(null),
                count(guests, Answer.GOING),
                count(guests, Answer.MAYBE),
                count(guests, Answer.CANT),
                (int) guests.stream().filter(g -> g.answer() == null).count(),
                things.linked(id, me),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row));
    }

    @Transactional
    public EventResponse change(UUID id, UUID me, EventChange change) {
        ThingRow row = things.requireEdit(id, me, ThingKind.EVENT);
        EventRow e = events.find(id).orElseThrow(ThingService::notFound);
        if (change.coverMediaId() != null) {
            media.requireOwn(change.coverMediaId(), me, MediaKind.PHOTO);
        }
        When when = change.when();
        EventRow next = checked(new EventRow(
                id,
                when == null ? e.startsOn() : when.day(),
                when == null ? e.startTime() : when.time(),
                when == null ? e.endsOn() : when.endDay(),
                when == null ? e.endTime() : when.endTime(),
                when == null || when.timeZone() == null ? e.timeZone() : when.timeZone(),
                change.place() == null ? e.placeWords() : clean(change.place()),
                change.notes() == null ? e.notes() : change.notes().trim(),
                null,
                change.stopReminding()
                        ? null
                        : change.remindMinutes() == null ? e.remindMinutes() : change.remindMinutes(),
                change.stopRepeating() ? null : change.repeat() == null ? e.repeat() : change.repeat(),
                null));
        events.save(id, next, change.coverMediaId() != null || change.removeCover(), change.coverMediaId());
        thingStore.retitle(
                id, change.title() == null ? row.title() : change.title().trim());
        return get(id, me, null);
    }

    // ---------- who is coming ----------

    @Transactional
    public GuestResponse addGuest(UUID eventId, UUID me, NewGuest guest, UUID clientId) {
        ThingRow row = things.requireEdit(eventId, me, ThingKind.EVENT);
        if (events.countGuests(eventId) >= MAX_GUESTS) {
            throw ApiProblem.conflict("event_full", "An event takes 100 people at most.");
        }
        UUID id = add(row, people.in(row.circleId()), guest, clientId);
        if (guest.memberId() != null) {
            giving.showTo(row, me, List.of(guest.memberId()));
        }
        thingStore.touch(eventId);
        return view(events.guest(id).orElseThrow(), me);
    }

    private UUID add(ThingRow row, Map<UUID, Person> circle, NewGuest guest, UUID clientId) {
        String name = guest.name() == null ? "" : clean(guest.name());
        if (guest.memberId() == null && name.isEmpty()) {
            throw ApiProblem.badRequest("nobody", "Choose someone from the circle, or write a name.");
        }
        if (guest.memberId() != null) {
            PlanPeople.chosen(circle, List.of(guest.memberId()));
        }
        return events.addGuest(
                row.id(),
                guest.memberId(),
                guest.memberId() == null ? name : "",
                guest.part() == null ? "" : clean(guest.part()),
                guest.answer(),
                clientId);
    }

    @Transactional
    public GuestResponse changeGuest(UUID guestId, UUID me, GuestChange change) {
        GuestRow guest = events.guest(guestId).orElseThrow(EventService::guestGone);
        ThingRow row = guestsEvent(guest, me);
        // Your own answer is yours to give; anything else about who is coming is for whoever may change the event.
        boolean onlyMyAnswer = me.equals(guest.userId()) && change.name() == null && change.part() == null;
        if (!row.canEdit() && !onlyMyAnswer) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        events.changeGuest(
                guestId,
                guest.memberId() != null ? "" : change.name() == null ? guest.name() : clean(change.name()),
                change.part() == null ? guest.part() : clean(change.part()),
                change.removeAnswer() ? null : change.answer() == null ? guest.answer() : change.answer());
        thingStore.touch(row.id());
        return view(events.guest(guestId).orElseThrow(), me);
    }

    @Transactional
    public void removeGuest(UUID guestId, UUID me) {
        Optional<GuestRow> guest = events.guest(guestId);
        if (guest.isEmpty()) {
            return; // taking off someone who is already off is fine
        }
        ThingRow row = guestsEvent(guest.get(), me);
        if (!row.canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        events.removeGuest(guestId);
        thingStore.touch(row.id());
    }

    /** Going, maybe or can't, for the signed-in person. Anyone who can see an event may answer for themselves. */
    @Transactional
    public EventResponse answer(UUID eventId, UUID me, Answer answer) {
        ThingRow row = things.require(eventId, me, ThingKind.EVENT);
        UUID mine = people.in(row.circleId()).values().stream()
                .filter(p -> me.equals(p.userId()))
                .map(Person::id)
                .findFirst()
                .orElseThrow(ThingService::notFound);
        UUID guestId = events.addGuest(eventId, mine, "", "", null, null);
        GuestRow guest = events.guest(guestId).orElseThrow();
        events.changeGuest(guestId, "", guest.part(), answer);
        thingStore.touch(eventId);
        return get(eventId, me, null);
    }

    /** The event a guest row belongs to, for someone who may see it. To anyone else the row isn't there. */
    private ThingRow guestsEvent(GuestRow guest, UUID me) {
        try {
            return things.require(guest.eventId(), me, ThingKind.EVENT);
        } catch (ApiProblem problem) {
            throw guestGone();
        }
    }

    private static ApiProblem guestGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That person isn't on the event any more.");
    }

    // ---------- the rules of when ----------

    /**
     * An event as it may be kept: its end isn't before its start, all day has no times, one that repeats
     * starts on a day it really happens on, and its next push is worked out.
     */
    private static EventRow checked(EventRow e) {
        PlanSql.zone(e.timeZone());
        LocalDate endsOn = e.endsOn() == null ? e.startsOn() : e.endsOn();
        LocalTime endTime = e.startTime() == null ? null : e.endTime();
        if (endsOn.isBefore(e.startsOn())
                || (endsOn.equals(e.startsOn()) && endTime != null && endTime.isBefore(e.startTime()))) {
            throw ApiProblem.badRequest("ends_before_it_starts", "It can't end before it starts.");
        }
        if (ChronoUnit.DAYS.between(e.startsOn(), endsOn) > MAX_DAYS) {
            throw ApiProblem.badRequest("too_long", "An event can last 60 days at most.");
        }
        Recurrence repeat = e.repeat() == null ? null : e.repeat().startingOn(e.startsOn());
        LocalDate startsOn = e.startsOn();
        if (repeat != null) {
            if (repeat.until() != null && repeat.until().isBefore(startsOn)) {
                throw ApiProblem.badRequest("repeat_ends_early", "It can't stop repeating before it starts.");
            }
            // "Every Tuesday and Friday, starting on a Wednesday" starts on the Friday.
            LocalDate first = repeat.nextOnOrAfter(startsOn, startsOn)
                    .orElseThrow(() ->
                            ApiProblem.badRequest("repeat_ends_early", "It can't stop repeating before it starts."));
            endsOn = endsOn.plusDays(ChronoUnit.DAYS.between(startsOn, first));
            startsOn = first;
        }
        EventRow kept = new EventRow(
                e.id(),
                startsOn,
                e.startTime(),
                endsOn,
                endTime,
                e.timeZone().trim(),
                e.placeWords(),
                e.notes(),
                e.coverKey(),
                e.remindMinutes(),
                repeat,
                null);
        return withAlert(kept, Alerts.forEvent(kept, Instant.now()));
    }

    static EventRow withAlert(EventRow e, Instant alertAt) {
        return new EventRow(
                e.id(),
                e.startsOn(),
                e.startTime(),
                e.endsOn(),
                e.endTime(),
                e.timeZone(),
                e.placeWords(),
                e.notes(),
                e.coverKey(),
                e.remindMinutes(),
                e.repeat(),
                alertAt);
    }

    private GuestResponse view(GuestRow g, UUID me) {
        return new GuestResponse(
                g.id(),
                g.memberId(),
                g.memberId() == null ? g.name() : app.homeport.api.common.Names.first(g.name()),
                media.urlFor(g.avatarKey(), MediaSize.SMALL),
                g.part(),
                g.answer(),
                me.equals(g.userId()));
    }

    private static int count(List<GuestRow> guests, Answer answer) {
        return (int) guests.stream().filter(g -> g.answer() == answer).count();
    }

    private static String clean(String text) {
        return text == null ? "" : text.trim().replaceAll("\\s+", " ");
    }
}
