package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * The fair share: the work nobody sees, as each of the two sees their own part of it.
 *
 * <p><b>What is counted.</b> There is one list of jobs (meals, bedtimes, the car, the bills). Each month each
 * person ticks the jobs that were theirs and guesses the hours each took. A person only ever ticks for
 * themselves: the hours are their own guesses. A month is then shown as it is: each one's jobs and hours, the
 * share of the whole each carried ({@link #percents}), and the gap between them in hours.
 *
 * <p><b>No scores.</b> Nothing here adds up over months, ranks anyone or says who is ahead. The one thing it
 * offers is a swap ({@link #swap}): when the two shares are further apart than {@value #CLOSE} points in a
 * hundred (53 to 47), it looks for one job of each to trade that brings them that close, and of those the
 * trade that moves the fewest hours. One of them can suggest it to the other, who says yes or no; nothing
 * changes by itself.
 *
 * <p>Nothing here is secret between the people who see the board; it is the board's own sharing that keeps
 * it to the two of them.
 */
@Component
class FairShare implements BoardRules {

    static final String JOB = "job";
    static final String CLAIM = "claim";
    static final String SWAP = "swap";
    /** Two shares are "close" when they are no more than this many points in a hundred apart. */
    static final int CLOSE = 6;

    private static final int MAX_JOBS = 60;

    record FairShareSettings(
            @Schema(description = "The members whose share it is about")
            List<UUID> people) {
        FairShareSettings {
            people = people == null ? List.of() : List.copyOf(people);
        }
    }

    record Job(String name, String emoji, Boolean retired) {
        boolean gone() {
            return Boolean.TRUE.equals(retired);
        }
    }

    /** A swap someone suggested. The entry's {@code author_id} suggested it, and {@code day} is the first of its month. */
    record Offer(UUID fromId, UUID giveJobId, UUID toId, UUID takeJobId, Boolean accepted) {}

    /** One trade: {@code from} hands the job {@code give} to {@code to} and takes the job {@code take} back. */
    record Trade(UUID from, UUID give, UUID to, UUID take, long gapAfter) {}

    record FairShareResponse(
            @Schema(description = "The month shown, as 2026-10")
            String month,

            @Schema(description = "Its name: October") String monthName,

            @Schema(description = "The months there is something for, newest first, as 2026-10")
            List<String> months,

            @Schema(description = "The hours of everyone together")
            long totalHours,

            @Schema(description = "Each person's side of it, in the order of the people")
            List<FairSharePersonResponse> people,

            @Schema(description = "How many hours the heaviest share is above the lightest")
            long gapHours,

            @Schema(description = "True when the shares are within 53 to 47 of each other, or nobody ticked anything")
            boolean close,

            @Schema(
                    nullable = true,
                    description = "One swap that would bring it close. Null when it is close, or none would.")
            FairShareSwapResponse swap,

            @Schema(nullable = true, description = "A swap one of them suggested for this month")
            FairShareOfferResponse offered,

            @Schema(description = "Every job on the list, with this person's own hours in the month shown")
            List<FairShareJobResponse> jobs,

            @Schema(description = "True when the month shown can still be ticked: this month and the one before")
            boolean canTick) {}

    record FairSharePersonResponse(
            PersonBrief person,
            boolean you,
            long hours,

            @Schema(description = "Their share of all the hours, 0 to 100. Everyone's add up to 100.")
            int percent,

            @Schema(description = "The jobs they ticked, the biggest first")
            List<FairShareHoursResponse> jobs) {}

    record FairShareHoursResponse(
            UUID jobId,
            String name,
            @Schema(nullable = true) String emoji,
            long hours) {}

    record FairShareSwapResponse(
            PersonBrief from,
            FairShareHoursResponse gives,
            PersonBrief to,
            FairShareHoursResponse takes,

            @Schema(description = "The gap in hours there would be afterwards")
            long gapAfter,

            @Schema(description = "In words, for the person looking: Alex takes the school things; you take the car.")
            String line) {}

    record FairShareOfferResponse(
            UUID id,
            @Schema(nullable = true) PersonBrief by,

            @Schema(description = "True when the person looking suggested it")
            boolean yours,

            Instant at,
            String line,

            @Schema(nullable = true, description = "What the other one said: true, false, or null for nothing yet")
            Boolean accepted) {}

    record FairShareJobResponse(
            UUID id,
            String name,
            @Schema(nullable = true) String emoji,

            @Schema(nullable = true, description = "This person's hours for it in the month shown. Null: not theirs.")
            Long yourHours) {}

    @Override
    public Template template() {
        return Template.FAIR_SHARE;
    }

    @Override
    public Class<?> settingsType() {
        return FairShareSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return FairShareResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: people (the member ids whose share it is about; left out: everyone in the circle)",
                "entry job: name, emoji",
                "verb tick: jobId, hours (1 to 744; left out: your guess from last time, or 1), mine (left out:"
                        + " true; false takes it off your side), month (as 2026-11; this month or the one before;"
                        + " left out: this month). You only ever tick for yourself.",
                "verb suggest: month (left out: the month shown by default). Puts the swap the board offers in"
                        + " front of the other one.",
                "verb answer: entryId (the suggested swap), yes (true or false). For the one it was suggested to.",
                "show: a month, as 2026-10. Left out: last month when something was ticked in it, else this month.",
                "Everyone the share is about may use these verbs, also with a board they may only look at.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return List.of("tick", "suggest", "answer").contains(verb);
    }

    @Override
    public int ceiling() {
        return 20000;
    }

    // ---------- the sums ----------

    /** Shares of a hundred that add up to exactly 100: each rounded down, the points left over to the largest remainders. */
    static List<Integer> percents(List<Long> hours) {
        long total = hours.stream().mapToLong(Long::longValue).sum();
        if (total == 0) {
            return hours.stream().map(h -> 0).toList();
        }
        List<Integer> percents =
                new ArrayList<>(hours.stream().map(h -> (int) (h * 100 / total)).toList());
        List<Integer> byRemainder = new ArrayList<>();
        for (int i = 0; i < hours.size(); i++) {
            byRemainder.add(i);
        }
        byRemainder.sort(Comparator.comparingLong((Integer i) -> -(hours.get(i) * 100 % total)));
        int left = 100 - percents.stream().mapToInt(Integer::intValue).sum();
        for (int i = 0; i < left; i++) {
            int index = byRemainder.get(i % byRemainder.size());
            percents.set(index, percents.get(index) + 1);
        }
        return percents;
    }

    /** True when two amounts of hours are within {@value #CLOSE} points in a hundred of each other. */
    static boolean close(long one, long other) {
        return Math.abs(one - other) * 100 <= CLOSE * (one + other);
    }

    /**
     * One trade between the person with the most hours and the person with the fewest: a job of each, so that
     * afterwards they are close. Of the trades that do that, the one that moves the fewest hours; when none
     * does, the one that leaves the smallest gap, if it is smaller than it was. Null when they are close
     * already, or no trade helps. A job both of them ticked is left alone.
     *
     * @param hours for each person, the hours of each job they ticked
     */
    static Trade swap(Map<UUID, Map<UUID, Long>> hours) {
        if (hours.size() < 2) {
            return null;
        }
        Map<UUID, Long> totals = new LinkedHashMap<>();
        hours.forEach((person, jobs) -> totals.put(
                person, jobs.values().stream().mapToLong(Long::longValue).sum()));
        UUID heavy = totals.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .orElseThrow()
                .getKey();
        UUID light = totals.entrySet().stream()
                .min(Map.Entry.comparingByValue())
                .orElseThrow()
                .getKey();
        long most = totals.get(heavy);
        long least = totals.get(light);
        if (heavy.equals(light) || close(most, least)) {
            return null;
        }
        Trade gentlest = null; // brings them close, and moves the fewest hours
        Trade nearest = null; // doesn't, but leaves the smallest gap
        for (Map.Entry<UUID, Long> give : hours.get(heavy).entrySet()) {
            for (Map.Entry<UUID, Long> take : hours.get(light).entrySet()) {
                long moved = give.getValue() - take.getValue();
                if (moved <= 0
                        || hours.get(light).containsKey(give.getKey())
                        || hours.get(heavy).containsKey(take.getKey())) {
                    continue;
                }
                long gap = Math.abs(most - least - 2 * moved);
                Trade trade = new Trade(heavy, give.getKey(), light, take.getKey(), gap);
                if (close(most - moved, least + moved)) {
                    long movedBefore = gentlest == null
                            ? Long.MAX_VALUE
                            : hours.get(heavy).get(gentlest.give())
                                    - hours.get(light).get(gentlest.take());
                    if (moved < movedBefore || (moved == movedBefore && gap < gentlest.gapAfter())) {
                        gentlest = trade;
                    }
                } else if (gap < most - least && (nearest == null || gap < nearest.gapAfter())) {
                    nearest = trade;
                }
            }
        }
        return gentlest != null ? gentlest : nearest;
    }

    // ---------- reading a month ----------

    private static YearMonth month(String sent) {
        try {
            return YearMonth.parse(sent);
        } catch (RuntimeException notAMonth) {
            throw ApiProblem.badRequest("invalid_month", "Choose a month, like 2026-10.");
        }
    }

    /** The people it is about who are still in the circle. */
    private static List<UUID> people(Scene scene) {
        return scene.settings(FairShareSettings.class).people().stream()
                .filter(id -> scene.person(id) != null && !scene.person(id).left())
                .toList();
    }

    private static List<EntryRow> claims(Scene scene, YearMonth month) {
        return scene.entries(CLAIM).stream()
                .filter(claim ->
                        claim.day() != null && YearMonth.from(claim.day()).equals(month))
                .toList();
    }

    /** For each person, the hours of each job they ticked in a month, in the order of the people. */
    private static Map<UUID, Map<UUID, Long>> hours(Scene scene, YearMonth month) {
        Map<UUID, Map<UUID, Long>> hours = new LinkedHashMap<>();
        people(scene).forEach(person -> hours.put(person, new LinkedHashMap<>()));
        for (EntryRow claim : claims(scene, month)) {
            if (hours.containsKey(claim.forId()) && claim.parentId() != null) {
                hours.get(claim.forId()).put(claim.parentId(), claim.amountOr(0));
            }
        }
        return hours;
    }

    /** The month shown when none is asked for: last month when something was ticked in it, else this month. */
    private static YearMonth shownByDefault(Scene scene) {
        YearMonth last = YearMonth.from(scene.today()).minusMonths(1);
        return claims(scene, last).isEmpty() ? YearMonth.from(scene.today()) : last;
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        List<UUID> people = sent.ids("people", 10);
        if (people == null) {
            people = scene.isNew()
                    ? scene.humans().stream().map(Person::id).toList()
                    : scene.settings(FairShareSettings.class).people();
        }
        for (UUID id : people) {
            scene.inCircle(id);
            if (scene.person(id).kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_a_person", "The share is between people.");
            }
        }
        if (people.size() < 2) {
            throw ApiProblem.badRequest("too_few", "A share needs at least two people.");
        }
        return new FairShareSettings(people);
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        YearMonth month = show == null ? shownByDefault(scene) : month(show);
        Map<UUID, EntryRow> jobs = scene.entries(JOB).stream().collect(Collectors.toMap(EntryRow::id, job -> job));
        Map<UUID, Map<UUID, Long>> hours = hours(scene, month);
        List<UUID> people = List.copyOf(hours.keySet());
        List<Long> totals = people.stream()
                .map(person -> hours.get(person).values().stream()
                        .mapToLong(Long::longValue)
                        .sum())
                .toList();
        List<Integer> percents = percents(totals);
        List<FairSharePersonResponse> sides = new ArrayList<>();
        for (int i = 0; i < people.size(); i++) {
            UUID person = people.get(i);
            sides.add(new FairSharePersonResponse(
                    scene.brief(person),
                    scene.isMe(person),
                    totals.get(i),
                    percents.get(i),
                    hours.get(person).entrySet().stream()
                            .filter(job -> jobs.containsKey(job.getKey()))
                            .sorted(Map.Entry.<UUID, Long>comparingByValue().reversed())
                            .map(job -> hoursOf(jobs.get(job.getKey()), job.getValue()))
                            .toList()));
        }
        long most = totals.stream().mapToLong(Long::longValue).max().orElse(0);
        long least = totals.stream().mapToLong(Long::longValue).min().orElse(0);
        Trade trade = swap(hours);
        YearMonth now = YearMonth.from(scene.today());
        return new FairShareResponse(
                month.toString(),
                Phrases.month(month.atDay(1)),
                months(scene),
                totals.stream().mapToLong(Long::longValue).sum(),
                sides,
                most - least,
                close(most, least),
                trade == null || !jobs.containsKey(trade.give()) || !jobs.containsKey(trade.take())
                        ? null
                        : new FairShareSwapResponse(
                                scene.brief(trade.from()),
                                hoursOf(
                                        jobs.get(trade.give()),
                                        hours.get(trade.from()).get(trade.give())),
                                scene.brief(trade.to()),
                                hoursOf(
                                        jobs.get(trade.take()),
                                        hours.get(trade.to()).get(trade.take())),
                                trade.gapAfter(),
                                line(scene, jobs, trade.from(), trade.give(), trade.to(), trade.take())),
                scene.entries(SWAP).stream()
                        .filter(offer -> offer.day() != null
                                && YearMonth.from(offer.day()).equals(month))
                        .findFirst()
                        .map(offer -> offer(scene, jobs, offer))
                        .orElse(null),
                scene.entries(JOB).stream()
                        .filter(job -> !job.as(Job.class).gone())
                        .map(job -> {
                            Job named = job.as(Job.class);
                            return new FairShareJobResponse(
                                    job.id(),
                                    named.name(),
                                    named.emoji(),
                                    scene.myId() == null || !hours.containsKey(scene.myId())
                                            ? null
                                            : hours.get(scene.myId()).get(job.id()));
                        })
                        .toList(),
                !month.isBefore(now.minusMonths(1)) && !month.isAfter(now));
    }

    private static List<String> months(Scene scene) {
        List<YearMonth> months = new ArrayList<>(scene.entries(CLAIM).stream()
                .map(EntryRow::day)
                .filter(Objects::nonNull)
                .map(YearMonth::from)
                .distinct()
                .toList());
        if (!months.contains(YearMonth.from(scene.today()))) {
            months.add(YearMonth.from(scene.today()));
        }
        return months.stream()
                .sorted(Comparator.reverseOrder())
                .map(YearMonth::toString)
                .toList();
    }

    private static FairShareHoursResponse hoursOf(EntryRow job, Long hours) {
        Job named = job.as(Job.class);
        return new FairShareHoursResponse(job.id(), named.name(), named.emoji(), hours == null ? 0 : hours);
    }

    /** A job's name inside a sentence: "the school things", "the car". A name that is someone's own name stays as it is. */
    private static String inSentence(Scene scene, String name) {
        boolean someone = scene.members().stream()
                .anyMatch(person -> scene.firstName(person.id()).equalsIgnoreCase(name));
        if (someone) {
            return name;
        }
        String lower = name.substring(0, 1).toLowerCase(Locale.ROOT) + name.substring(1);
        return lower.startsWith("the ") ? lower : "the " + lower;
    }

    /** "Alex takes the school things; you take the car." */
    private static String line(Scene scene, Map<UUID, EntryRow> jobs, UUID from, UUID give, UUID to, UUID take) {
        String handed = jobs.containsKey(give)
                ? inSentence(scene, jobs.get(give).as(Job.class).name())
                : "one job";
        String back = jobs.containsKey(take)
                ? inSentence(scene, jobs.get(take).as(Job.class).name())
                : "another";
        String first = scene.isMe(to) ? "You take " : scene.firstName(to) + " takes ";
        String second = scene.isMe(from) ? "you take " : scene.firstName(from) + " takes ";
        return first + handed + "; " + second + back + ".";
    }

    private static FairShareOfferResponse offer(Scene scene, Map<UUID, EntryRow> jobs, EntryRow row) {
        Offer offer = row.as(Offer.class);
        return new FairShareOfferResponse(
                row.id(),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()),
                row.createdAt(),
                line(scene, jobs, offer.fromId(), offer.giveJobId(), offer.toId(), offer.takeJobId()),
                offer.accepted());
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(JOB) && !entry.as(Job.class).gone()
                ? entry.as(Job.class).name()
                : null;
    }

    // ---------- changing it ----------

    private static Job job(Fields sent, Job now) {
        String name = sent.text("name", 80, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Give the job a name.");
        }
        return new Job(name, sent.text("emoji", 16, now.emoji()), now.retired());
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(JOB)) {
            throw BoardRules.unknownKind();
        }
        if (scene.entries(JOB).stream().filter(job -> !job.as(Job.class).gone()).count() >= MAX_JOBS) {
            throw ApiProblem.conflict("too_many", "Sixty jobs is as many as one list holds.");
        }
        return scene.add(EntryDraft.of(JOB).by(scene.myId()).doc(job(sent, new Job(null, null, null))), clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(JOB)) {
            throw BoardRules.unknownKind(); // hours are ticked, and a swap is answered, with their verbs
        }
        scene.save(entry, EntryDraft.from(entry).doc(job(sent, entry.as(Job.class))));
    }

    /** A job that was ever ticked is taken off the list, not deleted: the months it was part of keep it. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(JOB) && !scene.under(entry.id()).isEmpty()) {
            Job job = entry.as(Job.class);
            scene.save(entry, EntryDraft.from(entry).doc(new Job(job.name(), job.emoji(), true)));
        } else if (entry.is(CLAIM) && !scene.isMe(entry.forId())) {
            throw BoardRules.notYours();
        } else {
            scene.remove(entry.id());
        }
    }

    private static UUID me(Scene scene) {
        if (scene.myId() == null || !people(scene).contains(scene.myId())) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "not_about_you", "This share is between other people.");
        }
        return scene.myId();
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "tick" -> tick(scene, sent);
            case "suggest" -> suggest(scene, sent);
            case "answer" -> {
                UUID me = me(scene);
                EntryRow row = scene.need(sent.id("entryId"));
                if (!row.is(SWAP)) {
                    throw Scene.entryGone();
                }
                if (me.equals(row.authorId())) {
                    throw ApiProblem.conflict("your_own", "You suggested this one. It is for the other one to answer.");
                }
                Boolean yes = sent.flag("yes");
                if (yes == null) {
                    throw ApiProblem.badRequest("missing_yes", "Say yes or no.");
                }
                Offer offer = row.as(Offer.class);
                scene.save(
                        row,
                        EntryDraft.from(row)
                                .done(scene.now(), me)
                                .doc(new Offer(
                                        offer.fromId(), offer.giveJobId(), offer.toId(), offer.takeJobId(), yes)));
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    /** Ticks a job as the viewer's own for a month, with their guess of its hours, or takes it off their side. */
    private static void tick(Scene scene, Fields sent) {
        UUID me = me(scene);
        EntryRow job = scene.need(sent.id("jobId"));
        if (!job.is(JOB) || job.as(Job.class).gone()) {
            throw Scene.entryGone();
        }
        YearMonth now = YearMonth.from(scene.today());
        YearMonth month = sent.has("month") ? month(sent.text("month", 7)) : now;
        if (month.isAfter(now) || month.isBefore(now.minusMonths(1))) {
            throw ApiProblem.badRequest("invalid_month", "Hours can be ticked for this month or the one before.");
        }
        List<EntryRow> mine = scene.under(job.id()).stream()
                .filter(claim -> claim.is(CLAIM) && me.equals(claim.forId()))
                .sorted(Comparator.comparing(EntryRow::day))
                .toList();
        EntryRow there = mine.stream()
                .filter(claim -> YearMonth.from(claim.day()).equals(month))
                .findFirst()
                .orElse(null);
        if (!sent.flag("mine", true)) {
            if (there != null) {
                scene.remove(there.id());
            }
            return;
        }
        long guess = mine.isEmpty() ? 1 : mine.get(mine.size() - 1).amountOr(1);
        Long hours = sent.whole("hours", 1, 744, there != null ? there.amount() : Long.valueOf(guess));
        if (hours == null) {
            hours = guess;
        }
        if (there != null) {
            scene.save(there, EntryDraft.from(there).amount(hours));
        } else {
            scene.add(
                    EntryDraft.of(CLAIM)
                            .under(job.id())
                            .by(me)
                            .forMember(me)
                            .day(month.atDay(1))
                            .amount(hours),
                    Scene.derivedId(job.id(), "claim " + month + " " + me));
        }
    }

    /** Puts the swap the board offers for a month in front of the other one. One suggestion a month. */
    private static void suggest(Scene scene, Fields sent) {
        UUID me = me(scene);
        YearMonth month = sent.has("month") ? month(sent.text("month", 7)) : shownByDefault(scene);
        Trade trade = swap(hours(scene, month));
        if (trade == null) {
            throw ApiProblem.conflict("nothing_to_swap", "It is close already, or no single swap would help.");
        }
        Offer offer = new Offer(trade.from(), trade.give(), trade.to(), trade.take(), null);
        EntryRow there = scene.entries(SWAP).stream()
                .filter(row -> row.day() != null && YearMonth.from(row.day()).equals(month))
                .findFirst()
                .orElse(null);
        if (there != null) {
            scene.save(there, EntryDraft.from(there).by(me).done(null, null).doc(offer));
        } else {
            scene.add(
                    EntryDraft.of(SWAP).by(me).day(month.atDay(1)).doc(offer),
                    Scene.derivedId(scene.boardId(), "swap " + month));
        }
    }

    // ---------- what it brings to the rest ----------

    /** "October · you 31 h, Alex 22 h" */
    @Override
    public String glance(Scene scene) {
        YearMonth month = shownByDefault(scene);
        Map<UUID, Map<UUID, Long>> hours = hours(scene, month);
        String sides = hours.entrySet().stream()
                .map(side -> (scene.isMe(side.getKey()) ? "you" : scene.firstName(side.getKey())) + " "
                        + side.getValue().values().stream()
                                .mapToLong(Long::longValue)
                                .sum() + " h")
                .collect(Collectors.joining(", "));
        return Phrases.month(month.atDay(1)) + " · " + sides;
    }
}
