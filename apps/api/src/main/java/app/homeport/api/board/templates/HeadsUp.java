package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Heads-up: one line to tell the flat something ("six people over on Saturday", "away till Sunday"), and a
 * tap from each of the others to say it's fine, or that they'd like to talk first.
 *
 * <p>A notice may have days: the day it starts and the day it ends. Time away is a notice of its own kind,
 * and its nights are what "bills by nights" counts off (see {@link FairerSplit}): away from the 20th and
 * back on the 27th is seven nights.
 *
 * <p>A notice stays on the board until it is over: the day after it ends, or a week after it was written
 * when it has no days. Older ones are still read a page at a time. Only its writer changes or removes a
 * notice, and when its words or its days change, the answers given to the old ones are dropped: everyone is
 * asked again.
 *
 * <p>Nothing here is secret: everyone who sees the board sees every notice and every answer.
 */
@Component
class HeadsUp implements BoardRules {

    static final String NOTICE = "notice";
    static final String REPLY = "reply";
    static final String AWAY = "away";
    private static final Set<String> WHATS = Set.of(AWAY, "guests", "note");
    private static final Set<String> SAYS = Set.of("fine", "talk");
    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH);

    // ---------- what is stored ----------

    record HeadsUpSettings(
            @Schema(nullable = true, description = "A line that always stands under the notices: Quiet after 23:00")
            String standing,

            @Schema(nullable = true, description = "A line under it: From the House rules, agreed by all three.")
            String standingNote) {}

    /** The day a notice starts is the entry's day; {@code until} is the day it ends. */
    record Notice(String text, String detail, String what, LocalDate until) {}

    record Reply(String says, String text) {}

    // ---------- nights away ----------

    /** Time away: gone from the night that begins on {@code from}, back on {@code until}. */
    record Stay(LocalDate from, LocalDate until) {}

    /**
     * How many nights of a stretch of days someone was away. A night belongs to the day it begins on; the
     * stretch counts the nights of both its first and its last day. Two notices over the same night count it
     * once.
     */
    static int nightsAway(List<Stay> stays, LocalDate first, LocalDate last) {
        Set<LocalDate> nights = new HashSet<>();
        for (Stay stay : stays) {
            LocalDate night = stay.from().isBefore(first) ? first : stay.from();
            while (night.isBefore(stay.until()) && !night.isAfter(last)) {
                nights.add(night);
                night = night.plusDays(1);
            }
        }
        return nights.size();
    }

    /** The times away one member has given notice of, read from a heads-up board's entries. */
    static List<Stay> stays(List<EntryRow> entries, UUID memberId) {
        return entries.stream()
                .filter(e -> e.is(NOTICE) && memberId.equals(e.authorId()) && e.day() != null)
                .filter(e -> AWAY.equals(e.as(Notice.class).what())
                        && e.as(Notice.class).until() != null)
                .map(e -> new Stay(e.day(), e.as(Notice.class).until()))
                .toList();
    }

    // ---------- what a person sees ----------

    record HeadsUpViewResponse(
            @Schema(description = "The notices that aren't over, newest first")
            List<HeadsUpNoticeResponse> notices,

            @Schema(description = "How many older ones there are, read a page at a time")
            int earlier,

            @Schema(description = "How many wait for this person's answer")
            int needYou,

            @Schema(nullable = true) String standing,
            @Schema(nullable = true) String standingNote) {}

    record HeadsUpNoticeResponse(
            UUID id,
            String text,

            @Schema(nullable = true, description = "A few words more: on the sofa")
            String detail,

            @Schema(description = "away, guests or note") String what,

            @Schema(nullable = true) PersonBrief from,
            boolean mine,
            Instant writtenAt,

            @Schema(nullable = true, description = "The day it starts")
            LocalDate fromDay,

            @Schema(nullable = true, description = "The day it ends")
            LocalDate untilDay,

            @Schema(nullable = true, description = "For time away: the nights that come off the bills")
            Integer nightsAway,

            @Schema(description = "Everyone who answered, in the order they did")
            List<HeadsUpReplyResponse> replies,

            @Schema(description = "Who hasn't answered yet") List<PersonBrief> waitingFor,

            @Schema(description = "True when everyone else said it's fine")
            boolean everyoneFine,

            @Schema(nullable = true, description = "The viewer's own answer: fine or talk")
            String yourAnswer,

            @Schema(description = "True when it is someone else's, isn't over, and this person hasn't answered")
            boolean needsYou,

            @Schema(description = "True once it is over") boolean over) {}

    record HeadsUpReplyResponse(
            @Schema(nullable = true) PersonBrief who,

            @Schema(description = "fine or talk") String says,

            @Schema(nullable = true, description = "A few words with it: will water the plants")
            String text,

            boolean yours) {}

    @Override
    public Template template() {
        return Template.HEADS_UP;
    }

    @Override
    public Class<?> settingsType() {
        return HeadsUpSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return HeadsUpViewResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return HeadsUpNoticeResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: standing (a line that always stands under the notices), standingNote",
                "entry notice: text, detail (a few words more), what (away, guests or note; left out: note), from"
                        + " (the day it starts), until (the day it ends). Time away needs both days.",
                "verb answer: noticeId, says (fine or talk; null takes your answer back), text (a few words with it)",
                "entries list: kind notice gives every notice there ever was, newest first");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("answer");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        HeadsUpSettings now = scene.isNew() ? new HeadsUpSettings(null, null) : scene.settings(HeadsUpSettings.class);
        return new HeadsUpSettings(
                sent.text("standing", 120, now.standing()), sent.text("standingNote", 120, now.standingNote()));
    }

    // ---------- reading ----------

    /** The last day a notice is about: its end, its start, or a week after it was written. */
    private static LocalDate lastDay(EntryRow notice) {
        LocalDate until = notice.as(Notice.class).until();
        if (until != null) {
            return until;
        }
        return notice.day() != null
                ? notice.day()
                : notice.createdAt().atOffset(ZoneOffset.UTC).toLocalDate().plusDays(7);
    }

    private static boolean over(Scene scene, EntryRow notice) {
        return lastDay(notice).isBefore(scene.today());
    }

    private static List<EntryRow> newestFirst(Scene scene) {
        return scene.entries(NOTICE).stream()
                .sorted(Comparator.comparing(EntryRow::createdAt)
                        .thenComparing(EntryRow::id)
                        .reversed())
                .toList();
    }

    /** Who is asked: everyone who speaks for themselves, except the writer. */
    private static List<UUID> asked(Scene scene, EntryRow notice) {
        return Say.voiceIds(scene).stream()
                .filter(id -> !id.equals(notice.authorId()))
                .toList();
    }

    private static List<EntryRow> replies(Scene scene, EntryRow notice) {
        return scene.under(notice.id()).stream().filter(e -> e.is(REPLY)).toList();
    }

    private static boolean needs(Scene scene, EntryRow notice) {
        return scene.me() != null
                && !over(scene, notice)
                && asked(scene, notice).contains(scene.myId())
                && replies(scene, notice).stream().noneMatch(r -> scene.isMe(r.authorId()));
    }

    private static boolean everyoneFine(Scene scene, EntryRow notice) {
        List<EntryRow> replies = replies(scene, notice);
        List<UUID> asked = asked(scene, notice);
        return !asked.isEmpty()
                && asked.stream()
                        .allMatch(id -> replies.stream()
                                .anyMatch(r -> id.equals(r.authorId())
                                        && "fine".equals(r.as(Reply.class).says())));
    }

    @Override
    public Object view(Scene scene, String show) {
        HeadsUpSettings settings = scene.settings(HeadsUpSettings.class);
        List<EntryRow> all = newestFirst(scene);
        List<EntryRow> current = all.stream().filter(n -> !over(scene, n)).toList();
        return new HeadsUpViewResponse(
                current.stream().map(n -> notice(scene, n)).toList(),
                all.size() - current.size(),
                (int) current.stream().filter(n -> needs(scene, n)).count(),
                settings.standing(),
                settings.standingNote());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(NOTICE) ? notice(scene, entry) : null;
    }

    private static HeadsUpNoticeResponse notice(Scene scene, EntryRow row) {
        Notice notice = row.as(Notice.class);
        List<EntryRow> replies = replies(scene, row);
        Set<UUID> answered = new HashSet<>();
        replies.forEach(r -> answered.add(r.authorId()));
        boolean away = AWAY.equals(notice.what()) && row.day() != null && notice.until() != null;
        return new HeadsUpNoticeResponse(
                row.id(),
                notice.text(),
                notice.detail(),
                notice.what() == null ? "note" : notice.what(),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()),
                row.createdAt(),
                row.day(),
                notice.until(),
                away ? (int) ChronoUnit.DAYS.between(row.day(), notice.until()) : null,
                replies.stream()
                        .map(r -> new HeadsUpReplyResponse(
                                scene.brief(r.authorId()),
                                r.as(Reply.class).says(),
                                r.as(Reply.class).text(),
                                scene.isMe(r.authorId())))
                        .toList(),
                asked(scene, row).stream()
                        .filter(id -> !answered.contains(id))
                        .map(scene::brief)
                        .filter(Objects::nonNull)
                        .toList(),
                everyoneFine(scene, row),
                replies.stream()
                        .filter(r -> scene.isMe(r.authorId()))
                        .map(r -> r.as(Reply.class).says())
                        .findFirst()
                        .orElse(null),
                needs(scene, row),
                over(scene, row));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(NOTICE)) {
            return null;
        }
        Notice notice = entry.as(Notice.class);
        return notice.text() + (notice.detail() == null ? "" : " · " + notice.detail());
    }

    // ---------- changing it ----------

    private static Notice checked(Scene scene, Fields sent, Notice now, LocalDate from) {
        String text = sent.text("text", 200, now.text());
        if (text == null) {
            throw ApiProblem.badRequest("missing_text", "Write what you want to tell the flat.");
        }
        String what = sent.text("what", 10, now.what());
        if (what == null) {
            what = "note";
        }
        if (!WHATS.contains(what)) {
            throw ApiProblem.badRequest("invalid_what", "A notice is about time away, about guests, or a note.");
        }
        LocalDate until = sent.day("until", now.until());
        if (from != null
                && (from.isBefore(scene.today().minusDays(92))
                        || from.isAfter(scene.today().plusYears(1)))) {
            throw ApiProblem.badRequest("invalid_day", "Choose a day within a year from now.");
        }
        if (until != null && (from == null || until.isBefore(from) || until.isAfter(from.plusYears(1)))) {
            throw ApiProblem.badRequest("invalid_day", "The day it ends has to come after the day it starts.");
        }
        if (what.equals(AWAY) && (from == null || until == null || !until.isAfter(from))) {
            throw ApiProblem.badRequest("missing_days", "Say the day you leave and the day you're back.");
        }
        return new Notice(text, sent.text("detail", 120, now.detail()), what, until);
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(NOTICE)) {
            throw BoardRules.unknownKind();
        }
        LocalDate from = sent.day("from");
        return scene.add(
                EntryDraft.of(NOTICE)
                        .by(scene.myId())
                        .day(from)
                        .doc(checked(scene, sent, new Notice(null, null, null, null), from)),
                clientId);
    }

    /** Only its writer changes a notice. New words or new days are a new question: the old answers go. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(NOTICE)) {
            throw BoardRules.unknownKind();
        }
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        Notice now = entry.as(Notice.class);
        LocalDate from = sent.day("from", entry.day());
        Notice next = checked(scene, sent, now, from);
        boolean asksAgain = !next.text().equals(now.text())
                || !Objects.equals(from, entry.day())
                || !Objects.equals(next.until(), now.until());
        scene.save(entry, EntryDraft.from(entry).day(from).doc(next));
        if (asksAgain) {
            replies(scene, entry).forEach(reply -> scene.remove(reply.id()));
        }
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("answer")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow notice = scene.need(sent.id("noticeId"));
        if (!notice.is(NOTICE)) {
            throw Scene.entryGone();
        }
        if (scene.isMe(notice.authorId())) {
            throw ApiProblem.conflict("your_own", "It's your own notice. The others answer it.");
        }
        String says = sent.text("says", 10);
        EntryRow mine = replies(scene, notice).stream()
                .filter(r -> scene.isMe(r.authorId()))
                .findFirst()
                .orElse(null);
        if (says == null) {
            if (mine != null) {
                scene.remove(mine.id());
            }
            return;
        }
        if (!SAYS.contains(says)) {
            throw ApiProblem.badRequest("invalid_answer", "Say it's fine, or that you'd like to talk.");
        }
        Reply reply = new Reply(says, sent.text("text", 120));
        if (mine != null) {
            scene.save(mine, EntryDraft.from(mine).doc(reply));
        } else {
            scene.add(
                    EntryDraft.of(REPLY)
                            .under(notice.id())
                            .by(scene.myId())
                            .done(scene.now(), scene.myId())
                            .doc(reply),
                    Scene.derivedId(notice.id(), "reply of " + scene.myId()));
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<EntryRow> current =
                scene.entries(NOTICE).stream().filter(n -> !over(scene, n)).toList();
        long needYou = current.stream().filter(n -> needs(scene, n)).count();
        if (current.isEmpty()) {
            return "Nothing to tell just now";
        }
        return Words.count(current.size(), "notice")
                + (needYou == 0 ? "" : " · " + needYou + (needYou == 1 ? " waits" : " wait") + " for your answer");
    }

    /** How the others stand on a notice, in a few words. */
    private static String standing(Scene scene, EntryRow notice) {
        if (everyoneFine(scene, notice)) {
            return "everyone said fine";
        }
        List<EntryRow> replies = replies(scene, notice);
        List<UUID> talk = replies.stream()
                .filter(r -> "talk".equals(r.as(Reply.class).says()))
                .map(EntryRow::authorId)
                .toList();
        if (!talk.isEmpty()) {
            List<String> names = Say.names(scene, talk);
            return Say.list(names) + (names.size() == 1 && !names.get(0).equals("you") ? " wants" : " want")
                    + " to talk";
        }
        List<UUID> waiting = asked(scene, notice).stream()
                .filter(id -> replies.stream().noneMatch(r -> id.equals(r.authorId())))
                .toList();
        return waiting.isEmpty() ? null : "waiting for " + Say.list(Say.names(scene, waiting));
    }

    /** "until Sunday" within the week, "until 27 Nov" further off. */
    private static String until(Scene scene, LocalDate day) {
        return "until " + (ChronoUnit.DAYS.between(scene.today(), day) < 7 ? WEEKDAY.format(day) : Words.shortDay(day));
    }

    /**
     * A notice with days is on Today from four days before it starts until it is over: "Fri · My sister's
     * staying · Lena · until Sunday · everyone said fine". One that still waits for the viewer's answer is a
     * card instead (see {@link #cards}).
     */
    @Override
    public List<TodayItem> today(Scene scene) {
        List<TodayItem> items = new ArrayList<>();
        for (EntryRow row : newestFirst(scene)) {
            if (row.day() == null
                    || over(scene, row)
                    || row.day().isAfter(scene.today().plusDays(4))
                    || needs(scene, row)) {
                continue;
            }
            Notice notice = row.as(Notice.class);
            List<String> note = new ArrayList<>();
            note.add(scene.isMe(row.authorId()) ? "You" : scene.firstName(row.authorId()));
            if (notice.until() != null && notice.until().isAfter(scene.today())) {
                note.add(until(scene, notice.until()));
            }
            String standing = standing(scene, row);
            if (standing != null) {
                note.add(standing);
            }
            items.add(new TodayItem(
                    scene.boardId(),
                    ThingKind.BOARD,
                    notice.text(),
                    String.join(" · ", note),
                    row.day().isAfter(scene.today()) ? Words.weekday(row.day()) : "Now",
                    null,
                    1440,
                    scene.avatars(row.authorId())));
        }
        return items.stream().limit(3).toList();
    }

    /** A notice that waits for this person's answer, two at most, the soonest first. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        return scene.entries(NOTICE).stream()
                .filter(n -> needs(scene, n))
                .sorted(Comparator.comparing(HeadsUp::lastDay))
                .limit(2)
                .map(n -> new TodayCard(
                        scene.boardId(),
                        ThingKind.BOARD,
                        template().code(),
                        template().emoji(),
                        n.as(Notice.class).text(),
                        scene.firstName(n.authorId()) + " · waiting for your answer",
                        n.day() == null || n.day().isBefore(scene.today())
                                ? null
                                : n.day().isBefore(scene.today().plusDays(7))
                                        ? Words.weekday(n.day())
                                        : Words.shortDay(n.day()),
                        null,
                        "Answer",
                        20))
                .toList();
    }
}
