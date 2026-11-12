package app.homeport.api.money.split;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.CircleService;
import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.money.Cash;
import app.homeport.api.money.split.SplitService.Mine;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * What splits bring to the rest: "You're owed for Lisbon weekend" on Today (among equals, where splitting is
 * everyday business; a family keeps it in Money), a search inside what was paid for, and "You're owed €64"
 * wherever a split is listed among other things.
 */
@Component
class SplitSources implements TodaySource, SearchSource, GlanceSource {

    private final SplitService splits;
    private final SplitStore store;
    private final CircleService circles;
    private final ThingStore things;

    // ThingService asks every GlanceSource, and SplitService asks ThingService: lazily, so either can be made first.
    SplitSources(@Lazy SplitService splits, SplitStore store, CircleService circles, ThingStore things) {
        this.splits = splits;
        this.store = store;
        this.circles = circles;
        this.things = things;
    }

    @Override
    public List<TodayItem> today(UUID me, UUID circleId, LocalDate day) {
        CircleKind kind = circles.require(circleId, me).kind();
        if (kind.hasRoles()) {
            return List.of();
        }
        return splits.standings(circleId, me).stream()
                .filter(mine -> mine.balanceCents() != 0)
                .map(mine -> new TodayItem(
                                mine.thing().id(),
                                ThingKind.SPLIT,
                                title(mine),
                                mine.with().stream()
                                        .map(owing -> owing.person().name() + " "
                                                + Cash.round(Math.abs(owing.cents()), mine.currency()))
                                        .collect(Collectors.joining(" · ")),
                                Cash.round(Math.abs(mine.balanceCents()), mine.currency()),
                                null,
                                1440,
                                mine.with().stream()
                                        .map(owing -> owing.person().avatarUrl())
                                        .filter(Objects::nonNull)
                                        .limit(2)
                                        .toList())
                        .with(action(kind, mine.balanceCents() > 0), false, null))
                .toList();
    }

    /**
     * "You're owed for Lisbon weekend" among several; between you and one other person the line names them:
     * "Alex owes you for October", "You owe Nora for October".
     */
    static String title(Mine mine) {
        boolean owed = mine.balanceCents() > 0;
        String with = mine.with().size() == 1 ? mine.with().get(0).person().name() : null;
        if (with == null) {
            return (owed ? "You're owed for " : "You owe for ") + mine.thing().title();
        }
        return (owed ? with + " owes you for " : "You owe " + with + " for ")
                + mine.thing().title();
    }

    /**
     * The button of a split's line. Two people who share a life settle up, whichever of them owes. Among
     * friends and housemates, whoever is owed can remind the others, and whoever owes can pay their share.
     */
    static TodayAction action(CircleKind kind, boolean owed) {
        if (kind == CircleKind.COUPLE) {
            return new TodayAction("Settle", "settle");
        }
        return owed ? new TodayAction("Remind", "remind") : new TodayAction("Pay", "settle");
    }

    @Override
    public Place place() {
        return Place.MONEY;
    }

    @Override
    public List<Found> find(UUID circleId, UUID me, String words, int limit) {
        return store.search(circleId, me, Sql.anywhere(words), limit).stream()
                .map(found -> new Found(found.getKey(), found.getValue()))
                .toList();
    }

    @Override
    public ThingKind kind() {
        return ThingKind.SPLIT;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        Map<UUID, String> glances = new HashMap<>();
        List<UUID> circleIds = things.findAll(thingIds, me).stream()
                .map(ThingRow::circleId)
                .distinct()
                .toList();
        for (UUID circleId : circleIds) {
            for (Mine mine : splits.standings(circleId, me)) {
                if (thingIds.contains(mine.thing().id())) {
                    glances.put(mine.thing().id(), words(mine));
                }
            }
        }
        return glances;
    }

    private static String words(Mine mine) {
        if (mine.balanceCents() > 0) {
            return "You're owed " + Cash.round(mine.balanceCents(), mine.currency());
        }
        if (mine.balanceCents() < 0) {
            return "You owe " + Cash.round(-mine.balanceCents(), mine.currency());
        }
        return mine.expenses() == 0 ? "Nothing added yet" : "You're even";
    }
}
