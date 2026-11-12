package app.homeport.api.money;

import app.homeport.api.circle.CircleService;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.money.BillStore.BillRow;
import app.homeport.api.money.BillStore.DueRow;
import app.homeport.api.money.BillStore.Listed;
import app.homeport.api.money.BillStore.MarkRow;
import app.homeport.api.money.BillStore.Reminder;
import app.homeport.api.money.BillStore.ShareRow;
import app.homeport.api.money.MoneyPeople.Person;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bills: what is due, who pays, what it usually costs. A bill is due one time after another; marking a
 * repeating bill paid makes the next one due. When several people pay a bill, each marks their own share, and
 * the bill is paid when every share is. Nothing here pays anything: "paid" is what someone says happened.
 */
@Service
public class BillService {

    static final int HISTORY = 6;

    /** One person's share of a bill, for the time it is due now. */
    public record ShareResponse(
            PersonBrief person,

            @Schema(description = "Their part of the whole: 1 and 1 is half each")
            long parts,

            @Schema(
                    description =
                            "What that comes to for the amount due now, in cents. The shares add up to the amount.")
            long cents,

            boolean paid,
            @Schema(nullable = true) Instant paidAt,

            @Schema(nullable = true, description = "Who marked it paid: usually themselves")
            PersonBrief paidBy,

            @Schema(description = "True for the signed-in person's own share")
            boolean you) {}

    /** One of the last times a bill was due. */
    public record PastDueResponse(
            LocalDate dueOn,
            long amountCents,
            boolean paid,

            @Schema(description = "True for the one the bill shows now")
            boolean current) {}

    public record BillResponse(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "Who it is paid to: Elektro Ljubljana")
            String payee,

            String emoji,
            String currency,

            @Schema(description = "What is due now, or what was paid last for a bill that is done, in cents")
            long amountCents,

            LocalDate dueOn,

            @Schema(description = "True when nothing is due: a bill that came once and is paid")
            boolean paid,

            @Schema(nullable = true) Instant paidAt,
            @Schema(nullable = true) PersonBrief paidBy,
            Repeat repeat,

            @Schema(description = "For every few months: how many")
            int everyMonths,

            @Schema(description = "The day of the month it comes round on")
            int dueDay,

            boolean subscription,

            @Schema(
                    nullable = true,
                    description = "What it costs in a year, in cents. Null for a bill that comes once.")
            Long yearCents,

            PaidHow pays,

            @Schema(nullable = true, description = "Remind this many days before it is due. Null for no reminder.")
            Integer remindDays,

            String note,

            @Schema(nullable = true, description = "The payee's own page for paying, which Pay opens")
            String payUrl,

            String iban,
            String reference,

            @Schema(description = "Who pays, and whether each has. One person is someone paying all of it.")
            List<ShareResponse> shares,

            @Schema(nullable = true, description = "The signed-in person's own share, when they pay one")
            ShareResponse myShare,

            @Schema(description = "The last six times it was due, the oldest first, the one shown now included")
            List<PastDueResponse> history,

            @Schema(
                    nullable = true,
                    description = "What it usually comes to: the average of those, in cents. Null with fewer than two.")
            Long usualCents,

            @Schema(
                    nullable = true,
                    description = "How much more (or, below zero, less) than the time before, in cents")
            Long changeCents,

            @Schema(description = "What it is linked to: its login in the Vault, its invoice in the Library")
            List<ThingBrief> links,

            @Schema(nullable = true, description = "The first linked thing in the Vault: its login")
            ThingBrief login,

