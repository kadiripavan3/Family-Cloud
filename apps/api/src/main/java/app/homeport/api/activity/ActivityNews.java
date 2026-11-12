package app.homeport.api.activity;

import app.homeport.api.activity.ActivityStore.Batch;
import app.homeport.api.activity.ActivityStore.Burst;
import app.homeport.api.activity.ActivityStore.Who;
import app.homeport.api.activity.PhotoBatches.Named;
import app.homeport.api.common.Jobs;
import app.homeport.api.common.Names;
import app.homeport.api.notify.CountedPush;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushFeed;
import app.homeport.api.notify.PushKind;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The news in Activity that is pushed: a batch of photos. One push per burst, not per photo: the first
 * photo starts a wait of ten minutes, and whatever arrives meanwhile is told with it. Who hears of it is
 * worked out when the wait is over (everyone who may see at least one of the photos), and what the push says
 * is counted when it is sent, from what that reader may see at that moment: "Alex added 19 photos".
 */
@Component
class ActivityNews implements PushFeed, CountedPush {

    static final int BURSTS_AT_ONCE = 50;
    /** How long Activity keeps a line. It is news, not a record. */
    static final int DAYS_KEPT = 90;

    private final ActivityStore store;
    private final Outbox outbox;
    private final ObjectProvider<PhotoBatches> library;
    private final TransactionTemplate transaction;
    private final Jobs jobs;

    ActivityNews(
            ActivityStore store,
            Outbox outbox,
            ObjectProvider<PhotoBatches> library,
            TransactionTemplate transaction,
            Jobs jobs) {
        this.store = store;
        this.outbox = outbox;
        this.library = library;
        this.transaction = transaction;
        this.jobs = jobs;
    }

    /** Turns the bursts whose wait is over into one push per person who may see something of them. */
    @Override
    public int announce() {
        Integer told = transaction.execute(status -> {
            List<Burst> bursts = store.takeBursts(BURSTS_AT_ONCE);
            for (Burst burst : bursts) {
                for (UUID user : store.hearOfBurst(burst)) {
                    // These words are only what it says to someone who hides details: the rest is counted when it is
                    // sent.
                    outbox.tell(Push.to(
                                    user,
                                    PushKind.PHOTOS,
                                    PushKind.PHOTOS.quietTitle(),
                                    PushKind.PHOTOS.quietBody(),
                                    "/library")
                            .about(burst.circleId(), null)
                            .by(burst.memberId())
                            .counting(burst.lineId(), burst.since()));
                }
            }
            return bursts.size();
        });
        return told == null ? 0 : told;
    }

    /** "Alex added 19 photos" and under it "Saturday at the lake", for what this reader may see of the burst now. */
    @Override
    public Optional<Words> words(UUID lineId, UUID userId, Instant since) {
        Burst line = store.line(lineId).orElse(null);
        Batch batch = line == null
                ? null
                : store.batches(List.of(lineId), userId, since).get(lineId);
        if (batch == null || batch.count() == 0) {
            return Optional.empty();
        }
        String who = line.memberId() == null
                ? "Someone"
                : store.who(List.of(line.memberId())).values().stream()
                        .findFirst()
                        .map(Who::name)
                        .map(Names::first)
                        .orElse("Someone");
        Named named = library.stream()
                .map(names -> names.name(line.circleId(), userId, batch.some()))
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(new Named(null, null));
        return Optional.of(new Words(
                who + " added " + ActivityService.photos(batch.count()),
                named.title() == null ? "Open the Library to see them" : named.title()));
    }

    /** Once a night: lines from more than three months ago are forgotten. */
    @Scheduled(cron = "${homeport.activity.cleanup-cron:0 35 3 * * *}", zone = "UTC")
    void nightly() {
        jobs.run("activity_cleanup", LocalDate.now(ZoneOffset.UTC).toString(), this::forgetOld);
    }

    public int forgetOld() {
        int gone = 0;
        int step;
        do {
            step = store.forgetOlderThan(DAYS_KEPT);
            gone += step;
        } while (step == 5000);
        return gone;
    }
}
