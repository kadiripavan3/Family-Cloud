package app.homeport.api.money.sheet;

import app.homeport.api.money.sheet.SheetService.NamedTotalResponse;
import app.homeport.api.plan.GoalNumber;
import app.homeport.api.plan.GoalSource;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * A goal that reads its number from a sheet: "Reads “Saved” in Norway budget". The goal keeps
 * {@code <the sheet's id>/<the name of a tile or of a column with a total>}, and the number is the sheet's own
 * ({@link SheetService#total}), worked out afresh each time, so the goal and the sheet can't disagree.
 *
 * <p>Nothing is read for someone who may not see the sheet, for a sheet of another circle, or when the sheet
 * or that number is gone: the goal then shows what was put in by hand.
 */
@Component
class SheetNumbers implements GoalNumber {

    private final SheetService sheets;
    private final ThingStore things;

    SheetNumbers(SheetService sheets, ThingStore things) {
        this.sheets = sheets;
        this.things = things;
    }

    @Override
    public GoalSource source() {
        return GoalSource.SHEET;
    }

    /** What a goal keeps to read this number of this sheet. */
    static String ref(UUID sheetId, String name) {
        return sheetId + "/" + name;
    }

    @Override
    public Optional<Reading> read(UUID circleId, String ref, UUID me) {
        int slash = ref == null ? -1 : ref.indexOf('/');
        if (slash < 0) {
            return Optional.empty();
        }
        UUID sheetId;
        try {
            sheetId = UUID.fromString(ref.substring(0, slash));
        } catch (IllegalArgumentException notASheet) {
            return Optional.empty();
        }
        Optional<ThingRow> sheet = things.find(sheetId, me)
                .filter(row -> row.kind() == ThingKind.SHEET && row.circleId().equals(circleId));
        if (sheet.isEmpty()) {
            return Optional.empty();
        }
        return sheets.total(sheetId, ref.substring(slash + 1), me)
                .flatMap(total -> number(total)
                        .map(number -> new Reading(
                                number,
                                "“" + total.name() + "” in " + sheet.get().title(),
                                sheetId)));
    }

    /** Money in cents, a plain number rounded to a whole one. Anything else (words, a day, a tick) is no number. */
    private static Optional<Long> number(NamedTotalResponse total) {
        return switch (total.kind()) {
            case MONEY -> Optional.ofNullable(total.cents());
            case NUMBER ->
                Optional.ofNullable(total.number())
                        .map(number -> number.setScale(0, RoundingMode.HALF_UP).longValue());
            default -> Optional.empty();
        };
    }
}
