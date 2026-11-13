package app.homeport.api.journey;

import app.homeport.api.activity.LineLooks;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource;
import app.homeport.api.journey.AtHomeService.AwayResponse;
import app.homeport.api.journey.AtHomeService.JourneyPastDay;
import app.homeport.api.journey.GoodnightService.GoodnightResponse;
import app.homeport.api.journey.GoodnightStore.Goodnight;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.media.MediaStore;
import app.homeport.api.media.MediaStore.MediaRow;
import app.homeport.api.plan.GoalNumber;
import app.homeport.api.plan.GoalSource;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Where the link with Journey plugs into the rest: cards on Today (someone is away, a goodnight waits, a day
 * from a kept journey of an earlier year), the cover of a kept journey's book in Activity, a few words on
 * where a goodnight stands, and the number a goal reads from a challenge in Journey. One small bean for each,
 * because each is asked for in its own way. (What is told of the link, in Activity and on phones, is made
 * where those are made: {@code activity/JourneyNews}. The Sunday summary's part is {@code digest/JourneyDigest}.)
 */
@Configuration
class JourneySources {

    private static final Logger log = LoggerFactory.getLogger(JourneySources.class);

    /** Above the day's list: a goodnight first, then who is away, then a look back. */
    @Bean
    TodaySource journeyOnToday(AtHomeService atHome, GoodnightService goodnights, HomeSettings homes) {
        return new TodaySource() {
            @Override
            public List<TodayCard> cards(UUID me, UUID circleId, LocalDate day) {
                List<TodayCard> cards = new ArrayList<>();
                try {
                    for (GoodnightResponse goodnight : goodnights.waiting(circleId, me, day)) {
                        Integer seconds = goodnight.clip().durationSeconds();
                        cards.add(new TodayCard(
                                goodnight.id(),
                                ThingKind.GOODNIGHT,
                                "goodnight",
                                "🌙",
                                goodnight.from() == null
                                        ? goodnight.title()
                                        : "Goodnight from " + goodnight.from().name(),
                                "For bedtime at " + goodnight.showFrom()
                                        + (goodnight.place() == null ? "" : " · " + goodnight.place()),
                                seconds == null ? null : "%d:%02d".formatted(seconds / 60, seconds % 60),
                                goodnight.posterUrl(),
                                "Play",
                                5));
                    }
                    for (AwayResponse away : atHome.away(circleId, me)) {
                        cards.add(new TodayCard(
                                null,
                                null,
                                "journey_away",
                                "🌍",
                                away.who().name() + " is on a journey",
                                away.journey().title() + " · " + away.journey().progressLabel(),
                                away.newCount() > 0 ? away.newCount() + " new" : null,
                                away.latest().imageUrl(),
                                "Open in Journey",
                                20));
                    }
                    for (JourneyPastDay past : atHome.onThisDay(circleId, me, day)) {
                        if (past.pageId() == null) {
                            continue;
                        }
                        cards.add(new TodayCard(
                                past.pageId(),
                                ThingKind.PAGE,
                                "journey_on_this_day",
                                "📷",
                                past.title(),
                                (past.yearsAgo() == 1 ? "Last year" : past.yearsAgo() + " years ago") + " · "
                                        + past.label() + " · kept journey",
                                null,
                                past.imageUrl(),
                                null,
                                60));
                    }
                } catch (RuntimeException failed) {
                    // Today opens whatever happens to the link with Journey.
                    log.warn("The Journey cards couldn't be made for Today", failed);
                }
                return cards;
            }
        };
    }

    /** A kept journey's book is drawn in Activity with its cover: the waterfall next to "Iceland ring road". */
    @Bean
    LineLooks keptJourneyLooks(KeepStore keeps, MediaService media) {
        return new LineLooks() {
            @Override
            public Set<ThingKind> kinds() {
                return Set.of(ThingKind.PAGE);
            }

            @Override
            public Map<UUID, Look> looks(List<UUID> thingIds, UUID me) {
                Map<UUID, Look> looks = new HashMap<>();
                keeps.coversOfBooks(thingIds)
                        .forEach((page, key) -> looks.put(page, new Look(null, media.urlFor(key, MediaSize.SMALL))));
                return looks;
            }
        };
    }

    /** "0:48 · Reine, Norway": how long a goodnight is and where it was recorded. */
    @Bean
    GlanceSource goodnightGlance(GoodnightStore goodnights, MediaStore media) {
        return new GlanceSource() {
            @Override
            public ThingKind kind() {
                return ThingKind.GOODNIGHT;
            }

            @Override
            public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
                List<Goodnight> rows = goodnights.findAll(thingIds, me);
                Map<UUID, MediaRow> clips = media
                        .findAll(rows.stream().map(Goodnight::mediaId).toList())
                        .stream()
                        .collect(Collectors.toMap(MediaRow::id, Function.identity()));
                Map<UUID, String> lines = new HashMap<>();
                for (Goodnight row : rows) {
                    MediaRow clip = clips.get(row.mediaId());
                    String length = clip == null || clip.durationS() == null
                            ? null
                            : "%d:%02d".formatted(clip.durationS() / 60, clip.durationS() % 60);
                    String line =
                            length == null ? row.place() : row.place() == null ? length : length + " · " + row.place();
                    if (line != null) {
                        lines.put(row.id(), line);
                    }
                }
                return lines;
            }
        };
    }

    /**
     * A goal that follows a challenge in Journey reads how many days were ticked there, asked as the person
     * looking at the goal: someone who may not see the challenge in Journey is shown what was put in by hand.
     */
    @Bean
    GoalNumber journeyChallengeDays(JourneyPort port) {
        return new GoalNumber() {
            @Override
            public GoalSource source() {
                return GoalSource.JOURNEY;
            }

            @Override
            public Optional<Reading> read(UUID circleId, String ref, UUID me) {
                Optional<Caller> as =
                        Caller.current().filter(caller -> caller.userId().equals(me));
                if (ref == null || ref.isBlank() || as.isEmpty() || port.mode() == JourneyMode.OFF) {
                    return Optional.empty();
                }
                try {
                    return port.challenge(as.get(), ref.trim())
                            .map(challenge -> new Reading(challenge.checkIns(), challenge.title() + " in Journey"));
                } catch (ApiProblem problem) {
                    log.debug("A challenge couldn't be read from Journey: {}", problem.code());
                    return Optional.empty();
                }
            }
        };
    }
}
