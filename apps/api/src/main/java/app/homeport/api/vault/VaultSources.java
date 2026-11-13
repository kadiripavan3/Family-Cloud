package app.homeport.api.vault;

import app.homeport.api.guest.GuestView;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * What the Vault brings to the rest of the app, all of it from what is kept in the clear: an ID that runs out
 * soon on Today, a search by site (titles are searched for every kind already; there is nothing else the API
 * could search), "Login · netflix.com" wherever things of mixed kinds are listed, and what a guest pass says
 * about a Vault item, which is nothing: only a sealed card carries a secret to a guest.
 */
@Component
class VaultSources implements TodaySource, SearchSource, GlanceSource, GuestView {

    private final VaultItemStore items;
    private final MediaService media;

    VaultSources(VaultItemStore items, MediaService media) {
        this.items = items;
        this.media = media;
    }

    @Override
    public List<TodayItem> today(UUID me, UUID circleId, LocalDate day) {
        return items
                .expiring(
                        circleId,
                        me,
                        day.minusDays(VaultGlance.TODAY_DAYS_AFTER),
                        day.plusDays(VaultGlance.TODAY_DAYS_BEFORE))
                .stream()
                .map(e -> new TodayItem(
                        e.thingId(),
                        ThingKind.VAULT_ITEM,
                        e.title(),
                        VaultGlance.countdown(e.expiresOn(), day) + " · renew it",
                        null,
                        null,
                        1440,
                        e.avatarKeys().stream()
                                .map(key -> media.urlFor(key, MediaSize.SMALL))
                                .toList()))
                .toList();
    }

    @Override
    public Place place() {
        return Place.VAULT;
    }

    @Override
    public List<Found> find(UUID circleId, UUID me, String words, int limit) {
        return items.bySite(circleId, me, words, limit).stream()
                .map(g -> new Found(g.thingId(), g.site()))
                .toList();
    }

    @Override
    public ThingKind kind() {
        return ThingKind.VAULT_ITEM;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        LocalDate today = LocalDate.now();
        return items.glances(thingIds).stream()
                .collect(Collectors.toMap(
                        VaultItemStore.GlanceRow::thingId,
                        g -> VaultGlance.of(g.category(), g.site(), g.expiresOn(), today)));
    }

    /**
     * A Vault item on a guest pass shows its title and this line, never anything from inside: the API
     * couldn't read it if it wanted to. What a guest may read (a door code, the Wi‑Fi password) travels as a
     * sealed card the pass's maker made on their phone.
     */
    @Override
    public Card show(UUID thingId) {
        String label = items.glances(List.of(thingId)).stream()
                .findFirst()
                .map(g -> g.category().label())
                .orElse("Vault");
        return new Card(label, "Kept in the Vault. Not shown on a pass.");
    }
}
