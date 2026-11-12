package app.homeport.api.money.sheet;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.money.Cash;
import app.homeport.api.money.MoneyPeople.Person;
import app.homeport.api.money.sheet.SheetStore.ColumnRow;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * One cell of a sheet, on its three ways: what the app sends for it (checked against its column's kind, so a
 * cost can't be typed as a word), how it is kept (a plain JSON value under its column's id), and what the app
 * is sent back.
 *
 * <p>How each kind is kept: text and a choice as a string; a number as a string of digits ("12.5"), so nothing
 * is lost to rounding; money as whole cents; a date as "2027-01-15"; a tick as true (an unticked cell isn't
 * kept at all); people as a list of member ids. A formula column keeps nothing: it is worked out.
 */
public final class Cells {

    static final int MAX_PEOPLE_IN_A_CELL = 10;

    private Cells() {}

    /** What one cell, total or answer holds, as the app is sent it. Only the field for its kind is set. */
    public record CellResponse(
            CellKind kind,
            @Schema(nullable = true) String text,
            @Schema(nullable = true) BigDecimal number,

            @Schema(nullable = true, description = "Money, in cents of the sheet's currency")
            Long cents,

            @Schema(nullable = true) LocalDate date,
            @Schema(nullable = true) Boolean ticked,
            @Schema(nullable = true) List<PersonBrief> people,

            @Schema(nullable = true, description = "Why it can't be worked out, in plain words: Price is empty")
            String problem) {

        static final CellResponse EMPTY = new CellResponse(CellKind.EMPTY, null, null, null, null, null, null, null);
    }

    // ---------- from what is kept ----------

    /** What is kept in a cell, as a value to count with. Null for a cell that holds nothing (or something its column can't read). */
    static Value stored(ColumnRow column, Object kept, Map<UUID, Person> circle) {
        if (kept == null) {
            return null;
        }
        try {
            return switch (column.kind()) {
                case TEXT, CHOICE -> kept instanceof String text && !text.isBlank() ? new Value.Text(text) : null;
                case NUMBER -> new Value.Num(new BigDecimal(kept.toString()), false);
                case MONEY -> kept instanceof Number cents ? Value.money(cents.longValue()) : null;
                case DATE -> new Value.Day(LocalDate.parse(kept.toString()));
                case TICK -> new Value.Tick(Boolean.TRUE.equals(kept));
                case PERSON -> {
                    List<UUID> ids = new ArrayList<>();
                    List<String> names = new ArrayList<>();
                    if (kept instanceof List<?> list) {
                        for (Object one : list) {
                            Person person = circle.get(UUID.fromString(one.toString()));
                            if (person != null) {
                                ids.add(person.id());
                                names.add(person.name());
                            }
                        }
                    }
                    yield ids.isEmpty() ? null : new Value.People(ids, names);
                }
                case FORMULA -> null;
            };
        } catch (RuntimeException unreadable) {
            return null;
        }
    }

    // ---------- to what the app is sent ----------

    /** A value as the app is sent it. Money becomes whole cents again here, rounded half up. */
    static CellResponse view(Value value, Map<UUID, Person> circle) {
        return switch (value) {
            case Value.Num num -> {
                try {
                    yield num.money()
                            ? new CellResponse(
                                    CellKind.MONEY,
                                    null,
                                    null,
                                    num.amount()
                                            .movePointRight(2)
                                            .setScale(0, RoundingMode.HALF_UP)
                                            .longValueExact(),
                                    null,
                                    null,
                                    null,
                                    null)
                            : new CellResponse(
                                    CellKind.NUMBER,
                                    null,
                                    new BigDecimal(Calc.plain(num.amount())),
                                    null,
                                    null,
                                    null,
                                    null,
                                    null);
                } catch (ArithmeticException tooLarge) {
                    yield problem("That number is too large to show");
                }
            }
            case Value.Text text ->
                text.text().isBlank()
                        ? CellResponse.EMPTY
                        : new CellResponse(CellKind.TEXT, text.text(), null, null, null, null, null, null);
            case Value.Tick tick -> new CellResponse(CellKind.TICK, null, null, null, null, tick.on(), null, null);
            case Value.Day day -> new CellResponse(CellKind.DATE, null, null, null, day.date(), null, null, null);
            case Value.People who ->
                new CellResponse(
                        CellKind.PERSON,
                        null,
                        null,
                        null,
                        null,
                        null,
                        who.ids().stream()
                                .map(circle::get)
                                .filter(Objects::nonNull)
                                .map(Person::brief)
                                .toList(),
                        null);
            case Value.Empty empty -> CellResponse.EMPTY;
            case Value.Problem problem -> problem(problem.says());
        };
    }

