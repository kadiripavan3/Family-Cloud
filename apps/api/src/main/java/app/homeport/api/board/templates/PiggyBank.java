package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.money.Cash;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The piggy bank: a child's pocket money in three jars (Spend, Save, Give), kept count of by the parents. It
 * isn't a bank account and moves no money: it is a count the child can see and trust.
 *
 * <p><b>Money is whole cents.</b> Every amount is a {@code long} of cents in the piggy bank's currency. A jar
 * never goes below nothing: taking out more than it holds is refused.
 *
 * <p><b>Interest.</b> The parents choose a rate, in whole percent a month, paid on what is in Save. On the
 * first of every month the bank pays that share of what Save held at the end of the day before, rounded to
 * the nearest cent (half a cent goes up). Nothing runs at midnight for it: the interest that has come due is
 * worked out by {@link #due} whenever the piggy bank is looked at, so the count is always right, and it is
 * written down as an entry of its own the next time anything is changed. Changing the rate first writes down
 * what was due at the old rate, so a new rate never reaches back.
 *
 * <p><b>Stars.</b> Money paid in can say how many stars it stands for ("10 stars from the chore wheel"). A
 * fund ("Skates fund, 50 stars") fills with those stars. The stars are typed by the parent who pays in; the
 * chore wheel and the habit charts are not read from here.
 *
 * <p>Only the people who run the circle (in a family, the grown-ups) change anything. Nothing here is secret:
 * everyone who sees the piggy bank sees all of it.
 */
@Component
class PiggyBank implements BoardRules {

    static final String IN = "in";
    static final String OUT = "out";
    static final String MOVE = "move";
    static final String INTEREST = "interest";
    static final String SPEND = "spend";
    static final String SAVE = "save";
    static final String GIVE = "give";
    private static final List<String> JARS = List.of(SPEND, SAVE, GIVE);

    // ---------- what is stored ----------

    record PiggyBankSettings(
            @Schema(description = "The child whose piggy bank it is")
            UUID forMemberId,

            @Schema(description = "The currency of every amount, as three letters: EUR")
            String currency,

            @Schema(description = "What the bank pays on Save, in whole percent a month. 0: no interest.")
            int interestPercent,

            @Schema(description = "Every first of the month up to this day is settled: interest is due from the next")
            LocalDate paidThrough,

            @Schema(nullable = true, description = "What one star is worth, in cents, when stars turn into money")
            Long starCents,

            @Schema(nullable = true, description = "What Save is for, counted in stars: Skates fund, 50 stars")
            PiggyBankFund fund,

            @Schema(nullable = true, description = "How full Spend is drawn against, in cents")
            Long spendGoalCents,

            @Schema(nullable = true, description = "How full Save is drawn against when there is no fund, in cents")
            Long saveGoalCents,

            @Schema(nullable = true, description = "How full Give is drawn against, in cents")
            Long giveGoalCents) {}

    record PiggyBankFund(String name, int stars) {}

    /**
     * Money in, money out, money from one jar to another, or the bank's interest. The entry's {@code amount}
     * is the cents, always above zero; its {@code day} is the day it happened.
     *
     * @param jar the jar it goes into or comes out of
     * @param toJar for money moved from one jar to another: where it went
     * @param fromName who it came from, when that is someone outside the circle: Astrid Lind
     * @param stars how many stars it stands for
     */
    record Money(String jar, String toJar, String title, String note, String fromName, Integer stars) {}

    /** Interest that has come due: the first of a month, and what the bank pays that day. */
    record Due(LocalDate day, long cents) {}

    // ---------- what a person sees ----------

    record PiggyBankResponse(
            @Schema(nullable = true) PersonBrief child,
            String currency,

            @Schema(description = "Everything in the three jars, in cents")
            long totalCents,

            @Schema(description = "Spend, Save and Give, in that order")
            List<PiggyBankJarResponse> jars,

            int interestPercent,

            @Schema(nullable = true, description = "The last interest the bank paid: €0.60 arrived on 1 November")
            PiggyBankInterestResponse lastInterest,

            @Schema(nullable = true, description = "The day the next interest arrives. Null while the rate is 0.")
            LocalDate nextInterestOn,

            @Schema(nullable = true) PiggyBankFundResponse fund,

            @Schema(nullable = true, description = "What one star is worth, in cents")
            Long starCents,

            @Schema(description = "The last three things that happened, newest first. The interest is not among them.")
            List<PiggyBankMoneyResponse> lately,

            @Schema(description = "True when this person runs the bank: in a family, the grown-ups")
            boolean canChange) {}

    record PiggyBankJarResponse(
            @Schema(description = "spend, save or give") String jar,
            long cents,

            @Schema(nullable = true, description = "What it is drawn against, in cents")
            Long goalCents,

            @Schema(
                    nullable = true,
                    description = "How full to draw it, 0 to 100. Null when it has nothing to be full of.")
            Integer fill) {}

    record PiggyBankInterestResponse(LocalDate day, long cents) {}

    record PiggyBankFundResponse(
            String name,

            @Schema(description = "How many stars it takes") int stars,

            @Schema(description = "How many stars were paid in so far")
            int starsIn,

            @Schema(description = "0 to 100") int percent,
            int starsToGo) {}

    record PiggyBankMoneyResponse(
            @Schema(nullable = true, description = "Null for interest that is due and not written down yet")
            UUID id,

            @Schema(description = "in, out, move or interest")
            String kind,

            @Schema(description = "The jar it went into or came out of: spend, save or give")
            String jar,

            @Schema(nullable = true, description = "For money moved between jars: where it went")
            String toJar,

            @Schema(description = "In cents: above zero for money in, below zero for money out")
            long cents,

            String title,
            @Schema(nullable = true) String note,

            @Schema(nullable = true, description = "Who it came from, when that is someone outside the circle")
            String fromName,

            @Schema(nullable = true, description = "How many stars it stands for")
            Integer stars,

            LocalDate day,

            @Schema(nullable = true, description = "Who wrote it down. Null for the bank's interest.")
            PersonBrief by) {}

    @Override
    public Template template() {
        return Template.PIGGY_BANK;
    }

    @Override
    public Class<?> settingsType() {
        return PiggyBankSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return PiggyBankResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return PiggyBankMoneyResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: forMemberId (the child), currency (left out: EUR), interestPercent (0 to 100 a month, paid"
                        + " on Save on the first of the month), starCents (what a star is worth), fund ({name, stars}"
                        + " or null), spendGoalCents, saveGoalCents, giveGoalCents",
                "entry in: jar (spend, save or give), cents, title, note, fromName, stars (with starCents set, cents"
                        + " may be left out), day (left out: today)",
                "entry out: jar, cents, title, note, day",
                "entry move: jar, toJar, cents, note, day",
                "Changing an entry changes its title and note. Interest is written by the bank, never sent.");
    }

    // ---------- the sums ----------

    /** Half a cent goes up: 5% of €12.10 is 60.5 cents, paid as 61. */
    static long share(long cents, int percent) {
        return cents <= 0 ? 0 : Math.floorDiv(cents * percent + 50, 100);
    }

    private static long delta(EntryRow row, String jar) {
        Money money = row.as(Money.class);
        long cents = row.amountOr(0);
        return switch (row.kind()) {
            case IN, INTEREST -> jar.equals(money.jar()) ? cents : 0;
            case OUT -> jar.equals(money.jar()) ? -cents : 0;
            case MOVE -> (jar.equals(money.toJar()) ? cents : 0) - (jar.equals(money.jar()) ? cents : 0);
            default -> 0;
        };
    }

    /**
     * The interest that has come due and isn't settled: one payment for every first of a month after
     * {@code paidThrough} up to today, each on what Save held at the end of the day before, the earlier
     * payments of this list included.
     *
     * @param saves what went into Save (above zero) and out of it (below), each with its day, in any order
     */
    static List<Due> due(List<Map.Entry<LocalDate, Long>> saves, LocalDate paidThrough, LocalDate today, int percent) {
        List<Due> due = new ArrayList<>();
        long paid = 0;
        LocalDate first = paidThrough.plusDays(1).withDayOfMonth(1);
        if (!first.isAfter(paidThrough)) {
            first = first.plusMonths(1);
        }
        for (; !first.isAfter(today); first = first.plusMonths(1)) {
            LocalDate on = first;
            long held = saves.stream()
                            .filter(step -> step.getKey().isBefore(on))
                            .mapToLong(Map.Entry::getValue)
                            .sum()
                    + paid;
            long cents = share(held, percent);
            if (cents > 0) {
                due.add(new Due(on, cents));
                paid += cents;
            }
        }
        return due;
    }

    private static List<EntryRow> money(Scene scene) {
        return scene.entries().stream()
                .filter(row -> row.day() != null)
                .sorted(Comparator.comparing(EntryRow::day).thenComparing(EntryRow::createdAt))
                .toList();
    }

    private static List<Due> due(Scene scene, PiggyBankSettings settings) {
        return due(
                money(scene).stream()
                        .map(row -> Map.entry(row.day(), delta(row, SAVE)))
                        .toList(),
                settings.paidThrough(),
                scene.today(),
                settings.interestPercent());
    }

    /** What each jar holds, the interest that is due included. */
    private static Map<String, Long> jars(Scene scene, PiggyBankSettings settings) {
        Map<String, Long> jars = new LinkedHashMap<>();
        for (String jar : JARS) {
            jars.put(
                    jar, money(scene).stream().mapToLong(row -> delta(row, jar)).sum());
        }
        jars.merge(SAVE, due(scene, settings).stream().mapToLong(Due::cents).sum(), Long::sum);
        return jars;
    }

    /** Writes down the interest that has come due, so what is changed next starts from a settled count. */
    private static void settle(Scene scene) {
        PiggyBankSettings settings = scene.settings(PiggyBankSettings.class);
        for (Due due : due(scene, settings)) {
            scene.add(
                    EntryDraft.of(INTEREST)
                            .day(due.day())
                            .position(scene.positionOn(due.day()))
                            .amount(due.cents())
                            .doc(new Money(
                                    SAVE, null, "Interest, " + settings.interestPercent() + "%", null, null, null)),
                    Scene.derivedId(scene.boardId(), "interest " + due.day()));
        }
        LocalDate first = scene.today().withDayOfMonth(1);
        if (first.isAfter(settings.paidThrough())) {
            scene.saveSettings(new PiggyBankSettings(
                    settings.forMemberId(),
                    settings.currency(),
                    settings.interestPercent(),
                    first,
                    settings.starCents(),
                    settings.fund(),
                    settings.spendGoalCents(),
                    settings.saveGoalCents(),
                    settings.giveGoalCents()));
        }
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        if (!scene.isNew()) {
            bankers(scene);
            settle(scene);
        }
        PiggyBankSettings now = scene.isNew()
                ? new PiggyBankSettings(null, Cash.EUR, 0, scene.today(), null, null, null, null, null)
                : scene.settings(PiggyBankSettings.class);
        UUID child = scene.inCircle(sent.id("forMemberId", now.forMemberId()));
        if (child == null || scene.person(child).kind() == MemberKind.PET) {
            throw ApiProblem.badRequest("missing_child", "Choose whose piggy bank it is.");
        }
        if (now.forMemberId() != null
                && !now.forMemberId().equals(child)
                && !scene.entries().isEmpty()) {
            throw ApiProblem.conflict("has_money", "There is money in here already. Start another for someone else.");
        }
        String currency = sent.has("currency") ? Cash.currency(sent.text("currency", 3)) : now.currency();
        if (!currency.equals(now.currency())
                && !scene.isNew()
                && !scene.entries().isEmpty()) {
            throw ApiProblem.conflict("has_money", "There is money in here already. Its currency stays as it is.");
        }
        PiggyBankFund fund = now.fund();
        if (sent.has("fund")) {
            Fields named = sent.inside("fund");
            Long stars = named.whole("stars", 1, 100_000);
            fund = stars == null
                    ? null
                    : new PiggyBankFund(named.need("name", 80, "Give the fund a name."), stars.intValue());
        }
        return new PiggyBankSettings(
                child,
                currency,
                Phrases.number(sent, "interestPercent", 0, 100, now.interestPercent()),
                now.paidThrough(),
                sent.whole("starCents", 1, 100_000, now.starCents()),
                fund,
                sent.whole("spendGoalCents", 1, Cash.MAX_CENTS, now.spendGoalCents()),
                sent.whole("saveGoalCents", 1, Cash.MAX_CENTS, now.saveGoalCents()),
                sent.whole("giveGoalCents", 1, Cash.MAX_CENTS, now.giveGoalCents()));
    }

    // ---------- what a person sees ----------

    private static Integer percent(long part, Long whole) {
        return whole == null || whole <= 0 ? null : Integer.valueOf(Math.clamp(part * 100 / whole, 0, 100));
    }

    @Override
    public Object view(Scene scene, String show) {
        PiggyBankSettings settings = scene.settings(PiggyBankSettings.class);
        Map<String, Long> jars = jars(scene, settings);
        List<EntryRow> money = money(scene);
        List<Due> due = due(scene, settings);
        PiggyBankFundResponse fund = fund(settings, money);
        PiggyBankInterestResponse last = !due.isEmpty()
                ? new PiggyBankInterestResponse(
                        due.get(due.size() - 1).day(), due.get(due.size() - 1).cents())
                : money.stream()
                        .filter(row -> row.is(INTEREST))
                        .reduce((earlier, later) -> later)
                        .map(row -> new PiggyBankInterestResponse(row.day(), row.amountOr(0)))
                        .orElse(null);
        return new PiggyBankResponse(
                scene.brief(settings.forMemberId()),
                settings.currency(),
                jars.values().stream().mapToLong(Long::longValue).sum(),
                List.of(
                        jar(SPEND, jars, settings.spendGoalCents(), null),
                        jar(SAVE, jars, settings.saveGoalCents(), fund == null ? null : fund.percent()),
                        jar(GIVE, jars, settings.giveGoalCents(), null)),
                settings.interestPercent(),
                last,
                settings.interestPercent() == 0
                        ? null
                        : scene.today().withDayOfMonth(1).plusMonths(1),
                fund,
                settings.starCents(),
                money.reversed().stream()
                        .filter(row -> !row.is(INTEREST))
                        .limit(3)
                        .map(row -> shown(scene, row))
                        .toList(),
                scene.canEdit() && scene.iRunTheCircle());
    }

    private static PiggyBankJarResponse jar(String jar, Map<String, Long> jars, Long goal, Integer fundPercent) {
        long cents = jars.get(jar);
        return new PiggyBankJarResponse(jar, cents, goal, fundPercent != null ? fundPercent : percent(cents, goal));
    }

    private static PiggyBankFundResponse fund(PiggyBankSettings settings, List<EntryRow> money) {
        if (settings.fund() == null) {
            return null;
        }
        int in = money.stream()
                .map(row -> row.as(Money.class).stars())
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .sum();
        int of = settings.fund().stars();
        return new PiggyBankFundResponse(
                settings.fund().name(), of, in, Math.clamp(in * 100L / of, 0, 100), Math.max(0, of - in));
    }

    private static PiggyBankMoneyResponse shown(Scene scene, EntryRow row) {
        Money money = row.as(Money.class);
        return new PiggyBankMoneyResponse(
                row.id(),
                row.kind(),
                money.jar(),
                money.toJar(),
                row.is(OUT) ? -row.amountOr(0) : row.amountOr(0),
                money.title(),
                money.note(),
                money.fromName(),
                money.stars(),
                row.day(),
                scene.brief(row.authorId()));
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.day() == null ? null : shown(scene, entry);
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        Money money = entry.as(Money.class);
        return money.title() + (money.note() == null ? "" : " · " + money.note());
    }

    // ---------- changing it ----------

    private static void bankers(Scene scene) {
        Phrases.requireGrownUp(scene, "Only the grown-ups run this bank.");
    }

    private static String jar(Fields sent, String name) {
        String jar = sent.text(name, 10);
        if (jar == null || !JARS.contains(jar)) {
            throw ApiProblem.badRequest("invalid_jar", "Choose a jar: Spend, Save or Give.");
        }
        return jar;
    }

    private static String name(String jar) {
        return jar.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + jar.substring(1);
    }

    private static void mustHold(Scene scene, PiggyBankSettings settings, String jar, long cents) {
        long held = jars(scene, settings).get(jar);
        if (cents > held) {
            throw ApiProblem.conflict(
                    "not_enough", "There is only " + Cash.exact(held, settings.currency()) + " in " + name(jar) + ".");
        }
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        bankers(scene);
        if (!List.of(IN, OUT, MOVE).contains(kind)) {
            throw BoardRules.unknownKind();
        }
        settle(scene);
        PiggyBankSettings settings = scene.settings(PiggyBankSettings.class);
        String jar = jar(sent, "jar");
        Long stars = kind.equals(IN) ? sent.whole("stars", 1, 100_000) : null;
        Long cents = sent.whole("cents", 1, Cash.MAX_CENTS);
        if (cents == null && stars != null && settings.starCents() != null) {
            cents = stars * settings.starCents();
        }
        if (cents == null) {
            throw ApiProblem.badRequest("missing_cents", "Say how much.");
        }
        LocalDate day = sent.day("day", scene.today());
        if (day == null
                || day.isAfter(scene.today())
                || day.isBefore(scene.today().minusDays(366))) {
            throw ApiProblem.badRequest("invalid_day", "Choose today or a day in the last year.");
        }
        String toJar = kind.equals(MOVE) ? jar(sent, "toJar") : null;
        if (jar.equals(toJar)) {
            throw ApiProblem.badRequest("same_jar", "Choose two different jars.");
        }
        if (!kind.equals(IN)) {
            mustHold(scene, settings, jar, cents);
        }
        String title = kind.equals(MOVE)
                ? sent.text("title", 120, "Moved to " + name(toJar))
                : sent.need("title", 120, kind.equals(IN) ? "Say where it came from." : "Say what it was for.");
        return scene.add(
                EntryDraft.of(kind)
                        .by(scene.myId())
                        .forMember(settings.forMemberId())
                        .day(day)
                        .position(scene.positionOn(day))
                        .amount(cents)
                        .doc(new Money(
                                jar,
                                toJar,
                                title,
                                sent.text("note", 200),
                                kind.equals(IN) ? sent.text("fromName", 80) : null,
                                stars == null ? null : stars.intValue())),
                clientId);
    }

    /** What happened stays as it was: only its words can be put right. A wrong amount is removed and added again. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        bankers(scene);
        Money now = entry.as(Money.class);
        String title = sent.text("title", 120, now.title());
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .doc(new Money(
                                now.jar(),
                                now.toJar(),
                                title == null ? now.title() : title,
                                sent.text("note", 200, now.note()),
                                now.fromName(),
                                now.stars())));
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        bankers(scene);
        if (entry.is(INTEREST)) {
            throw ApiProblem.conflict("interest_stays", "The bank's interest can't be taken back.");
        }
        settle(scene);
        PiggyBankSettings settings = scene.settings(PiggyBankSettings.class);
        Money money = entry.as(Money.class);
        // Money that came in can only go again while it is still in its jar.
        String holds = entry.is(IN) ? money.jar() : entry.is(MOVE) ? money.toJar() : null;
        if (holds != null && entry.amountOr(0) > jars(scene, settings).get(holds)) {
            throw ApiProblem.conflict("already_spent", "Some of that money has been spent or moved since.");
        }
        scene.remove(entry.id());
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        PiggyBankSettings settings = scene.settings(PiggyBankSettings.class);
        Map<String, Long> jars = jars(scene, settings);
        return Cash.exact(jars.values().stream().mapToLong(Long::longValue).sum(), settings.currency()) + " · "
                + Cash.exact(jars.get(SAVE), settings.currency()) + " in Save";
    }
}
