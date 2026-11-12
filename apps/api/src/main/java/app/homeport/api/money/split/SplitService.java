package app.homeport.api.money.split;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.money.Cash;
import app.homeport.api.money.MoneyPeople;
import app.homeport.api.money.MoneyPeople.Person;
import app.homeport.api.money.Shares;
import app.homeport.api.money.split.Settle.Payment;
import app.homeport.api.money.split.SplitStore.ExpenseRow;
import app.homeport.api.money.split.SplitStore.Part;
import app.homeport.api.money.split.SplitStore.PaymentRow;
import app.homeport.api.money.split.SplitStore.Reminded;
import app.homeport.api.money.split.SplitStore.ShareRow;
import app.homeport.api.notify.Nudge;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Splitting costs: everyone adds what they paid and who shares it; this keeps count of who is owed and who
 * owes, and works out the fewest payments that settle it. It only keeps count: a payment is something a
 * person says they made, never something the app does.
 *
 * <p>How a balance is counted: paying for something puts its whole amount in your favour; your share of
 * everything shared with you counts against you (divided by {@link Shares}, so the shares of one expense
 * always add up to it); a payment you made to someone counts for you and against them. All balances of a
 * split therefore add up to zero, to the cent.
 */
@Service
public class SplitService {

    static final int MAX_EXPENSES = 2000;
    static final int MAX_PAYMENTS = 2000;
    static final int LATEST = 20;

    public record ExpenseShareResponse(
            PersonBrief person,

            @Schema(description = "Their weight: 1 for an equal split, their shares, or their exact cents")
            long weight,

            @Schema(description = "What that comes to, in cents. The shares of an expense add up to it.")
            long cents,

            boolean you) {}

    public record ExpenseResponse(
            UUID id,
            UUID splitId,
            String title,
            String emoji,
            long amountCents,
            @Schema(nullable = true) PersonBrief paidBy,
            boolean paidByYou,
            ShareMode mode,
            LocalDate spentOn,

            @Schema(description = "Who shares it, and what each one's part comes to")
            List<ExpenseShareResponse> shares,

            @Schema(nullable = true) PersonBrief addedBy,
            Instant createdAt) {}

    /** Where one person stands in a split. */
    public record StandingResponse(
            PersonBrief person,

            @Schema(description = "What they paid for, in cents")
            long paidCents,

            @Schema(description = "Their share of everything, in cents")
            long shareCents,

            @Schema(
                    description =
                            "Above zero: they are owed this. Below zero: they owe it. In cents, with the payments already made counted in.")
            long balanceCents,

            boolean you) {}

    /** One of the fewest payments that settle everything. */
    public record ToPayResponse(
            PersonBrief from,
            PersonBrief to,
            long cents,

            @Schema(description = "True when the signed-in person is the one to pay")
            boolean youPay,

            @Schema(description = "True when the signed-in person is the one paid: they can remind the other")
            boolean paysYou,

            @Schema(nullable = true, description = "When the one who pays was last reminded")
            Instant remindedAt) {}

    /** A payment someone said was made. */
    public record PaymentResponse(
            UUID id, PersonBrief from, PersonBrief to, long amountCents, LocalDate paidOn, Instant createdAt) {}

