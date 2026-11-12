package app.homeport.api.money.sheet;

import app.homeport.api.common.Keyset;
import app.homeport.api.money.sheet.SheetService.NamedTotal;
import app.homeport.api.plan.GoalNumber;
import app.homeport.api.plan.GoalSource;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * A goal that reads its number from a sheet: the tile called "Saved" in the Norway budget. The goal keeps
 * where to look as {@code <sheet>/<name>}: the sheet by its id, or by its title written small with hyphens
 * ("norway-budget", for a goal that was set up before the sheet's id was known), and the name of a tile or of
 * a column with a total. Only someone who may see the sheet gets the number.
 */
@Component
class SheetNumber implements GoalNumber {

    private final SheetService sheets;
    private final ThingStore things;

    SheetNumber(SheetService sheets, ThingStore things) {
        this.sheets = sheets;
        this.things = things;
    }

    @Override
    public GoalSource source() {
        return GoalSource.SHEET;
    }

    @Override
    public Optional<Reading> read(UUID circleId, String ref, UUID me) {
        int slash = ref == null ? -1 : ref.indexOf('/');
        if (slash <= 0 || slash == ref.length() - 1) {
            return Optional.empty();
        }
        Optional<ThingRow> sheet = sheet(circleId, ref.substring(0, slash).trim(), me);
        if (sheet.isEmpty()) {
            return Optional.empty();
        }
        String name = ref.substring(slash + 1).trim();
        return sheets.total(sheet.get().id(), name, me)
                .filter(total -> total.cents() != null || total.number() != null)
                .map(total -> new Reading(
                        number(total),
                        "“" + total.name() + "” in " + sheet.get().title()));
    }

    /** Money counts in cents, as a money goal does; any other number as it stands. */
    private static long number(NamedTotal total) {
        return total.cents() != null ? total.cents() : total.number().longValue();
    }

    private Optional<ThingRow> sheet(UUID circleId, String which, UUID me) {
        try {
            UUID id = UUID.fromString(which);
            return things.find(id, me)
                    .filter(row ->
                            row.kind() == ThingKind.SHEET && row.circleId().equals(circleId));
        } catch (IllegalArgumentException notAnId) {
            return things.list(circleId, me, ThingKind.SHEET, null, null, Keyset.first(200)).stream()
                    .filter(row -> slug(row.title()).equals(slug(which)))
                    .findFirst();
        }
    }

    /** "Norway budget" and "norway-budget" are the same sheet. */
    static String slug(String title) {
        return Normalizer.normalize(title, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }
}
