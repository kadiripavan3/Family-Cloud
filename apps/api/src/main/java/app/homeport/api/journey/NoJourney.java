package app.homeport.api.journey;

import app.homeport.api.common.Page;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.IntConsumer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * This app without Journey ({@code homeport.journey.mode=off}, and the answer when nothing is set): nobody has
 * a Journey profile, nobody is away on a journey, and there is nothing to keep or to tell. What was kept
 * before stays: a kept journey is a page and photos of this app's own.
 */
@Component
@ConditionalOnProperty(name = "homeport.journey.mode", havingValue = "off", matchIfMissing = true)
class NoJourney implements JourneyPort {

    @Override
    public JourneyMode mode() {
        return JourneyMode.OFF;
    }

    @Override
    public List<NotYet> notYet() {
        return List.of();
    }

    @Override
    public Optional<Traveller> profile(Caller as) {
        return Optional.empty();
    }

    @Override
    public Page<JourneyBrief> journeys(Caller as, String cursor, int limit) {
        return new Page<>(List.of(), null);
    }

    @Override
    public Optional<JourneyBrief> journey(Caller as, UUID journeyId) {
        return Optional.empty();
    }

    @Override
    public Story story(Caller as, UUID journeyId) {
        throw JourneyPort.off();
    }

    @Override
    public List<StoryRemark> remarks(Caller as, UUID entryId) {
        return List.of();
    }

    @Override
    public byte[] file(Caller as, StoryShot shot) {
        throw JourneyPort.off();
    }

    @Override
    public byte[] still(Caller as, StoryShot shot) {
        throw JourneyPort.off();
    }

    @Override
    public Optional<byte[]> cover(Caller as, JourneyBrief journey) {
        return Optional.empty();
    }

    @Override
    public List<AwayJourney> away(Caller as, Collection<UUID> userIds) {
        return List.of();
    }

    @Override
    public PostedJourney post(Caller as, LeavingHome.Checked draft, IntConsumer sent) {
        throw JourneyPort.off();
    }

    @Override
    public Optional<ChallengeDays> challenge(Caller as, String ref) {
        return Optional.empty();
    }
}
