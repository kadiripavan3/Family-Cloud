package app.homeport.api.activity;

import app.homeport.api.activity.ActivityLog.Happened;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.Names;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.Crumb;
import app.homeport.api.journey.HomeSettings;
import app.homeport.api.journey.JourneyHappened;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.OutboxStore;
import app.homeport.api.notify.OutboxStore.Reachable;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushKind;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The link with Journey sends nothing itself: it says what happened ({@link JourneyHappened}), and this turns
 * that into lines of Activity and pushes, by the rules every line and every push keeps. A line about a thing
 * is read only by whoever may see that thing, and a push is checked against the thing again when it is sent.
 *
 * <ul>
 *   <li><b>A journey was kept.</b> One line, about its book (or its album, when no book was kept): "Iceland
 *       ring road was kept from Journey", with how many originals came and where the book is. Keeping takes a
 *       while and ends by itself, so whoever kept it reads the line too. The line that the book "was added"
 *       gives way to it. Nobody's phone buzzes for the journey as such: its photos are told as the one burst
 *       they are, like any photos. When more of a kept journey comes home later, that is a line of its own.
 *   <li><b>A trip became a journey.</b> One line about the trip's folder, for the others who may see it.
 *   <li><b>A draft left for Journey.</b> A line for its writer alone, as a record of what left home.
 *   <li><b>A goodnight arrived.</b> A push for everyone else who may see it, at the circle's bedtime on the
 *       evening it is meant for (by the clock at home, when the circle said which that is; else by each
 *       person's own), or at once when that moment has passed. Activity has its line already: a goodnight is
 *       a thing, and it arriving is told like any thing that is added.
 * </ul>
 *
 * <p>News never undoes what it is about. Each of these is written at a savepoint of the transaction it
 * happened in (or in a transaction of its own, where there is none), and when it can't be written, that is
 * logged and the journey is kept, told or sent all the same.
 */
@Component
class JourneyNews {

    private static final Logger log = LoggerFactory.getLogger(JourneyNews.class);

    private final ActivityLog activity;
    private final ActivityStore lines;
    private final Outbox outbox;
    private final OutboxStore reach;
    private final MemberStore members;
    private final FolderService folders;
    private final HomeSettings homes;
    private final TransactionTemplate transaction;

    JourneyNews(
            ActivityLog activity,
            ActivityStore lines,
            Outbox outbox,
            OutboxStore reach,
            MemberStore members,
            FolderService folders,
            HomeSettings homes,
            PlatformTransactionManager transactions) {
        this.activity = activity;
        this.lines = lines;
        this.outbox = outbox;
        this.reach = reach;
        this.members = members;
        this.folders = folders;
        this.homes = homes;
        this.transaction = new TransactionTemplate(transactions);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
    }

    /** Writes a piece of news by itself: what goes wrong here is logged, and never reaches whoever said it happened. */
    private void quietly(JourneyHappened happened, Runnable news) {
        try {
            transaction.executeWithoutResult(status -> news.run());
        } catch (RuntimeException failed) {
            log.warn(
                    "News of the link with Journey couldn't be written ({})",
                    happened.getClass().getSimpleName(),
                    failed);
        }
    }

    // ---------- a journey was kept ----------

    @EventListener
    void on(JourneyHappened.Kept kept) {
        UUID about = kept.pageId() != null ? kept.pageId() : kept.albumId();
        if (about == null) {
            return; // only its route was kept: nothing of it stands here to open
        }
        quietly(kept, () -> {
            if (kept.first()) {
                // One piece of news, not three: that its book and its album "were added" is said by this line.
                lines.takeBack(
                        ActivityKind.ADDED,
                        Stream.of(kept.pageId(), kept.albumId())
                                .filter(Objects::nonNull)
                                .toList(),
                        kept.memberId());
                activity.record(kept(kept.circleId(), kept.memberId(), about, kept.shots()));
            } else if (kept.entries() > 0 || kept.shots() > 0) {
                activity.record(Happened.to(kept.circleId(), ActivityKind.KEPT, about)
                        .saying("has more from Journey", false)
                        .note(commas(
                                kept.entries() == 0 ? null : count(kept.entries(), "new entry", "new entries"),
                                kept.shots() == 0 ? null : count(kept.shots(), "original", "originals"))));
            }
        });
    }

    /**
     * The line for a kept journey: "Iceland ring road was kept from Journey", and under it "214 originals, now
     * in Trips". It names nobody: the journey came home, and whoever kept it reads the line like everyone
     * else who may see the book.
     *
     * @param keptBy the member who kept it: the folder its book is in is named as they see it
     * @param about the book, or the album when no book was kept
     * @param originals how many photos and clips came home
     */
    Happened kept(UUID circleId, UUID keptBy, UUID about, int originals) {
        return Happened.to(circleId, ActivityKind.KEPT, about)
                .note(commas(
                        originals == 0 ? null : count(originals, "original", "originals"), folderOf(about, keptBy)));
    }

    /** "now in Trips": the folder a thing is filed in, as this member sees it. Null when it isn't filed. */
    private String folderOf(UUID thingId, UUID memberId) {
        Reachable keeper = reach.reachable(List.of(memberId)).get(memberId);
        if (keeper == null) {
            return null;
        }
        List<Crumb> way = folders.breadcrumb(thingId, keeper.userId());
        return way.isEmpty() ? null : "now in " + way.get(way.size() - 1).title();
    }

    // ---------- a trip became a journey, a draft left for Journey ----------

    @EventListener
    void on(JourneyHappened.TripBecameJourney became) {
        quietly(
                became,
                () -> activity.record(Happened.to(became.circleId(), ActivityKind.KEPT, became.folderId())
                        .by(became.memberId())
                        .saying("became a journey", false)
                        .note("It is told in Journey from here on")));
    }

    @EventListener
    void on(JourneyHappened.Told told) {
        String title = told.title() == null || told.title().isBlank()
                ? "a journey"
                : "“" + told.title().trim() + "”";
        quietly(
                told,
                () -> activity.record(Happened.in(told.circleId(), ActivityKind.KEPT)
                        .onlyFor(told.memberId())
                        .saying("You told " + title + " in Journey", false)
                        .note(told.shots() == 0 ? "" : count(told.shots(), "photo", "photos") + " left home")));
    }

    // ---------- a goodnight arrived ----------

    @EventListener
    void on(JourneyHappened.GoodnightArrived arrived) {
        quietly(arrived, () -> {
            List<UUID> others = members.of(List.of(arrived.circleId())).stream()
                    .map(MemberRow::id)
                    .filter(id -> !id.equals(arrived.memberId()))
                    .toList();
            tellAtBedtime(
                    arrived,
                    reach.reachable(others),
                    Names.first(reach.nameOf(arrived.memberId())),
                    homes.zone(arrived.circleId()).orElse(null),
                    Instant.now());
        });
    }

    private void tellAtBedtime(
            JourneyHappened.GoodnightArrived arrived,
            Map<UUID, Reachable> phones,
            String from,
            ZoneId home,
            Instant now) {
        for (Reachable who : phones.values()) {
            // Bedtime on the evening it is meant for, by the clock at home. One that arrives after that is told now.
            Instant bedtime = arrived.forDay() == null || arrived.bedtime() == null
                    ? now
                    : arrived.forDay()
                            .atTime(arrived.bedtime())
                            .atZone(home != null ? home : who.zone())
                            .toInstant();
            Push push = Push.to(
                            who.userId(),
                            PushKind.GOODNIGHT,
                            arrived.replyTo() == null ? "Goodnight from " + from : from + " sent a goodnight back",
                            arrived.replyTo() == null ? "Recorded for tonight. Open to play it." : "Open to play it.",
                            "/goodnight/" + arrived.thingId())
                    .about(arrived.circleId(), arrived.thingId())
                    .by(arrived.memberId())
                    .once("goodnight:" + arrived.thingId() + ":" + who.userId());
            outbox.tell(bedtime.isAfter(now) ? push.after(bedtime) : push);
        }
    }

    // ---------- small pieces ----------

    private static String count(int howMany, String one, String many) {
        return howMany + " " + (howMany == 1 ? one : many);
    }

    private static String commas(String... pieces) {
        List<String> said = new ArrayList<>();
        for (String piece : pieces) {
            if (piece != null && !piece.isBlank()) {
                said.add(piece);
            }
        }
        return String.join(", ", said);
    }
}
