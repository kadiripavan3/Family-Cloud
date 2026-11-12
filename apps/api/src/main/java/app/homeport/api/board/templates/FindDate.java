package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.PublicUrls;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.notify.Nudge;
import app.homeport.api.plan.EventService;
import app.homeport.api.plan.EventService.NewEvent;
import app.homeport.api.plan.EventService.NewGuest;
import app.homeport.api.plan.EventService.When;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * When can everyone? A stretch of days is offered, each person taps the days they can do, and the API says
 * which day is best.
 *
 * <p><b>The best day</b> is the one the most people can do, looking only at days that haven't passed; when
 * several days tie, the earliest (see {@link #best}). People who answered by link count like everyone else.
 *
 * <p><b>By link.</b> The board has a link with an end nobody can guess. Someone without the app opens it,
 * writes their name and ticks their days on a web page (see {@link FindDatePages}). They are shown the title
 * and who is asking, and nothing else: not who else answered, and not what anyone said. Anyone who may change
 * the board can remove an answer that came by link, and can give the board a new link.
 *
 * <p><b>Setting it</b> puts the day into the calendar as an ordinary event with everyone on it. From there
 * each person can still say they can't, in Plan.
 *
 * <p>Nothing here is secret within the circle: everyone who sees the board sees who can do which day. Each
 * person changes only their own days.
 */
@Component
class FindDate implements BoardRules {

    static final String FREE = "free";
    static final String CANT = "cant";
    static final String OUTSIDER = "outsider";
    static final String DOOR = "door";
    static final String SEEN = "seen";
    static final String NUDGE = "nudge";
    static final int LONGEST = 62;
    static final int MOST_OUTSIDERS = 30;

    // ---------- what is stored ----------

    record FindDateSettings(
            @Schema(description = "The first day offered") LocalDate from,
            @Schema(description = "The last day offered") LocalDate to,

            @Schema(nullable = true, description = "The day it was set for, once someone set it")
            LocalDate setFor,

            @Schema(nullable = true, description = "The event in the calendar it became")
            UUID eventId) {}

    record Outsider(String name) {}

    // ---------- the best day ----------

    /**
     * The best day: the one most people can do, among the days from today on; the earliest when several tie.
     * Null when nobody can do any of them.
     */
    static LocalDate best(Map<LocalDate, Integer> free, LocalDate today) {
        LocalDate best = null;
        int most = 0;
        for (Map.Entry<LocalDate, Integer> day : new TreeMap<>(free).entrySet()) {
            if (!day.getKey().isBefore(today) && day.getValue() > most) {
                best = day.getKey();
                most = day.getValue();
            }
        }
        return best;
    }

    // ---------- what a person sees ----------

    record FindDateViewResponse(
            LocalDate from,
            LocalDate to,

            @Schema(description = "Every day offered, with how many can do it")
            List<FindDateDayResponse> days,

            @Schema(description = "How many people are asked: everyone in the circle, and whoever answered by link")
            int asked,

            @Schema(description = "How many of them have answered")
            int answered,

            @Schema(nullable = true, description = "The best day so far. Null while nobody can do any.")
            FindDateBestResponse best,

            @Schema(description = "The people of the circle who haven't answered")
            List<FindDateWaitingResponse> waitingFor,

            @Schema(description = "People who answered by link")
            List<FindDateOutsiderResponse> byLink,

            boolean youAnswered,

            @Schema(description = "True when this person said none of the days work")
            boolean youCant,

            @Schema(
                    nullable = true,
                    description = "The link for people without the app, for those who may change the board")
            String link,

            @Schema(description = "When it was sent round") Instant askedAt,

            @Schema(nullable = true, description = "The day it was set for")
            LocalDate setFor,

            @Schema(nullable = true, description = "The event in the calendar it became, while that is still there")
            UUID eventId) {}

    record FindDateDayResponse(
            LocalDate day,

            @Schema(description = "How many can do it") int free,

            @Schema(description = "True when this person can")
            boolean you,

            @Schema(description = "True for the best day") boolean best,

            @Schema(description = "True for a day that has passed")
            boolean past,

            @Schema(description = "The people of the circle who can")
            List<PersonBrief> who,

            @Schema(description = "The names of those who can and answered by link")
            List<String> byLink) {}

    record FindDateBestResponse(
            LocalDate day,
            int free,

            @Schema(description = "True when everyone who answered can do it")
            boolean allWhoAnswered,

            @Schema(description = "True when everyone who is asked can do it")
            boolean everyone,

            @Schema(description = "Who can: first names, with “you” for this person")
            List<String> names) {}

    record FindDateWaitingResponse(
            PersonBrief person,
            boolean you,

            @Schema(description = "True when they have opened it")
            boolean opened,

            @Schema(nullable = true, description = "When they were last nudged")
            Instant nudgedAt) {}

    record FindDateOutsiderResponse(
            UUID id,
            String name,

            @Schema(description = "How many days they can do")
            int days) {}

    private final PublicUrls urls;
    private final EventService events;
    private final BoardStore store;
    private final ApplicationEventPublisher told;

    FindDate(PublicUrls urls, EventService events, BoardStore store, ApplicationEventPublisher told) {
        this.urls = urls;
        this.events = events;
        this.store = store;
        this.told = told;
    }

    @Override
    public Template template() {
        return Template.FIND_DATE;
    }

    @Override
    public Class<?> settingsType() {
        return FindDateSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return FindDateViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: from and to (the days offered, 62 at most; left out: the three weeks from today)",
                "verb tap: day, free (true or false; left out: true). Your own day.",
                "verb cant: cant (true or false; left out: true). None of the days work for you.",
                "verb opened: says you have looked at it (the app sends it when the board is opened)",
                "verb nudge: memberId (someone who hasn't answered; once a day)",
                "verb set: day (left out: the best day), time (HH:mm; left out: all day), timeZone (left out: UTC)."
                        + " It becomes an event with everyone on it.",
                "verb new_link: the link for people without the app is replaced, and the old one stops working",
                "removing an entry: an answer that came by link, by anyone who may change the board");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("tap") || verb.equals(CANT) || verb.equals("opened");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        FindDateSettings now = scene.isNew()
                ? new FindDateSettings(scene.today(), scene.today().plusDays(20), null, null)
                : scene.settings(FindDateSettings.class);
        LocalDate from = sent.day("from", now.from());
        LocalDate to = sent.day("to", now.to());
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) >= LONGEST) {
            throw ApiProblem.badRequest(
                    "invalid_days", "Choose the first and the last day to offer. Two months is as long as it gets.");
        }
        if (scene.isNew() && to.isBefore(scene.today())) {
            throw ApiProblem.badRequest("invalid_days", "Those days have passed. Offer days that are still to come.");
        }
        return new FindDateSettings(from, to, now.setFor(), now.eventId());
    }

    /** A new board gets its link for people without the app. */
    @Override
    public void started(Scene scene) {
        scene.add(EntryDraft.of(DOOR).token(Scene.newToken()), Scene.derivedId(scene.boardId(), "door"));
    }

    // ---------- reading ----------

    /** Everything the view, the glance and the card need, counted once. */
    private record Tally(
            Map<LocalDate, Set<UUID>> members,
            Map<LocalDate, List<String>> byLink,
            Map<LocalDate, Integer> free,
            List<UUID> asked,
            Set<UUID> answered,
            List<EntryRow> outsiders,
            LocalDate best) {

        int people() {
            return asked.size() + outsiders.size();
        }

        int answers() {
            return (int) asked.stream().filter(answered::contains).count() + outsiders.size();
        }

        int bestFree() {
            return best == null ? 0 : free.getOrDefault(best, 0);
        }
    }

    private static Tally tally(Scene scene) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        Map<UUID, EntryRow> outsiders = new HashMap<>();
        scene.entries(OUTSIDER).forEach(o -> outsiders.put(o.id(), o));
        Map<LocalDate, Set<UUID>> members = new TreeMap<>();
        Map<LocalDate, List<String>> byLink = new TreeMap<>();
        // Only the people who are asked now are counted: someone who left the circle takes their days with them.
        List<UUID> asked = Say.voiceIds(scene);
        Set<UUID> answered = new HashSet<>();
        scene.entries(CANT).forEach(c -> answered.add(c.forId()));
        for (EntryRow free : scene.entries(FREE)) {
            if (free.day() == null
                    || free.day().isBefore(settings.from())
                    || free.day().isAfter(settings.to())) {
                continue;
            }
            if (free.parentId() != null) {
                EntryRow outsider = outsiders.get(free.parentId());
                if (outsider != null) {
                    byLink.computeIfAbsent(free.day(), d -> new ArrayList<>())
                            .add(outsider.as(Outsider.class).name());
                }
            } else if (asked.contains(free.forId())) {
                members.computeIfAbsent(free.day(), d -> new HashSet<>()).add(free.forId());
                answered.add(free.forId());
            }
        }
        Map<LocalDate, Integer> counts = new TreeMap<>();
        members.forEach((day, who) -> counts.merge(day, who.size(), Integer::sum));
        byLink.forEach((day, who) -> counts.merge(day, who.size(), Integer::sum));
        return new Tally(
                members, byLink, counts, asked, answered, List.copyOf(outsiders.values()), best(counts, scene.today()));
    }

    private static String dayWords(LocalDate day) {
        return Words.weekday(day) + " " + Words.shortDay(day);
    }

    @Override
    public Object view(Scene scene, String show) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        Tally tally = tally(scene);
        List<FindDateDayResponse> days = new ArrayList<>();
        for (LocalDate day = settings.from(); !day.isAfter(settings.to()); day = day.plusDays(1)) {
            Set<UUID> who = tally.members().getOrDefault(day, Set.of());
            days.add(new FindDateDayResponse(
                    day,
                    tally.free().getOrDefault(day, 0),
                    scene.myId() != null && who.contains(scene.myId()),
                    day.equals(tally.best()),
                    day.isBefore(scene.today()),
                    tally.asked().stream()
                            .filter(who::contains)
                            .map(scene::brief)
                            .toList(),
                    tally.byLink().getOrDefault(day, List.of())));
        }
        Set<UUID> seen = new HashSet<>();
        scene.entries(SEEN).forEach(s -> seen.add(s.forId()));
        Map<UUID, Instant> nudged = new HashMap<>();
        scene.entries(NUDGE).forEach(n -> nudged.put(n.forId(), n.doneAt()));
        boolean eventThere = settings.eventId() != null && store.thingExists(settings.eventId());
        return new FindDateViewResponse(
                settings.from(),
                settings.to(),
                days,
                tally.people(),
                tally.answers(),
                tally.best() == null ? null : best(scene, tally),
                tally.asked().stream()
                        .filter(id -> !tally.answered().contains(id))
                        .map(id -> new FindDateWaitingResponse(
                                scene.brief(id), scene.isMe(id), seen.contains(id), nudged.get(id)))
                        .toList(),
                tally.outsiders().stream()
                        .map(o -> new FindDateOutsiderResponse(
                                o.id(),
                                o.as(Outsider.class).name(),
                                scene.under(o.id()).size()))
                        .toList(),
                scene.myId() != null && tally.answered().contains(scene.myId()),
                scene.entries(CANT).stream().anyMatch(c -> scene.isMe(c.forId())),
                scene.entries(DOOR).stream()
                        .filter(door -> scene.canEdit() && door.token() != null)
                        .map(door -> urls.to("/when/" + door.token()))
                        .findFirst()
                        .orElse(null),
                scene.createdAt(),
                eventThere ? settings.setFor() : null,
                eventThere ? settings.eventId() : null);
    }

    private static FindDateBestResponse best(Scene scene, Tally tally) {
        Set<UUID> who = tally.members().getOrDefault(tally.best(), Set.of());
        List<String> names = new ArrayList<>(
                Say.names(scene, tally.asked().stream().filter(who::contains).toList()));
        names.addAll(tally.byLink().getOrDefault(tally.best(), List.of()));
        // "Lea, Lena, Ana and you": the viewer comes last.
        if (names.remove("you")) {
            names.add("you");
        }
        return new FindDateBestResponse(
                tally.best(),
                tally.bestFree(),
                tally.bestFree() == tally.answers(),
                tally.bestFree() == tally.people(),
                names);
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        throw BoardRules.unknownKind();
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        throw BoardRules.unknownKind();
    }

    /** An answer that came by link can be taken out by anyone who may change the board. Nothing else is removed this way. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!entry.is(OUTSIDER)) {
            throw BoardRules.unknownKind();
        }
        scene.remove(entry.id());
    }

    private static UUID myOwn(Scene scene) {
        if (scene.myId() == null || !Say.voiceIds(scene).contains(scene.myId())) {
            throw BoardRules.notYours();
        }
        return scene.myId();
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        switch (verb) {
            case "tap" -> {
                UUID me = myOwn(scene);
                LocalDate day = sent.day("day");
                if (day == null || day.isBefore(settings.from()) || day.isAfter(settings.to())) {
                    throw ApiProblem.badRequest("invalid_day", "Choose one of the days that are offered.");
                }
                EntryRow there = scene.entries(FREE).stream()
                        .filter(f -> me.equals(f.forId()) && f.parentId() == null && day.equals(f.day()))
                        .findFirst()
                        .orElse(null);
                if (!sent.flag("free", true)) {
                    if (there != null) {
                        scene.remove(there.id());
                    }
                    return;
                }
                if (day.isBefore(scene.today())) {
                    throw ApiProblem.badRequest("invalid_day", "That day has passed.");
                }
                scene.entries(CANT).stream().filter(c -> me.equals(c.forId())).forEach(c -> scene.remove(c.id()));
                if (there == null) {
                    scene.add(
                            EntryDraft.of(FREE).by(me).forMember(me).day(day),
                            Scene.derivedId(scene.boardId(), "free " + me + " " + day));
                }
            }
            case CANT -> {
                UUID me = myOwn(scene);
                List<EntryRow> said = scene.entries(CANT).stream()
                        .filter(c -> me.equals(c.forId()))
                        .toList();
                if (!sent.flag(CANT, true)) {
                    said.forEach(c -> scene.remove(c.id()));
                    return;
                }
                scene.entries(FREE).stream()
                        .filter(f -> me.equals(f.forId()) && f.parentId() == null)
                        .forEach(f -> scene.remove(f.id()));
                if (said.isEmpty()) {
                    scene.add(
                            EntryDraft.of(CANT).by(me).forMember(me).done(scene.now(), me),
                            Scene.derivedId(scene.boardId(), "cant " + me));
                }
            }
            case "opened" -> {
                if (scene.myId() != null && scene.entries(SEEN).stream().noneMatch(s -> scene.isMe(s.forId()))) {
                    scene.add(
                            EntryDraft.of(SEEN).forMember(scene.myId()).done(scene.now(), scene.myId()),
                            Scene.derivedId(scene.boardId(), "seen " + scene.myId()));
                }
            }
            case NUDGE -> nudge(scene, sent);
            case "set" -> set(scene, settings, sent);
            case "new_link" -> {
                scene.entries(DOOR).forEach(door -> scene.remove(door.id()));
                scene.add(EntryDraft.of(DOOR).token(Scene.newToken()), null);
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    /**
     * A nudge is remembered, once a day for each person, and shown on their Today. No push is sent from
     * here: a board's verbs run inside one database transaction, and nothing outside is waited on in one.
     * Whoever sends things is told through a {@link Nudge}.
     */
    private void nudge(Scene scene, Fields sent) {
        UUID member = scene.inCircle(sent.id("memberId"));
        Tally tally = tally(scene);
        if (member == null
                || !tally.asked().contains(member)
                || tally.answered().contains(member)) {
            throw ApiProblem.conflict("nobody_to_nudge", "They have answered already. There is nobody to nudge.");
        }
        EntryRow before = scene.entries(NUDGE).stream()
                .filter(n -> member.equals(n.forId()))
                .findFirst()
                .orElse(null);
        if (before != null
                && before.doneAt() != null
                && before.doneAt().isAfter(scene.now().minus(Duration.ofHours(20)))) {
            throw ApiProblem.conflict(
                    "nudged_already", scene.firstName(member) + " was nudged today already. Give it a day.");
        }
        if (before != null) {
            scene.save(before, EntryDraft.from(before).by(scene.myId()).done(scene.now(), scene.myId()));
        } else {
            scene.add(
                    EntryDraft.of(NUDGE).by(scene.myId()).forMember(member).done(scene.now(), scene.myId()),
                    Scene.derivedId(scene.boardId(), "nudge " + member));
        }
        told.publishEvent(new Nudge(
                scene.circleId(),
                scene.boardId(),
                ThingKind.BOARD,
                scene.myId(),
                member,
                scene.title(),
                scene.firstName(scene.myId()) + " is waiting for your answer: which days can you do?",
                Nudge.FIND_DATE,
                false));
    }

    /** The day goes into the calendar as an event with everyone on it. Setting the same day twice makes one event. */
    private void set(Scene scene, FindDateSettings settings, Fields sent) {
        LocalDate day = sent.day("day", tally(scene).best());
        if (day == null) {
            throw ApiProblem.conflict("no_day_yet", "Nobody has tapped a day yet. Choose the day to set.");
        }
        if (day.isBefore(settings.from()) || day.isAfter(settings.to()) || day.isBefore(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose one of the days that are offered and still to come.");
        }
        LocalTime time;
        try {
            time = sent.text("time", 5) == null ? null : LocalTime.parse(sent.text("time", 5));
        } catch (RuntimeException notATime) {
            throw ApiProblem.badRequest("invalid_time", "Write the time like 19:30.");
        }
        UUID event = events.create(
                        scene.me().userId(),
                        new NewEvent(
                                scene.circleId(),
                                scene.title(),
                                new When(day, time, null, null, sent.text("timeZone", 60, "UTC")),
                                null,
                                null,
                                null,
                                null,
                                null,
                                Say.voiceIds(scene).stream()
                                        .map(id -> new NewGuest(id, null, null, null))
                                        .toList(),
                                null,
                                scene.audience() == Audience.SOME ? null : scene.audience()),
                        Scene.derivedId(scene.boardId(), "set for " + day))
                .id();
        scene.saveSettings(new FindDateSettings(settings.from(), settings.to(), day, event));
    }

    // ---------- what it brings to the rest ----------

    private boolean isSet(Scene scene) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        return settings.eventId() != null && store.thingExists(settings.eventId());
    }

    @Override
    public String glance(Scene scene) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        if (isSet(scene)) {
            return "Set for " + dayWords(settings.setFor());
        }
        Tally tally = tally(scene);
        return tally.best() == null
                ? tally.answers() + " of " + tally.people() + " answered"
                : dayWords(tally.best()) + " works for " + tally.bestFree() + " of " + tally.people();
    }

    /** While it is still open: the best day so far and who it waits for. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        if (scene.me() == null || settings.to().isBefore(scene.today()) || isSet(scene)) {
            return List.of();
        }
        Tally tally = tally(scene);
        List<UUID> waiting = tally.asked().stream()
                .filter(id -> !tally.answered().contains(id))
                .toList();
        boolean mine = waiting.contains(scene.myId());
        List<String> names = new ArrayList<>(Say.names(scene, waiting));
        if (names.remove("you")) {
            names.add(0, "you");
        }
        boolean nudged = mine && scene.entries(NUDGE).stream().anyMatch(n -> scene.isMe(n.forId()));
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                tally.best() == null
                        ? "When can everyone?"
                        : dayWords(tally.best()) + " works for "
                                + (tally.bestFree() == tally.people()
                                        ? "everyone"
                                        : Say.spell(tally.bestFree()) + " of you"),
                scene.title()
                        + (names.isEmpty()
                                ? ""
                                : nudged ? " · the others are waiting for you" : " · waiting for " + Say.list(names)),
                null,
                null,
                mine ? "Answer" : null,
                5));
    }

    @Override
    public String guest(Scene scene) {
        FindDateSettings settings = scene.settings(FindDateSettings.class);
        if (isSet(scene)) {
            return "Set for " + dayWords(settings.setFor()) + ".";
        }
        Tally tally = tally(scene);
        return tally.best() == null
                ? "No day yet."
                : dayWords(tally.best()) + " works for " + tally.bestFree() + " so far.";
    }
}
