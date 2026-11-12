package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore;
import app.homeport.api.board.BoardStore.BoardRow;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.board.templates.HeadsUp.Stay;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.money.Cash;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * A fairer split: equal isn't always fair. Rent can follow the size of each room (with the shared space split
 * evenly), a bill the nights each person was at home or what each one used, and the flat can always type its
 * own numbers.
 *
 * <p><b>The sums.</b> A total is divided by weights, in whole cents, so that the shares always add up to the
 * total: each share is rounded down, and the cents left over go, one each, to the shares that lost the largest
 * fraction (see {@link #shares}). By room size, a person's weight is their room plus an equal part of the
 * shared space. By nights, it is the nights of the bill's days they were at home: every night, less the ones
 * they gave notice of on the flat's Heads-up board, unless the numbers are typed in.
 *
 * <p><b>Agreeing.</b> A split is proposed, and it only counts once every housemate has said yes: everyone in
 * the flat with a sign-in of their own, the proposer by proposing. Until then the split that was agreed
 * before stays in force. Anyone can propose a change at any time; that is a new proposal, it replaces one
 * that was still waiting, and everyone is asked again. Nobody can change numbers that were agreed in any
 * other way.
 *
 * <p>For a bill that is paid once, each person ticks their share as paid (whoever paid the bill can tick it
 * for them). Nothing here is secret: everyone who sees the board sees every number and who has agreed.
 */
@Component
class FairerSplit implements BoardRules {

    static final String SPLIT = "split";
    static final String PROPOSAL = "proposal";
    static final String YES = "yes";
    static final String PAID = "paid";
    static final String EQUAL = "equal";
    static final String ROOM = "room";
    static final String NIGHTS = "nights";
    static final String USE = "use";
    static final String OWN = "own";
    private static final Set<String> WAYS = Set.of(EQUAL, ROOM, NIGHTS, USE, OWN);
    private static final Set<String> GROUPS = Set.of("rent", "bills", "kitty", "other");
    private static final long MOST = 100_000_000;

    // ---------- what is stored ----------

    record FairerSplitSettings() {}

    /** @param repeats true for something that is split the same way every month, like the rent */
    record Split(
            String name, String group, boolean repeats, LocalDate from, LocalDate to, UUID payerId, String currency) {}

    /** @param shared the shared space, when the split goes by room size */
    record Proposal(String way, long totalCents, Long shared, List<Part> parts) {
        Proposal {
            parts = parts == null ? List.of() : List.copyOf(parts);
        }
    }

    /** @param measure the room's size, the nights at home, or the units used */
    record Part(UUID memberId, long cents, Long measure, String note) {}

    // ---------- the sums ----------

    /**
     * Divides a total by weights, in whole cents. Every share is rounded down; the cents left over go one
     * each to the shares that lost the largest fraction, the earlier one first when two lost the same. The
     * shares always add up to the total. With no weight at all it is split equally.
     */
    static long[] shares(long totalCents, long[] weights) {
        int n = weights.length;
        long[] by = weights.clone();
        long sum = 0;
        for (long weight : by) {
            sum += weight;
        }
        if (sum <= 0) {
            java.util.Arrays.fill(by, 1);
            sum = n;
        }
        long[] cents = new long[n];
        long[] lost = new long[n];
        long given = 0;
        for (int i = 0; i < n; i++) {
            cents[i] = totalCents * by[i] / sum;
            lost[i] = totalCents * by[i] % sum;
            given += cents[i];
        }
        for (long left = totalCents - given; left > 0; left--) {
            int most = 0;
            for (int i = 1; i < n; i++) {
                if (lost[i] > lost[most]) {
                    most = i;
                }
            }
            cents[most]++;
            lost[most] = -1;
        }
        return cents;
    }

    /** The weights for a split by room size: each room, plus an equal part of the shared space. */
    static long[] roomWeights(long[] rooms, long shared) {
        long[] weights = new long[rooms.length];
        for (int i = 0; i < rooms.length; i++) {
            weights[i] = rooms[i] * rooms.length + shared;
        }
        return weights;
    }

    /** What the rule alone gives each part of a proposal, before anyone moved a slider. */
    static long[] byRule(Proposal proposal) {
        long[] measures = proposal.parts().stream()
                .mapToLong(p -> p.measure() == null ? 0 : p.measure())
                .toArray();
        return switch (proposal.way()) {
            case ROOM ->
                shares(proposal.totalCents(), roomWeights(measures, proposal.shared() == null ? 0 : proposal.shared()));
            case NIGHTS, USE -> shares(proposal.totalCents(), measures);
            case EQUAL -> shares(proposal.totalCents(), new long[measures.length]);
            default -> proposal.parts().stream().mapToLong(Part::cents).toArray();
        };
    }

    // ---------- what a person sees ----------

    record FairerSplitViewResponse(
            @Schema(description = "Everything the flat splits, in the order it was added")
            List<FairerSplitSplitResponse> splits,

            @Schema(description = "How many proposals wait for this person's yes")
            int waitingForYou) {}

    record FairerSplitSplitResponse(
            UUID id,

            @Schema(description = "What is split: Rent, Electricity")
            String name,

            @Schema(description = "As a heading: October's electricity")
            String title,

            @Schema(description = "rent, bills, kitty or other: the tab it stands under")
            String group,

            @Schema(description = "True for something split the same way every month; false for a bill paid once")
            boolean repeats,

            @Schema(nullable = true, description = "The first day a bill is for")
            LocalDate from,

            @Schema(nullable = true, description = "The last day a bill is for")
            LocalDate to,

            @Schema(nullable = true, description = "Who paid the bill, and is paid back")
            PersonBrief payer,

            String currency,

            @Schema(nullable = true, description = "The split that counts: the last one everyone agreed to")
            FairerSplitVersionResponse agreed,

            @Schema(nullable = true, description = "A split that was proposed and still waits for someone's yes")
            FairerSplitVersionResponse proposed,

            @Schema(description = "True for a bill whose every share is paid")
            boolean settled) {}

    record FairerSplitVersionResponse(
            UUID id,

            @Schema(description = "equal, room, nights, use or own")
            String way,

            long totalCents,

            @Schema(nullable = true, description = "By room size: the shared space, in square metres")
            Long shared,

            List<FairerSplitShareResponse> shares,
            @Schema(nullable = true) PersonBrief proposedBy,
            Instant proposedAt,

            @Schema(nullable = true, description = "The day the last housemate said yes")
            LocalDate agreedOn,

            List<PersonBrief> agreedBy,
            List<PersonBrief> waitingFor,
            boolean youAgreed,

            @Schema(description = "True when it waits for this person's yes")
            boolean needsYou,

            @Schema(description = "True when this person proposed it and can take it back")
            boolean yours) {}

    record FairerSplitShareResponse(
            @Schema(nullable = true) PersonBrief person,
            boolean you,

            @Schema(description = "This person's share, in whole cents")
            long cents,

            @Schema(description = "What the rule alone gives, before anyone changed the numbers by hand")
            long byRuleCents,

            @Schema(
                    nullable = true,
                    description = "What the rule goes by: square metres, nights at home, or units used")
            Long measure,

            @Schema(nullable = true, description = "A few words: the big room")
            String note,

            @Schema(description = "The share as a part of the total, 0 to 100")
            int percent,

            @Schema(description = "For a bill paid once: true when this share is paid")
            boolean paid) {}

    private final BoardStore store;

    FairerSplit(BoardStore store) {
        this.store = store;
    }

    @Override
    public Template template() {
        return Template.FAIRER_SPLIT;
    }

    @Override
    public Class<?> settingsType() {
        return FairerSplitSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return FairerSplitViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry split: name, group (rent, bills, kitty or other; left out: bills), repeats (left out: true"
                        + " for rent and kitty), from and to (the days a bill is for; needed for nights),"
                        + " payerMemberId (who paid a bill), currency, and its first proposal: way, totalCents,"
                        + " shared, parts",
                "a proposal's fields: way (equal, room, nights, use or own), totalCents, shared (square metres of"
                        + " shared space, for room), parts ([{memberId, measure, note, cents}]: measure is square"
                        + " metres, nights at home or units used; nights left out are counted from Heads-up; cents"
                        + " for every part sets the shares by hand and has to add up to the total; parts left out:"
                        + " everyone)",
                "verb propose: splitId and a proposal's fields (what is left out stays as it was). Everyone is asked again.",
                "verb agree: proposalId",
                "verb paid: splitId, paid (true or false; left out: true), memberId (left out: you; whoever paid the"
                        + " bill may tick for others)",
                "changing a split entry: name, group, payerMemberId. Removing: a proposal by whoever proposed it; a"
                        + " split only while nobody agreed to it.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("agree") || verb.equals(PAID);
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new FairerSplitSettings();
    }

    // ---------- reading ----------

    private static List<EntryRow> proposals(Scene scene, EntryRow split) {
        return scene.under(split.id()).stream()
                .filter(e -> e.is(PROPOSAL))
                .sorted(Comparator.comparing(EntryRow::createdAt).thenComparing(EntryRow::id))
                .toList();
    }

    /** The split that counts: the last proposal everyone agreed to. */
    private static EntryRow agreed(Scene scene, EntryRow split) {
        return proposals(scene, split).stream()
                .filter(EntryRow::done)
                .max(Comparator.comparing(EntryRow::doneAt))
                .orElse(null);
    }

    private static EntryRow pending(Scene scene, EntryRow split) {
        return proposals(scene, split).stream()
                .filter(p -> !p.done())
                .reduce((first, second) -> second)
                .orElse(null);
    }

    private static Set<UUID> saidYes(Scene scene, EntryRow proposal) {
        Set<UUID> yes = new HashSet<>();
        scene.under(proposal.id()).stream().filter(e -> e.is(YES)).forEach(e -> yes.add(e.authorId()));
        return yes;
    }

    private static Set<UUID> paid(Scene scene, EntryRow split) {
        Set<UUID> paid = new HashSet<>();
        scene.under(split.id()).stream().filter(e -> e.is(PAID)).forEach(e -> paid.add(e.forId()));
        UUID payer = split.as(Split.class).payerId();
        if (payer != null) {
            paid.add(payer);
        }
        return paid;
    }

    static String title(Split split) {
        if (split.from() == null || split.to() == null || ChronoUnit.DAYS.between(split.from(), split.to()) > 35) {
            return split.name();
        }
        return Words.of(split.to().getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH)) + " "
                + Say.lowerFirst(split.name());
    }

    @Override
    public Object view(Scene scene, String show) {
        List<FairerSplitSplitResponse> splits =
                scene.entries(SPLIT).stream().map(s -> split(scene, s)).toList();
        return new FairerSplitViewResponse(splits, (int) splits.stream()
                .filter(s -> s.proposed() != null && s.proposed().needsYou())
                .count());
    }

    private FairerSplitSplitResponse split(Scene scene, EntryRow row) {
        Split split = row.as(Split.class);
        EntryRow agreed = agreed(scene, row);
        EntryRow pending = pending(scene, row);
        Set<UUID> paid = paid(scene, row);
        return new FairerSplitSplitResponse(
                row.id(),
                split.name(),
                title(split),
                split.group(),
                split.repeats(),
                split.from(),
                split.to(),
                scene.brief(split.payerId()),
                split.currency(),
                agreed == null ? null : version(scene, split, agreed, paid),
                pending == null ? null : version(scene, split, pending, paid),
                !split.repeats()
                        && agreed != null
                        && agreed.as(Proposal.class).parts().stream().allMatch(p -> paid.contains(p.memberId())));
    }

    private FairerSplitVersionResponse version(Scene scene, Split split, EntryRow row, Set<UUID> paid) {
        Proposal proposal = row.as(Proposal.class);
        long[] byRule = byRule(proposal);
        Set<UUID> yes = saidYes(scene, row);
        List<UUID> voices = Say.voiceIds(scene);
        List<FairerSplitShareResponse> shares = new ArrayList<>();
        for (int i = 0; i < proposal.parts().size(); i++) {
            Part part = proposal.parts().get(i);
            shares.add(new FairerSplitShareResponse(
                    scene.brief(part.memberId()),
                    scene.isMe(part.memberId()),
                    part.cents(),
                    byRule[i],
                    part.measure(),
                    part.note(),
                    (int) Math.round(part.cents() * 100.0 / Math.max(1, proposal.totalCents())),
                    !split.repeats() && paid.contains(part.memberId())));
        }
        boolean waiting = !row.done();
        return new FairerSplitVersionResponse(
                row.id(),
                proposal.way(),
                proposal.totalCents(),
                proposal.shared(),
                shares,
                scene.brief(row.authorId()),
                row.createdAt(),
                row.done() ? row.doneAt().atOffset(ZoneOffset.UTC).toLocalDate() : null,
                voices.stream()
                        .filter(id -> row.done() || yes.contains(id))
                        .map(scene::brief)
                        .toList(),
                voices.stream()
                        .filter(id -> waiting && !yes.contains(id))
                        .map(scene::brief)
                        .toList(),
                scene.myId() != null && (row.done() || yes.contains(scene.myId())),
                waiting && scene.myId() != null && voices.contains(scene.myId()) && !yes.contains(scene.myId()),
                waiting && scene.isMe(row.authorId()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(SPLIT) ? title(entry.as(Split.class)) : null;
    }

    // ---------- proposing ----------

    private static ApiProblem chooseAWay() {
        return ApiProblem.badRequest(
                "invalid_way",
                "Choose how to split it: equally, by room size, by nights at home, by use, or your own numbers.");
    }

    /** Reads a proposal from what was sent. What is left out stays as it was in the proposal before it. */
    private Proposal proposal(Scene scene, Split split, Fields sent, Proposal before) {
        String way = sent.text("way", 10, before == null ? null : before.way());
        if (way == null || !WAYS.contains(way)) {
            throw chooseAWay();
        }
        Long total = sent.whole("totalCents", 1, MOST, before == null ? null : before.totalCents());
        if (total == null) {
            throw ApiProblem.badRequest("missing_total", "Say how much there is to split.");
        }
        Long shared = sent.whole("shared", 0, 10_000, before == null ? null : before.shared());
        List<Fields> sentParts = sent.list("parts", 30);
        List<Part> parts = new ArrayList<>();
        boolean byHand;
        if (sentParts != null && !sentParts.isEmpty()) {
            int withCents = 0;
            Set<UUID> seen = new HashSet<>();
            for (Fields one : sentParts) {
                UUID member = scene.inCircle(one.id("memberId"));
                if (member == null || !seen.add(member)) {
                    throw ApiProblem.badRequest("invalid_parts", "Give each person one share.");
                }
                Long cents = one.whole("cents", 0, MOST);
                withCents += cents == null ? 0 : 1;
                parts.add(new Part(
                        member, cents == null ? 0 : cents, one.whole("measure", 0, 1_000_000), one.text("note", 80)));
            }
            if (withCents != 0 && withCents != parts.size()) {
                throw ApiProblem.badRequest(
                        "invalid_parts", "Give every person a share, or none and we'll work them out.");
            }
            byHand = withCents > 0;
        } else if (before != null) {
            parts.addAll(before.parts());
            // The numbers that were typed by hand still hold while the total they add up to is the same.
            byHand = way.equals(OWN) && total == before.totalCents();
        } else {
            Say.voiceIds(scene).forEach(id -> parts.add(new Part(id, 0, null, null)));
            byHand = false;
        }
        if (parts.isEmpty()) {
            throw ApiProblem.badRequest("invalid_parts", "Say who it is split between.");
        }
        if (byHand) {
            long sum = parts.stream().mapToLong(Part::cents).sum();
            if (sum != total) {
                throw ApiProblem.badRequest(
                        "shares_dont_add_up",
                        "The shares add up to " + Cash.exact(sum, split.currency()) + ", but there is "
                                + Cash.exact(total, split.currency()) + " to split.");
            }
            return new Proposal(way, total, shared, parts);
        }
        List<Part> measured = switch (way) {
            case ROOM -> needMeasures(parts, 1, "Say how big each person's room is.");
            case USE -> needMeasures(parts, 0, "Say how much each person used.");
            case NIGHTS -> withNights(scene, split, parts);
            case OWN -> throw ApiProblem.badRequest("missing_shares", "Say what each person pays.");
            default -> parts;
        };
        long[] cents = byRule(new Proposal(way, total, shared, measured));
        List<Part> worked = new ArrayList<>();
        for (int i = 0; i < measured.size(); i++) {
            Part part = measured.get(i);
            worked.add(new Part(part.memberId(), cents[i], part.measure(), part.note()));
        }
        return new Proposal(way, total, shared, worked);
    }

    private static List<Part> needMeasures(List<Part> parts, long least, String whenMissing) {
        if (parts.stream().anyMatch(p -> p.measure() == null || p.measure() < least)
                || parts.stream().mapToLong(Part::measure).sum() == 0) {
            throw ApiProblem.badRequest("missing_measures", whenMissing);
        }
        return parts;
    }

    /** By nights: for whoever has no number typed in, every night of the bill's days less the ones they were away. */
    private List<Part> withNights(Scene scene, Split split, List<Part> parts) {
        if (split.from() == null || split.to() == null) {
            throw ApiProblem.badRequest("missing_days", "Say which days the bill is for, to count the nights.");
        }
        long nights = ChronoUnit.DAYS.between(split.from(), split.to()) + 1;
        List<EntryRow> notices = parts.stream().allMatch(p -> p.measure() != null) ? List.of() : headsUps(scene);
        List<Part> counted = new ArrayList<>();
        for (Part part : parts) {
            Long atHome = part.measure();
            if (atHome == null) {
                List<Stay> stays = HeadsUp.stays(notices, part.memberId());
                atHome = nights - HeadsUp.nightsAway(stays, split.from(), split.to());
            }
            if (atHome > nights) {
                throw ApiProblem.badRequest(
                        "too_many_nights", "The bill is for " + nights + " nights. Nobody was at home for more.");
            }
            counted.add(new Part(part.memberId(), 0, atHome, part.note()));
        }
        return counted;
    }

    /** Every notice on the flat's Heads-up boards that this person may see. */
    private List<EntryRow> headsUps(Scene scene) {
        if (scene.me() == null) {
            return List.of();
        }
        List<ThingRow> boards = store.seenIn(scene.circleId(), scene.me().userId());
        Map<UUID, BoardRow> rows =
                store.findAll(boards.stream().map(ThingRow::id).toList());
        List<EntryRow> notices = new ArrayList<>();
        rows.values().stream()
                .filter(board -> board.template() == Template.HEADS_UP)
                .forEach(board -> notices.addAll(store.entries(board.thingId(), Set.of(), 2000)));
        return notices;
    }

    /** Puts a proposal under a split, with its proposer's yes. One that was still waiting is replaced. */
    private void propose(Scene scene, EntryRow split, Proposal proposal, UUID clientId) {
        EntryRow waiting = pending(scene, split);
        if (waiting != null) {
            scene.remove(waiting.id());
        }
        UUID id = scene.add(
                EntryDraft.of(PROPOSAL).under(split.id()).by(scene.myId()).doc(proposal), clientId);
        scene.add(EntryDraft.of(YES).under(id).by(scene.myId()), Scene.derivedId(id, "yes of " + scene.myId()));
        settle(scene, scene.entry(id));
    }

    /** A proposal counts from the moment the last housemate has said yes. What it replaces is cleared away. */
    private static void settle(Scene scene, EntryRow proposal) {
        if (proposal.done() || !saidYes(scene, proposal).containsAll(Say.voiceIds(scene))) {
            return;
        }
        scene.under(proposal.parentId()).stream()
                .filter(e -> e.is(PROPOSAL) && e.done())
                .forEach(old -> scene.remove(old.id()));
        scene.save(proposal, EntryDraft.from(proposal).done(scene.now(), scene.myId()));
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(SPLIT)) {
            throw BoardRules.unknownKind();
        }
        if (scene.entries(SPLIT).size() >= 100) {
            throw ApiProblem.conflict("too_many", "A hundred splits is as many as one board keeps. Start another.");
        }
        String group = sent.text("group", 10, "bills");
        if (group == null || !GROUPS.contains(group)) {
            throw ApiProblem.badRequest("invalid_group", "Put it under rent, bills, the kitty or other.");
        }
        LocalDate from = sent.day("from");
        LocalDate to = sent.day("to");
        if ((from == null) != (to == null) || (from != null && (to.isBefore(from) || to.isAfter(from.plusDays(366))))) {
            throw ApiProblem.badRequest("invalid_day", "Say the first and the last day the bill is for.");
        }
        Split split = new Split(
                sent.need("name", 80, "Say what is being split."),
                group,
                sent.flag("repeats", group.equals("rent") || group.equals("kitty")),
                from,
                to,
                scene.inCircle(sent.id("payerMemberId")),
                sent.has("currency") ? Cash.currency(sent.text("currency", 3)) : Cash.EUR);
        Proposal first = proposal(scene, split, sent, null);
        UUID id = scene.add(EntryDraft.of(SPLIT).by(scene.myId()).doc(split), clientId);
        propose(scene, scene.entry(id), first, Scene.derivedId(id, "first proposal"));
        return id;
    }

    /** What a split is called and who paid can be changed by anyone. Its numbers only by a proposal. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(SPLIT)) {
            throw ApiProblem.conflict(
                    "propose_instead",
                    "The numbers change by proposing a new split: it counts once everyone says yes.");
        }
        Split now = entry.as(Split.class);
        String name = sent.text("name", 80, now.name());
        String group = sent.text("group", 10, now.group());
        if (name == null || group == null || !GROUPS.contains(group)) {
            throw ApiProblem.badRequest(
                    "invalid_group", "Give it a name, and put it under rent, bills, the kitty or other.");
        }
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .doc(new Split(
                                name,
                                group,
                                now.repeats(),
                                now.from(),
                                now.to(),
                                scene.inCircle(sent.id("payerMemberId", now.payerId())),
                                now.currency())));
    }

    /** A waiting proposal is taken back by whoever made it. A split goes only while nobody ever agreed to it. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(PROPOSAL) && !entry.done()) {
            if (!scene.isMe(entry.authorId())) {
                throw BoardRules.notYours();
            }
            scene.remove(entry.id());
            return;
        }
        if (entry.is(SPLIT) && agreed(scene, entry) == null) {
            if (!scene.isMe(entry.authorId())) {
                throw BoardRules.notYours();
            }
            scene.remove(entry.id());
            return;
        }
        throw ApiProblem.conflict(
                "agreed", "Everyone agreed to this. Propose a change instead: it counts once everyone says yes.");
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "propose" -> {
                EntryRow split = scene.need(sent.id("splitId"));
                if (!split.is(SPLIT)) {
                    throw Scene.entryGone();
                }
                EntryRow last = pending(scene, split) != null ? pending(scene, split) : agreed(scene, split);
                propose(
                        scene,
                        split,
                        proposal(scene, split.as(Split.class), sent, last == null ? null : last.as(Proposal.class)),
                        null);
            }
            case "agree" -> {
                EntryRow proposal = scene.need(sent.id("proposalId"));
                if (!proposal.is(PROPOSAL)) {
                    throw Scene.entryGone();
                }
                if (!Say.voiceIds(scene).contains(scene.myId())) {
                    throw BoardRules.notYours();
                }
                if (!proposal.done()) {
                    scene.add(
                            EntryDraft.of(YES).under(proposal.id()).by(scene.myId()),
                            Scene.derivedId(proposal.id(), "yes of " + scene.myId()));
                    settle(scene, proposal);
                }
            }
            case PAID -> paid(scene, sent);
            default -> throw BoardRules.unknownVerb();
        }
    }

    private static void paid(Scene scene, Fields sent) {
        EntryRow split = scene.need(sent.id("splitId"));
        if (!split.is(SPLIT)) {
            throw Scene.entryGone();
        }
        Split details = split.as(Split.class);
        EntryRow agreed = agreed(scene, split);
        if (details.repeats() || agreed == null) {
            throw ApiProblem.conflict(
                    "nothing_to_pay", "There is nothing to tick here yet: it counts once everyone agreed.");
        }
        UUID member = scene.inCircle(sent.id("memberId", scene.myId()));
        if (!scene.isMe(member) && !scene.isMe(details.payerId())) {
            throw BoardRules.notYours();
        }
        EntryRow tick = scene.under(split.id()).stream()
                .filter(e -> e.is(PAID) && member.equals(e.forId()))
                .findFirst()
                .orElse(null);
        if (!sent.flag(PAID, true)) {
            if (tick != null) {
                scene.remove(tick.id());
            }
        } else if (tick == null) {
            scene.add(
                    EntryDraft.of(PAID)
                            .under(split.id())
                            .by(scene.myId())
                            .forMember(member)
                            .done(scene.now(), scene.myId()),
                    Scene.derivedId(split.id(), "paid by " + member));
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<EntryRow> splits = scene.entries(SPLIT);
        long agreed = splits.stream().filter(s -> agreed(scene, s) != null).count();
        long waiting = splits.stream().filter(s -> pending(scene, s) != null).count();
        if (splits.isEmpty()) {
            return "Nothing split yet";
        }
        return Words.count(agreed, "split") + " agreed" + (waiting == 0 ? "" : " · " + waiting + " waiting for a yes");
    }

    private static String wayWords(String way) {
        return switch (way) {
            case NIGHTS -> "split by nights at home";
            case ROOM -> "split by room size";
            case USE -> "split by use";
            case EQUAL -> "split equally";
            default -> "split as agreed";
        };
    }

    /** A proposal that waits for this person's yes, and their share of a bill that isn't paid yet. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        if (scene.me() == null) {
            return List.of();
        }
        List<TodayCard> cards = new ArrayList<>();
        for (EntryRow row : scene.entries(SPLIT)) {
            Split split = row.as(Split.class);
            EntryRow pending = pending(scene, row);
            if (pending != null
                    && Say.voiceIds(scene).contains(scene.myId())
                    && !saidYes(scene, pending).contains(scene.myId())) {
                cards.add(new TodayCard(
                        scene.boardId(),
                        ThingKind.BOARD,
                        template().code(),
                        template().emoji(),
                        title(split) + ": a new split needs your yes",
                        "Proposed by " + scene.firstName(pending.authorId()) + " · it counts once everyone agrees",
                        null,
                        null,
                        "Look",
                        25));
            }
            EntryRow agreed = agreed(scene, row);
            if (agreed == null || split.repeats() || paid(scene, row).contains(scene.myId())) {
                continue;
            }
            Proposal proposal = agreed.as(Proposal.class);
            proposal.parts().stream()
                    .filter(p -> scene.isMe(p.memberId()) && p.cents() > 0)
                    .findFirst()
                    .ifPresent(mine -> cards.add(new TodayCard(
                            scene.boardId(),
                            ThingKind.BOARD,
                            template().code(),
                            template().emoji(),
                            "Your share of the " + Say.lowerFirst(split.name()),
                            Cash.round(proposal.totalCents(), split.currency()) + ", " + wayWords(proposal.way()),
                            Cash.round(mine.cents(), split.currency()),
                            null,
                            "Pay",
                            30)));
        }
        return cards.stream().limit(3).toList();
    }
}
