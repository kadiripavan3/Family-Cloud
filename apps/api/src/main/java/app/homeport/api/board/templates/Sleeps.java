package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Sleeps until…: a countdown the way a six-year-old counts, as a paper chain. One link comes off at bedtime.
 *
 * <p><b>The count.</b> The sleeps left are the nights between the viewer's today and the day: that is a
 * matter of the calendar and can't be got wrong. The chain is as long as the wait was when it was started
 * (sixty links at most), and a link is gone for every night that has passed. Tonight's link comes off when
 * someone tears it; a night nobody tore a link on has lost its link by the morning all the same.
 *
 * <p>A day that comes every year (a birthday, Christmas) counts to its next time round.
 *
 * <p>Nothing here is secret: everyone who sees the board sees all of it, and anyone who sees it may tear
 * tonight's link.
 */
@Component
class Sleeps implements BoardRules {

    static final String COUNT = "count";
    static final int MAX_LINKS = 60;

    record SleepsSettings() {}

    /**
     * Something to count down to. The entry's {@code day} is the day, and {@code for_id} whoever tears the
     * links off.
     *
     * @param from the day the chain was started
     * @param tornOn the last day someone tore a link off
     */
    record Count(String title, String emoji, String note, LocalDate from, LocalDate tornOn, Boolean yearly) {
        boolean everyYear() {
            return Boolean.TRUE.equals(yearly);
        }
    }

    record SleepsResponse(
            @Schema(nullable = true, description = "The nearest day there is to count down to: the one with the chain")
            SleepsCountResponse first,

            @Schema(description = "The others that are still to come, nearest first")
            List<SleepsCountResponse> others,

            @Schema(description = "The last few whose day has been, newest first")
            List<SleepsCountResponse> passed) {}

    record SleepsCountResponse(
            UUID id,

            @Schema(description = "What comes after “sleeps until”: Grandma Astrid comes")
            String title,

            @Schema(nullable = true) String emoji,

            @Schema(nullable = true, description = "A few words under it: from the trip")
            String note,

            @Schema(description = "The day it counts to. For one that comes every year, its next time round.")
            LocalDate day,

            boolean yearly,

            @Schema(description = "How many sleeps are left: the nights from today to the day. 0 on the day.")
            long sleeps,

            @Schema(description = "How many links the chain has: the sleeps there were when it was started, 60 at most")
            int links,

            @Schema(description = "How many of them are gone, tonight's included once it was torn off")
            int off,

            @Schema(description = "True when tonight's link was torn off already")
            boolean tornTonight,

            @Schema(description = "True while there is a link to tear off tonight")
            boolean canTear,

            @Schema(nullable = true, description = "Who tears the links off")
            PersonBrief tearer) {}

    @Override
    public Template template() {
        return Template.SLEEPS;
    }