    static CellResponse problem(String says) {
        return new CellResponse(CellKind.PROBLEM, null, null, null, null, null, null, says);
    }

    // ---------- from what the app sends ----------

    /**
     * What the app sent for some cells, as it is kept: checked against each column's kind, so a cost can't be
     * typed as a word. Null empties a cell.
     */
    static Map<String, Object> kept(Map<UUID, Object> sent, List<ColumnRow> columns, Map<UUID, Person> circle) {
        Map<String, Object> kept = new LinkedHashMap<>();
        if (sent == null) {
            return kept;
        }
        for (Map.Entry<UUID, Object> one : sent.entrySet()) {
            ColumnRow column = columns.stream()
                    .filter(c -> c.id().equals(one.getKey()))
                    .findFirst()
                    .orElseThrow(() -> ApiProblem.badRequest("not_in_tab", "One of those columns isn't in this tab."));
            kept.put(column.id().toString(), keptValue(column, one.getValue(), circle));
        }
        return kept;
    }

    private static Object keptValue(ColumnRow column, Object sent, Map<UUID, Person> circle) {
        if (sent == null || (sent instanceof String text && text.isBlank())) {
            return null;
        }
        String name = column.name();
        switch (column.kind()) {
            case TEXT:
                if (sent instanceof String text && text.length() <= 2000) {
                    return text.strip();
                }
                throw wrong(name + " takes words, 2,000 characters at most.");
            case CHOICE:
                if (sent instanceof String text) {
                    Optional<String> option = column.options().stream()
                            .filter(o -> o.equalsIgnoreCase(text.strip()))
                            .findFirst();
                    if (option.isPresent()) {
                        return option.get();
                    }
                }
                throw wrong(name + " is one of: " + String.join(", ", column.options()) + ".");
            case NUMBER:
                try {
                    BigDecimal number = new BigDecimal(
                            sent instanceof String text ? text.strip().replace(',', '.') : sent.toString());
                    if (number.precision() - number.scale() > 15 || number.scale() > 10) {
                        throw wrong(name + " takes a number with up to 15 digits.");
                    }
                    return number.toPlainString();
                } catch (NumberFormatException notANumber) {
                    throw wrong(name + " takes a number.");
                }
            case MONEY:
                if (sent instanceof Number amount && (sent instanceof Integer || sent instanceof Long)) {
                    if (Math.abs(amount.longValue()) > Cash.MAX_CENTS) {
                        throw wrong(name + " can't hold an amount that large.");
                    }
                    return amount.longValue();
                }
                throw wrong(name + " takes money, sent as whole cents.");
            case DATE:
                try {
                    return LocalDate.parse(sent.toString()).toString();
                } catch (DateTimeParseException notADay) {
                    throw wrong(name + " takes a date.");
                }
            case TICK:
                if (sent instanceof Boolean ticked) {
                    return ticked ? Boolean.TRUE : null;
                }
                throw wrong(name + " is ticked or not.");
            case PERSON:
                List<?> list = sent instanceof List<?> many ? many : List.of(sent);
                List<String> ids = new ArrayList<>();
                for (Object one : list) {
                    Person person;
                    try {
                        person = circle.get(UUID.fromString(String.valueOf(one)));
                    } catch (IllegalArgumentException notAnId) {
                        person = null;
                    }
                    if (person == null || person.left()) {
                        throw ApiProblem.badRequest("not_in_circle", "Choose people from this circle.");
                    }
                    if (!ids.contains(person.id().toString())) {
                        ids.add(person.id().toString());
                    }
                }
                if (ids.size() > MAX_PEOPLE_IN_A_CELL) {
                    throw wrong(name + " holds ten people at most.");
                }
                return ids.isEmpty() ? null : ids;
            default:
                throw wrong(name + " is worked out by its formula. Change the formula instead.");
        }
    }

    private static ApiProblem wrong(String sentence) {
        return ApiProblem.badRequest("wrong_kind", sentence);
    }

    /** A cell of a built-in definition (a template, the sample data), as it is kept. */
    static Object fromDefinition(ColumnKind kind, Object value) {
        if (value == null || (value instanceof String text && text.isBlank())) {
            return null;
        }
        return switch (kind) {
            case TEXT, CHOICE -> value.toString();
            case NUMBER -> new BigDecimal(value.toString()).toPlainString();
            case MONEY -> ((Number) value).longValue();
            case DATE -> value.toString();
            case TICK -> Boolean.TRUE.equals(value) ? Boolean.TRUE : null;
            case PERSON ->
                value instanceof List<?> list
                        ? list.stream().map(Object::toString).toList()
                        : List.of(value.toString());
            case FORMULA -> null;
        };
    }
}