    public record SplitResponse(
            UUID id,
            UUID circleId,
            String title,
            String currency,

            @Schema(description = "How many expenses were added")
            int expenses,

            @Schema(description = "What they come to in all, in cents")
            long totalCents,

            @Schema(description = "Above zero: you are owed this. Below zero: you owe it. Zero: you are even.")
            long myBalanceCents,

            @Schema(description = "Everyone in the circle who can share a cost, and where each stands")
            List<StandingResponse> people,

            @Schema(description = "The fewest payments that settle everything: yours first, then the largest")
            List<ToPayResponse> settle,

            @Schema(description = "The twenty latest expenses. The rest come from the expenses route.")
            List<ExpenseResponse> latest,

            @Schema(description = "The twenty latest payments that were made")
            List<PaymentResponse> paid,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** A split in a list. */
    public record SplitBriefResponse(
            UUID id,
            UUID circleId,
            String title,
            String currency,
            long myBalanceCents,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** What one person is owed (above zero) or owes (below zero) in one currency. */
    public record Owed(String currency, long cents) {}

    /** What someone owes the viewer (above zero), or the viewer owes them (below zero), across a circle's splits. */
    public record OwingResponse(PersonBrief person, long cents, String currency) {}

    public record ShareInput(UUID memberId, Long weight, Long cents) {}

    public record ExpenseInput(
            String title,
            String emoji,
            Long amountCents,
            UUID paidBy,
            ShareMode mode,
            List<ShareInput> shares,
            LocalDate spentOn) {}

    /** A split with its balances worked out. */
    private record Counted(
            Map<UUID, Long> balance,
            Map<UUID, Long> paid,
            Map<UUID, Long> share,
            int expenses,
            long total,
            List<UUID> order,
            List<Payment> settle) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final SplitStore splits;
    private final CircleService circles;
    private final MoneyPeople people;
    private final ApplicationEventPublisher events;

    SplitService(
            ThingService things,
            ThingStore thingStore,
            SplitStore splits,
            CircleService circles,
            MoneyPeople people,
            ApplicationEventPublisher events) {
        this.things = things;
        this.thingStore = thingStore;
        this.splits = splits;
        this.circles = circles;
        this.people = people;
        this.events = events;
    }

    // ---------- counting ----------

    /**
     * Adds up one split: what each person paid, what their share of everything is, and so where they stand.
     * An expense nobody shares any more (everyone who did was removed from the circle) is its payer's own.
     *
     * @param circle everyone of the circle, in its order: the order people are listed and settled in
     */
    static Map<UUID, long[]> count(List<Part> parts, List<PaymentRow> payments, List<UUID> circle) {
        // For each person: what they paid, their share, their balance.
        Map<UUID, long[]> count = new LinkedHashMap<>();
        circle.forEach(member -> count.put(member, new long[3]));
        Map<UUID, List<Part>> byExpense =
                parts.stream().collect(Collectors.groupingBy(Part::expenseId, LinkedHashMap::new, Collectors.toList()));
        for (List<Part> expense : byExpense.values()) {
            Part first = expense.get(0);
            List<Part> sharing =
                    expense.stream().filter(part -> part.memberId() != null).toList();
            long[] paid = count.computeIfAbsent(first.paidBy(), member -> new long[3]);
            paid[0] += first.amountCents();
            if (sharing.isEmpty()) {
                paid[1] += first.amountCents();
                continue;
            }
            int payer = -1;
            long[] weights = new long[sharing.size()];
            for (int i = 0; i < weights.length; i++) {
                weights[i] = sharing.get(i).weight();
                if (sharing.get(i).memberId().equals(first.paidBy())) {
                    payer = i;
                }
            }
            long[] cents = Shares.split(first.amountCents(), weights, payer);
            paid[2] += first.amountCents();
            for (int i = 0; i < cents.length; i++) {
                long[] theirs = count.computeIfAbsent(sharing.get(i).memberId(), member -> new long[3]);
                theirs[1] += cents[i];
                theirs[2] -= cents[i];
            }
        }
        for (PaymentRow payment : payments) {
            count.computeIfAbsent(payment.from(), member -> new long[3])[2] += payment.amountCents();
            count.computeIfAbsent(payment.to(), member -> new long[3])[2] -= payment.amountCents();
        }
        return count;
    }

    private static Counted counted(List<Part> parts, List<PaymentRow> payments, List<UUID> circle) {
        Map<UUID, long[]> count = count(parts, payments, circle);
        List<UUID> order = List.copyOf(count.keySet());
        long[] balances =
                order.stream().mapToLong(member -> count.get(member)[2]).toArray();
        Map<UUID, Long> balance = new HashMap<>();
        Map<UUID, Long> paid = new HashMap<>();
        Map<UUID, Long> share = new HashMap<>();
        count.forEach((member, sums) -> {
            paid.put(member, sums[0]);
            share.put(member, sums[1]);
            balance.put(member, sums[2]);
        });
        Map<UUID, Long> amounts = new HashMap<>();
        parts.forEach(part -> amounts.put(part.expenseId(), part.amountCents()));
        return new Counted(
                balance,
                paid,
                share,
                amounts.size(),
                amounts.values().stream().mapToLong(Long::longValue).sum(),
                order,
                Settle.fewest(balances));
    }

    /** The splits of a circle the viewer may see, each added up. Three statements however many there are. */
    private Map<ThingRow, Counted> countedIn(UUID circleId, UUID me, Map<UUID, Person> circle) {
        List<ThingRow> rows = splits.visible(circleId, me);
        List<UUID> ids = rows.stream().map(ThingRow::id).toList();
        Map<UUID, List<Part>> parts = splits.parts(ids).stream().collect(Collectors.groupingBy(Part::thingId));
        Map<UUID, List<PaymentRow>> payments =
                splits.payments(ids).stream().collect(Collectors.groupingBy(PaymentRow::thingId));
        Map<ThingRow, Counted> all = new LinkedHashMap<>();
        for (ThingRow row : rows) {
            all.put(
                    row,
                    counted(
                            parts.getOrDefault(row.id(), List.of()),
                            payments.getOrDefault(row.id(), List.of()),
                            List.copyOf(circle.keySet())));
        }
        return all;
    }

    private static UUID mine(Map<UUID, Person> circle, UUID me) {
        return circle.values().stream()
                .filter(person -> me.equals(person.userId()) && !person.left())
                .map(Person::id)
                .findFirst()
                .orElse(null);
    }

    // ---------- for the rest of the app ----------

    /**
     * What the signed-in person is owed (above zero) or owes (below zero) in a circle, across every split of
     * it they may see, for each currency there is something in. Empty when they are even, or see none. The
     * circle switcher's "you're owed €64" is this.
     */
    public List<Owed> owed(UUID circleId, UUID me) {
        Map<UUID, Person> circle = people.of(circleId);
        UUID mine = mine(circle, me);
        if (mine == null) {
            return List.of();
        }
        Map<ThingRow, Counted> all = countedIn(circleId, me, circle);
        Map<UUID, String> currencies =
                splits.currencies(all.keySet().stream().map(ThingRow::id).toList());
        Map<String, Long> sums = new LinkedHashMap<>();
        all.forEach((row, counted) -> sums.merge(
                currencies.getOrDefault(row.id(), Cash.EUR), counted.balance().getOrDefault(mine, 0L), Long::sum));
        return sums.entrySet().stream()
                .filter(sum -> sum.getValue() != 0)
                .map(sum -> new Owed(sum.getKey(), sum.getValue()))
                .toList();
    }

    /**
     * Who owes the signed-in person, and whom they owe, across every split of a circle they may see: one line
     * for each other person and currency, by the fewest payments that settle each split. The largest first.
     */
    public List<OwingResponse> owing(UUID circleId, UUID me) {
        Map<UUID, Person> circle = people.of(circleId);
        UUID mine = mine(circle, me);
        if (mine == null) {
            return List.of();
        }
        Map<ThingRow, Counted> all = countedIn(circleId, me, circle);
        Map<UUID, String> currencies =
                splits.currencies(all.keySet().stream().map(ThingRow::id).toList());
        Map<Map.Entry<UUID, String>, Long> sums = new LinkedHashMap<>();
        all.forEach((row, counted) -> {
            String currency = currencies.getOrDefault(row.id(), Cash.EUR);
            for (Payment payment : counted.settle()) {
                UUID from = counted.order().get(payment.from());
                UUID to = counted.order().get(payment.to());
                if (to.equals(mine)) {
                    sums.merge(Map.entry(from, currency), payment.cents(), Long::sum);
                } else if (from.equals(mine)) {
                    sums.merge(Map.entry(to, currency), -payment.cents(), Long::sum);
                }
            }
        });
        return sums.entrySet().stream()
                .filter(sum ->
                        sum.getValue() != 0 && circle.containsKey(sum.getKey().getKey()))
                .map(sum -> new OwingResponse(
                        circle.get(sum.getKey().getKey()).brief(),
                        sum.getValue(),
                        sum.getKey().getValue()))
                .sorted(Comparator.comparingLong((OwingResponse owing) -> Math.abs(owing.cents()))
                        .reversed())
                .toList();
    }

    /** One split's standing for the viewer, for the lines the API words itself (Today, a glance). */
    public record Mine(ThingRow thing, String currency, int expenses, long balanceCents, List<OwingResponse> with) {}

    /** Where the signed-in person stands in each split of a circle they may see. */
    public List<Mine> standings(UUID circleId, UUID me) {
        Map<UUID, Person> circle = people.of(circleId);
        UUID mine = mine(circle, me);
        if (mine == null) {
            return List.of();
        }
        Map<ThingRow, Counted> all = countedIn(circleId, me, circle);
        Map<UUID, String> currencies =
                splits.currencies(all.keySet().stream().map(ThingRow::id).toList());
        List<Mine> standings = new ArrayList<>();
        all.forEach((row, counted) -> {
            String currency = currencies.getOrDefault(row.id(), Cash.EUR);
            List<OwingResponse> with = new ArrayList<>();
            for (Payment payment : counted.settle()) {
                Person from = circle.get(counted.order().get(payment.from()));
                Person to = circle.get(counted.order().get(payment.to()));
                if (from != null && to != null && to.id().equals(mine)) {
                    with.add(new OwingResponse(from.brief(), payment.cents(), currency));
                } else if (from != null && to != null && from.id().equals(mine)) {
                    with.add(new OwingResponse(to.brief(), -payment.cents(), currency));
                }
            }
            standings.add(new Mine(
                    row, currency, counted.expenses(), counted.balance().getOrDefault(mine, 0L), with));
        });
        return standings;
    }

    // ---------- reading ----------

    public SplitResponse get(UUID id, UUID me) {
        ThingRow row = things.require(id, me, ThingKind.SPLIT);
        Map<UUID, Person> circle = people.of(row.circleId());
        UUID mine = mine(circle, me);
        List<UUID> one = List.of(id);
        List<PaymentRow> payments = splits.payments(one);
        Counted counted = counted(splits.parts(one), payments, List.copyOf(circle.keySet()));
        Map<UUID, Instant> reminded =
                splits.reminders(id).stream().collect(Collectors.toMap(Reminded::memberId, Reminded::at));
        List<StandingResponse> standings = counted.order().stream()
                .map(circle::get)
                .filter(Objects::nonNull)
                // Someone who left, or a pet, is listed only when they have a part in it.
                .filter(person -> (!person.left() && person.kind() != MemberKind.PET)
                        || counted.paid().get(person.id()) != 0
                        || counted.share().get(person.id()) != 0
                        || counted.balance().get(person.id()) != 0)
                .map(person -> new StandingResponse(
                        person.brief(),
                        counted.paid().get(person.id()),
                        counted.share().get(person.id()),
                        counted.balance().get(person.id()),
                        person.id().equals(mine)))
                .toList();
        List<ToPayResponse> settle = counted.settle().stream()
                .map(payment -> {
                    Person from = circle.get(counted.order().get(payment.from()));
                    Person to = circle.get(counted.order().get(payment.to()));
                    return from == null || to == null
                            ? null
                            : new ToPayResponse(
                                    from.brief(),
                                    to.brief(),
                                    payment.cents(),
                                    from.id().equals(mine),
                                    to.id().equals(mine),
                                    reminded.get(from.id()));
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing((ToPayResponse pay) -> !(pay.youPay() || pay.paysYou())))
                .toList();
        List<ExpenseRow> latest = splits.expenses(id, Keyset.first(LATEST));
        return new SplitResponse(
                row.id(),
                row.circleId(),
                row.title(),
                splits.currencies(one).getOrDefault(id, Cash.EUR),
                counted.expenses(),
                counted.total(),
                mine == null ? 0 : counted.balance().getOrDefault(mine, 0L),
                standings,
                settle,
                views(latest.subList(0, Math.min(latest.size(), LATEST)), circle, mine),
                payments.stream()
                        .limit(LATEST)
                        .map(payment -> view(payment, circle))
                        .filter(Objects::nonNull)
                        .toList(),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row));
    }

    private static PaymentResponse view(PaymentRow payment, Map<UUID, Person> circle) {
        Person from = circle.get(payment.from());
        Person to = circle.get(payment.to());
        return from == null || to == null
                ? null
                : new PaymentResponse(
                        payment.id(),
                        from.brief(),
                        to.brief(),
                        payment.amountCents(),
                        payment.paidOn(),
                        payment.createdAt());
    }

    private List<ExpenseResponse> views(List<ExpenseRow> rows, Map<UUID, Person> circle, UUID mine) {
        Map<UUID, List<ShareRow>> shares = splits
                .shares(rows.stream().map(ExpenseRow::id).toList())
                .stream()
                .collect(Collectors.groupingBy(ShareRow::expenseId));
        return rows.stream()
                .map(expense -> {
                    List<ShareRow> sharing = shares.getOrDefault(expense.id(), List.of()).stream()
                            .filter(share -> circle.containsKey(share.memberId()))
                            .toList();
                    int payer = -1;
                    for (int i = 0; i < sharing.size(); i++) {
                        if (sharing.get(i).memberId().equals(expense.paidBy())) {
                            payer = i;
                        }
                    }
                    long[] cents = Shares.split(
                            expense.amountCents(),
                            sharing.stream().mapToLong(ShareRow::weight).toArray(),
                            payer);
                    List<ExpenseShareResponse> views = new ArrayList<>();
                    for (int i = 0; i < sharing.size(); i++) {
                        ShareRow share = sharing.get(i);
                        views.add(new ExpenseShareResponse(
                                circle.get(share.memberId()).brief(),
                                share.weight(),
                                cents[i],
                                share.memberId().equals(mine)));
                    }
                    Person paidBy = circle.get(expense.paidBy());
                    Person addedBy = expense.addedBy() == null ? null : circle.get(expense.addedBy());
                    return new ExpenseResponse(
                            expense.id(),
                            expense.thingId(),
                            expense.title(),
                            expense.emoji(),
                            expense.amountCents(),
                            paidBy == null ? null : paidBy.brief(),
                            expense.paidBy().equals(mine),
                            expense.mode(),
                            expense.spentOn(),
                            views,
                            addedBy == null ? null : addedBy.brief(),
                            expense.createdAt());
                })
                .toList();
    }

    public Page<ExpenseResponse> expenses(UUID id, UUID me, Keyset page) {
        ThingRow row = things.require(id, me, ThingKind.SPLIT);
        Map<UUID, Person> circle = people.of(row.circleId());
        UUID mine = mine(circle, me);
        return page.page(
                        splits.expenses(id, page),
                        expense -> Keyset.cursor(expense.spentOn(), expense.createdAt(), expense.id()))
                .map(shown -> views(shown, circle, mine));
    }

    public Page<SplitBriefResponse> list(UUID circleId, UUID me, Keyset page) {
        List<ThingRow> rows = thingStore.list(circleId, me, ThingKind.SPLIT, null, null, page);
        List<UUID> ids = rows.stream().map(ThingRow::id).toList();
        Map<UUID, Person> circle = people.of(circleId);
        UUID mine = mine(circle, me);
        Map<UUID, List<Part>> parts = splits.parts(ids).stream().collect(Collectors.groupingBy(Part::thingId));
        Map<UUID, List<PaymentRow>> payments =
                splits.payments(ids).stream().collect(Collectors.groupingBy(PaymentRow::thingId));
        Map<UUID, String> currencies = splits.currencies(ids);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        return page.page(rows, row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> shown.stream()
                        .map(row -> new SplitBriefResponse(
                                row.id(),
                                row.circleId(),
                                row.title(),
                                currencies.getOrDefault(row.id(), Cash.EUR),
                                mine == null
                                        ? 0
                                        : count(
                                                        parts.getOrDefault(row.id(), List.of()),
                                                        payments.getOrDefault(row.id(), List.of()),
                                                        List.of(mine))
                                                .get(mine)[2],
                                row.updatedAt(),
                                row.mine(),
                                row.canEdit(),
                                chips.get(row.id())))
                        .toList());
    }

    // ---------- changing ----------

    @Transactional
    public SplitResponse create(
            UUID me, UUID circleId, String title, String currency, Audience audience, UUID clientId) {
        UUID id = things.create(me, circleId, ThingKind.SPLIT, title.strip(), audience, clientId);
        splits.insert(id, Cash.currency(currency));
        return get(id, me);
    }

    @Transactional
    public SplitResponse rename(UUID id, UUID me, String title) {
        things.requireEdit(id, me, ThingKind.SPLIT);
        thingStore.retitle(id, title.strip());
        return get(id, me);
    }

    private static ApiProblem gone(String what) {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That " + what + " isn't there any more.");
    }

    /** The split, for someone who may change it. An expense of a split they may not see isn't there for them either. */
    private ThingRow editing(UUID thingId, UUID me, String what) {
        try {
            return things.requireEdit(thingId, me, ThingKind.SPLIT);
        } catch (ApiProblem problem) {
            throw problem.status() == HttpStatus.NOT_FOUND ? gone(what) : problem;
        }
    }

    /**
     * Who shares an expense, as weights. With nobody named, everyone in the circle who can pay shares it
     * equally. Exact amounts must add up to the expense.
     */
    private static Map<UUID, Long> weights(
            ShareMode mode, List<ShareInput> shares, long amountCents, String currency, Map<UUID, Person> circle) {
        Map<UUID, Long> weights = new LinkedHashMap<>();
        if (shares == null || shares.isEmpty()) {
            if (mode != ShareMode.EQUAL) {
                throw ApiProblem.badRequest("no_shares", "Say who shares it, and how much of it each.");
            }
            circle.values().stream()
                    .filter(person -> !person.left() && person.kind() == MemberKind.PERSON)
                    .forEach(person -> weights.put(person.id(), 1L));
            return weights;
        }
        MoneyPeople.requirePayers(
                circle, shares.stream().map(ShareInput::memberId).toList());
        long sum = 0;
        for (ShareInput share : shares) {
            long weight = switch (mode) {
                case EQUAL -> 1;
                case SHARES -> share.weight() == null ? 1 : share.weight();
                case EXACT -> share.cents() == null ? 0 : share.cents();
            };
            if (weight <= 0 || (mode == ShareMode.SHARES && weight > 1000)) {
                throw ApiProblem.badRequest(
                        "invalid_share",
                        mode == ShareMode.EXACT
                                ? "Give everyone who shares it an amount above zero."
                                : "A share is between 1 and 1,000.");
            }
            sum += weight;
            weights.put(share.memberId(), weight);
        }
        if (mode == ShareMode.EXACT && sum != amountCents) {
            throw ApiProblem.badRequest(
                    "shares_dont_add_up",
                    "The amounts add up to %s, and it cost %s."
                            .formatted(Cash.exact(sum, currency), Cash.exact(amountCents, currency)));
        }
        return weights;
    }

    @Transactional
    public ExpenseResponse addExpense(UUID id, UUID me, ExpenseInput input, UUID clientId, LocalDate day) {
        ThingRow row = things.requireEdit(id, me, ThingKind.SPLIT);
        Map<UUID, Person> circle = people.of(row.circleId());
        UUID mine = mine(circle, me);
        UUID payer = input.paidBy() == null ? mine : input.paidBy();
        MoneyPeople.requirePayers(circle, List.of(payer));
        ShareMode mode = input.mode() == null ? ShareMode.EQUAL : input.mode();
        String currency = splits.currencies(List.of(id)).getOrDefault(id, Cash.EUR);
        Map<UUID, Long> weights = weights(mode, input.shares(), input.amountCents(), currency, circle);
        if (splits.countExpenses(id) >= MAX_EXPENSES) {
            throw ApiProblem.conflict(
                    "split_full", "A split holds 2,000 expenses at most. Start another for the rest.");
        }
        UUID expenseId = splits.addExpense(
                id,
                input.title().strip().replaceAll("\\s+", " "),
                input.emoji() == null ? "" : input.emoji().strip(),
                input.amountCents(),
                payer,
                mode,
                input.spentOn() != null ? input.spentOn() : day != null ? day : LocalDate.now(),
                mine,
                clientId);
        if (!splits.hasShares(expenseId)) {
            splits.setShares(expenseId, weights);
            thingStore.touch(id);
        }
        return views(List.of(splits.expense(expenseId).orElseThrow()), circle, mine)
                .get(0);
    }

    @Transactional
    public ExpenseResponse changeExpense(UUID expenseId, UUID me, ExpenseInput change) {
        ExpenseRow expense = splits.expense(expenseId).orElseThrow(() -> gone("expense"));
        ThingRow row = editing(expense.thingId(), me, "expense");
        Map<UUID, Person> circle = people.of(row.circleId());
        UUID payer = change.paidBy() == null ? expense.paidBy() : change.paidBy();
        if (change.paidBy() != null) {
            MoneyPeople.requirePayers(circle, List.of(payer));
        }
        long amount = change.amountCents() == null ? expense.amountCents() : change.amountCents();
        ShareMode mode = change.mode() == null ? expense.mode() : change.mode();
        String currency = splits.currencies(List.of(row.id())).getOrDefault(row.id(), Cash.EUR);
        if (change.shares() != null || change.mode() != null) {
            if (change.shares() == null && mode != ShareMode.EQUAL) {
                throw ApiProblem.badRequest("no_shares", "Say who shares it, and how much of it each.");
            }
            // Changing to an equal split without naming anyone keeps the people who shared it.
            List<ShareInput> sharing = change.shares() != null
                    ? change.shares()
                    : splits.shares(List.of(expenseId)).stream()
                            .map(share -> new ShareInput(share.memberId(), null, null))
                            .toList();
            splits.setShares(expenseId, weights(mode, sharing, amount, currency, circle));
        } else if (mode == ShareMode.EXACT && amount != expense.amountCents()) {
            throw ApiProblem.badRequest(
                    "shares_dont_add_up", "The exact amounts no longer add up to it. Send who pays how much as well.");
        }
        splits.changeExpense(
                expenseId,
                change.title() == null
                        ? expense.title()
                        : change.title().strip().replaceAll("\\s+", " "),
                change.emoji() == null ? expense.emoji() : change.emoji().strip(),
                amount,
                payer,
                mode,
                change.spentOn() == null ? expense.spentOn() : change.spentOn());
        thingStore.touch(row.id());
        return views(List.of(splits.expense(expenseId).orElseThrow()), circle, mine(circle, me))
                .get(0);
    }

    @Transactional
    public void removeExpense(UUID expenseId, UUID me) {
        ExpenseRow expense = splits.expense(expenseId).orElse(null);
        if (expense == null) {
            return; // removing what is gone is fine
        }
        editing(expense.thingId(), me, "expense");
        splits.removeExpense(expenseId);
        thingStore.touch(expense.thingId());
    }

    /** Notes that one person paid another, to settle up. Whoever may change the split can note it. */
    @Transactional
    public PaymentResponse addPayment(
            UUID id, UUID me, UUID from, UUID to, long amountCents, LocalDate paidOn, UUID clientId, LocalDate day) {
        ThingRow row = things.requireEdit(id, me, ThingKind.SPLIT);
        Map<UUID, Person> circle = people.of(row.circleId());
        if (from.equals(to)) {
            throw ApiProblem.badRequest("same_person", "A payment goes from one person to another.");
        }
        for (UUID member : List.of(from, to)) {
            // Someone who left can still pay what they owe, and be paid what they are owed.
            Person person = circle.get(member);
            if (person == null || person.kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
            }
        }
        if (splits.countPayments(id) >= MAX_PAYMENTS) {
            throw ApiProblem.conflict("split_full", "A split holds 2,000 payments at most.");
        }
        UUID paymentId = splits.addPayment(
                id,
                from,
                to,
                amountCents,
                paidOn != null ? paidOn : day != null ? day : LocalDate.now(),
                mine(circle, me),
                clientId);
        thingStore.touch(id);
        return view(splits.payment(paymentId).orElseThrow(), circle);
    }

    @Transactional
    public void removePayment(UUID paymentId, UUID me) {
        PaymentRow payment = splits.payment(paymentId).orElse(null);
        if (payment == null) {
            return; // removing what is gone is fine
        }
        editing(payment.thingId(), me, "payment");
        splits.removePayment(paymentId);
        thingStore.touch(payment.thingId());
    }

    /**
     * Reminds someone of what they owe the signed-in person in a split. The time is kept, and whoever sends
     * notifications is told through a {@link Nudge}; Money itself sends nothing.
     */
    @Transactional
    public SplitResponse remind(UUID id, UUID me, UUID memberId) {
        ThingRow row = things.require(id, me, ThingKind.SPLIT);
        Map<UUID, Person> circle = people.of(row.circleId());
        UUID mine = mine(circle, me);
        Counted counted =
                counted(splits.parts(List.of(id)), splits.payments(List.of(id)), List.copyOf(circle.keySet()));
        long owes = counted.settle().stream()
                .filter(payment -> counted.order().get(payment.from()).equals(memberId)
                        && counted.order().get(payment.to()).equals(mine))
                .mapToLong(Payment::cents)
                .sum();
        if (owes == 0) {
            throw ApiProblem.badRequest("nothing_owed", "They don't owe you anything here.");
        }
        splits.reminded(id, memberId, mine);
        String amount = Cash.round(owes, splits.currencies(List.of(id)).getOrDefault(id, Cash.EUR));
        events.publishEvent(new Nudge(
                row.circleId(),
                id,
                ThingKind.SPLIT,
                mine,
                memberId,
                row.title(),
                "A reminder from " + circle.get(mine).name() + ": you owe " + amount + ".",
                Nudge.SPLIT,
                false));
        return get(id, me);
    }
}