            @Schema(nullable = true, description = "The first linked thing in the Library: its invoice")
            ThingBrief invoice,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** A bill in a list. In the list of paid ones, one line for each time it was paid. */
    public record BillRowResponse(
            UUID id,
            UUID circleId,
            String title,
            String payee,
            String emoji,
            String currency,
            long amountCents,
            LocalDate dueOn,
            boolean paid,
            @Schema(nullable = true) Instant paidAt,
            Repeat repeat,
            boolean subscription,
            @Schema(nullable = true) Long yearCents,
            PaidHow pays,

            @Schema(description = "The others who pay a share of it: split with Alex")
            List<PersonBrief> splitWith,

            @Schema(nullable = true, description = "The signed-in person's own share in cents, when they pay one")
            Long myShareCents,

            @Schema(description = "True when the signed-in person's own share is paid")
            boolean mySharePaid,

            @Schema(description = "True when it is linked to something in the Vault you may see: its login")
            boolean hasLogin,

            @Schema(description = "True when it is linked to something in the Library you may see: its invoice")
            boolean hasInvoice,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** One person's part of a bill as the app sends it: parts of the whole, or exact cents (all of them, adding up). */
    public record ShareInput(UUID memberId, Long parts, Long cents) {}

    public record NewBill(
            String title,
            String payee,
            String emoji,
            long amountCents,
            String currency,
            LocalDate dueOn,
            Repeat repeat,
            Integer everyMonths,
            Boolean subscription,
            PaidHow pays,
            Integer remindDays,
            String note,
            String payUrl,
            String iban,
            String reference,
            Audience audience,
            List<ShareInput> shares) {}

    public record BillChange(
            String title,
            String payee,
            String emoji,
            Long amountCents,
            String currency,
            LocalDate dueOn,
            Repeat repeat,
            Integer everyMonths,
            Boolean subscription,
            PaidHow pays,
            Integer remindDays,
            Boolean removeReminder,
            String note,
            String payUrl,
            Boolean removePayUrl,
            String iban,
            String reference,
            List<ShareInput> shares) {}

    public record Paid(LocalDate dueOn, UUID memberId, Boolean everyone, Boolean paid) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final BillStore bills;
    private final CircleService circles;
    private final MoneyPeople people;

    BillService(
            ThingService things, ThingStore thingStore, BillStore bills, CircleService circles, MoneyPeople people) {
        this.things = things;
        this.thingStore = thingStore;
        this.bills = bills;
        this.circles = circles;
        this.people = people;
    }

    // ---------- making and changing ----------

    @Transactional
    public BillResponse create(UUID me, UUID circleId, NewBill input, UUID clientId) {
        String payee = clean(input.payee());
        String title = clean(input.title());
        if (title.isEmpty()) {
            title = payee;
        }
        if (title.isEmpty()) {
            throw ApiProblem.badRequest("no_name", "Give the bill a name, or say who it is paid to.");
        }
        UUID id = things.create(me, circleId, ThingKind.BILL, title, input.audience(), clientId);
        if (thingStore.isNew(id, "bills")) {
            Repeat repeat = input.repeat() == null ? Repeat.ONCE : input.repeat();
            UUID mine = circles.me(circleId, me).id();
            Map<UUID, Long> parts = parts(circleId, input.shares(), input.amountCents(), input.currency(), mine);
            bills.insert(new BillRow(
                    id,
                    payee,
                    clean(input.emoji()),
                    Cash.currency(input.currency()),
                    repeat,
                    every(repeat, input.everyMonths(), 1),
                    input.dueOn().getDayOfMonth(),
                    Boolean.TRUE.equals(input.subscription()),
                    input.pays() == null ? PaidHow.BY_HAND : input.pays(),
                    input.remindDays(),
                    clean(input.note()),
                    link(input.payUrl()),
                    clean(input.iban()),
                    clean(input.reference())));
            bills.replaceShares(id, parts);
            bills.addDue(id, input.dueOn(), input.amountCents());
        }
        return get(id, me);
    }

    @Transactional
    public BillResponse change(UUID id, UUID me, BillChange change) {
        ThingRow row = things.requireEdit(id, me, ThingKind.BILL);
        bills.lock(id);
        BillRow bill = bills.find(id).orElseThrow(ThingService::notFound);
        DueRow due = bills.latest(id, 1).stream().findFirst().orElseThrow(ThingService::notFound);
        LocalDate dueOn = change.dueOn() == null ? due.dueOn() : change.dueOn();
        long amount = change.amountCents() == null ? due.amountCents() : change.amountCents();
        Repeat repeat = change.repeat() == null ? bill.repeat() : change.repeat();
        String currency = change.currency() == null ? bill.currency() : Cash.currency(change.currency());
        bills.update(new BillRow(
                id,
                change.payee() == null ? bill.payee() : clean(change.payee()),
                change.emoji() == null ? bill.emoji() : clean(change.emoji()),
                currency,
                repeat,
                every(repeat, change.everyMonths(), bill.everyMonths()),
                change.dueOn() == null ? bill.dueDay() : dueOn.getDayOfMonth(),
                change.subscription() == null ? bill.subscription() : change.subscription(),
                change.pays() == null ? bill.pays() : change.pays(),
                Boolean.TRUE.equals(change.removeReminder())
                        ? null
                        : change.remindDays() == null ? bill.remindDays() : change.remindDays(),
                change.note() == null ? bill.note() : clean(change.note()),
                Boolean.TRUE.equals(change.removePayUrl())
                        ? null
                        : change.payUrl() == null ? bill.payUrl() : link(change.payUrl()),
                change.iban() == null ? bill.iban() : clean(change.iban()),
                change.reference() == null ? bill.reference() : clean(change.reference())));
        bills.changeDue(due.id(), dueOn, amount);
        if (change.shares() != null) {
            UUID mine = circles.me(row.circleId(), me).id();
            bills.replaceShares(id, parts(row.circleId(), change.shares(), amount, currency, mine));
            settleIfAllPaid(bills.find(id).orElseThrow(), bills.open(id).orElse(null), mine);
        }
        if (change.title() != null && !clean(change.title()).isEmpty()) {
            thingStore.retitle(id, clean(change.title()));
        } else {
            thingStore.touch(id);
        }
        return get(id, me);
    }

    private static String clean(String text) {
        return text == null ? "" : text.strip().replaceAll("\\s+", " ");
    }

    /** A link to the payee's own page. Only a web address is kept, never something that would run on the phone. */
    private static String link(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        String trimmed = url.strip();
        if (!trimmed.matches("(?i)https?://[^\\s]+")) {
            throw ApiProblem.badRequest("invalid_link", "A link starts with https://.");
        }
        return trimmed;
    }

    private static int every(Repeat repeat, Integer asked, int kept) {
        if (repeat != Repeat.MONTHS) {
            return 1;
        }
        int every = asked == null ? kept : asked;
        if (every < 2) {
            throw ApiProblem.badRequest("invalid_repeat", "Say how many months lie between two bills: 2 to 24.");
        }
        return every;
    }

    /**
     * Who pays, as parts of the whole. With nothing sent, the person adding the bill pays all of it. Exact
     * amounts must add up to the bill; they are kept as parts too, so next month's amount divides the same way.
     */
    private Map<UUID, Long> parts(
            UUID circleId, List<ShareInput> shares, long amountCents, String currency, UUID mine) {
        Map<UUID, Long> parts = new LinkedHashMap<>();
        if (shares == null || shares.isEmpty()) {
            parts.put(mine, 1L);
            return parts;
        }
        MoneyPeople.requirePayers(
                people.of(circleId), shares.stream().map(ShareInput::memberId).toList());
        boolean exact = shares.stream().anyMatch(share -> share.cents() != null);
        if (exact) {
            if (shares.stream().anyMatch(share -> share.cents() == null || share.cents() <= 0)) {
                throw ApiProblem.badRequest("shares_incomplete", "Give everyone an amount above zero, or nobody.");
            }
            long sum = shares.stream().mapToLong(ShareInput::cents).sum();
            if (sum != amountCents) {
                String code = Cash.currency(currency);
                throw ApiProblem.badRequest(
                        "shares_dont_add_up",
                        "The shares add up to %s, and the bill is %s."
                                .formatted(Cash.exact(sum, code), Cash.exact(amountCents, code)));
            }
        }
        for (ShareInput share : shares) {
            long part = exact ? share.cents() : share.parts() == null ? 1 : share.parts();
            if (part <= 0 || part > Cash.MAX_CENTS) {
                throw ApiProblem.badRequest("invalid_share", "A share is at least 1.");
            }
            parts.put(share.memberId(), part);
        }
        return parts;
    }

    // ---------- paid, and not paid after all ----------

    /**
     * Marks a share of a bill as paid, or takes that back. {@code dueOn} says which time it was due, so a tap
     * that is sent twice doesn't also pay next month's. When the last share is paid the bill is, and a
     * repeating bill is due again.
     */
    @Transactional
    public BillResponse paid(UUID id, UUID me, Paid request) {
        ThingRow row = things.requireEdit(id, me, ThingKind.BILL);
        bills.lock(id);
        BillRow bill = bills.find(id).orElseThrow(ThingService::notFound);
        UUID mine = circles.me(row.circleId(), me).id();
        List<UUID> sharers =
                bills.shares(List.of(id)).stream().map(ShareRow::memberId).toList();
        List<UUID> whose;
        if (Boolean.TRUE.equals(request.everyone())) {
            whose = sharers;
        } else if (request.memberId() != null) {
            if (!sharers.contains(request.memberId())) {
                throw ApiProblem.badRequest("no_share", "They don't pay a share of this bill.");
            }
            whose = List.of(request.memberId());
        } else {
            // Your own share when you pay one; otherwise you are saying the whole bill is paid.
            whose = sharers.contains(mine) ? List.of(mine) : sharers;
        }
        DueRow open = bills.open(id).orElse(null);
        if (!Boolean.FALSE.equals(request.paid())) {
            if (open != null && open.dueOn().equals(request.dueOn())) {
                whose.forEach(member -> bills.mark(open.id(), member, mine));
                settleIfAllPaid(bill, open, mine);
                thingStore.touch(id);
            }
        } else if (open != null && open.dueOn().equals(request.dueOn())) {
            bills.unmark(open.id(), whose);
            thingStore.touch(id);
        } else {
            // It was the last share, so the bill closed (and a repeating one moved on). Open it again.
            DueRow last = bills.latest(id, 2).stream()
                    .filter(due -> due.paidAt() != null)
                    .findFirst()
                    .orElse(null);
            if (last != null && last.dueOn().equals(request.dueOn())) {
                if (open != null) {
                    if (!bills.marks(List.of(open.id())).isEmpty()) {
                        throw ApiProblem.conflict(
                                "next_one_started", "The next one is already being paid. Take that back first.");
                    }
                    bills.removeDue(open.id());
                }
                bills.reopen(last.id());
                bills.unmark(last.id(), whose);
                thingStore.touch(id);
            }
        }
        return get(id, me);
    }

    /** Closes the open due time when every share of it is paid, and makes a repeating bill due again. */
    private void settleIfAllPaid(BillRow bill, DueRow open, UUID by) {
        if (open == null) {
            return;
        }
        Set<UUID> marked =
                bills.marks(List.of(open.id())).stream().map(MarkRow::memberId).collect(Collectors.toSet());
        List<UUID> sharers = bills.shares(List.of(bill.thingId())).stream()
                .map(ShareRow::memberId)
                .toList();
        if (!marked.containsAll(sharers)) {
            return;
        }
        bills.close(open.id(), by);
        LocalDate next = bill.repeat().next(open.dueOn(), bill.dueDay(), bill.everyMonths());
        if (next != null) {
            bills.addDue(bill.thingId(), next, open.amountCents());
        }
    }

    // ---------- reading ----------

    public BillResponse get(UUID id, UUID me) {
        ThingRow row = things.require(id, me, ThingKind.BILL);
        BillRow bill = bills.find(id).orElseThrow(ThingService::notFound);
        // The newest first: the open one when there is one, then the paid ones.
        List<DueRow> dues = bills.latest(id, HISTORY);
        DueRow current = dues.get(0);
        Map<UUID, Person> circle = people.of(row.circleId());
        UUID mine = circles.me(row.circleId(), me).id();
        List<ShareResponse> shares =
                shares(current, bills.shares(List.of(id)), bills.marks(List.of(current.id())), circle, mine);
        List<PastDueResponse> history = new ArrayList<>();
        for (int i = dues.size() - 1; i >= 0; i--) {
            DueRow due = dues.get(i);
            history.add(new PastDueResponse(due.dueOn(), due.amountCents(), due.paidAt() != null, i == 0));
        }
        Long usual = dues.size() < 2
                ? null
                : BigDecimal.valueOf(
                                dues.stream().mapToLong(DueRow::amountCents).sum())
                        .divide(BigDecimal.valueOf(dues.size()), 0, RoundingMode.HALF_UP)
                        .longValueExact();
        List<ThingBrief> links = things.linked(id, me);
        return new BillResponse(
                row.id(),
                row.circleId(),
                row.title(),
                bill.payee(),
                bill.emoji(),
                bill.currency(),
                current.amountCents(),
                current.dueOn(),
                current.paidAt() != null,
                current.paidAt(),
                brief(circle, current.paidBy()),
                bill.repeat(),
                bill.everyMonths(),
                bill.dueDay(),
                bill.subscription(),
                bill.repeat().yearly(current.amountCents(), bill.everyMonths()),
                bill.pays(),
                bill.remindDays(),
                bill.note(),
                bill.payUrl(),
                bill.iban(),
                bill.reference(),
                shares,
                shares.stream().filter(ShareResponse::you).findFirst().orElse(null),
                history,
                usual,
                dues.size() < 2 ? null : current.amountCents() - dues.get(1).amountCents(),
                links,
                links.stream().filter(l -> l.place() == Place.VAULT).findFirst().orElse(null),
                links.stream()
                        .filter(l -> l.place() == Place.LIBRARY)
                        .findFirst()
                        .orElse(null),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row));
    }

