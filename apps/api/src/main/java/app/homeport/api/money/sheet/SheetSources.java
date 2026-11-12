package app.homeport.api.money.sheet;

import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.money.sheet.SheetService.Headline;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * What sheets bring to the rest: a search inside their cells, and a few words on where a sheet stands. Those
 * words are its first tile that is shown against another ("€180 of €250"), failing that its first tile
 * ("€7,640"), failing that how many rows it has.
 */
@Component
class SheetSources implements SearchSource, GlanceSource {

    private final SheetStore sheets;
    private final SheetService service;
    private final ThingStore things;

    // ThingService asks every GlanceSource, and SheetService asks ThingService: lazily, so either can be made first.
    SheetSources(SheetStore sheets, @Lazy SheetService service, ThingStore things) {
        this.sheets = sheets;
        this.service = service;
        this.things = things;
    }

    @Override
    public Place place() {
        return Place.MONEY;
    }

    @Override
    public List<Found> find(UUID circleId, String words, int limit) {
        return sheets.search(circleId, Sql.anywhere(words), limit).stream()
                .map(found -> new Found(found.getKey(), found.getValue()))
                .toList();
    }

    @Override
    public ThingKind kind() {
        return ThingKind.SHEET;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        Map<UUID, String> glances = new HashMap<>();
        service.headlines(things.findAll(thingIds, me)).forEach((id, headline) -> glances.put(id, words(headline)));
        return glances;
    }

    private static String words(Headline headline) {
        String rows = headline.rows() == 1 ? "1 row" : headline.rows() + " rows";
        if (headline.against() != null) {
            String part = SheetService.words(headline.against().cell(), headline.currency());
            String whole = SheetService.words(headline.against().ofCell(), headline.currency());
            if (!part.isEmpty() && !whole.isEmpty()) {
                return part + " of " + whole;
            }
        }
        if (headline.first() != null) {
            String first = SheetService.words(headline.first().cell(), headline.currency());
            if (!first.isEmpty()) {
                return first;
            }
        }
        return rows;
    }
}