    @Override
    public Class<?> settingsType() {
        return SleepsSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return SleepsResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return SleepsCountResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry count: title (what comes after “sleeps until”), day (a date), emoji, note, yearly (true for a"
                        + " birthday or Christmas), tearerMemberId (who tears the links off), from (the day the chain"
                        + " starts; left out: today)",
                "verb tear: entryId, torn (left out: true; false puts tonight's link back). Everyone who sees the"
                        + " board may tear, also with a board they may only look at.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("tear");
    }

    // ---------- the count ----------

    /** The day counted to: the day itself, or for one that comes every year its next time on or after today. */
    static LocalDate next(LocalDate day, boolean yearly, LocalDate today) {
        if (!yearly || !day.isBefore(today)) {
            return day;
        }
        // 29 February comes round as the 28th in a year without one.
        LocalDate thisYear = day.withYear(today.getYear());
        return thisYear.isBefore(today) ? day.withYear(today.getYear() + 1) : thisYear;
    }

    /** How many links the chain has: the nights from its start to the day, never fewer than are left, 60 at most. */
    static int links(LocalDate from, LocalDate day, long sleeps) {
        long whole = from == null || from.isBefore(day.minusYears(1)) ? MAX_LINKS : ChronoUnit.DAYS.between(from, day);
        return Math.clamp(Math.max(whole, sleeps), 0, MAX_LINKS);
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new SleepsSettings();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        List<SleepsCountResponse> all = scene.entries(COUNT).stream()
                .map(row -> count(scene, row))
                .sorted(Comparator.comparing(SleepsCountResponse::day))
                .toList();
        List<SleepsCountResponse> coming = all.stream()
                .filter(count -> !count.day().isBefore(scene.today()))
                .toList();
        return new SleepsResponse(
                coming.isEmpty() ? null : coming.get(0),
                coming.stream().skip(1).toList(),
                all.reversed().stream()
                        .filter(count -> count.day().isBefore(scene.today()))
                        .limit(5)
                        .toList());
    }

    private static SleepsCountResponse count(Scene scene, EntryRow row) {
        Count count = row.as(Count.class);
        LocalDate day = next(row.day(), count.everyYear(), scene.today());
        long sleeps = Math.max(0, ChronoUnit.DAYS.between(scene.today(), day));
        boolean tornTonight = sleeps > 0 && scene.today().equals(count.tornOn());
        // A chain started for an earlier year's birthday starts again for this one.
        int links = links(day.equals(row.day()) ? count.from() : null, day, sleeps);
        long left = Math.min(links, sleeps - (tornTonight ? 1 : 0));
        return new SleepsCountResponse(
                row.id(),
                count.title(),
                count.emoji(),
                count.note(),
                day,
                count.everyYear(),
                sleeps,
                links,
                (int) (links - left),
                tornTonight,
                sleeps > 0 && !tornTonight,
                scene.brief(row.forId()));
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(COUNT) ? count(scene, entry) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        Count count = entry.as(Count.class);
        return count.title() + (count.note() == null ? "" : " · " + count.note());
    }

    // ---------- changing it ----------

    private static EntryDraft filled(Scene scene, EntryDraft draft, Fields sent, Count now, LocalDate dayNow) {
        String title = sent.text("title", 120, now.title());
        if (title == null) {
            throw ApiProblem.badRequest("missing_title", "Say what you are counting down to.");
        }
        LocalDate day = sent.day("day", dayNow);
        boolean yearly = sent.flag("yearly", now.everyYear());
        if (day == null || (!yearly && !day.equals(dayNow) && day.isBefore(scene.today()))) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day. It has to be today or later.");
        }
        LocalDate from = sent.day("from", now.from());
        if (from == null || from.isAfter(scene.today())) {
            from = scene.today();
        }
        return draft.day(day)
                .doc(new Count(
                        title,
                        sent.text("emoji", 16, now.emoji()),
                        sent.text("note", 120, now.note()),
                        from,
                        now.tornOn(),
                        yearly));
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(COUNT)) {
            throw BoardRules.unknownKind();
        }
        return scene.add(
                filled(
                        scene,
                        EntryDraft.of(COUNT).by(scene.myId()).forMember(scene.inCircle(sent.id("tearerMemberId"))),
                        sent,
                        new Count(null, null, null, null, null, null),
                        null),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        scene.save(
                entry,
                filled(
                        scene,
                        EntryDraft.from(entry).forMember(scene.inCircle(sent.id("tearerMemberId", entry.forId()))),
                        sent,
                        entry.as(Count.class),
                        entry.day()));
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("tear")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow row = scene.need(sent.id("entryId"));
        Count count = row.as(Count.class);
        if (!next(row.day(), count.everyYear(), scene.today()).isAfter(scene.today())) {
            throw ApiProblem.conflict("no_links_left", "There are no links left. The day has come.");
        }
        LocalDate tornOn = sent.flag("torn", true) ? scene.today() : null;
        scene.save(
                row,
                EntryDraft.from(row)
                        .doc(new Count(
                                count.title(), count.emoji(), count.note(), count.from(), tornOn, count.yearly())));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        return scene.entries(COUNT).stream()
                .map(row -> count(scene, row))
                .filter(count -> !count.day().isBefore(scene.today()))
                .min(Comparator.comparing(SleepsCountResponse::day))
                .map(count -> count.sleeps() == 0
                        ? "Today: " + count.title()
                        : Words.count(count.sleeps(), "sleep") + " until " + count.title())
                .orElse("Nothing to count down to yet");
    }

    @Override
    public String guest(Scene scene) {
        return glance(scene);
    }
}