    private static PersonBrief brief(Map<UUID, Person> circle, UUID memberId) {
        Person person = memberId == null ? null : circle.get(memberId);
        return person == null ? null : person.brief();
    }

    /** Each person's share of one due time, in the circle's order. A bill that is paid shows every share as paid. */
    static List<ShareResponse> shares(
            DueRow due, List<ShareRow> shares, List<MarkRow> marks, Map<UUID, Person> circle, UUID mine) {
        List<ShareRow> known = shares.stream()
                .filter(share -> share.thingId().equals(due.thingId()) && circle.containsKey(share.memberId()))
                .toList();
        long[] cents = Shares.split(
                due.amountCents(), known.stream().mapToLong(ShareRow::parts).toArray(), -1);
        Map<UUID, MarkRow> paid = marks.stream()
                .filter(mark -> mark.dueId().equals(due.id()))
                .collect(Collectors.toMap(MarkRow::memberId, mark -> mark, (a, b) -> a));
        List<ShareResponse> views = new ArrayList<>();
        for (int i = 0; i < known.size(); i++) {
            ShareRow share = known.get(i);
            MarkRow mark = paid.get(share.memberId());
            views.add(new ShareResponse(
                    circle.get(share.memberId()).brief(),
                    share.parts(),
                    cents[i],
                    mark != null || due.paidAt() != null,
                    mark != null ? mark.paidAt() : due.paidAt(),
                    mark != null ? brief(circle, mark.paidBy()) : brief(circle, due.paidBy()),
                    share.memberId().equals(mine)));
        }
        return views;
    }

    public Page<BillRowResponse> list(UUID circleId, UUID me, BillShow show, Keyset page) {
        List<Listed> rows = bills.list(circleId, me, show == null ? BillShow.DUE : show, page);
        return page.page(
                        rows,
                        listed ->
                                Keyset.cursor(listed.due().dueOn(), listed.due().id()))
                .map(shown -> views(circleId, shown, me));
    }

    /** Bills as lines of a list, with who else pays and whether the viewer's own share is paid. */
    List<BillRowResponse> views(UUID circleId, List<Listed> rows, UUID me) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = rows.stream().map(l -> l.thing().id()).distinct().toList();
        Map<UUID, Person> circle = people.of(circleId);
        UUID mine = circles.me(circleId, me).id();
        List<ShareRow> shares = bills.shares(ids);
        List<MarkRow> marks = bills.marks(rows.stream().map(l -> l.due().id()).toList());
        Map<UUID, Set<Place>> linked = bills.linkedPlaces(ids, me);
        Map<UUID, AudienceChip> chips =
                things.chips(rows.stream().map(Listed::thing).distinct().toList());
        return rows.stream()
                .map(listed -> {
                    ThingRow thing = listed.thing();
                    BillRow bill = listed.bill();
                    DueRow due = listed.due();
                    List<ShareResponse> split = shares(due, shares, marks, circle, mine);
                    ShareResponse my = split.stream()
                            .filter(ShareResponse::you)
                            .findFirst()
                            .orElse(null);
                    Set<Place> places = linked.getOrDefault(thing.id(), Set.of());
                    return new BillRowResponse(
                            thing.id(),
                            thing.circleId(),
                            thing.title(),
                            bill.payee(),
                            bill.emoji(),
                            bill.currency(),
                            due.amountCents(),
                            due.dueOn(),
                            due.paidAt() != null,
                            due.paidAt(),
                            bill.repeat(),
                            bill.subscription(),
                            bill.repeat().yearly(due.amountCents(), bill.everyMonths()),
                            bill.pays(),
                            split.stream()
                                    .filter(share -> !share.you())
                                    .map(ShareResponse::person)
                                    .toList(),
                            my == null ? null : my.cents(),
                            my != null && my.paid(),
                            places.contains(Place.VAULT),
                            places.contains(Place.LIBRARY),
                            thing.updatedAt(),
                            thing.mine(),
                            thing.canEdit(),
                            chips.get(thing.id()));
                })
                .toList();
    }

    /**
     * Who to remind on a day that a bill is coming up: each person whose share isn't paid, for every bill that
     * asked for a reminder this many days ahead. For the place that sends notifications; Money sends none.
     */
    public List<Reminder> remindersFor(LocalDate day) {
        return bills.reminders(day);
    }
}
